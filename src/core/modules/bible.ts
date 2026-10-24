// The Bible: a reader for every free-to-share translation on eBible.org (1,100 Bibles in about 890
// languages, including the Indian Revised Version in Hindi, Telugu, Tamil, Malayalam, Kannada,
// Bengali, Marathi, Gujarati, Punjabi, Odia, Assamese and Urdu), and passages for the projector.
// Chapters are read from eBible.org's chapter pages on demand and kept in memory, so a busy Sunday
// costs one fetch per chapter. A few well-loved King James passages are built in for the demo.
import { BOOKS } from '../bible.js';
import { BOOK_CODES, bookIndex, chapterUrl, FEATURED_BIBLES, indexUrl, parseEbibleChapter, parseEbibleIndex, parseReference } from '../bible-texts.js';
import type { Ctx, Router } from '../engine.js';
import { ApiError } from '../errors.js';
import type { BibleBookInfo, BibleChapter, BiblePassage, BibleTranslationInfo } from '../types.js';

/** The two translations the projector offered before the reader; old saved choices map onto eBible.org. */
const LEGACY: Record<string, string> = { kjv: 'eng-kjv2006', web: 'engwebp' };
export type Translation = string;

/** King James Version (public domain), for when the server is offline or in the demo. */
const BUILT_IN: Record<string, { reference: string; verses: [number, string][] }> = {
  'JHN 3:16-17': { reference: 'John 3:16-17', verses: [[16, 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.'], [17, 'For God sent not his Son into the world to condemn the world; but that the world through him might be saved.']] },
  'JHN 3:16-16': { reference: 'John 3:16', verses: [[16, 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.']] },
  'PSA 23': { reference: 'Psalms 23', verses: [[1, 'The LORD is my shepherd; I shall not want.'], [2, 'He maketh me to lie down in green pastures: he leadeth me beside the still waters.'], [3, 'He restoreth my soul: he leadeth me in the paths of righteousness for his name’s sake.'], [4, 'Yea, though I walk through the valley of the shadow of death, I will fear no evil: for thou art with me; thy rod and thy staff they comfort me.'], [5, 'Thou preparest a table before me in the presence of mine enemies: thou anointest my head with oil; my cup runneth over.'], [6, 'Surely goodness and mercy shall follow me all the days of my life: and I will dwell in the house of the LORD for ever.']] },
  'ROM 8:28-28': { reference: 'Romans 8:28', verses: [[28, 'And we know that all things work together for good to them that love God, to them who are the called according to his purpose.']] },
  'PHP 4:13-13': { reference: 'Philippians 4:13', verses: [[13, 'I can do all things through Christ which strengtheneth me.']] },
  'JER 29:11-11': { reference: 'Jeremiah 29:11', verses: [[11, 'For I know the thoughts that I think toward you, saith the LORD, thoughts of peace, and not of evil, to give you an expected end.']] },
  'MAT 11:28-30': { reference: 'Matthew 11:28-30', verses: [[28, 'Come unto me, all ye that labour and are heavy laden, and I will give you rest.'], [29, 'Take my yoke upon you, and learn of me; for I am meek and lowly in heart: and ye shall find rest unto your souls.'], [30, 'For my yoke is easy, and my burden is light.']] },
};

/** "Ps 23", "jn 3:16–17" → "Psalms 23", "John 3:16-17"; anything else comes back trimmed. */
export function tidyReference(ref: string): string {
  const p = parseReference(ref);
  if (!p) return ref.replace(/\s+/g, ' ').trim();
  return `${BOOKS[p.book].en} ${p.chapter}${p.from ? `:${p.from}${p.to && p.to !== p.from ? `-${p.to}` : ''}` : ''}`;
}

export function bibleList(ctx: Ctx): BibleTranslationInfo[] {
  return ctx.env.bibleCatalog?.length ? ctx.env.bibleCatalog : FEATURED_BIBLES;
}
function translation(ctx: Ctx, id: string): BibleTranslationInfo {
  const want = LEGACY[id] ?? id;
  const t = bibleList(ctx).find((x) => x.id === want) ?? FEATURED_BIBLES.find((x) => x.id === want);
  if (!t) throw new ApiError(404, 'not_found', 'That Bible translation is not available.');
  return t;
}

// Chapters and book lists, shared by every church on the server. Oldest out first past the limit.
const MAX_CHAPTERS = 3000;
const chapters = new Map<string, Promise<BibleChapter>>();
const bookLists = new Map<string, Promise<BibleBookInfo[]>>();

function remember<T>(map: Map<string, Promise<T>>, key: string, max: number, load: () => Promise<T>): Promise<T> {
  const hit = map.get(key);
  if (hit) { map.delete(key); map.set(key, hit); return hit; }
  const p = load();
  map.set(key, p);
  p.catch(() => map.delete(key));
  while (map.size > max) map.delete(map.keys().next().value as string);
  return p;
}

async function fetchPage(ctx: Ctx, url: string): Promise<string | null> {
  if (!ctx.env.http || ctx.env.demo) throw new ApiError(503, 'offline', 'The Bible reader needs the internet. It works in the live app.');
  const r = await ctx.env.http({ method: 'GET', url, timeoutMs: 15_000, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Flockwise/1.0; +https://flockwise.church)', Accept: 'text/html' } }).catch((e: Error) => ({ status: 0, headers: {}, text: e.message }));
  if (r.status === 404) return null;
  if (r.status !== 200) throw new ApiError(502, 'bible_unreachable', `Could not reach the Bible library (${r.status || r.text.slice(0, 80)}). Try again in a minute.`);
  return r.text;
}

const chapterCount = (i: number) => BOOKS[i].chapters;

export function bibleBooks(ctx: Ctx, id: string): Promise<BibleBookInfo[]> {
  const t = translation(ctx, id);
  const fallback = () => BOOK_CODES.map((code, i) => ({ code, name: BOOKS[i].en, en: BOOKS[i].en, chapters: chapterCount(i), testament: i < 39 ? 'ot' as const : 'nt' as const })).filter((b) => (b.testament === 'ot' ? t.ot || t.partial : t.nt || t.partial));
  if (!ctx.env.http || ctx.env.demo) return Promise.resolve(fallback());
  return remember(bookLists, t.id, 400, async () => {
    const html = await fetchPage(ctx, indexUrl(t.id));
    const list = html ? parseEbibleIndex(html) : [];
    if (!list.length) return fallback();
    return list.map(({ code, name }) => { const i = bookIndex(code); return { code, name, en: BOOKS[i].en, chapters: chapterCount(i), testament: i < 39 ? 'ot' as const : 'nt' as const }; });
  });
}

export function bibleChapter(ctx: Ctx, id: string, book: string, chapter: number): Promise<BibleChapter> {
  const t = translation(ctx, id);
  const i = bookIndex(book);
  if (i < 0) throw new ApiError(404, 'not_found', 'That book is not in the Bible.');
  if (!Number.isInteger(chapter) || chapter < 1 || chapter > chapterCount(i) + 1) throw new ApiError(404, 'not_found', `${BOOKS[i].en} has ${chapterCount(i)} chapters.`);
  const code = BOOK_CODES[i];
  return remember(chapters, `${t.id}/${code}/${chapter}`, MAX_CHAPTERS, async () => {
    const html = await fetchPage(ctx, chapterUrl(t.id, code, chapter));
    const parsed = html ? parseEbibleChapter(html) : null;
    if (!html) throw new ApiError(404, 'not_found', `${t.name} does not have ${BOOKS[i].en} ${chapter}.`);
    if (!parsed?.verses.length) throw new ApiError(502, 'bible_unreadable', `Could not read ${BOOKS[i].en} ${chapter} from the Bible library (${html.length} bytes: ${html.replace(/\s+/g, ' ').slice(0, 120)}).`);
    return {
      translation: t, book: code, bookName: parsed.bookName || BOOKS[i].en, en: BOOKS[i].en, chapter,
      intro: parsed.intro, verses: parsed.verses, notes: parsed.notes, prev: parsed.prev, next: parsed.next,
      source: `${t.name}. ${t.copyright}${t.copyright === 'Public domain' ? '' : ', shared under its free licence'}. Text from eBible.org.`,
    };
  });
}

/** A passage for the projector or a sermon: "John 3:16-18" in any translation, verses joined into one passage. */
export async function lookupPassage(ctx: Ctx, ref: string, tr: Translation = 'kjv'): Promise<BiblePassage> {
  const p = parseReference(ref);
  if (!p) throw new ApiError(422, 'invalid', 'Type a reference like John 3:16 or Psalm 23.', { ref: 'Book, chapter and verse' });
  const id = LEGACY[tr] ?? tr;
  const code = BOOK_CODES[p.book];
  const key = p.from ? `${code} ${p.chapter}:${p.from}-${p.to}` : `${code} ${p.chapter}`;
  const built = id === 'eng-kjv2006' ? BUILT_IN[key] : undefined;
  if ((ctx.env.demo || !ctx.env.http) && built) return { reference: built.reference, translation: 'King James Version', verses: built.verses.map(([verse, text]) => ({ verse, text })) };
  if (!ctx.env.http || ctx.env.demo) throw new ApiError(422, 'offline', 'This passage is not available offline. Paste the words under Text instead.');
  let ch: BibleChapter;
  try {
    ch = await bibleChapter(ctx, id, code, p.chapter);
  } catch (e) {
    if (built) return { reference: built.reference, translation: 'King James Version', verses: built.verses.map(([verse, text]) => ({ verse, text })) };
    throw e;
  }
  const verses = ch.verses.filter((v) => !p.from || (v.n >= p.from && v.n <= (p.to ?? p.from))).slice(0, 80).map((v) => ({ verse: v.n, text: v.text.replace(/\n/g, ' ') }));
  if (!verses.length) throw new ApiError(404, 'not_found', `Could not find ${ref}. Check the book, chapter and verse.`);
  const range = p.from ? `:${p.from}${p.to && p.to !== p.from ? `-${p.to}` : ''}` : '';
  return { reference: `${ch.bookName} ${p.chapter}${range}`, translation: ch.translation.name, verses };
}

/** One verse per paragraph, so each verse gets its own slide. */
export const passageText = (p: BiblePassage) => p.verses.map((v) => `${v.verse} ${v.text}`).join('\n\n');

export function registerBible(r: Router) {
  r.get('/public/bible/translations', { public: true }, (ctx) => ({ featured: FEATURED_BIBLES.map((t) => t.id), translations: bibleList(ctx) }));
  r.get('/public/bible/:tr/books', { public: true }, (ctx) => bibleBooks(ctx, decodeURIComponent(ctx.params[0])));
  r.get('/public/bible/:tr/:book/:chapter', { public: true }, (ctx) => bibleChapter(ctx, decodeURIComponent(ctx.params[0]), ctx.params[1], Number(ctx.params[2])));
  r.get('/admin/bible', { staff: true }, (ctx) => lookupPassage(ctx, String(ctx.query.ref ?? ''), String(ctx.query.tr ?? 'kjv')));
}

