// Village and migrant link. When a member moves city for work, Flockwise suggests a church near the
// new city (from the church's own partner list, or churches on Flockwise there that welcome
// introductions) and, only with the member's consent, passes along a warm introduction. A month
// later the pastor is reminded to check they found a home, so people do not drift away when they move.
import type { Ctx, Router } from '../engine.js';
import { ApiError } from '../errors.js';
import { featureOn } from '../features.js';
import type { Move, MoveIntroduction, MovesHub, MoveStatus, MoveView, MyMove, OwnPartnerChurch, PartnerChurch } from '../types.js';
import { church, find, fullName, localDate, matchOrCreatePerson, normEmail, settings } from '../util.js';
import { notify, pastorIds } from './notify.js';

const DAY = 86_400_000;
const STATUSES: MoveStatus[] = ['planning', 'introduced', 'settled', 'lost'];
const norm = (v: string) => v.trim().toLowerCase().replace(/\s+/g, ' ');
const clean = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
const isDate = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

function guard(ctx: Ctx) {
  if (!featureOn(settings(ctx).features, 'migrant-link')) throw new ApiError(404, 'not_found', 'Migrant link is switched off for this church.');
}

const ownPartners = (ctx: Ctx): OwnPartnerChurch[] => settings(ctx).partnerChurches ?? [];
const asPartner = (p: OwnPartnerChurch): PartnerChurch => ({ ref: `p:${p.id}`, name: p.name, city: p.city, contact: [p.contactName, p.phone, p.email].filter(Boolean).join(' · ') || null, onFlockwise: false, url: null });

/** Churches near a city: the church's own partners first, then churches on Flockwise there. */
export function suggest(ctx: Ctx, city: string): PartnerChurch[] {
  const c = norm(city);
  if (c.length < 2) return [];
  const hit = (x: string) => { const n = norm(x); return !!n && (n.includes(c) || c.includes(n)); };
  const own = ownPartners(ctx).filter((p) => hit(p.city)).map(asPartner);
  const flock = (ctx.env.partners?.near(city) ?? []).filter((p) => !own.some((o) => norm(o.name) === norm(p.name)));
  return [...own, ...flock].slice(0, 12);
}

function resolve(ctx: Ctx, ref: string, city: string): PartnerChurch {
  const p = suggest(ctx, city).find((x) => x.ref === ref) ?? (ref.startsWith('p:') ? ownPartners(ctx).map(asPartner).find((x) => x.ref === ref) : undefined);
  if (!p) throw new ApiError(404, 'not_found', 'That church is not in the list for this city.');
  return p;
}

const view = (ctx: Ctx, m: Move): MoveView => {
  const p = ctx.db.get('people', m.personId);
  return { ...m, name: p ? fullName(p) : 'Removed person', phone: p?.phone ?? null };
};

/** Sends the introduction: into the other church's Flockwise, by email to a partner, or as WhatsApp text for the office. */
async function introduce(ctx: Ctx, m: Move, partner: PartnerChurch, consentBy: 'member' | 'office'): Promise<Move> {
  const p = find(ctx, 'people', m.personId, 'Person');
  const c = church(ctx);
  const intro: MoveIntroduction = { firstName: p.firstName, lastName: p.lastName, phone: p.phone, email: p.email, fromChurch: c.name, fromCity: c.city, movingOn: m.movingOn, note: m.note };
  const text = `Greetings from ${c.name}, ${c.city}. ${fullName(p)} from our church is moving to ${m.toCity}${m.movingOn ? ` around ${m.movingOn}` : ''} and would love a church family there. With their permission, here is how to reach them: ${[p.phone, p.email].filter(Boolean).join(', ') || 'please reply and we will connect you'}. Thank you for welcoming them.`;
  let introText: string | null = null;
  if (partner.onFlockwise) {
    if (!ctx.env.partners) throw new ApiError(409, 'not_available', 'Introductions to churches on Flockwise are not available on this server.');
    await ctx.env.partners.introduce(partner.ref.slice(2), intro);
  } else {
    const own = ownPartners(ctx).find((x) => `p:${x.id}` === partner.ref);
    if (own?.email) await ctx.env.deliver('email', [{ to: own.email, name: own.contactName || own.name, subject: `Introducing ${fullName(p)}, moving to ${m.toCity}`, text: `Dear ${own.contactName || 'friends'},\n\n${text}\n\n${ctx.staff?.name ?? 'The church office'}\n${c.name}` }]).catch(() => undefined);
    else introText = text;
  }
  const now = ctx.now.toISOString();
  ctx.audit('sent', 'move', m.id, `Introduced ${fullName(p)} to ${partner.name}`);
  return ctx.db.put('moves', {
    ...m, partner, consentAt: m.consentAt ?? now, consentBy: m.consentBy ?? consentBy, status: 'introduced', introducedAt: now, introText,
    checkBackOn: localDate(ctx, new Date(ctx.now.getTime() + 30 * DAY)), updatedAt: now,
  });
}

/** The receiving church: the person arrives as a visitor with a welcome follow-up for the care team. */
export async function receiveIntroduction(ctx: Ctx, intro: MoveIntroduction) {
  const p = matchOrCreatePerson(ctx, { name: `${intro.firstName} ${intro.lastName}`.trim(), email: intro.email, phone: intro.phone });
  const tag = `Moved from ${intro.fromChurch}`.slice(0, 60);
  if (!p.tags.includes(tag)) ctx.db.put('people', { ...p, tags: [...p.tags, tag] });
  const now = ctx.now.toISOString();
  ctx.db.put('care', {
    id: ctx.id('cc'), personId: p.id, personName: fullName(p), type: 'visitor', title: `Welcome ${p.firstName}: moving here from ${intro.fromChurch}, ${intro.fromCity}`,
    status: 'open', priority: 'normal', assignedTo: null, assignedName: null, dueAt: null, createdAt: now, closedAt: null,
    notes: [{ id: ctx.id('cn'), at: now, by: intro.fromChurch, text: `${intro.fromChurch} introduced ${p.firstName} with their permission.${intro.movingOn ? ` Moving around ${intro.movingOn}.` : ''}${intro.note ? ` ${intro.note}` : ''}` }],
    source: 'automation', confidential: false,
  });
  await notify(ctx, 'move.new', { personIds: pastorIds(ctx), title: `${fullName(p)} is moving to your city`, body: `${intro.fromChurch} (${intro.fromCity}) introduced ${p.firstName}, who is moving here. A welcome follow-up is waiting in Care.`, link: '/admin/care' });
}

/** Whether this church shows up for churches elsewhere: it has to want introductions and have its public page on. */
export const welcomesIntroductions = (s: ReturnType<typeof settings>) => s.welcomeIntroductions !== false && !!s.publicPage?.enabled && featureOn(s.features, 'migrant-link');

function hub(ctx: Ctx): MovesHub {
  const s = settings(ctx);
  return {
    moves: ctx.db.all('moves').sort((a, b) => Number(['settled', 'lost'].includes(a.status)) - Number(['settled', 'lost'].includes(b.status)) || b.updatedAt.localeCompare(a.updatedAt)).map((m) => view(ctx, m)),
    partners: ownPartners(ctx),
    welcomeIntroductions: s.welcomeIntroductions !== false,
    onFlockwise: !!ctx.env.partners,
  };
}

function newMove(ctx: Ctx, personId: string, b: Record<string, unknown>, source: Move['source']): Move {
  const toCity = clean(b.toCity, 60);
  if (toCity.length < 2) throw new ApiError(422, 'invalid', 'Which city are they moving to?', { toCity: 'Required' });
  const now = ctx.now.toISOString();
  return { id: ctx.id('mv'), personId, toCity, movingOn: isDate(b.movingOn) ? String(b.movingOn) : null, partner: null, consentAt: null, consentBy: null, status: 'planning', introducedAt: null, introText: null, checkBackOn: null, note: clean(b.note, 300) || null, source, createdAt: now, updatedAt: now };
}

export function registerMigrantLink(r: Router) {
  // ----- office -----
  r.get('/admin/moves', { perm: 'care' }, (ctx) => { guard(ctx); return hub(ctx); });
  r.get('/admin/moves/suggest', { perm: 'care' }, (ctx) => { guard(ctx); return suggest(ctx, String(ctx.query.city ?? '')); });
  r.post('/admin/moves', { perm: 'care' }, (ctx) => {
    guard(ctx);
    const p = find(ctx, 'people', String(ctx.body.personId ?? ''), 'Person');
    const m = ctx.db.put('moves', newMove(ctx, p.id, ctx.body, 'office'));
    ctx.audit('created', 'move', m.id, `Noted that ${fullName(p)} is moving to ${m.toCity}`);
    return hub(ctx);
  });
  r.patch('/admin/moves/:id', { perm: 'care' }, (ctx) => {
    guard(ctx);
    const m = find(ctx, 'moves', ctx.params[0], 'Move');
    const next: Move = { ...m, updatedAt: ctx.now.toISOString() };
    if (ctx.body.toCity !== undefined) next.toCity = clean(ctx.body.toCity, 60) || m.toCity;
    if (ctx.body.movingOn !== undefined) next.movingOn = isDate(ctx.body.movingOn) ? String(ctx.body.movingOn) : null;
    if (ctx.body.note !== undefined) next.note = clean(ctx.body.note, 300) || null;
    if (STATUSES.includes(ctx.body.status)) next.status = ctx.body.status;
    if (ctx.body.checkBackOn !== undefined) next.checkBackOn = isDate(ctx.body.checkBackOn) ? String(ctx.body.checkBackOn) : null;
    ctx.db.put('moves', next);
    return hub(ctx);
  });
  // The office introduces only when the person said yes; the office records that they did.
  r.post('/admin/moves/:id/introduce', { perm: 'care' }, async (ctx) => {
    guard(ctx);
    const m = find(ctx, 'moves', ctx.params[0], 'Move');
    if (!m.consentAt && ctx.body.consent !== true) throw new ApiError(422, 'consent_needed', 'Ask them first. Tick that they agreed to be introduced.');
    await introduce(ctx, m, resolve(ctx, String(ctx.body.partnerRef ?? ''), m.toCity), 'office');
    return hub(ctx);
  });
  r.del('/admin/moves/:id', { perm: 'care' }, (ctx) => { guard(ctx); ctx.db.del('moves', ctx.params[0]); return hub(ctx); });
  r.put('/admin/partner-churches', { perm: 'care' }, (ctx) => {
    guard(ctx);
    const list = (Array.isArray(ctx.body.partners) ? ctx.body.partners : []).slice(0, 100).map((x: Partial<OwnPartnerChurch>) => {
      const name = clean(x.name, 80);
      const city = clean(x.city, 60);
      if (!name || !city) throw new ApiError(422, 'invalid', 'Each partner church needs a name and a city.');
      const email = normEmail(x.email);
      return { id: clean(x.id, 40) || ctx.id('pc'), name, city, contactName: clean(x.contactName, 60), phone: clean(x.phone, 20), email: email || '', note: clean(x.note, 200) };
    });
    const s = settings(ctx);
    ctx.db.put('settings', { ...s, partnerChurches: list, welcomeIntroductions: typeof ctx.body.welcomeIntroductions === 'boolean' ? ctx.body.welcomeIntroductions : s.welcomeIntroductions });
    return hub(ctx);
  });

  // ----- member -----
  r.get('/me/move', {}, (ctx): MyMove => {
    guard(ctx);
    const move = ctx.db.all('moves').filter((m) => m.personId === ctx.me()).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
    const city = String(ctx.query.city ?? '') || move?.toCity || '';
    return { move, suggestions: city ? suggest(ctx, city) : [] };
  });
  r.post('/me/move', {}, async (ctx): Promise<MyMove> => {
    guard(ctx);
    const me = ctx.me();
    const cur = ctx.db.all('moves').find((m) => m.personId === me && m.status === 'planning');
    let m = cur ? { ...cur, ...newMove(ctx, me, ctx.body, 'member'), id: cur.id, createdAt: cur.createdAt } : newMove(ctx, me, ctx.body, 'member');
    m = ctx.db.put('moves', m);
    const p = ctx.db.get('people', me)!;
    if (!cur) await notify(ctx, 'move.new', { personIds: pastorIds(ctx), title: `${fullName(p)} is moving`, body: `${p.firstName} says they are moving to ${m.toCity}${m.movingOn ? ` around ${m.movingOn}` : ''}.`, link: '/admin/moves', except: me });
    if (ctx.body.partnerRef && ctx.body.consent === true) {
      m = ctx.db.put('moves', { ...m, consentAt: ctx.now.toISOString(), consentBy: 'member' });
      m = await introduce(ctx, m, resolve(ctx, String(ctx.body.partnerRef), m.toCity), 'member');
    }
    return { move: m, suggestions: suggest(ctx, m.toCity) };
  });
}
