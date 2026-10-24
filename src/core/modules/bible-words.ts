// Word study: the Greek or Hebrew words behind any verse, each with its transliteration, English
// gloss, grammar and Strong's number; tap a word for its dictionary entry and every verse that
// uses it. From STEPBible.org's open data (CC BY 4.0), shipped with the server in data/interlinear
// (rebuilt by scripts/build-interlinear.mjs) and read into memory the first time it is asked for.
import { BOOKS } from '../bible.js';
import { BOOK_CODES, bookIndex } from '../bible-texts.js';
import type { Ctx, Router } from '../engine.js';
import { ApiError } from '../errors.js';
import { parsing } from '../morph.js';
import type { BibleWord, BibleWords, StrongsEntry, StrongsStudy } from '../types.js';

export const WORDS_SOURCE = 'Greek and Hebrew from STEPBible.org (CC BY 4.0): Translators Amalgamated Greek NT and Hebrew OT, with the Translators Brief lexicons.';

type Testament = { verses: Map<string, string>; byStrong?: Map<string, string[]> };
const loaded = new Map<string, Promise<unknown>>();

async function gunzip(bytes: Uint8Array): Promise<string> {
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return new TextDecoder().decode(bytes); // already unpacked
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

function load<T>(ctx: Ctx, name: string, parse: (text: string) => T): Promise<T> {
  const hit = loaded.get(name) as Promise<T> | undefined;
  if (hit) return hit;
  if (!ctx.env.dataFile) throw new ApiError(503, 'offline', 'Word study works in the live app.');
  const p = ctx.env.dataFile(`interlinear/${name}.tsv.gz`).then(async (bytes) => {
    if (!bytes) throw new ApiError(503, 'unavailable', 'Word study is not installed on this server.');
    return parse(await gunzip(bytes));
  });
  loaded.set(name, p);
  p.catch(() => loaded.delete(name));
  return p;
}

/** "JHN.3.16 <tab> word|translit|gloss|strong|grammar <tab> …" lines, kept as text until asked for. */
export function parseTestament(text: string): Testament {
  const verses = new Map<string, string>();
  for (const line of text.split('\n')) {
    const tab = line.indexOf('\t');
    if (tab > 0) verses.set(line.slice(0, tab), line.slice(tab + 1));
  }
  return { verses };
}

export function parseLexicon(text: string): Map<string, StrongsEntry> {
  const out = new Map<string, StrongsEntry>();
  for (const line of text.split('\n')) {
    const [strong, lemma, translit, gloss, definition] = line.split('\t');
    if (strong) out.set(strong, { strong, lemma: lemma ?? '', translit: translit ?? '', gloss: gloss ?? '', definition: definition ?? '', language: strong.startsWith('G') ? 'greek' : 'hebrew' });
  }
  return out;
}

const testament = (ctx: Ctx, nt: boolean) => load(ctx, nt ? 'nt' : 'ot', parseTestament);
const lexicon = (ctx: Ctx) => load(ctx, 'lexicon', parseLexicon);

export const splitWords = (row: string): BibleWord[] => row.split('\t').map((w) => {
  const [word = '', translit = '', gloss = '', strong = '', grammar = ''] = w.split('|');
  return { word, translit, gloss, strong, grammar, parsing: parsing(grammar) };
});

/** Strong's numbers are written G0025 and H7462B; "g25", "G25" and "H7462b" find them too. */
export function normStrong(s: string): string | null {
  const m = /^([GH])0*(\d{1,4})([A-Za-z]?)$/i.exec(s.trim());
  return m ? `${m[1].toUpperCase()}${m[2].padStart(4, '0')}${m[3].toUpperCase()}` : null;
}

function byStrong(t: Testament): Map<string, string[]> {
  if (t.byStrong) return t.byStrong;
  const index = new Map<string, string[]>();
  for (const [key, row] of t.verses) {
    for (const w of row.split('\t')) {
      const strong = w.split('|')[3];
      if (!strong) continue;
      const list = index.get(strong) ?? [];
      if (list[list.length - 1] !== key) list.push(key);
      index.set(strong, list);
    }
  }
  t.byStrong = index;
  return index;
}

export async function verseWords(ctx: Ctx, book: string, chapter: number, verse: number): Promise<BibleWords> {
  const b = bookIndex(book);
  if (b < 0 || !Number.isInteger(chapter) || chapter < 1 || chapter > BOOKS[b].chapters + 1 || !Number.isInteger(verse) || verse < 1) throw new ApiError(404, 'not_found', 'That verse is not in the Bible.');
  const t = await testament(ctx, b > 38);
  const row = t.verses.get(`${BOOK_CODES[b]}.${chapter}.${verse}`);
  return { book: BOOK_CODES[b], chapter, verse, language: b > 38 ? 'greek' : 'hebrew', words: row ? splitWords(row) : [], source: WORDS_SOURCE };
}

export async function strongsStudy(ctx: Ctx, id: string): Promise<StrongsStudy> {
  const strong = normStrong(id);
  if (!strong) throw new ApiError(404, 'not_found', 'That is not a Strong\'s number.');
  const lex = await lexicon(ctx);
  // Plain numbers ("H7462") match every extended entry under them ("H7462A", "H7462B").
  const entry = lex.get(strong) ?? [...lex.values()].find((e) => e.strong.startsWith(strong));
  if (!entry) throw new ApiError(404, 'not_found', `${strong} is not in the dictionary.`);
  const t = await testament(ctx, strong.startsWith('G'));
  const keys = byStrong(t).get(entry.strong) ?? [];
  const counts = new Map<string, number>();
  for (const k of keys) { const book = k.split('.')[0]; counts.set(book, (counts.get(book) ?? 0) + 1); }
  const uses = keys.slice(0, 300).map((k) => {
    const [book, c, v] = k.split('.');
    const w = splitWords(t.verses.get(k) ?? '').find((x) => x.strong === entry.strong);
    return { book, chapter: Number(c), verse: Number(v), gloss: w?.gloss ?? '' };
  });
  return { entry, total: keys.length, uses, books: [...counts].map(([book, count]) => ({ book, count })), source: WORDS_SOURCE };
}

export function registerBibleWords(r: Router) {
  r.get('/public/bible/words/:book/:chapter/:verse', { public: true }, (ctx) => verseWords(ctx, ctx.params[0].toUpperCase(), Number(ctx.params[1]), Number(ctx.params[2])));
  r.get('/public/bible/strongs/:id', { public: true }, (ctx) => strongsStudy(ctx, ctx.params[0]));
}
