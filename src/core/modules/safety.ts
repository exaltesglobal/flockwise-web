// Persecution and emergency alert. A pastor or member facing threats, violence, a mob or a police
// complaint presses one discreet button in the app. The leaders the church chose are told at once
// (push, WhatsApp and email) and can see where the person is; the legal-aid contacts get a WhatsApp
// and SMS with a link that shows the location; the prayer chain is asked to pray, without a name or
// place unless the church chose otherwise. The location is shared for 2 hours (or the time the
// church set) and wiped when the person is safe or the time runs out. Nothing goes on the
// directory, the prayer wall or any public page.
import type { Ctx, Router } from '../engine.js';
import { ApiError } from '../errors.js';
import { featureOn } from '../features.js';
import type { MySafety, PublicSafetyAlert, SafetyAlert, SafetyAlertKind, SafetyAlertView, SafetyHub, SafetyLocation, SafetySettings } from '../types.js';
import { fullName, settings } from '../util.js';
import { chainMembers } from './care.js';
import { deliverAll } from './integrations.js';
import { notify } from './notify.js';

const KINDS: SafetyAlertKind[] = ['threat', 'violence', 'police', 'mob', 'medical', 'other'];
const KIND_LABEL: Record<SafetyAlertKind, string> = { threat: 'being threatened', violence: 'facing violence', police: 'facing a police complaint or arrest', mob: 'facing a mob', medical: 'a medical emergency', other: 'in an emergency' };
const TOKEN_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';
const MIN = 60_000;
const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function on(ctx: Ctx) {
  return featureOn(settings(ctx).features, 'safety-alert');
}
function guard(ctx: Ctx) {
  if (!on(ctx)) throw new ApiError(404, 'not_found', 'The emergency alert is switched off for this church.');
}

export function safetySettings(ctx: Ctx): SafetySettings {
  return ctx.db.get('safetySettings', 'main') ?? { id: 'main', leaderIds: [], legal: [], prayerChain: true, chainNames: false, shareMinutes: 120, updatedAt: '' };
}

function location(v: Record<string, unknown> | undefined, at: string): SafetyLocation | null {
  const lat = Number(v?.lat);
  const lng = Number(v?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return null;
  const acc = Number(v?.accuracy);
  return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6, accuracy: Number.isFinite(acc) && acc >= 0 ? Math.round(acc) : null, at };
}

const sharing = (ctx: Ctx, a: SafetyAlert) => a.status === 'active' && ctx.now.toISOString() < a.shareUntil;

/** Wipes locations once the sharing time is over, so nothing is kept longer than promised. */
function tidy(ctx: Ctx, a: SafetyAlert): SafetyAlert {
  if (a.locations.length && !sharing(ctx, a)) return ctx.db.put('safetyAlerts', { ...a, locations: [] });
  return a;
}

function view(ctx: Ctx, raw: SafetyAlert): SafetyAlertView {
  const a = tidy(ctx, raw);
  const p = ctx.db.get('people', a.personId);
  const { token: _t, locations, ...rest } = a;
  const live = sharing(ctx, a);
  return { ...rest, name: p ? fullName(p) : 'Member', phone: p?.phone ?? null, sharing: live, location: live ? (locations[locations.length - 1] ?? null) : null, trail: live ? locations.slice(-30) : [] };
}

const mapLink = (l: SafetyLocation | null) => (l ? `https://maps.google.com/?q=${l.lat},${l.lng}` : '');
const until = (ctx: Ctx, iso: string) => {
  try {
    return new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: settings(ctx).timezone || 'Asia/Kolkata' }).format(new Date(iso));
  } catch {
    return iso.slice(11, 16);
  }
};

async function raise(ctx: Ctx, a: SafetyAlert) {
  const st = safetySettings(ctx);
  const s = settings(ctx);
  const p = ctx.db.get('people', a.personId);
  const name = p ? fullName(p) : 'A member';
  const loc = a.locations[a.locations.length - 1] ?? null;
  const what = KIND_LABEL[a.kind];
  const leaders = st.leaderIds.filter((id) => id !== a.personId);
  await notify(ctx, 'alert.raised', {
    personIds: leaders,
    title: `🚨 ${name} needs help now`,
    body: `${name} is ${what}${a.note ? `: “${a.note}”` : '.'}${p?.phone ? ` Phone ${p.phone}.` : ''}${loc ? ` Location: ${mapLink(loc)}` : ' Location not shared yet.'} Location is shared until ${until(ctx, a.shareUntil)}. Open the alert to see it and to say you are responding.`,
    link: `/app/safety/respond/${a.id}`,
  });
  const link = `${ctx.env.webUrl}/alert/${a.token}`;
  const legal = st.legal.filter((c) => c.phone).map((c) => ({ to: c.phone, name: c.name, subject: `Urgent: ${name} (${s.name}) needs help`, text: `Urgent from ${s.name}: ${name} is ${what}${a.note ? ` (“${a.note}”)` : ''}.${p?.phone ? ` Phone ${p.phone}.` : ''} Live location until ${until(ctx, a.shareUntil)}: ${link}` }));
  if (legal.length) {
    await deliverAll(ctx, 'whatsapp', legal).catch(() => undefined);
    await ctx.env.deliver('sms', legal).catch(() => undefined);
  }
  if (st.prayerChain) {
    const chain = chainMembers(ctx).filter((x) => x.id !== a.personId && !leaders.includes(x.id)).map((x) => x.id);
    if (chain.length)
      await notify(ctx, 'prayer.chain', { personIds: chain, title: '🙏 Urgent prayer', body: st.chainNames ? `Please pray now for ${name}, who is ${what}. Pray for protection, calm and wisdom.` : `Please pray now for one of our church family who is ${what}. Pray for protection, calm and wisdom. Please do not share this further.`, link: '/app/prayer' });
  }
}

function hub(ctx: Ctx): SafetyHub {
  const st = safetySettings(ctx);
  return {
    settings: st,
    leaders: st.leaderIds.map((id) => ctx.db.get('people', id)).filter((p): p is NonNullable<typeof p> => !!p).map((p) => ({ id: p.id, name: fullName(p), phone: p.phone })),
    alerts: ctx.db.all('safetyAlerts').sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 100).map((a) => view(ctx, a)),
  };
}

function mine(ctx: Ctx, me: string): MySafety {
  const st = safetySettings(ctx);
  const all = ctx.db.all('safetyAlerts');
  const active = all.filter((a) => a.personId === me && a.status === 'active').sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  const dayAgo = new Date(ctx.now.getTime() - 24 * 60 * MIN).toISOString();
  const responding = st.leaderIds.includes(me) ? all.filter((a) => a.personId !== me && (a.status === 'active' || (a.endedAt ?? '') > dayAgo)).sort((a, b) => b.startedAt.localeCompare(a.startedAt)).map((a) => view(ctx, a)) : [];
  return { ready: st.leaderIds.length > 0 || st.legal.length > 0, leaders: st.leaderIds.length, legal: st.legal.length, prayerChain: st.prayerChain, shareMinutes: st.shareMinutes, alert: active ? view(ctx, active) : null, responding };
}

/** Daily tidy: wipe any locations whose sharing time is over, and close alerts left open a day. */
export function safetyDue(ctx: Ctx) {
  const dayAgo = new Date(ctx.now.getTime() - 24 * 60 * MIN).toISOString();
  for (const a of ctx.db.all('safetyAlerts')) {
    const t = tidy(ctx, a);
    if (t.status === 'active' && t.startedAt < dayAgo) ctx.db.put('safetyAlerts', { ...t, status: 'closed', endedAt: ctx.now.toISOString(), endedBy: 'Closed after a day' });
  }
}

export function registerSafety(r: Router) {
  // ----- member -----
  r.get('/me/safety', {}, (ctx): MySafety => {
    guard(ctx);
    return mine(ctx, ctx.me());
  });
  r.post('/me/safety/alert', {}, async (ctx): Promise<MySafety> => {
    guard(ctx);
    const me = ctx.me();
    const st = safetySettings(ctx);
    if (!st.leaderIds.length && !st.legal.length) throw new ApiError(422, 'not_ready', 'The church has not chosen who to alert yet. Call your pastor or 112.');
    const open = ctx.db.all('safetyAlerts').find((a) => a.personId === me && a.status === 'active');
    const now = ctx.now.toISOString();
    const loc = location(ctx.body, now);
    if (open) {
      // Pressed again: keep the same alert, add the location.
      const next = ctx.db.put('safetyAlerts', { ...open, locations: loc && sharing(ctx, open) ? [...open.locations, loc].slice(-200) : open.locations });
      return { ...mine(ctx, me), alert: view(ctx, next) };
    }
    const kind = KINDS.includes(ctx.body?.kind) ? (ctx.body.kind as SafetyAlertKind) : 'other';
    const a = ctx.db.put('safetyAlerts', { id: ctx.id('sa'), personId: me, kind, note: clean(ctx.body?.note, 300), status: 'active', startedAt: now, shareUntil: new Date(ctx.now.getTime() + st.shareMinutes * MIN).toISOString(), locations: loc ? [loc] : [], acks: [], token: ctx.env.random(16, TOKEN_ALPHABET), endedAt: null, endedBy: null, followUp: '' });
    await raise(ctx, a);
    return mine(ctx, me);
  });
  r.post('/me/safety/location', {}, (ctx): MySafety => {
    guard(ctx);
    const me = ctx.me();
    const a = ctx.db.all('safetyAlerts').find((x) => x.personId === me && x.status === 'active');
    if (!a) throw new ApiError(404, 'not_found', 'There is no alert running.');
    const loc = location(ctx.body, ctx.now.toISOString());
    if (!loc) throw new ApiError(422, 'invalid', 'That location could not be read.');
    if (sharing(ctx, a)) ctx.db.put('safetyAlerts', { ...a, locations: [...a.locations, loc].slice(-200) });
    return mine(ctx, me);
  });
  r.post('/me/safety/safe', {}, async (ctx): Promise<MySafety> => {
    guard(ctx);
    const me = ctx.me();
    const a = ctx.db.all('safetyAlerts').find((x) => x.personId === me && x.status === 'active');
    if (!a) return mine(ctx, me);
    const p = ctx.db.get('people', me);
    ctx.db.put('safetyAlerts', { ...a, status: 'safe', locations: [], endedAt: ctx.now.toISOString(), endedBy: p ? fullName(p) : 'Member' });
    await notify(ctx, 'alert.update', { personIds: safetySettings(ctx).leaderIds.filter((id) => id !== me), title: `${p ? fullName(p) : 'The member'} says they are safe`, body: 'Location sharing has stopped. Please check in with them when you can.', link: `/app/safety/respond/${a.id}` });
    return mine(ctx, me);
  });
  // A chosen leader responding.
  r.post('/me/safety/respond/:id', {}, async (ctx): Promise<MySafety> => {
    guard(ctx);
    const me = ctx.me();
    const st = safetySettings(ctx);
    if (!st.leaderIds.includes(me)) throw new ApiError(403, 'forbidden', 'Only the leaders chosen to respond can see alerts.');
    const a = ctx.db.get('safetyAlerts', ctx.params[0]);
    if (!a) throw new ApiError(404, 'not_found', 'That alert was not found.');
    const p = ctx.db.get('people', me);
    const note = clean(ctx.body?.note, 200);
    const acks = [...a.acks.filter((x) => x.personId !== me), { personId: me, name: p ? fullName(p) : 'Leader', at: ctx.now.toISOString(), note }];
    ctx.db.put('safetyAlerts', { ...a, acks });
    if (!a.acks.some((x) => x.personId === me))
      await notify(ctx, 'alert.update', { personIds: [a.personId, ...st.leaderIds.filter((id) => id !== me && id !== a.personId)], title: `${p ? fullName(p) : 'A leader'} is responding`, body: note || 'They have seen your alert and are on it.', link: '/app/safety' });
    return mine(ctx, me);
  });

  // ----- legal-aid link: works only while the location is shared -----
  r.get('/public/alert/:token', { public: true }, (ctx): PublicSafetyAlert => {
    if (!on(ctx)) throw new ApiError(404, 'not_found', 'This link is not valid.');
    const raw = ctx.db.all('safetyAlerts').find((a) => a.token === ctx.params[0]);
    if (!raw) throw new ApiError(404, 'not_found', 'This link is not valid.');
    const a = tidy(ctx, raw);
    const p = ctx.db.get('people', a.personId);
    const live = sharing(ctx, a);
    return { church: settings(ctx).name, name: p ? fullName(p) : 'Member', phone: live ? (p?.phone ?? null) : null, kind: a.kind, note: live ? a.note : '', status: a.status, startedAt: a.startedAt, shareUntil: a.shareUntil, sharing: live, location: live ? (a.locations[a.locations.length - 1] ?? null) : null, responders: a.acks.length };
  });

  // ----- office (care staff) -----
  r.get('/admin/safety', { perm: 'care' }, (ctx): SafetyHub => {
    guard(ctx);
    return hub(ctx);
  });
  r.put('/admin/safety/settings', { perm: ['care', 'settings'] as ('care' | 'settings')[] }, (ctx): SafetyHub => {
    guard(ctx);
    const st = safetySettings(ctx);
    const b = ctx.body ?? {};
    const next: SafetySettings = { ...st, updatedAt: ctx.now.toISOString() };
    if (Array.isArray(b.leaderIds)) next.leaderIds = [...new Set((b.leaderIds as unknown[]).map(String))].filter((id) => ctx.db.get('people', id)).slice(0, 20);
    if (Array.isArray(b.legal)) {
      next.legal = (b.legal as Record<string, unknown>[]).slice(0, 5).map((c) => ({ id: clean(c?.id, 40) || ctx.id('lg'), name: clean(c?.name, 80), org: clean(c?.org, 120), phone: clean(c?.phone, 20).replace(/[^\d+]/g, '') })).filter((c) => c.name && c.phone.length >= 8);
    }
    if (b.prayerChain !== undefined) next.prayerChain = !!b.prayerChain;
    if (b.chainNames !== undefined) next.chainNames = !!b.chainNames;
    if (b.shareMinutes !== undefined) next.shareMinutes = Math.min(240, Math.max(30, Math.round(Number(b.shareMinutes) || 120)));
    ctx.db.put('safetySettings', next);
    ctx.audit('updated', 'safety', 'main', 'Updated who the emergency alert reaches');
    return hub(ctx);
  });
  r.patch('/admin/safety/alerts/:id', { perm: 'care' }, (ctx): SafetyHub => {
    guard(ctx);
    const a = ctx.db.get('safetyAlerts', ctx.params[0]);
    if (!a) throw new ApiError(404, 'not_found', 'That alert was not found.');
    const close = ctx.body?.status === 'closed' && a.status === 'active';
    ctx.db.put('safetyAlerts', { ...a, followUp: ctx.body?.followUp !== undefined ? clean(ctx.body.followUp, 2000) : a.followUp, ...(close ? { status: 'closed' as const, locations: [], endedAt: ctx.now.toISOString(), endedBy: ctx.staff?.name ?? 'Church office' } : {}) });
    if (close) ctx.audit('updated', 'safetyAlert', a.id, 'Closed an emergency alert');
    return hub(ctx);
  });
}
