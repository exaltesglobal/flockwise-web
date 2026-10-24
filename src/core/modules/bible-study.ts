// Bible study tools on top of the reader: search a whole Bible in any language, and "see also"
// cross references for any verse. Each Bible's full text is downloaded once from eBible.org (its
// verse-per-line file) and kept in memory for a while; the cross references are the Treasury of
// Scripture Knowledge as shared by OpenBible.info (CC BY), loaded once for the whole server.
import { BOOKS } from '../bible.js';
import { BOOK_CODES, bookIndex, parseReference } from '../bible-texts.js';
import type { Ctx, Router } from '../engine.js';
import { ApiError } from '../errors.js';
import type { BibleCrossRef, BibleHit, BibleSearch } from '../types.js';
import { zipEntries, zipRead } from '../unzip.js';
import { remember, translation } from './bible.js';

const UA = 'Mozilla/5.0 (compatible; Flockwise/1.0; +https://flockwise.church)';
const verseKey = (book: number, chapter: number, verse: number) => (book + 1) * 1_000_000 + chapter * 1000 + verse;
const fromKey = (k: number) => ({ book: Math.floor(k / 1_000_000) - 1, chapter: Math.floor(k / 1000) % 1000, verse: k % 1000 });

/** A big download, kept in the server's file cache when it has one. */
async function download(ctx: Ctx, url: string, cacheKey: string): Promise<Uint8Array | null> {
  if (!ctx.env.http || ctx.env.demo) throw new ApiError(503, 'offline', 'Bible search needs the internet. It works in the live app.');
  const cached = await ctx.env.fileCache?.get(cacheKey).catch(() => null);
  if (cached) return cached;
  const r = await ctx.env.http({ method: 'GET', url, binary: true, timeoutMs: 240_000, headers: { 'User-Agent': UA } }).catch((e: Error) => ({ status: 0, headers: {}, text: e.message, bytes: undefined }));
  if (r.status === 404) return null;
  if (r.status !== 200 || !r.bytes) throw new ApiError(502, 'bible_unreachable', `Could not reach the Bible library (${r.status || r.text.slice(0, 80)}). Try again in a minute.`);
  await ctx.env.fileCache?.put(cacheKey, r.bytes).catch(() => undefined);
  return r.bytes;
}

// ---- Whole Bibles ----

/** A Bible's every verse, sorted by book, chapter and verse. */
export type FullBible = { keys: number[]; texts: string[]; folded: string[] };

/** Lower case, accents off (Latin only), so "Jesús" finds "jesus"; Indian scripts are left as written. */
export const fold = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').normalize('NFC').toLowerCase();

/** eBible.org's verse-per-line files use BibleWorks codes where they differ from USFM. */
const VPL_CODES: Record<string, string> = { SOL: 'SNG', EZE: 'EZK', JOE: 'JOL', NAH: 'NAM', MAR: 'MRK', JOH: 'JHN', PHI: 'PHP', JAM: 'JAS', '1JO': '1JN', '2JO': '2JN', '3JO': '3JN' };

/** eBible.org's verse-per-line text: "GEN 1:1 In the beginning…". Books outside the 66 are skipped. */
export function parseVpl(text: string): FullBible {
  const rows: [number, string][] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^([1-4A-Z][A-Z0-9]{2}) (\d+):(\d+)\s*(.*)$/.exec(line);
    if (!m) continue;
    const b = bookIndex(VPL_CODES[m[1]] ?? m[1]);
    const words = m[4].replace(/<[^>]+>/g, '').replace(/[¶¶]/g, '').replace(/\s+/g, ' ').trim();
    if (b < 0 || !words) continue;
    rows.push([verseKey(b, Number(m[2]), Number(m[3])), words]);
  }
  rows.sort((a, b) => a[0] - b[0]);
  return { keys: rows.map((r) => r[0]), texts: rows.map((r) => r[1]), folded: rows.map((r) => fold(r[1])) };
}

const fullBibles = new Map<string, Promise<FullBible>>();

/** Whether a Bible is in memory and ready to search; starts loading it if not. */
export function bibleReady(ctx: Ctx, id: string): { ready: boolean; failed?: string } {
  const t = translation(ctx, id);
  const failure = failed.get(t.id);
  if (failure) { failed.delete(t.id); return { ready: false, failed: failure }; }
  if (fullBibles.has(t.id) && loaded.has(t.id)) return { ready: true };
  if (!fullBibles.has(t.id)) fullBible(ctx, t.id).catch(() => undefined);
  return { ready: false };
}
const loaded = new Set<string>();
const failed = new Map<string, string>();

export function fullBible(ctx: Ctx, id: string): Promise<FullBible> {
  const t = translation(ctx, id);
  if (!ctx.env.http || ctx.env.demo) throw new ApiError(503, 'offline', 'Bible search needs the internet. It works in the live app.');
  const p = remember(fullBibles, t.id, 4, async () => {
    const zip = await download(ctx, `https://ebible.org/Scriptures/${t.id}_vpl.zip`, `${t.id}_vpl.zip`);
    if (!zip) throw new ApiError(404, 'not_found', `${t.name} cannot be searched yet.`);
    const entries = zipEntries(zip);
    const e = entries.find((x) => /_vpl\.txt$/i.test(x.name)) ?? entries.find((x) => /\.txt$/i.test(x.name));
    if (!e) throw new ApiError(502, 'bible_unreadable', `Could not read ${t.name} for searching (files: ${entries.map((x) => x.name).join(', ').slice(0, 160)}).`);
    const bible = parseVpl(new TextDecoder().decode(await zipRead(zip, e)));
    if (bible.keys.length < 100) throw new ApiError(502, 'bible_unreadable', `Could not read ${t.name} for searching (${e.name}, ${bible.keys.length} verses).`);
    return bible;
  });
  p.then(() => { loaded.add(t.id); failed.delete(t.id); }, (e: Error) => failed.set(t.id, e.message));
  return p;
}

function find(b: FullBible, key: number): number {
  let lo = 0, hi = b.keys.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (b.keys[mid] === key) return mid;
    if (b.keys[mid] < key) lo = mid + 1; else hi = mid - 1;
  }
  return -lo - 1;
}

/** The words from one verse to another (at most eight verses), joined. */
export function versesText(b: FullBible, from: number, to: number): string {
  let i = find(b, from);
  if (i < 0) i = -i - 1;
  const out: string[] = [];
  for (; i < b.keys.length && b.keys[i] <= to && out.length < 8; i++) out.push(b.texts[i]);
  return out.join(' ');
}

/** Words and "quoted phrases"; every one must appear in the verse. */
export function searchTerms(q: string): string[] {
  const terms: string[] = [];
  const s = fold(q).replace(/"([^"]+)"/g, (_, p: string) => { terms.push(p.trim()); return ' '; });
  for (const w of s.split(/[\s,;.!?]+/)) if (w) terms.push(w);
  return terms.filter((x) => x.length > 0);
}

const MAX_HITS = 300;

export function searchBible(b: FullBible, q: string, scope = ''): Omit<BibleSearch, 'translation' | 'q'> {
  const terms = searchTerms(q);
  const one = scope && scope !== 'ot' && scope !== 'nt' ? bookIndex(scope) : -1;
  const results: BibleHit[] = [];
  const counts = new Map<number, number>();
  let total = 0;
  if (!terms.length) return { total, results, books: [] };
  for (let i = 0; i < b.keys.length; i++) {
    const book = Math.floor(b.keys[i] / 1_000_000) - 1;
    if (one >= 0 ? book !== one : scope === 'ot' ? book > 38 : scope === 'nt' ? book < 39 : false) continue;
    const f = b.folded[i];
    if (!terms.every((t) => f.includes(t))) continue;
    total++;
    counts.set(book, (counts.get(book) ?? 0) + 1);
    if (results.length < MAX_HITS) { const k = fromKey(b.keys[i]); results.push({ book: BOOK_CODES[k.book], chapter: k.chapter, verse: k.verse, text: b.texts[i] }); }
  }
  return { total, results, books: [...counts].sort((a, c) => a[0] - c[0]).map(([book, count]) => ({ book: BOOK_CODES[book], count })) };
}

// ---- Cross references ----

/** OpenBible.info's book abbreviations, in Bible order. */
export const OSIS = ['Gen', 'Exod', 'Lev', 'Num', 'Deut', 'Josh', 'Judg', 'Ruth', '1Sam', '2Sam', '1Kgs', '2Kgs', '1Chr', '2Chr', 'Ezra', 'Neh', 'Esth', 'Job', 'Ps', 'Prov', 'Eccl', 'Song', 'Isa', 'Jer', 'Lam', 'Ezek', 'Dan', 'Hos', 'Joel', 'Amos', 'Obad', 'Jonah', 'Mic', 'Nah', 'Hab', 'Zeph', 'Hag', 'Zech', 'Mal', 'Matt', 'Mark', 'Luke', 'John', 'Acts', 'Rom', '1Cor', '2Cor', 'Gal', 'Eph', 'Phil', 'Col', '1Thess', '2Thess', '1Tim', '2Tim', 'Titus', 'Phlm', 'Heb', 'Jas', '1Pet', '2Pet', '1John', '2John', '3John', 'Jude', 'Rev'];
const osisIndex = new Map(OSIS.map((o, i) => [o, i]));

function osisKey(s: string): number | null {
  const m = /^([1-3]?[A-Za-z]+)\.(\d+)\.(\d+)$/.exec(s.trim());
  const b = m ? osisIndex.get(m[1]) : undefined;
  return m && b !== undefined ? verseKey(b, Number(m[2]), Number(m[3])) : null;
}

/** Every "see also" link, sorted by verse and then by how many people found it useful. */
export type CrossRefs = { from: Int32Array; to: Int32Array; toEnd: Int32Array; votes: Int32Array };

/** "From Verse	To Verse	Votes" rows, e.g. "Gen.1.1	Ps.33.6-Ps.33.9	210". Links with negative votes are dropped. */
export function parseCrossRefs(text: string): CrossRefs {
  const rows: [number, number, number, number][] = [];
  for (const line of text.split(/\r?\n/)) {
    const [a, b, v] = line.split('\t');
    if (!a || !b) continue;
    const votes = Number(v);
    const from = osisKey(a);
    const [s, e] = b.split('-');
    const to = osisKey(s);
    const end = e ? osisKey(e) : to;
    if (from === null || to === null || end === null || !Number.isFinite(votes) || votes < 0) continue;
    rows.push([from, to, end, votes]);
  }
  rows.sort((x, y) => x[0] - y[0] || y[3] - x[3] || x[1] - y[1]);
  const pick = (i: number) => Int32Array.from(rows, (r) => r[i]);
  return { from: pick(0), to: pick(1), toEnd: pick(2), votes: pick(3) };
}

const crossRefCache = new Map<string, Promise<CrossRefs>>();
export const CROSS_REFS_URL = 'https://a.openbible.info/data/cross-references.zip';

function crossRefs(ctx: Ctx): Promise<CrossRefs> {
  return remember(crossRefCache, 'tsk', 1, async () => {
    const zip = await download(ctx, CROSS_REFS_URL, 'cross-references.zip');
    if (!zip) throw new ApiError(502, 'bible_unreachable', 'The cross references are not available right now.');
    const entries = zipEntries(zip);
    const e = entries.find((x) => /\.txt$/i.test(x.name));
    if (!e) throw new ApiError(502, 'bible_unreadable', `Could not read the cross references (files: ${entries.map((x) => x.name).join(', ').slice(0, 160)}).`);
    const refs = parseCrossRefs(new TextDecoder().decode(await zipRead(zip, e)));
    if (!refs.from.length) throw new ApiError(502, 'bible_unreadable', `Could not read the cross references (${refs.from.length} rows).`);
    return refs;
  });
}

export function refsFor(refs: CrossRefs, key: number, limit = 40): { to: number; toEnd: number; votes: number }[] {
  let lo = 0, hi = refs.from.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (refs.from[mid] < key) lo = mid + 1; else hi = mid; }
  const out: { to: number; toEnd: number; votes: number }[] = [];
  for (let i = lo; i < refs.from.length && refs.from[i] === key && out.length < limit; i++) out.push({ to: refs.to[i], toEnd: refs.toEnd[i], votes: refs.votes[i] });
  return out;
}

export async function crossReferences(ctx: Ctx, tr: string, book: string, chapter: number, verse: number): Promise<{ refs: BibleCrossRef[]; source: string }> {
  const b = bookIndex(book);
  if (b < 0 || !Number.isInteger(chapter) || chapter < 1 || chapter > BOOKS[b].chapters + 1 || !Number.isInteger(verse) || verse < 1) throw new ApiError(404, 'not_found', 'That verse is not in the Bible.');
  if (!ctx.env.http || ctx.env.demo) throw new ApiError(503, 'offline', 'Cross references need the internet. They work in the live app.');
  // The verses' words wait at most 20 seconds for a Bible that is still downloading.
  const words = Promise.race([fullBible(ctx, tr), new Promise<null>((r) => setTimeout(() => r(null), 20_000))]).catch(() => null);
  const [refs, bible] = await Promise.all([crossRefs(ctx), words]);
  const list = refsFor(refs, verseKey(b, chapter, verse)).map((r) => {
    const s = fromKey(r.to), e = fromKey(r.toEnd);
    return { book: BOOK_CODES[s.book], chapter: s.chapter, verse: s.verse, endChapter: e.chapter, endVerse: e.verse, votes: r.votes, text: bible ? versesText(bible, r.to, r.toEnd) : '' };
  });
  return { refs: list, source: 'Cross references from the Treasury of Scripture Knowledge, via OpenBible.info (CC BY).' };
}

export function registerBibleStudy(r: Router) {
  r.get('/public/bible/:tr/search', { public: true }, async (ctx) => {
    const tr = decodeURIComponent(ctx.params[0]);
    const q = String(ctx.query.q ?? '').trim().slice(0, 120);
    if (q.length < 2) throw new ApiError(422, 'invalid', 'Type at least two letters to search.', { q: 'At least two letters' });
    const t = translation(ctx, tr);
    const found = searchBible(await fullBible(ctx, t.id), q, String(ctx.query.scope ?? '').toLowerCase() === 'ot' || String(ctx.query.scope ?? '').toLowerCase() === 'nt' ? String(ctx.query.scope).toLowerCase() : String(ctx.query.scope ?? '').toUpperCase());
    const ref = parseReference(q);
    return { translation: t.id, q, ...found, reference: ref ? { book: BOOK_CODES[ref.book], chapter: ref.chapter, verse: ref.from ?? null } : null };
  });
  r.get('/public/bible/:tr/ready', { public: true }, (ctx) => bibleReady(ctx, decodeURIComponent(ctx.params[0])));
  r.get('/public/bible/:tr/refs/:book/:chapter/:verse', { public: true }, (ctx) =>
    crossReferences(ctx, decodeURIComponent(ctx.params[0]), ctx.params[1].toUpperCase(), Number(ctx.params[2]), Number(ctx.params[3])));
}
