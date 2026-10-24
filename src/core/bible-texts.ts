// Free-to-share Bibles in every language eBible.org carries: the translation list, the book codes,
// and the readers for eBible.org's chapter pages (one page per chapter, the same layout for every
// translation). Pure data and string parsing; the module in modules/bible.ts does the fetching.
import { BOOKS } from './bible.js';
import type { BibleChapterNote, BibleTranslationInfo, BibleVerse } from './types.js';

/** USFM codes of the 66 books, in the same order as BOOKS. */
export const BOOK_CODES = [
  'GEN', 'EXO', 'LEV', 'NUM', 'DEU', 'JOS', 'JDG', 'RUT', '1SA', '2SA', '1KI', '2KI', '1CH', '2CH', 'EZR', 'NEH', 'EST', 'JOB', 'PSA', 'PRO', 'ECC', 'SNG', 'ISA', 'JER', 'LAM', 'EZK', 'DAN', 'HOS', 'JOL', 'AMO', 'OBA', 'JON', 'MIC', 'NAM', 'HAB', 'ZEP', 'HAG', 'ZEC', 'MAL',
  'MAT', 'MRK', 'LUK', 'JHN', 'ACT', 'ROM', '1CO', '2CO', 'GAL', 'EPH', 'PHP', 'COL', '1TH', '2TH', '1TI', '2TI', 'TIT', 'PHM', 'HEB', 'JAS', '1PE', '2PE', '1JN', '2JN', '3JN', 'JUD', 'REV',
] as const;
export type BookCode = (typeof BOOK_CODES)[number];
export const bookIndex = (code: string) => BOOK_CODES.indexOf(code.toUpperCase() as BookCode);

/** The translations the demo and the reader's first screen offer: English plus every Indian language. */
export const FEATURED_BIBLES: BibleTranslationInfo[] = [
  { id: 'engbsb', lang: 'eng', language: 'English', native: 'English', name: 'Berean Standard Bible', ot: true, nt: true, copyright: 'Public domain', app: 'en' },
  { id: 'engwebp', lang: 'eng', language: 'English', native: 'English', name: 'World English Bible', ot: true, nt: true, copyright: 'Public domain', app: 'en' },
  { id: 'eng-kjv2006', lang: 'eng', language: 'English', native: 'English', name: 'King James Version', ot: true, nt: true, copyright: 'Public domain', app: 'en' },
  { id: 'engkjvcpb', lang: 'eng', language: 'English', native: 'English', name: 'KJV Cambridge Paragraph Bible', ot: true, nt: true, copyright: 'Public domain', app: 'en' },
  { id: 'eng-asv', lang: 'eng', language: 'English', native: 'English', name: 'American Standard Version (1901)', ot: true, nt: true, copyright: 'Public domain', app: 'en' },
  { id: 'engnet', lang: 'eng', language: 'English', native: 'English', name: 'NET Bible', ot: true, nt: true, copyright: 'Copyright © 1996-2016 Biblical Studies Press, L.L.C.', app: 'en' },
  { id: 'engylt', lang: 'eng', language: 'English', native: 'English', name: "Young's Literal Translation", ot: true, nt: true, copyright: 'Public domain', app: 'en' },
  { id: 'hin2017', lang: 'hin', language: 'Hindi', native: 'हिन्दी', name: 'Indian Revised Version (IRV)', ot: true, nt: true, copyright: 'Copyright © 2017, 2018, 2019 Bridge Connectivity Solutions', app: 'hi' },
  { id: 'hincv', lang: 'hin', language: 'Hindi', native: 'हिन्दी', name: 'Hindi Contemporary Version', ot: true, nt: true, copyright: 'Copyright © 1978, 2009, 2016, 2019 Biblica, Inc.', app: 'hi' },
  { id: 'tel2017', lang: 'tel', language: 'Telugu', native: 'తెలుగు', name: 'Indian Revised Version (IRV)', ot: true, nt: true, copyright: 'Copyright © 2017, 2019 Bridge Connectivity Solutions', app: 'te' },
  { id: 'tam2017', lang: 'tam', language: 'Tamil', native: 'தமிழ்', name: 'Indian Revised Version (IRV)', ot: true, nt: true, copyright: 'Copyright © 2017, 2019 Bridge Connectivity Solutions', app: 'ta' },
  { id: 'tamtcv', lang: 'tam', language: 'Tamil', native: 'தமிழ்', name: 'Tamil Contemporary Version', ot: true, nt: true, copyright: 'Copyright © 2005, 2020, 2022 Biblica, Inc.', app: 'ta' },
  { id: 'mal', lang: 'mal', language: 'Malayalam', native: 'മലയാളം', name: 'Indian Revised Version (IRV)', ot: true, nt: true, copyright: 'Copyright © 2017, 2019 Bridge Connectivity Solutions', app: 'ml' },
  { id: 'mal2015', lang: 'mal', language: 'Malayalam', native: 'മലയാളം', name: 'Malayalam 1910 (contemporary spelling)', ot: true, nt: true, copyright: 'Copyright © 2015 The Free Bible Foundation', app: 'ml' },
  { id: 'malc', lang: 'mal', language: 'Malayalam', native: 'മലയാളം', name: 'Malayalam Contemporary Bible', ot: true, nt: true, copyright: 'Copyright © 2021 Biblica, Inc.', app: 'ml' },
  { id: 'kan2017', lang: 'kan', language: 'Kannada', native: 'ಕನ್ನಡ', name: 'Indian Revised Version (IRV)', ot: true, nt: true, copyright: 'Copyright © 2017, 2019 Bridge Connectivity Solutions', app: 'kn' },
  { id: 'kanokcv', lang: 'kan', language: 'Kannada', native: 'ಕನ್ನಡ', name: 'Kannada Contemporary Version', ot: true, nt: true, copyright: 'Copyright © Biblica, Inc.', app: 'kn' },
  { id: 'benirv', lang: 'ben', language: 'Bengali', native: 'বাংলা', name: 'Indian Revised Version (IRV)', ot: true, nt: true, copyright: 'Copyright © 2018 Bridge Connectivity Solutions', app: 'bn' },
  { id: 'benobcv', lang: 'ben', language: 'Bengali', native: 'বাংলা', name: 'Bengali Contemporary Version', ot: true, nt: true, copyright: 'Copyright © 2022 Biblica, Inc.', app: 'bn' },
  { id: 'mar', lang: 'mar', language: 'Marathi', native: 'मराठी', name: 'Indian Revised Version (IRV)', ot: true, nt: true, copyright: 'Copyright © 2017, 2019 Bridge Connectivity Solutions', app: 'mr' },
  { id: 'guj2017', lang: 'guj', language: 'Gujarati', native: 'ગુજરાતી', name: 'Indian Revised Version (IRV)', ot: true, nt: true, copyright: 'Copyright © 2019 Bridge Connectivity Solutions', app: 'gu' },
  { id: 'pan', lang: 'pan', language: 'Punjabi', native: 'ਪੰਜਾਬੀ', name: 'Indian Revised Version (IRV)', ot: true, nt: true, copyright: 'Copyright © 2017, 2019 Bridge Connectivity Solutions', app: 'pa' },
  { id: 'ory', lang: 'ory', language: 'Odia', native: 'ଓଡ଼ିଆ', name: 'Indian Revised Version (IRV)', ot: true, nt: true, copyright: 'Copyright © 2017, 2019, 2021 Bridge Connectivity Solutions', app: 'or' },
  { id: 'asmfb', lang: 'asm', language: 'Assamese', native: 'অসমীয়া', name: 'Indian Revised Version (IRV)', ot: true, nt: true, copyright: 'Copyright © 2017, 2018 Bridge Connectivity Solutions', app: 'as' },
  { id: 'urd', lang: 'urd', language: 'Urdu', native: 'उर्दू', name: 'Urdu IRV (Devanagari script)', ot: true, nt: true, copyright: 'Copyright © 2019 Bridge Connectivity Solutions', app: 'ur' },
  { id: 'urdgvu', lang: 'urd', language: 'Urdu', native: 'اردو', name: 'Urdu Geo Version', ot: true, nt: true, rtl: true, copyright: 'Copyright © 2019 Urdu Geo Version', app: 'ur' },
  { id: 'npiulb', lang: 'npi', language: 'Nepali', native: 'नेपाली', name: 'Nepali Bible', ot: true, nt: true, copyright: 'Copyright © 2019 Door43 World Missions Community', app: 'ne' },
  { id: 'nag', lang: 'nag', language: 'Nagamese', native: 'Nagamese', name: 'Nagamese New Testament', ot: false, nt: true, copyright: 'Copyright © 2019 Bridge Connectivity Solutions' },
  { id: 'mni', lang: 'mni', language: 'Meitei (Manipuri)', native: 'Meitei', name: 'Meitei Bible', ot: false, nt: true, copyright: 'Copyright © 2022 The Word for the World International' },
  { id: 'sandev', lang: 'san', language: 'Sanskrit', native: 'संस्कृतम्', name: 'Sanskrit New Testament (Devanagari)', ot: false, nt: true, copyright: 'Copyright © 2018 SanskritBible.in' },
  { id: 'mya', lang: 'mya', language: 'Burmese', native: 'မြန်မာ', name: 'Burmese Common Language Bible', ot: true, nt: true, copyright: 'Public domain', app: 'my' },
];

/** Which app language a Bible language serves, so a Telugu member opens the Telugu Bible first. */
const APP_LANG: Record<string, string> = { eng: 'en', hin: 'hi', ben: 'bn', mar: 'mr', tel: 'te', tam: 'ta', guj: 'gu', urd: 'ur', kan: 'kn', ory: 'or', mal: 'ml', pan: 'pa', asm: 'as', npi: 'ne', nep: 'ne', kok: 'kok', knn: 'kok', lus: 'lus', kha: 'kha', cmn: 'zh', zho: 'zh', jpn: 'ja', kor: 'ko', tha: 'th', vie: 'vi', ind: 'id', zlm: 'ms', msa: 'ms', tgl: 'fil', mya: 'my', khm: 'km', sin: 'si', lao: 'lo' };

/** One row of the full catalog (src/bible-catalog.ts on the server) as a translation. */
export function catalogEntry(row: [string, string, string, string, string, number, number, number, string]): BibleTranslationInfo {
  const [id, lang, language, native, name, ot, nt, rtl, copyright] = row;
  const featured = FEATURED_BIBLES.find((f) => f.id === id);
  if (featured) return featured;
  return { id, lang, language, native, name, ot: ot >= 39, nt: nt >= 27, ...(ot > 0 && ot < 39 || nt > 0 && nt < 27 ? { partial: true } : {}), ...(rtl ? { rtl: true } : {}), copyright, ...(APP_LANG[lang] ? { app: APP_LANG[lang] } : {}) };
}

/** eBible.org's page for one chapter. Psalms are numbered with three digits, the rest with two. */
export const chapterUrl = (tr: string, code: string, chapter: number) => `https://ebible.org/${encodeURIComponent(tr)}/${code}${String(chapter).padStart(code === 'PSA' ? 3 : 2, '0')}.htm`;
export const indexUrl = (tr: string) => `https://ebible.org/${encodeURIComponent(tr)}/index.htm`;

const ENTITIES: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'" };
const decode = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, e: string) => {
  if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
  return ENTITIES[e.toLowerCase()] ?? m;
});
/** Tags out, entities decoded, runs of spaces made one. */
const clean = (html: string) => decode(html.replace(/<[^>]+>/g, '')).replace(/[ \t\r\n ]+/g, ' ').trim();

/** Footnote markers (with their pop-up text) and bracketed cross references like "(Eccl. 11:5)" come out of the verse text. */
function stripNotes(html: string) {
  return html
    .replace(/<a[^>]*class=["']notemark["'][^>]*>[\s\S]*?<\/a>/g, '')
    .replace(/<span class=["']bdit["']>([\s\S]*?)<\/span>/g, (m, inner: string) => (/^\s*\(.*\d+\s*[:.]\s*\d+.*\)\s*$/.test(clean(inner)) ? '' : m));
}

const HEADING = /^(s\d?|ms\d?|sp|qa|cl)$/;
const SKIP = /^(chapterlabel|r|mr|sr|rem|toc\d?|mt\d?|imt\d?|ip|is\d?|io\d?|iot)$/;
const PARAGRAPH = /^(p|m|pi\d?|mi|pmo|pm|pc|po|pr|cls|li\d?)$/;
const POETRY = /^(q\d?|qr|qc|qm\d?|qd)$/;

export type ParsedChapter = { bookName: string | null; intro: string | null; verses: BibleVerse[]; notes: BibleChapterNote[]; prev: { book: string; chapter: number } | null; next: { book: string; chapter: number } | null };

/** Reads one eBible.org chapter page into verses, section headings, a psalm's title line, footnotes and the previous and next chapters. */
export function parseEbibleChapter(html: string): ParsedChapter {
  const start = html.search(/<div class=["']main["']>/);
  const navs = [...html.matchAll(/<ul class=["']tnav["']>([\s\S]*?)<\/ul>/g)];
  const nav = navs[0]?.[1] ?? '';
  const link = (label: string) => {
    const m = new RegExp(`<a href=["'](?:[^"']*/)?([0-9A-Z]{3})(\\d{2,3})\\.htm["']>${label}</a>`).exec(nav);
    return m && bookIndex(m[1]) >= 0 ? { book: m[1], chapter: Number(m[2]) } : null;
  };
  const bookName = /<li><a href=["'](?:[^"']*\/)?index\.htm["']>([^<]*)<\/a><\/li>/.exec(nav)?.[1];
  const afterMain = start >= 0 ? html.slice(start).replace(/^<div[^>]*>/, '') : '';
  const endNav = afterMain.search(/<ul class=["']tnav["']>/);
  const main = endNav >= 0 ? afterMain.slice(0, endNav) : afterMain;

  const verses: BibleVerse[] = [];
  let intro: string | null = null;
  let heading: string | null = null;
  let current: BibleVerse | null = null;
  for (const b of main.matchAll(/<div class=["']([^"']+)["'][^>]*>([\s\S]*?)<\/div>/g)) {
    const cls = b[1].split(' ')[0];
    if (SKIP.test(cls)) continue;
    const body = stripNotes(b[2]);
    if (HEADING.test(cls)) { const t = clean(body); if (t) heading = heading ? `${heading} · ${t}` : t; continue; }
    if (cls === 'd' && !verses.length) { intro = clean(body) || null; continue; }
    const parts = body.split(/<span class=["']verse["'] id=["']V(\d+)["']>([\s\S]*?)<\/span>/);
    const poetry = POETRY.test(cls);
    const lead = clean(parts[0]);
    if (lead && current) current.text += `\n${lead}`;
    for (let i = 1; i + 2 < parts.length; i += 3) {
      const n = Number(parts[i]);
      const label = clean(parts[i + 1]) || String(n);
      const text = clean(parts[i + 2] ?? '');
      const v: BibleVerse = { n, text };
      if (label !== String(n)) v.label = label;
      if (heading) { v.heading = heading; heading = null; }
      if (i === 1 && !lead && (PARAGRAPH.test(cls) || poetry)) v.para = true;
      if (poetry) v.poetry = true;
      // The same verse number twice (a verse split across blocks) joins the first.
      if (current && current.n === n) { current.text += ` ${text}`; continue; }
      verses.push(v);
      current = v;
    }
  }
  for (const v of verses) v.text = v.text.replace(/ +\n/g, '\n').trim();

  const notes: BibleChapterNote[] = [];
  for (const f of html.matchAll(/<p class=["']f["'] id=["']FN\d+["']>([\s\S]*?)<\/p>/g)) {
    const ref = /<a class=["']notebackref["'][^>]*>([^<]*)<\/a>/.exec(f[1]);
    const verse = Number(/[:.](\d+)/.exec(ref?.[1] ?? '')?.[1] ?? 0);
    const text = clean(f[1].replace(/<span class=["']notemark["']>[\s\S]*?<\/span>/, '').replace(/<a class=["']notebackref["'][^>]*>[^<]*<\/a>/, ''));
    if (verse && text) notes.push({ verse, text });
  }
  return { bookName: bookName ? clean(bookName) : null, intro, verses: verses.filter((v) => v.text), notes, prev: link('&lt;'), next: link('&gt;') };
}

/** Reads a translation's book list (code and the book's name in that language) from its eBible.org index page. */
export function parseEbibleIndex(html: string): { code: string; name: string }[] {
  const out: { code: string; name: string }[] = [];
  for (const m of html.matchAll(/<a(?: class=["'][^"']*["'])? href=["'](?:[^"']*\/)?([0-9A-Z]{3})\d{2,3}\.htm["']>([^<]+)<\/a>/g)) {
    if (bookIndex(m[1]) >= 0 && !out.some((b) => b.code === m[1])) out.push({ code: m[1], name: clean(m[2]) });
  }
  return out;
}

/** Book names to look a typed reference up by: English, the app's Indian languages, aliases, and USFM codes. */
const NAMES: [string, number][] = [];
const norm = (s: string) => s.toLowerCase().replace(/[\s.]/g, '');
BOOKS.forEach((b, i) => {
  for (const n of [b.en, b.hi, b.ta, b.te, b.ml, b.kn, ...(b.aliases ?? []), BOOK_CODES[i]]) NAMES.push([norm(n), i]);
});
const SHORT: Record<string, string> = { jn: 'JHN', jhn: 'JHN', mt: 'MAT', mk: 'MRK', lk: 'LUK', ps: 'PSA', pss: 'PSA', pr: 'PRO', prv: 'PRO', ex: 'EXO', dt: 'DEU', jdg: 'JDG', jg: 'JDG', sos: 'SNG', song: 'SNG', ez: 'EZK', ezk: 'EZK', jas: 'JAS', jm: 'JAS', phil: 'PHP', phl: 'PHP', php: 'PHP', phm: 'PHM', philem: 'PHM', jud: 'JUD', jude: 'JUD', '1jn': '1JN', '2jn': '2JN', '3jn': '3JN', rev: 'REV', re: 'REV' };

/** "Jn 3:16-18", "1 cor 13", "యోహాను 3:16" → book index, chapter and verse range. Null when it isn't a reference. */
export function parseReference(ref: string): { book: number; chapter: number; from: number | null; to: number | null } | null {
  const t = ref.replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
  const m = /^(.+?)\s*(\d+)(?:\s*[:.]\s*(\d+)(?:\s*-\s*(\d+))?)?\s*$/.exec(t);
  if (!m) return null;
  const name = norm(m[1]);
  if (!name) return null;
  let book = SHORT[name] ? bookIndex(SHORT[name]) : -1;
  if (book < 0) book = NAMES.find(([n]) => n === name)?.[1] ?? -1;
  if (book < 0) {
    const hits = [...new Set(NAMES.filter(([n]) => n.startsWith(name)).map(([, i]) => i))];
    if (hits.length === 1 || (hits.length > 1 && name.length >= 3)) book = hits[0];
  }
  if (book < 0) return null;
  let chapter = Number(m[2]);
  let verse = m[3];
  // "Jude 5": a one-chapter book with one number means the verse.
  if (BOOKS[book].chapters === 1 && !verse && chapter > 1) { verse = String(chapter); chapter = 1; }
  if (chapter < 1 || chapter > BOOKS[book].chapters) return null;
  const from = verse ? Number(verse) : null;
  const to = m[4] ? Math.max(Number(m[4]), from ?? 0) : from;
  return { book, chapter, from, to };
}
