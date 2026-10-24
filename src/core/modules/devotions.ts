// Leaders' devotionals: a pastor plans a short morning devotional for the leadership team (a
// passage, a reflection, a question and a prayer), drafted with AI if they like. Each morning it
// goes to the office staff; each leader checks in when they have read it, with a line of response
// or a prayer need the others can see. Nobody is chased; the streak is only for encouragement.
import type { Ctx, Router } from '../engine.js';
import { ApiError } from '../errors.js';
import type { Devotion, DevotionView, DevotionsHub } from '../types.js';
import { DAY, find, localDate, settings } from '../util.js';
import { writeDevotion } from './ai.js';
import { notify } from './notify.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const clean = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
const team = (ctx: Ctx) => ctx.db.all('staff').filter((s) => s.status === 'active' && s.role !== 'checkin');

function view(ctx: Ctx, d: Devotion): DevotionView {
  const checkins = ctx.db.all('devotionCheckins').filter((c) => c.devotionId === d.id).sort((a, b) => a.at.localeCompare(b.at));
  return { ...d, checkins, mine: !!ctx.staff && checkins.some((c) => c.staffId === ctx.staff!.id), team: team(ctx).length };
}

/** Days in a row, ending today or yesterday, on which this staff member checked in. */
function streak(ctx: Ctx, staffId: string, today: string): number {
  const byId = new Map(ctx.db.all('devotions').map((d) => [d.id, d.date]));
  const days = new Set(ctx.db.all('devotionCheckins').filter((c) => c.staffId === staffId).map((c) => byId.get(c.devotionId)).filter(Boolean));
  let n = 0;
  let at = Date.parse(`${today}T00:00:00Z`);
  if (!days.has(today)) at -= DAY;
  while (days.has(new Date(at).toISOString().slice(0, 10))) { n++; at -= DAY; }
  return n;
}

export function todaysDevotion(ctx: Ctx): Devotion | null {
  const today = localDate(ctx, ctx.now);
  return ctx.db.all('devotions').find((d) => d.date === today) ?? null;
}

/** Daily: today's devotional goes to the leadership team once. */
export async function devotionMorning(ctx: Ctx) {
  const d = todaysDevotion(ctx);
  if (!d || d.notifiedAt) return;
  ctx.db.put('devotions', { ...d, notifiedAt: ctx.now.toISOString() });
  const ids = team(ctx).map((s) => s.personId).filter((x): x is string => !!x);
  if (ids.length) await notify(ctx, 'devotion.today', { personIds: ids, title: `${settings(ctx).name}: ${d.title || "today's devotional"}`, body: `${d.passage}. ${d.question}`.trim(), link: '/admin/devotions' });
}

function fromBody(ctx: Ctx, b: Record<string, unknown>, before?: Devotion): Devotion {
  const date = DATE_RE.test(String(b.date)) ? String(b.date) : (before?.date ?? localDate(ctx, ctx.now));
  return {
    id: before?.id ?? ctx.id('dv'),
    date,
    passage: b.passage !== undefined ? clean(b.passage, 120) : (before?.passage ?? ''),
    title: b.title !== undefined ? clean(b.title, 120) : (before?.title ?? ''),
    thought: b.thought !== undefined ? clean(b.thought, 5000) : (before?.thought ?? ''),
    question: b.question !== undefined ? clean(b.question, 400) : (before?.question ?? ''),
    prayer: b.prayer !== undefined ? clean(b.prayer, 600) : (before?.prayer ?? ''),
    createdBy: before?.createdBy ?? ctx.staff?.name ?? 'Office',
    notifiedAt: before && before.date === date ? before.notifiedAt : null,
    createdAt: before?.createdAt ?? ctx.now.toISOString(),
    updatedAt: ctx.now.toISOString(),
  };
}

export function registerDevotions(r: Router) {
  r.get('/admin/devotions', { staff: true }, (ctx): DevotionsHub => {
    const today = localDate(ctx, ctx.now);
    const all = ctx.db.all('devotions').sort((a, b) => a.date.localeCompare(b.date));
    const t = all.find((d) => d.date === today);
    return {
      today: t ? view(ctx, t) : null,
      upcoming: all.filter((d) => d.date > today).slice(0, 30).map((d) => view(ctx, d)),
      past: all.filter((d) => d.date < today).reverse().slice(0, 30).map((d) => view(ctx, d)),
      streak: ctx.staff ? streak(ctx, ctx.staff.id, today) : 0,
    };
  });
  r.post('/admin/devotions', { perm: 'care' }, (ctx) => {
    const d = fromBody(ctx, ctx.body as Record<string, unknown>);
    if (!d.passage && !d.thought) throw new ApiError(422, 'invalid', 'Give a passage or write the devotional.');
    if (ctx.db.all('devotions').some((x) => x.date === d.date)) throw new ApiError(409, 'exists', 'There is already a devotional for that day.', { date: 'Choose another day' });
    ctx.db.put('devotions', d);
    return view(ctx, d);
  });
  r.put('/admin/devotions/:id', { perm: 'care' }, (ctx) => {
    const before = find(ctx, 'devotions', ctx.params[0], 'Devotional');
    const d = fromBody(ctx, ctx.body as Record<string, unknown>, before);
    if (ctx.db.all('devotions').some((x) => x.date === d.date && x.id !== d.id)) throw new ApiError(409, 'exists', 'There is already a devotional for that day.', { date: 'Choose another day' });
    ctx.db.put('devotions', d);
    return view(ctx, d);
  });
  r.del('/admin/devotions/:id', { perm: 'care' }, (ctx) => {
    const d = find(ctx, 'devotions', ctx.params[0], 'Devotional');
    for (const c of ctx.db.all('devotionCheckins').filter((x) => x.devotionId === d.id)) ctx.db.del('devotionCheckins', c.id);
    ctx.db.del('devotions', d.id);
    return { ok: true };
  });
  r.post('/admin/devotions/draft', { perm: 'care' }, async (ctx) => {
    const passage = clean(ctx.body.passage, 120);
    if (!passage) throw new ApiError(422, 'invalid', 'Give the passage first.', { passage: 'Required' });
    return writeDevotion(ctx, passage, clean(ctx.body.text, 6000));
  });
  r.post('/admin/devotions/:id/checkin', { staff: true }, (ctx) => {
    const d = find(ctx, 'devotions', ctx.params[0], 'Devotional');
    if (d.date > localDate(ctx, ctx.now)) throw new ApiError(422, 'invalid', 'This devotional is for a later day.');
    const staff = ctx.staff!;
    const id = `${d.id}:${staff.id}`;
    ctx.db.put('devotionCheckins', { id, devotionId: d.id, staffId: staff.id, name: staff.name, note: clean(ctx.body.note, 500), at: ctx.db.get('devotionCheckins', id)?.at ?? ctx.now.toISOString() });
    return view(ctx, d);
  });
  r.del('/admin/devotions/:id/checkin', { staff: true }, (ctx) => {
    const d = find(ctx, 'devotions', ctx.params[0], 'Devotional');
    ctx.db.del('devotionCheckins', `${d.id}:${ctx.staff!.id}`);
    return view(ctx, d);
  });
}
