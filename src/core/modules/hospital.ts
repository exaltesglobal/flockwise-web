// Hospital mode. One tap marks someone as admitted: their zone leader and the pastors are told, the
// prayer chain is asked to pray (without medical details), and a meal and visit rota opens that
// people in their zone, groups and family can fill from the app. On discharge the rota closes and,
// two days later, the person gets a short "how are you?" message.
import type { Ctx, Router } from '../engine.js';
import { ApiError } from '../errors.js';
import { featureOn } from '../features.js';
import type { CareCase, Collections, HospitalSlot, HospitalStay, HospitalStayView, MemberHospitalStay } from '../types.js';
import { find, fullName, localDate, settings } from '../util.js';
import { chainMembers } from './care.js';
import { notify, pastorIds } from './notify.js';

const DAY = 86_400_000;
const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const isDate = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

function guard(ctx: Ctx) {
  if (!featureOn(settings(ctx).features, 'hospital-mode')) throw new ApiError(404, 'not_found', 'Hospital mode is switched off for this church.');
}

function makeSlots(ctx: Ctx, from: string, days: number, meals: boolean, visits: boolean): HospitalSlot[] {
  const out: HospitalSlot[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(from, i);
    if (meals) out.push({ id: ctx.id('hs'), date, kind: 'meal', label: 'Meal for the family', takenBy: null, takenName: null, note: null });
    if (visits) out.push({ id: ctx.id('hs'), date, kind: 'visit', label: 'Visit', takenBy: null, takenName: null, note: null });
  }
  return out;
}

function zoneLeaders(ctx: Ctx, p: Collections['people']) {
  const z = p.zoneId ? ctx.db.get('zones', p.zoneId) : undefined;
  return z?.leaderIds ?? [];
}

function view(ctx: Ctx, s: HospitalStay): HospitalStayView {
  const p = ctx.db.get('people', s.personId);
  const z = p?.zoneId ? ctx.db.get('zones', p.zoneId) : undefined;
  return { ...s, name: p ? fullName(p) : 'Removed person', phone: p?.phone ?? null, zone: z?.name ?? null, filled: s.slots.filter((x) => x.takenBy).length, open: s.slots.filter((x) => !x.takenBy).length };
}

export const hospitalList = (ctx: Ctx) =>
  ctx.db.all('hospitalStays').sort((a, b) => Number(!!a.dischargedOn) - Number(!!b.dischargedOn) || b.admittedOn.localeCompare(a.admittedOn)).slice(0, 60).map((s) => view(ctx, s));

/** Who may see the rota and take a slot: the family, people in the same zone or a shared group, and the prayer chain. */
function canHelp(ctx: Ctx, s: HospitalStay, me: string) {
  const p = ctx.db.get('people', s.personId);
  const mine = ctx.db.get('people', me);
  if (!p || !mine) return { ok: false, family: false };
  const family = !!p.householdName && p.householdName === mine.householdName;
  if (me === p.id || family) return { ok: true, family: true };
  if (p.zoneId && p.zoneId === mine.zoneId) return { ok: true, family: false };
  if (mine.prayerChain) return { ok: true, family: false };
  const theirs = new Set(ctx.db.all('groupMembers').filter((m) => m.personId === p.id).map((m) => m.groupId));
  return { ok: ctx.db.all('groupMembers').some((m) => m.personId === me && theirs.has(m.groupId)), family: false };
}

function memberView(ctx: Ctx, s: HospitalStay, me: string, family: boolean): MemberHospitalStay {
  const p = ctx.db.get('people', s.personId)!;
  const today = localDate(ctx, ctx.now);
  return {
    id: s.id, name: fullName(p), hospital: s.hospital, ward: s.ward, admittedOn: s.admittedOn, family,
    slots: s.slots.filter((x) => x.date >= today).map(({ takenBy, ...x }) => ({ ...x, mine: takenBy === me })),
  };
}

/** Two days after discharge, a short message to the person. Runs on every tick. */
export async function hospitalCheckInsDue(ctx: Ctx) {
  for (const s of ctx.db.all('hospitalStays')) {
    if (!s.checkInDue || s.checkInSentAt || s.checkInDue > ctx.now.toISOString()) continue;
    ctx.db.put('hospitalStays', { ...s, checkInSentAt: ctx.now.toISOString() });
    const p = ctx.db.get('people', s.personId);
    if (!p) continue;
    await notify(ctx, 'hospital.checkin', { personIds: [p.id], title: `${settings(ctx).name} is thinking of you`, body: `Hi ${p.firstName}, we are so glad you are home. How are you feeling? Reply to this message and the pastor will read it. We are praying for you.` });
  }
}

export function registerHospital(r: Router) {
  r.get('/admin/hospital', { perm: 'care' }, (ctx) => { guard(ctx); return hospitalList(ctx); });

  r.post('/admin/hospital', { perm: 'care' }, async (ctx) => {
    guard(ctx);
    const p = find(ctx, 'people', String(ctx.body.personId ?? ''), 'Person');
    const hospital = String(ctx.body.hospital ?? '').trim().slice(0, 120);
    if (!hospital) throw new ApiError(422, 'invalid', 'Which hospital?', { hospital: 'Required' });
    if (ctx.db.all('hospitalStays').some((s) => s.personId === p.id && !s.dischargedOn)) throw new ApiError(409, 'exists', `${p.firstName} is already marked as in hospital.`);
    const admittedOn = isDate(ctx.body.admittedOn) ? String(ctx.body.admittedOn) : localDate(ctx, ctx.now);
    const days = Math.max(1, Math.min(14, Math.round(Number(ctx.body.days) || 5)));
    const now = ctx.now.toISOString();
    const by = ctx.staff?.name ?? 'Office';
    const caseRec: CareCase = {
      id: ctx.id('cc'), personId: p.id, personName: fullName(p), type: 'hospital', title: `In hospital: ${hospital}`, status: 'open', priority: 'urgent',
      assignedTo: ctx.staff?.id ?? null, assignedName: ctx.staff?.name ?? null, dueAt: null, createdAt: now, closedAt: null, notes: [], source: 'manual', confidential: false,
    };
    ctx.db.put('care', caseRec);
    const leaders = zoneLeaders(ctx, p).filter((id) => id !== p.id);
    const pastors = pastorIds(ctx).filter((id) => id !== p.id);
    const chain = ctx.body.tellChain === false ? [] : chainMembers(ctx).filter((m) => m.id !== p.id).map((m) => m.id);
    const stay: HospitalStay = {
      id: ctx.id('hos'), personId: p.id, hospital, ward: String(ctx.body.ward ?? '').trim().slice(0, 60) || null,
      note: String(ctx.body.note ?? '').trim().slice(0, 500) || null,
      admittedOn, dischargedOn: null, careCaseId: caseRec.id,
      slots: makeSlots(ctx, admittedOn, days, ctx.body.meals !== false, ctx.body.visits !== false),
      told: { leaders: leaders.length, chain: chain.length, pastors: pastors.length },
      checkInDue: null, checkInSentAt: null, createdBy: by, createdAt: now, updatedAt: now,
    };
    ctx.db.put('hospitalStays', stay);
    ctx.audit('created', 'hospital', stay.id, `Marked ${fullName(p)} as admitted to hospital`);
    const where = `${hospital}${stay.ward ? `, ${stay.ward}` : ''}`;
    const link = `/app/hospital`;
    await notify(ctx, 'hospital.admitted', { personIds: [...new Set([...leaders, ...pastors])], title: `${fullName(p)} is in hospital`, body: `${p.firstName} was admitted to ${where}. Please pray, and help with meals and visits.`, link, except: ctx.staff?.personId ?? null });
    // The chain hears only that they are in hospital: no ward, no medical details.
    if (chain.length) await notify(ctx, 'prayer.chain', { personIds: chain, title: `🙏 Pray for ${p.firstName} ${p.lastName.charAt(0)}.`, body: `${p.firstName} is in hospital. Please pray for healing and for the family. You can help with meals and visits in the app.`, link });
    return view(ctx, stay);
  });

  r.patch('/admin/hospital/:id', { perm: 'care' }, (ctx) => {
    guard(ctx);
    const s = find(ctx, 'hospitalStays', ctx.params[0], 'Hospital stay');
    const next: HospitalStay = { ...s, updatedAt: ctx.now.toISOString() };
    if (ctx.body.hospital !== undefined) next.hospital = String(ctx.body.hospital).trim().slice(0, 120) || s.hospital;
    if (ctx.body.ward !== undefined) next.ward = String(ctx.body.ward ?? '').trim().slice(0, 60) || null;
    if (ctx.body.note !== undefined) next.note = String(ctx.body.note ?? '').trim().slice(0, 500) || null;
    const more = Math.max(0, Math.min(14, Math.round(Number(ctx.body.addDays) || 0)));
    if (more && !s.dischargedOn) {
      const last = s.slots.map((x) => x.date).sort().at(-1) ?? localDate(ctx, ctx.now);
      next.slots = [...s.slots, ...makeSlots(ctx, addDays(last, 1), more, s.slots.some((x) => x.kind === 'meal'), s.slots.some((x) => x.kind === 'visit'))];
    }
    return view(ctx, ctx.db.put('hospitalStays', next));
  });

  r.post('/admin/hospital/:id/discharge', { perm: 'care' }, (ctx) => {
    guard(ctx);
    const s = find(ctx, 'hospitalStays', ctx.params[0], 'Hospital stay');
    if (s.dischargedOn) throw new ApiError(409, 'done', 'Already marked as home.');
    const on = isDate(ctx.body.date) ? String(ctx.body.date) : localDate(ctx, ctx.now);
    const next: HospitalStay = {
      ...s, dischargedOn: on, updatedAt: ctx.now.toISOString(),
      // Later slots nobody took go; the ones people signed up for stay so they can still bring a meal home.
      slots: s.slots.filter((x) => x.date <= on || x.takenBy),
      checkInDue: ctx.body.checkIn === false ? null : new Date(Date.parse(`${on}T04:30:00Z`) + 2 * DAY).toISOString(),
    };
    ctx.db.put('hospitalStays', next);
    const c = s.careCaseId ? ctx.db.get('care', s.careCaseId) : undefined;
    if (c) ctx.db.put('care', { ...c, title: `Home from hospital (${s.hospital})`, priority: 'normal', notes: [...c.notes, { id: ctx.id('cn'), at: ctx.now.toISOString(), by: ctx.staff?.name ?? '', text: `Discharged on ${on}.` }] });
    const p = ctx.db.get('people', s.personId);
    ctx.audit('updated', 'hospital', s.id, `Marked ${p ? fullName(p) : 'someone'} as home from hospital`);
    return view(ctx, next);
  });

  r.del('/admin/hospital/:id', { perm: 'care' }, (ctx) => {
    guard(ctx);
    ctx.db.del('hospitalStays', ctx.params[0]);
    return undefined;
  });

  // ----- members: the meal and visit rota -----
  r.get('/me/hospital', {}, (ctx) => {
    guard(ctx);
    const me = ctx.me();
    return ctx.db.all('hospitalStays')
      .filter((s) => !s.dischargedOn || s.slots.some((x) => x.date >= localDate(ctx, ctx.now) && x.takenBy))
      .map((s) => ({ s, h: canHelp(ctx, s, me) }))
      .filter((x) => x.h.ok)
      .map((x) => memberView(ctx, x.s, me, x.h.family));
  });

  r.post('/me/hospital/:id/slots/:slotId', {}, (ctx) => {
    guard(ctx);
    const me = ctx.me();
    const s = find(ctx, 'hospitalStays', ctx.params[0], 'Hospital stay');
    const h = canHelp(ctx, s, me);
    if (!h.ok) throw new ApiError(404, 'not_found', 'Hospital stay not found.');
    const slot = s.slots.find((x) => x.id === ctx.params[1]);
    if (!slot) throw new ApiError(404, 'not_found', 'That slot is gone.');
    const take = ctx.body.take !== false;
    if (take && slot.takenBy && slot.takenBy !== me) throw new ApiError(409, 'taken', `${slot.takenName ?? 'Someone'} has already taken this one.`);
    if (!take && slot.takenBy !== me) throw new ApiError(403, 'forbidden', 'This is not yours.');
    const person = ctx.db.get('people', me);
    const next: HospitalSlot = take
      ? { ...slot, takenBy: me, takenName: person ? fullName(person) : 'A member', note: String(ctx.body.note ?? '').trim().slice(0, 140) || null }
      : { ...slot, takenBy: null, takenName: null, note: null };
    const saved = ctx.db.put('hospitalStays', { ...s, slots: s.slots.map((x) => (x.id === slot.id ? next : x)), updatedAt: ctx.now.toISOString() });
    return memberView(ctx, saved, me, h.family);
  });
}
