// The pastor's morning list: each day, the few people most worth a call today, each with the reason
// in one line. It weighs hospital stays and bereavements, people who have stopped coming, new
// visitors nobody has followed up, fresh prayer requests, birthdays and anniversaries, and (only
// for staff who can see giving) regular giving that has stopped. Someone called is left off for a
// few weeks; "no answer" brings them back in two days. A push goes to the care team each morning.
import type { Ctx, Router } from '../engine.js';
import { ApiError } from '../errors.js';
import type { Collections, MorningCall, MorningCallOutcome, MorningListSettings, MorningListView, MorningReason } from '../types.js';
import { find, fullName, localDate, localHour, normEmail, photoUrlOf } from '../util.js';
import { permsOf } from '../perms.js';
import { notify } from './notify.js';

const META = 'morninglist:settings';
const DAY = 86_400_000;
const OUTCOMES: MorningCallOutcome[] = ['called', 'no_answer', 'visited', 'messaged'];
/** How long someone stays off the list after each outcome. */
const QUIET_DAYS: Record<MorningCallOutcome, number> = { called: 21, visited: 30, messaged: 10, no_answer: 2 };

export function morningSettings(ctx: Pick<Ctx, 'db'>): MorningListSettings {
  const base: MorningListSettings = { enabled: true, count: 5, hour: 7 };
  const raw = ctx.db.get('meta', META)?.value;
  return raw ? { ...base, ...(JSON.parse(raw) as Partial<MorningListSettings>) } : base;
}

const lastCall = (ctx: Ctx, personId: string): MorningCall | null => {
  const raw = ctx.db.get('meta', `ml:last:${personId}`)?.value;
  return raw ? (JSON.parse(raw) as MorningCall) : null;
};
const daysSince = (ctx: Ctx, iso: string | null | undefined) => (iso ? Math.floor((ctx.now.getTime() - Date.parse(iso)) / DAY) : Infinity);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function reasonsFor(ctx: Ctx, p: Collections['people'], seeGiving: boolean, today: string): MorningReason[] {
  const out: MorningReason[] = [];
  const cases = ctx.db.all('care').filter((c) => c.personId === p.id);
  const hospital = cases.find((c) => c.type === 'hospital' && c.status !== 'closed');
  if (hospital) out.push({ kind: 'hospital', score: 100, text: daysSince(ctx, hospital.createdAt) < 1 ? 'Admitted to hospital today' : `In hospital for ${plural(daysSince(ctx, hospital.createdAt), 'day')}` });
  const grief = cases.find((c) => c.type === 'bereavement' && (c.status !== 'closed' || daysSince(ctx, c.closedAt) <= 60));
  if (grief) out.push({ kind: 'grief', score: 90, text: daysSince(ctx, grief.createdAt) <= 14 ? 'Recently bereaved' : `Bereaved ${plural(Math.round(daysSince(ctx, grief.createdAt) / 7), 'week')} ago` });
  const urgent = cases.find((c) => c.priority === 'urgent' && c.status !== 'closed' && c !== hospital && c !== grief);
  if (urgent) out.push({ kind: 'care', score: 80, text: `Urgent care case: ${urgent.title}` });

  const away = daysSince(ctx, p.lastAttendedAt);
  if ((p.status === 'member' || p.status === 'regular') && away >= 14 && away <= 120) {
    const weeks = Math.floor(away / 7);
    out.push({ kind: 'absent', score: Math.min(80, 40 + weeks * 5), text: `Not in church for ${plural(weeks, 'week')}` });
  }
  const joined = daysSince(ctx, p.joinedAt);
  if (p.status === 'visitor' && joined <= 10 && !cases.length) out.push({ kind: 'visitor', score: 50, text: joined === 0 ? 'First visit today' : `First visit ${plural(joined, 'day')} ago, nobody has followed up` });

  const prayer = ctx.db.all('prayer').filter((r) => r.personId === p.id && r.status === 'open' && daysSince(ctx, r.createdAt) <= 4).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (prayer) out.push({ kind: 'prayer', score: 45, text: `Asked for prayer: "${prayer.text.length > 70 ? `${prayer.text.slice(0, 67)}…` : prayer.text}"` });

  const mmdd = today.slice(5);
  if (p.birthDate?.slice(5) === mmdd) out.push({ kind: 'birthday', score: 35, text: `Birthday today${p.birthDate.slice(0, 4) !== '1900' ? ` (${Number(today.slice(0, 4)) - Number(p.birthDate.slice(0, 4))})` : ''}` });
  if (p.anniversary?.slice(5) === mmdd) out.push({ kind: 'anniversary', score: 30, text: `Wedding anniversary today (${plural(Number(today.slice(0, 4)) - Number(p.anniversary.slice(0, 4)), 'year')})` });

  if (seeGiving) {
    const gifts = ctx.db.all('donations').filter((d) => d.donorId === p.id && d.status === 'succeeded' && !d.eventId && !d.rentalId && !d.formResponseId);
    const at = (d: (typeof gifts)[number]) => d.paidAt ?? d.createdAt;
    const recent = gifts.some((d) => daysSince(ctx, at(d)) < 60);
    const before = gifts.filter((d) => daysSince(ctx, at(d)) >= 60 && daysSince(ctx, at(d)) < 240).length;
    if (!recent && before >= 3) out.push({ kind: 'giving', score: 30, text: 'Gave regularly until about 2 months ago (only staff who see giving get this line)' });
  }
  return out;
}

export function morningList(ctx: Ctx, seeGiving: boolean, staffPersonId: string | null): MorningListView {
  const s = morningSettings(ctx);
  const today = localDate(ctx, ctx.now);
  const done = (ctx.db.get('meta', `ml:done:${today}`)?.value ?? '').split(',').filter(Boolean);
  const rows = [];
  for (const p of ctx.db.all('people')) {
    if (p.status === 'inactive' || p.id === staffPersonId || !ctx.inScope(p.id)) continue;
    const reasons = reasonsFor(ctx, p, seeGiving, today);
    if (!reasons.length) continue;
    const last = lastCall(ctx, p.id);
    const quiet = last ? daysSince(ctx, last.at) < QUIET_DAYS[last.outcome] : false;
    // A new hospital stay or bereavement since the last call still comes through.
    const fresh = reasons.some((r) => r.kind === 'hospital' || r.kind === 'grief') && last && ctx.db.all('care').some((c) => c.personId === p.id && (c.type === 'hospital' || c.type === 'bereavement') && c.createdAt > last.at);
    if (quiet && !fresh && !done.includes(p.id)) continue;
    reasons.sort((a, b) => b.score - a.score);
    // The top reason counts fully, the rest add a little each, so one strong reason beats many small ones.
    const score = reasons[0]!.score + reasons.slice(1).reduce((t, r) => t + r.score / 4, 0);
    rows.push({ personId: p.id, name: fullName(p), phone: p.phone, photoUrl: photoUrlOf(ctx, p), avatar: p.avatar ?? null, householdName: p.householdName, reasons, score: Math.round(score), lastCall: last, doneToday: done.includes(p.id) });
  }
  rows.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const today5 = rows.filter((r) => r.doneToday).concat(rows.filter((r) => !r.doneToday)).slice(0, Math.max(s.count, rows.filter((r) => r.doneToday).length));
  const ids = new Set(today5.map((r) => r.personId));
  return { date: today, settings: s, today: today5, more: rows.filter((r) => !ids.has(r.personId)).slice(0, 15), doneCount: done.length };
}

function careStaff(ctx: Ctx): { personId: string; seeGiving: boolean }[] {
  const out = new Map<string, boolean>();
  for (const s of ctx.db.all('staff')) {
    if (s.status !== 'active') continue;
    const perms = permsOf(ctx.db, s);
    if (!perms.includes('care')) continue;
    const p = (s.personId && ctx.db.get('people', s.personId)) || ctx.db.all('people').find((x) => normEmail(x.email) === normEmail(s.email));
    if (p) out.set(p.id, (out.get(p.id) ?? false) || perms.includes('giving.view'));
  }
  return [...out].map(([personId, seeGiving]) => ({ personId, seeGiving }));
}

/** Morning push to the care team. Runs on every tick and sends once a day after the chosen hour. */
export async function morningListDue(ctx: Ctx, today: string) {
  const s = morningSettings(ctx);
  if (!s.enabled || localHour(ctx, ctx.now) < s.hour) return;
  const key = `ml:sent:${today}`;
  if (ctx.db.get('meta', key)) return;
  ctx.db.put('meta', { id: key, value: '1' });
  for (const who of careStaff(ctx)) {
    // The push never mentions giving, even to those who can see it.
    const list = morningList(ctx, false, who.personId).today;
    if (!list.length) continue;
    const body = list.map((r) => `${r.name.split(' ')[0]}: ${r.reasons[0]!.text}`).join('\n');
    await notify(ctx, 'morning.list', { personIds: [who.personId], title: `Today's ${plural(list.length, 'call')}`, body, link: '/admin/morning-list' });
  }
}

export function registerMorningList(r: Router) {
  const myPersonId = (ctx: Ctx) => ctx.staff?.personId ?? null;
  r.get('/admin/morning-list', { perm: 'care' }, (ctx) => morningList(ctx, ctx.can('giving.view'), myPersonId(ctx)));

  r.post('/admin/morning-list/:personId/done', { perm: 'care' }, (ctx) => {
    const p = find(ctx, 'people', ctx.params[0], 'Person');
    const b = ctx.body as Record<string, unknown>;
    const outcome = OUTCOMES.includes(b.outcome as MorningCallOutcome) ? (b.outcome as MorningCallOutcome) : 'called';
    const note = String(b.note ?? '').trim().slice(0, 500);
    const call: MorningCall = { at: ctx.now.toISOString(), by: ctx.staff?.name ?? 'Office', outcome, note };
    ctx.db.put('meta', { id: `ml:last:${p.id}`, value: JSON.stringify(call) });
    const today = localDate(ctx, ctx.now);
    const done = new Set((ctx.db.get('meta', `ml:done:${today}`)?.value ?? '').split(',').filter(Boolean));
    done.add(p.id);
    ctx.db.put('meta', { id: `ml:done:${today}`, value: [...done].join(',') });
    // A note goes on the open care case, so the person's history shows the call.
    if (note) {
      const open = ctx.db.all('care').find((c) => c.personId === p.id && c.status !== 'closed');
      if (open) ctx.db.put('care', { ...open, notes: [...open.notes, { id: ctx.id('cn'), at: call.at, by: call.by, text: `${outcome === 'no_answer' ? 'Tried to call, no answer' : outcome === 'visited' ? 'Visited' : outcome === 'messaged' ? 'Messaged' : 'Called'}: ${note}` }] });
    }
    ctx.audit(outcome, 'morning-list', p.id, fullName(p));
    return morningList(ctx, ctx.can('giving.view'), myPersonId(ctx));
  });

  r.post('/admin/morning-list/:personId/undo', { perm: 'care' }, (ctx) => {
    const id = ctx.params[0]!;
    const today = localDate(ctx, ctx.now);
    const done = (ctx.db.get('meta', `ml:done:${today}`)?.value ?? '').split(',').filter((x) => x && x !== id);
    ctx.db.put('meta', { id: `ml:done:${today}`, value: done.join(',') });
    ctx.db.del('meta', `ml:last:${id}`);
    return morningList(ctx, ctx.can('giving.view'), myPersonId(ctx));
  });

  r.put('/admin/morning-list/settings', { perm: 'care' }, (ctx) => {
    const b = ctx.body as Record<string, unknown>;
    const prev = morningSettings(ctx);
    const count = b.count !== undefined ? Math.round(Number(b.count)) : prev.count;
    const hour = b.hour !== undefined ? Math.round(Number(b.hour)) : prev.hour;
    if (!(count >= 1 && count <= 20)) throw new ApiError(422, 'invalid', 'Pick between 1 and 20 people a day.');
    if (!(hour >= 4 && hour <= 12)) throw new ApiError(422, 'invalid', 'Pick a morning hour between 4 and 12.');
    const next: MorningListSettings = { enabled: b.enabled !== undefined ? !!b.enabled : prev.enabled, count, hour };
    ctx.db.put('meta', { id: META, value: JSON.stringify(next) });
    return morningList(ctx, ctx.can('giving.view'), myPersonId(ctx));
  });
}
