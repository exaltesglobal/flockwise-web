// Festival-season care. Before Diwali, Pongal, Onam or Christmas, the pastor sees the people who
// may feel left out at home: the first in their family to follow Jesus, or living in a home that
// keeps another faith. Each gets a suggestion (a visit, a gift, a call, an invitation) that the
// team can plan and tick off. This list is sensitive, so only office staff with care access see it,
// it is kept apart from the person record, and it is never shown to members or exported with people.
import type { Ctx, Router } from '../engine.js';
import { ApiError } from '../errors.js';
import { featureOn } from '../features.js';
import type { Collections, Festival, FestivalCareAction, FestivalCareHub, FestivalCareRecord, FestivalCareRow, FestivalCareSettings, FestivalFamily } from '../types.js';
import { find, fullName, localDate, settings } from '../util.js';

/** Dates checked against Drik Panchang (2026–2027). Churches add later years or their own festivals in the settings. */
const KNOWN: { key: string; name: string; dates: string[]; gift: string; visit: string }[] = [
  { key: 'pongal', name: 'Pongal / Sankranti', dates: ['2027-01-15'], gift: 'sugarcane, jaggery and a card', visit: 'Visit in the Pongal week and eat with them' },
  { key: 'holi', name: 'Holi', dates: ['2027-03-22'], gift: 'sweets and a card', visit: 'Visit the evening after Holi' },
  { key: 'eid', name: 'Eid al-Fitr', dates: ['2027-03-10'], gift: 'a box of sweets for the family', visit: 'Visit with sweets after Eid' },
  { key: 'ganesh', name: 'Ganesh Chaturthi', dates: ['2026-09-14', '2027-09-04'], gift: 'a fruit basket', visit: 'Visit in the festival week' },
  { key: 'onam', name: 'Onam', dates: ['2026-08-26', '2027-09-12'], gift: 'payasam or a sadya invitation', visit: 'Invite them to a church Onam lunch' },
  { key: 'dussehra', name: 'Dussehra', dates: ['2026-10-20'], gift: 'sweets and a card', visit: 'Visit in the Dussehra holidays' },
  { key: 'diwali', name: 'Diwali', dates: ['2026-11-08', '2027-10-29'], gift: 'a sweets box and a card', visit: 'Visit before Diwali with sweets' },
  { key: 'christmas', name: 'Christmas', dates: ['2026-12-25', '2027-12-25', '2028-12-25'], gift: 'a Christmas cake for the whole family', visit: 'Invite the family to the carol service and visit with a cake' },
];
const DEFAULT: FestivalCareSettings = { festivals: ['pongal', 'onam', 'diwali', 'christmas'], custom: [], leadDays: 21 };
const ACTIONS: FestivalCareAction[] = ['visit', 'gift', 'call', 'invite'];
const DAY = 86_400_000;

export const careSettings = (ctx: Ctx): FestivalCareSettings => ({ ...DEFAULT, ...(settings(ctx).festivalCare ?? {}) }) as FestivalCareSettings;

function guard(ctx: Ctx) {
  if (!featureOn(settings(ctx).features, 'festival-care')) throw new ApiError(404, 'not_found', 'Festival care is switched off for this church.');
}

/** The next date of each festival the church follows, today or later. */
function festivalsAhead(ctx: Ctx, s: FestivalCareSettings): Festival[] {
  const today = localDate(ctx, ctx.now);
  const out: Festival[] = [];
  for (const f of KNOWN) {
    if (!s.festivals.includes(f.key)) continue;
    const date = f.dates.find((d) => d >= today);
    if (date) out.push({ key: f.key, name: f.name, date });
  }
  for (const c of s.custom) if (c.date >= today) out.push({ key: c.key, name: c.name, date: c.date, custom: true });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY);

function reasonFor(f: FestivalFamily) {
  const home = f.home === 'other' ? 'the rest of the family keep another faith' : 'only some of the family follow Jesus';
  return f.firstGeneration ? `First in the family to follow Jesus; ${home}` : home.charAt(0).toUpperCase() + home.slice(1);
}

/** Christmas is the church's own festival: invite them in. Others are the family's: go to them. */
function suggest(festival: Festival, f: FestivalFamily): { action: FestivalCareAction; text: string } {
  const k = KNOWN.find((x) => x.key === festival.key);
  if (festival.key === 'christmas') return { action: 'invite', text: k!.visit };
  if (f.firstGeneration && f.home === 'other') return { action: 'visit', text: k ? k.visit : `Visit before ${festival.name}` };
  return { action: 'gift', text: k ? `Send ${k.gift}` : `Send a small gift and a card for ${festival.name}` };
}

function zoneInfo(ctx: Ctx, p: Collections['people']) {
  const z = p.zoneId ? ctx.db.get('zones', p.zoneId) : undefined;
  return { zone: z?.name ?? null, zoneLeaders: (z?.leaderIds ?? []).map((id) => ctx.db.get('people', id)).filter((x): x is Collections['people'] => !!x).map(fullName) };
}

export function festivalCareHub(ctx: Ctx): FestivalCareHub {
  const s = careSettings(ctx);
  const today = localDate(ctx, ctx.now);
  const families = ctx.db.all('festivalFamilies');
  const records = ctx.db.all('festivalCare');
  const upcoming = festivalsAhead(ctx, s)
    .map((f) => ({ ...f, daysAway: daysBetween(today, f.date) }))
    .filter((f) => f.daysAway <= Math.max(s.leadDays, 7) + 30)
    .map((f) => {
      const rows: FestivalCareRow[] = families
        .filter((fam) => !fam.festivals.length || fam.festivals.includes(f.key))
        .map((fam) => ({ fam, p: ctx.db.get('people', fam.id) }))
        .filter((x): x is { fam: FestivalFamily; p: Collections['people'] } => !!x.p && x.p.status !== 'inactive')
        .map(({ fam, p }) => ({
          personId: p.id, name: fullName(p), phone: p.phone, householdName: p.householdName, ...zoneInfo(ctx, p),
          reason: reasonFor(fam), suggestion: suggest(f, fam),
          record: records.find((r) => r.id === `${f.key}:${f.date}:${p.id}`) ?? null,
        }))
        // Not yet planned first, then the first-generation believers.
        .sort((a, b) => Number(a.record?.status === 'done') - Number(b.record?.status === 'done') || Number(!!a.record) - Number(!!b.record) || a.name.localeCompare(b.name));
      return { ...f, rows, done: rows.filter((r) => r.record?.status === 'done').length };
    });
  const listed = new Set(families.map((f) => f.id));
  const people = ctx.db.all('people');
  const since = localDate(ctx, new Date(ctx.now.getTime() - 730 * DAY));
  const maybe = people
    .filter((p) => !listed.has(p.id) && p.status !== 'inactive' && p.baptismDate && p.baptismDate >= since)
    .filter((p) => !p.householdName || people.filter((q) => q.householdName === p.householdName && q.status !== 'inactive').length === 1)
    .slice(0, 20)
    .map((p) => ({ personId: p.id, name: fullName(p), why: `Baptised ${p.baptismDate}, the only one from their home in the church` }));
  return {
    settings: s,
    known: KNOWN.map((k) => ({ key: k.key, name: k.name, next: k.dates.find((d) => d >= today) ?? null })),
    upcoming,
    families: families.map((f) => ({ ...f, name: ctx.db.get('people', f.id) ? fullName(ctx.db.get('people', f.id)!) : 'Removed person' })).sort((a, b) => a.name.localeCompare(b.name)),
    maybe,
  };
}

const keyOf = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'festival';
const isDate = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

export function registerFestivalCare(r: Router) {
  r.get('/admin/festival-care', { perm: 'care' }, (ctx) => { guard(ctx); return festivalCareHub(ctx); });

  r.put('/admin/festival-care/settings', { perm: 'care' }, (ctx) => {
    guard(ctx);
    const b = ctx.body as Partial<FestivalCareSettings>;
    const known = new Set(KNOWN.map((k) => k.key));
    const custom = (Array.isArray(b.custom) ? b.custom : []).slice(0, 30).map((c) => {
      const name = String(c?.name ?? '').trim().slice(0, 40);
      if (!name || !isDate(c?.date)) throw new ApiError(422, 'invalid', 'Each festival you add needs a name and a date.');
      return { key: c.key && !known.has(String(c.key)) ? String(c.key).slice(0, 40) : `c-${keyOf(name)}-${String(c.date).slice(0, 4)}`, name, date: String(c.date) };
    });
    const next: FestivalCareSettings = {
      festivals: (Array.isArray(b.festivals) ? b.festivals.map(String) : careSettings(ctx).festivals).filter((k) => known.has(k)),
      custom,
      leadDays: Math.max(7, Math.min(60, Math.round(Number(b.leadDays) || DEFAULT.leadDays))),
    };
    ctx.db.put('settings', { ...settings(ctx), festivalCare: next });
    return festivalCareHub(ctx);
  });

  r.put('/admin/festival-care/families/:personId', { perm: 'care' }, (ctx) => {
    guard(ctx);
    const p = find(ctx, 'people', ctx.params[0], 'Person');
    const b = ctx.body as Partial<FestivalFamily>;
    const fam: FestivalFamily = {
      id: p.id,
      home: b.home === 'other' ? 'other' : 'mixed',
      firstGeneration: !!b.firstGeneration,
      festivals: Array.isArray(b.festivals) ? [...new Set(b.festivals.map(String))].slice(0, 20) : [],
      note: String(b.note ?? '').trim().slice(0, 300) || null,
      addedBy: ctx.db.get('festivalFamilies', p.id)?.addedBy ?? ctx.staff?.name ?? 'Office',
      updatedAt: ctx.now.toISOString(),
    };
    ctx.db.put('festivalFamilies', fam);
    // The person's name is not written to the audit log: being on this list is itself sensitive.
    ctx.audit('updated', 'festivalCare', p.id, 'Updated the festival care list');
    return festivalCareHub(ctx);
  });

  r.del('/admin/festival-care/families/:personId', { perm: 'care' }, (ctx) => {
    guard(ctx);
    ctx.db.del('festivalFamilies', ctx.params[0]);
    for (const rec of ctx.db.all('festivalCare').filter((x) => x.personId === ctx.params[0] && x.status === 'planned')) ctx.db.del('festivalCare', rec.id);
    ctx.audit('deleted', 'festivalCare', ctx.params[0], 'Took someone off the festival care list');
    return festivalCareHub(ctx);
  });

  // Plan, reassign, tick off or clear the care for one person and one festival.
  r.put('/admin/festival-care/records', { perm: 'care' }, (ctx) => {
    guard(ctx);
    const b = ctx.body as Partial<FestivalCareRecord> & { clear?: boolean };
    const festival = festivalsAhead(ctx, careSettings(ctx)).find((f) => f.key === b.festivalKey && f.date === b.date)
      ?? (b.festivalKey && isDate(b.date) ? { key: String(b.festivalKey), date: String(b.date) } : null);
    if (!festival) throw new ApiError(422, 'invalid', 'Pick a festival.');
    const p = find(ctx, 'people', String(b.personId ?? ''), 'Person');
    const id = `${festival.key}:${festival.date}:${p.id}`;
    if (b.clear) { ctx.db.del('festivalCare', id); return festivalCareHub(ctx); }
    const cur = ctx.db.get('festivalCare', id);
    const status = b.status === 'done' ? 'done' : 'planned';
    ctx.db.put('festivalCare', {
      id, festivalKey: festival.key, date: festival.date, personId: p.id,
      action: ACTIONS.includes(b.action as FestivalCareAction) ? (b.action as FestivalCareAction) : cur?.action ?? 'visit',
      by: b.by !== undefined ? String(b.by ?? '').trim().slice(0, 60) || null : cur?.by ?? ctx.staff?.name ?? null,
      status, note: b.note !== undefined ? String(b.note ?? '').trim().slice(0, 300) || null : cur?.note ?? null,
      doneAt: status === 'done' ? cur?.doneAt ?? ctx.now.toISOString() : null,
      updatedAt: ctx.now.toISOString(),
    });
    return festivalCareHub(ctx);
  });
}
