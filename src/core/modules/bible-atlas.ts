// Bible dictionary, people, places and timeline. Easton's Bible Dictionary (public domain) for the
// entries; Theographic Bible Metadata (CC BY-SA 4.0) for who is who, family trees, places with map
// coordinates, a timeline of events, and which of them appear in every chapter. Shipped with the
// server in data/atlas (rebuilt by scripts/build-atlas.mjs) and read into memory when first asked.
import { BOOKS } from '../bible.js';
import { BOOK_CODES, bookIndex } from '../bible-texts.js';
import type { Ctx, Router } from '../engine.js';
import { ApiError } from '../errors.js';
import type { AtlasEvent, AtlasName, AtlasPerson, AtlasPlace, AtlasRef, ChapterAtlas, DictionaryEntry, DictionaryHit } from '../types.js';

export const ATLAS_SOURCE = "People, places and timeline from Theographic Bible Metadata (CC BY-SA 4.0); dictionary from Easton's Bible Dictionary (1897).";

type P = { n: string; g: 'm' | 'f' | null; b: number | null; d: number | null; t: string; v: number; r: string[]; f: string[]; m: string[]; c: string[]; s: string[]; w: string[]; bp: string | null; dp: string | null };
type L = { n: string; k: string | null; sk: string | null; la: number | null; lo: number | null; cm: string; t: string; v: number; r: string[]; o: string[] };
type E = { id: number; t: string; y: string | null; du: string | null; r: string[]; p: string[]; l: string[] };
type D = { k: string; i: number; t: string; p: string | null; l: string | null };
type C = Record<string, { p: Record<string, number[]>; l: Record<string, number[]>; e: number[] }>;

const loaded = new Map<string, Promise<unknown>>();

async function gunzip(bytes: Uint8Array): Promise<string> {
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return new TextDecoder().decode(bytes);
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

function load<T>(ctx: Ctx, name: string): Promise<T> {
  const hit = loaded.get(name) as Promise<T> | undefined;
  if (hit) return hit;
  if (!ctx.env.dataFile) throw new ApiError(503, 'offline', 'The Bible dictionary works in the live app.');
  const p = ctx.env.dataFile(`atlas/${name}.json.gz`).then(async (bytes) => {
    if (!bytes) throw new ApiError(503, 'unavailable', 'The Bible dictionary is not installed on this server.');
    return JSON.parse(await gunzip(bytes)) as T;
  });
  loaded.set(name, p);
  p.catch(() => loaded.delete(name));
  return p;
}
const people = (ctx: Ctx) => load<Record<string, P>>(ctx, 'people');
const places = (ctx: Ctx) => load<Record<string, L>>(ctx, 'places');
const events = (ctx: Ctx) => load<E[]>(ctx, 'events');
const dictionary = (ctx: Ctx) => load<D[]>(ctx, 'dictionary');
const chapters = (ctx: Ctx) => load<C>(ctx, 'chapters');

/** "JHN.3.16" → { key, label: "John 3:16" }. */
export function refOf(key: string): AtlasRef {
  const [b, c, v] = key.split('.');
  const i = (BOOK_CODES as readonly string[]).indexOf(b);
  return { key, label: `${i >= 0 ? BOOKS[i].en : b} ${c}:${v}` };
}
/** Years are written "-4003" (BC) or "0057" (AD). */
export const yearOf = (y: string | null): number | null => (y && /^-?\d{1,4}/.test(y) ? parseInt(y, 10) : null);
const named = (map: Record<string, { n: string }>, slugs: string[]): AtlasName[] => slugs.filter((s) => map[s]).map((slug) => ({ slug, name: map[slug].n }));
const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n).replace(/\s+\S*$/, '')}…` : s);
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export async function chapterAtlas(ctx: Ctx, book: string, chapter: number): Promise<ChapterAtlas> {
  const b = bookIndex(book);
  if (b < 0 || !Number.isInteger(chapter) || chapter < 1 || chapter > BOOKS[b].chapters) throw new ApiError(404, 'not_found', 'That chapter is not in the Bible.');
  const [C, P, L, E] = await Promise.all([chapters(ctx), people(ctx), places(ctx), events(ctx)]);
  const ch = C[`${BOOK_CODES[b]}.${chapter}`] ?? { p: {}, l: {}, e: [] };
  const byId = new Map(E.map((e) => [e.id, e]));
  return {
    book: BOOK_CODES[b], chapter,
    people: Object.entries(ch.p).filter(([s]) => P[s]).map(([slug, verses]) => ({ slug, name: P[slug].n, verses, summary: short(P[slug].t, 160) })).sort((x, y) => x.verses[0] - y.verses[0]),
    places: Object.entries(ch.l).filter(([s]) => L[s]).map(([slug, verses]) => ({ slug, name: L[slug].n, type: L[slug].k, lat: L[slug].la, lon: L[slug].lo, verses })).sort((x, y) => x.verses[0] - y.verses[0]),
    events: ch.e.map((id) => byId.get(id)).filter((e): e is E => !!e).map((e) => ({ id: e.id, title: e.t, year: yearOf(e.y), duration: e.du })),
    source: ATLAS_SOURCE,
  };
}

export async function person(ctx: Ctx, slug: string): Promise<AtlasPerson> {
  const [P, L, E] = await Promise.all([people(ctx), places(ctx), events(ctx)]);
  const p = P[slug];
  if (!p) throw new ApiError(404, 'not_found', 'That person is not in the dictionary.');
  const place = (s: string | null) => (s && L[s] ? { slug: s, name: L[s].n } : null);
  return {
    slug, name: p.n, gender: p.g, born: p.b, died: p.d, text: p.t, verseCount: p.v, refs: p.r.map(refOf),
    father: named(P, p.f), mother: named(P, p.m), children: named(P, p.c), siblings: named(P, p.s), partners: named(P, p.w),
    birthPlace: place(p.bp), deathPlace: place(p.dp),
    events: E.filter((e) => e.p.includes(slug)).slice(0, 40).map((e) => ({ id: e.id, title: e.t, year: yearOf(e.y) })),
    source: ATLAS_SOURCE,
  };
}

export async function place(ctx: Ctx, slug: string): Promise<AtlasPlace> {
  const [L, E] = await Promise.all([places(ctx), events(ctx)]);
  const l = L[slug];
  if (!l) throw new ApiError(404, 'not_found', 'That place is not in the dictionary.');
  return {
    slug, name: l.n, type: l.k, subtype: l.sk, lat: l.la, lon: l.lo, comment: l.cm, text: l.t, otherNames: l.o, verseCount: l.v, refs: l.r.map(refOf),
    events: E.filter((e) => e.l.includes(slug)).slice(0, 40).map((e) => ({ id: e.id, title: e.t, year: yearOf(e.y) })),
    source: ATLAS_SOURCE,
  };
}

export async function timeline(ctx: Ctx): Promise<AtlasEvent[]> {
  const [E, P, L] = await Promise.all([events(ctx), people(ctx), places(ctx)]);
  return E.map((e) => ({ id: e.id, title: e.t, year: yearOf(e.y), duration: e.du, refs: e.r.slice(0, 1).map(refOf), people: named(P, e.p).slice(0, 5), places: named(L, e.l).slice(0, 3) }));
}

export async function searchDictionary(ctx: Ctx, q: string): Promise<DictionaryHit[]> {
  const D = await dictionary(ctx);
  const t = fold(q);
  if (t.length < 2) return [];
  const terms = new Map<string, D[]>();
  for (const d of D) { const list = terms.get(d.k) ?? []; list.push(d); terms.set(d.k, list); }
  const rank = (k: string) => { const f = fold(k); return f === t ? 0 : f.startsWith(t) ? 1 : f.includes(t) ? 2 : 9; };
  const hits = [...terms.keys()].map((k) => ({ k, r: rank(k) })).filter((x) => x.r < 9);
  // Fall back to the entries' text when no headword matches.
  if (!hits.length) for (const [k, list] of terms) if (list.some((d) => fold(d.t).includes(t))) hits.push({ k, r: 5 });
  return hits.sort((a, b) => a.r - b.r || a.k.localeCompare(b.k)).slice(0, 30).map(({ k }) => {
    const list = terms.get(k)!;
    return { term: k, snippet: short(list[0].t, 140), senses: list.length };
  });
}

export async function dictionaryEntry(ctx: Ctx, term: string): Promise<DictionaryEntry> {
  const [D, P, L] = await Promise.all([dictionary(ctx), people(ctx), places(ctx)]);
  const t = fold(term);
  const list = D.filter((d) => fold(d.k) === t).sort((a, b) => a.i - b.i);
  if (!list.length) throw new ApiError(404, 'not_found', `"${term}" is not in the dictionary.`);
  const p = list.find((d) => d.p && P[d.p])?.p ?? null;
  const l = list.find((d) => d.l && L[d.l])?.l ?? null;
  return { term: list[0].k, senses: list.map((d) => d.t), person: p ? { slug: p, name: P[p].n } : null, place: l ? { slug: l, name: L[l].n } : null, source: ATLAS_SOURCE };
}

export function registerBibleAtlas(r: Router) {
  r.get('/public/bible/atlas/chapter/:book/:chapter', { public: true }, (ctx) => chapterAtlas(ctx, ctx.params[0].toUpperCase(), Number(ctx.params[1])));
  r.get('/public/bible/people/:slug', { public: true }, (ctx) => person(ctx, ctx.params[0]));
  r.get('/public/bible/places/:slug', { public: true }, (ctx) => place(ctx, ctx.params[0]));
  r.get('/public/bible/timeline', { public: true }, (ctx) => timeline(ctx));
  r.get('/public/bible/dictionary', { public: true }, (ctx) => searchDictionary(ctx, String(ctx.query.q ?? '')));
  r.get('/public/bible/dictionary/:term', { public: true }, (ctx) => dictionaryEntry(ctx, decodeURIComponent(ctx.params[0])));
}
