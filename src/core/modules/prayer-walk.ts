// Neighbourhood prayer walk map. The office sets the church's area (a centre and a radius) and
// loads its streets and lanes from OpenStreetMap (or draws them). Members walk a street praying for
// the homes, shops and schools on it, and mark it walked in the app. A street counts as prayed for
// when someone walked it in the last 30 days (the church can change this), so the map shows which
// lanes are covered and which are waiting, and over a month the whole locality is prayed for.
// Street data © OpenStreetMap contributors (ODbL).
import type { Ctx, Router } from '../engine.js';
import { ApiError } from '../errors.js';
import { featureOn } from '../features.js';
import type { PrayerWalkView, WalkArea, WalkStreet, WalkStreetView } from '../types.js';
import { fullName, settings } from '../util.js';

const OVERPASS = 'https://overpass-api.de/api/interpreter';
const ROADS = 'primary|secondary|tertiary|unclassified|residential|living_street|service|pedestrian|footway|track|road';
const KIND_LABEL: Record<string, string> = { primary: 'Main road', secondary: 'Road', tertiary: 'Road', unclassified: 'Road', residential: 'Street', living_street: 'Lane', service: 'Lane', pedestrian: 'Walkway', footway: 'Footpath', track: 'Track', road: 'Road' };
const MAX_STREETS = 800;
const DAY = 86_400_000;
const DEFAULT_PROMPTS = [
  'Bless the families in these homes with health, peace and work.',
  'Pray for the children and the schools on this street.',
  'Pray for the shopkeepers and their trade.',
  'Pray for anyone sick, lonely or grieving behind these doors.',
  'Ask God to open hearts to the good news of Jesus.',
  'Pray for safety from accidents, violence and quarrels.',
];
const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function guard(ctx: Ctx) {
  if (!featureOn(settings(ctx).features, 'prayer-walk')) throw new ApiError(404, 'not_found', 'The prayer walk map is switched off for this church.');
}

export function walkArea(ctx: Ctx): WalkArea {
  return ctx.db.get('walkArea', 'main') ?? { id: 'main', name: '', center: null, radius: 1000, cycleDays: 30, prompts: DEFAULT_PROMPTS, source: null, loadedAt: null, updatedAt: '' };
}

/** Metres between two points. */
export function metres(a: [number, number], b: [number, number]) {
  const R = 6_371_000;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const lengthOf = (path: [number, number][]) => Math.round(path.slice(1).reduce((t, p, i) => t + metres(path[i], p), 0));
const round = (n: number) => Math.round(n * 1e6) / 1e6;

/** Keeps a path light: no more than 40 points, ends kept. */
function simplify(path: [number, number][]): [number, number][] {
  if (path.length <= 40) return path;
  const step = (path.length - 1) / 39;
  return Array.from({ length: 40 }, (_, i) => path[Math.round(i * step)]);
}

function path(v: unknown): [number, number][] {
  if (!Array.isArray(v)) return [];
  return simplify(
    v
      .map((p) => (Array.isArray(p) ? [Number(p[0]), Number(p[1])] : [Number((p as { lat?: number })?.lat), Number((p as { lng?: number; lon?: number })?.lng ?? (p as { lon?: number })?.lon)]))
      .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) <= 90 && Math.abs(b) <= 180)
      .map(([a, b]) => [round(a), round(b)] as [number, number]),
  );
}

function view(ctx: Ctx, staff: boolean): PrayerWalkView {
  const area = walkArea(ctx);
  const since = new Date(ctx.now.getTime() - area.cycleDays * DAY).toISOString();
  const me = staff ? null : ctx.me();
  const marks = ctx.db.all('walkMarks');
  const byStreet = new Map<string, { last: string; walks: number; mine: boolean }>();
  for (const m of marks) {
    const row = byStreet.get(m.streetId) ?? { last: '', walks: 0, mine: false };
    if (m.at > row.last) row.last = m.at;
    if (m.at >= since) row.walks++;
    if (m.personId === me) row.mine = true;
    byStreet.set(m.streetId, row);
  }
  const streets: WalkStreetView[] = ctx.db.all('walkStreets').map((s) => {
    const r = byStreet.get(s.id);
    return { ...s, lastWalkedAt: r?.last || null, walks: r?.walks ?? 0, covered: !!r && r.last >= since, mine: !!r?.mine };
  });
  const cycle = marks.filter((m) => m.at >= since);
  const walkerCounts = new Map<string, { name: string; streets: Set<string> }>();
  for (const m of cycle) {
    const row = walkerCounts.get(m.personId) ?? { name: m.name, streets: new Set<string>() };
    row.streets.add(m.streetId);
    walkerCounts.set(m.personId, row);
  }
  const first = (n: string) => (staff ? n : n.split(' ')[0]);
  const names = new Map(streets.map((s) => [s.id, s.name]));
  const length = streets.reduce((t, s) => t + s.length, 0);
  const coveredLength = streets.filter((s) => s.covered).reduce((t, s) => t + s.length, 0);
  return {
    area,
    streets,
    stats: { streets: streets.length, covered: streets.filter((s) => s.covered).length, length, coveredLength, percent: length ? Math.round((coveredLength / length) * 100) : 0, walkers: walkerCounts.size, walksThisCycle: cycle.length },
    walkers: [...walkerCounts.values()].map((w) => ({ name: first(w.name), streets: w.streets.size })).sort((a, b) => b.streets - a.streets).slice(0, 10),
    recent: marks.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 12).map((m) => ({ streetName: names.get(m.streetId) ?? 'A street', name: first(m.name), at: m.at, note: staff ? m.note : '' })),
    myStreets: me ? new Set(cycle.filter((m) => m.personId === me).map((m) => m.streetId)).size : 0,
  };
}

type OsmElement = { type: string; id: number; tags?: Record<string, string>; geometry?: { lat: number; lon: number }[] };

/** Overpass ways to streets: driveways and parking aisles left out, unnamed lanes numbered. */
export function streetsFromOverpass(elements: OsmElement[]): WalkStreet[] {
  const unnamed = new Map<string, number>();
  const out: WalkStreet[] = [];
  for (const e of elements) {
    if (e.type !== 'way' || !e.geometry?.length || e.geometry.length < 2) continue;
    const kind = e.tags?.highway ?? 'road';
    if (kind === 'service' && e.tags?.service && e.tags.service !== 'alley') continue;
    const p = simplify(e.geometry.map((g) => [round(g.lat), round(g.lon)] as [number, number]));
    const len = lengthOf(p);
    if (len < 25) continue;
    let name = clean(e.tags?.name ?? e.tags?.['name:en'], 100);
    if (!name) {
      const label = KIND_LABEL[kind] ?? 'Lane';
      const n = (unnamed.get(label) ?? 0) + 1;
      unnamed.set(label, n);
      name = `${label} ${n}`;
    }
    out.push({ id: `osm${e.id}`, name, kind, path: p, length: len, osmId: e.id });
  }
  return out.slice(0, MAX_STREETS);
}

/** Streets and lanes inside the area, from OpenStreetMap's Overpass service. */
async function loadOsm(ctx: Ctx, area: WalkArea): Promise<WalkStreet[]> {
  if (!ctx.env.http) throw new ApiError(503, 'unavailable', 'This server cannot reach OpenStreetMap. Draw the streets instead.');
  const c = area.center!;
  const q = `[out:json][timeout:25];way["highway"~"^(${ROADS})$"](around:${area.radius},${c.lat},${c.lng});out tags geom ${MAX_STREETS};`;
  const r = await ctx.env.http({ method: 'POST', url: OVERPASS, headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Flockwise/1.0 (church prayer walk map)' }, body: `data=${encodeURIComponent(q)}`, timeoutMs: 30_000 });
  if (r.status !== 200) throw new ApiError(502, 'osm_failed', 'OpenStreetMap did not answer. Try again in a minute, or make the area smaller.');
  let data: { elements?: OsmElement[] };
  try {
    data = JSON.parse(r.text);
  } catch {
    throw new ApiError(502, 'osm_failed', 'OpenStreetMap sent something unexpected. Try again in a minute.');
  }
  const out = streetsFromOverpass(data.elements ?? []);
  if (!out.length) throw new ApiError(422, 'no_streets', 'OpenStreetMap has no streets mapped in this area yet. Draw them instead, or move the centre.');
  return out;
}

export function registerPrayerWalk(r: Router) {
  // ----- office -----
  r.get('/admin/prayer-walk', { perm: 'care' }, (ctx): PrayerWalkView => {
    guard(ctx);
    return view(ctx, true);
  });
  r.put('/admin/prayer-walk/area', { perm: 'care' }, (ctx): PrayerWalkView => {
    guard(ctx);
    const a = walkArea(ctx);
    const b = ctx.body ?? {};
    const next: WalkArea = { ...a, updatedAt: ctx.now.toISOString() };
    if (b.name !== undefined) next.name = clean(b.name, 100);
    if (b.center !== undefined) {
      const lat = Number(b.center?.lat);
      const lng = Number(b.center?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new ApiError(422, 'invalid', 'Choose the centre on the map.', { center: 'Invalid' });
      next.center = { lat: round(lat), lng: round(lng) };
    }
    if (b.radius !== undefined) next.radius = Math.min(3000, Math.max(200, Math.round(Number(b.radius) || 1000)));
    if (b.cycleDays !== undefined) next.cycleDays = Math.min(90, Math.max(7, Math.round(Number(b.cycleDays) || 30)));
    if (Array.isArray(b.prompts)) next.prompts = (b.prompts as unknown[]).map((x) => clean(x, 200)).filter(Boolean).slice(0, 12);
    ctx.db.put('walkArea', next);
    return view(ctx, true);
  });
  r.post('/admin/prayer-walk/load', { perm: 'care' }, async (ctx): Promise<PrayerWalkView> => {
    guard(ctx);
    const a = walkArea(ctx);
    if (!a.center) throw new ApiError(422, 'invalid', 'Set the centre of the area first.');
    const streets = await loadOsm(ctx, a);
    const keep = new Set(streets.map((s) => s.id));
    for (const s of ctx.db.all('walkStreets')) if (s.osmId !== null && !keep.has(s.id)) ctx.db.del('walkStreets', s.id);
    for (const s of streets) ctx.db.put('walkStreets', s);
    ctx.db.put('walkArea', { ...a, source: 'osm', loadedAt: ctx.now.toISOString() });
    ctx.audit('updated', 'prayerWalk', 'main', `Loaded ${streets.length} streets from OpenStreetMap`);
    return view(ctx, true);
  });
  r.post('/admin/prayer-walk/streets', { perm: 'care' }, (ctx): PrayerWalkView => {
    guard(ctx);
    const name = clean(ctx.body?.name, 100);
    const p = path(ctx.body?.path);
    if (!name) throw new ApiError(422, 'invalid', 'Name the street.', { name: 'Required' });
    if (p.length < 2) throw new ApiError(422, 'invalid', 'Tap at least two points along the street.', { path: 'Too short' });
    ctx.db.put('walkStreets', { id: ctx.id('ws'), name, kind: 'drawn', path: p, length: lengthOf(p), osmId: null });
    const a = walkArea(ctx);
    if (!a.source) ctx.db.put('walkArea', { ...a, source: 'drawn' });
    return view(ctx, true);
  });
  r.patch('/admin/prayer-walk/streets/:id', { perm: 'care' }, (ctx): PrayerWalkView => {
    guard(ctx);
    const s = ctx.db.get('walkStreets', ctx.params[0]);
    if (!s) throw new ApiError(404, 'not_found', 'That street was not found.');
    const name = clean(ctx.body?.name, 100);
    if (name) ctx.db.put('walkStreets', { ...s, name });
    return view(ctx, true);
  });
  r.del('/admin/prayer-walk/streets/:id', { perm: 'care' }, (ctx): PrayerWalkView => {
    guard(ctx);
    const s = ctx.db.get('walkStreets', ctx.params[0]);
    if (!s) throw new ApiError(404, 'not_found', 'That street was not found.');
    ctx.db.del('walkStreets', s.id);
    for (const m of ctx.db.all('walkMarks').filter((x) => x.streetId === s.id)) ctx.db.del('walkMarks', m.id);
    return view(ctx, true);
  });

  // ----- member -----
  r.get('/me/prayer-walk', {}, (ctx): PrayerWalkView => {
    guard(ctx);
    return view(ctx, false);
  });
  r.post('/me/prayer-walk/walked', {}, (ctx): PrayerWalkView => {
    guard(ctx);
    const me = ctx.me();
    const person = ctx.db.get('people', me);
    const ids: string[] = Array.isArray(ctx.body?.streetIds) ? [...new Set((ctx.body.streetIds as unknown[]).map(String))].slice(0, 30) : [];
    const streets = ids.map((id) => ctx.db.get('walkStreets', id)).filter((s): s is WalkStreet => !!s);
    if (!streets.length) throw new ApiError(422, 'invalid', 'Choose the streets you walked.');
    const hourAgo = new Date(ctx.now.getTime() - 3_600_000).toISOString();
    const note = clean(ctx.body?.note, 300);
    for (const s of streets) {
      // The same walker marking the same street twice within the hour counts once.
      if (ctx.db.all('walkMarks').some((m) => m.streetId === s.id && m.personId === me && m.at >= hourAgo)) continue;
      ctx.db.put('walkMarks', { id: ctx.id('wm'), streetId: s.id, personId: me, name: person ? fullName(person) : 'Member', at: ctx.now.toISOString(), note });
    }
    return view(ctx, false);
  });
  r.del('/me/prayer-walk/walked/:streetId', {}, (ctx): PrayerWalkView => {
    guard(ctx);
    const me = ctx.me();
    const mine = ctx.db.all('walkMarks').filter((m) => m.streetId === ctx.params[0] && m.personId === me).sort((a, b) => b.at.localeCompare(a.at))[0];
    if (mine) ctx.db.del('walkMarks', mine.id);
    return view(ctx, false);
  });
}
