// Planning around the sermon workspace: series laid out Sunday by Sunday, a bank of illustrations
// that remembers where each was used, the preaching history (every passage preached, and the books
// not yet touched), and a check of the key verse in each language the congregation speaks.
import { BOOKS } from '../bible.js';
import { BOOK_CODES, FEATURED_BIBLES, parseReference } from '../bible-texts.js';
import type { Ctx, Router } from '../engine.js';
import { ApiError } from '../errors.js';
import { LANGUAGES } from '../languages.js';
import type { Illustration, IllustrationKind, PreachedSermon, PreachingHistory, SermonSeries, SermonSeriesView, SermonSeriesWeek, TranslationCheck } from '../types.js';
import { find } from '../util.js';
import { lookupPassage, tidyReference } from './bible.js';
import { blankPrep } from './sermon-prep.js';

const PERM = { perm: ['services', 'comms'] } as { perm: ('services' | 'comms')[] };
const KINDS: IllustrationKind[] = ['story', 'quote', 'example', 'fact', 'humour'];
const text = (v: unknown, max: number) => String(v ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);
const isDate = (v: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? ''));
const addDays = (date: string, days: number) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
const tags = (v: unknown) => [...new Set((Array.isArray(v) ? v : String(v ?? '').split(/[,;\n]/)).map((t) => String(t ?? '').trim().toLowerCase().slice(0, 40)).filter(Boolean))].slice(0, 12);

// ---------- Series ----------

function weeks(ctx: Ctx, v: unknown): SermonSeriesWeek[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 60).map((w: Record<string, unknown>) => {
    if (w?.date && !isDate(w.date)) throw new ApiError(422, 'invalid', 'Each week needs a date.', { date: 'YYYY-MM-DD' });
    return {
      id: typeof w?.id === 'string' && /^[\w-]{1,40}$/.test(w.id) ? w.id : ctx.id('wk'),
      date: String(w?.date ?? ''), title: text(w?.title, 160), passage: tidyReference(text(w?.passage, 80)), preacher: text(w?.preacher, 120),
      prepId: typeof w?.prepId === 'string' ? w.prepId : null,
    };
  }).sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
}

/** Splits a book's chapters across the weeks: Philippians over 4 weeks is 1, 2, 3, 4; Romans over 4 is 1-4, 5-8, 9-12, 13-16. */
export function splitBook(code: string, count: number): string[] {
  const b = BOOK_CODES.indexOf(code as (typeof BOOK_CODES)[number]);
  if (b < 0) throw new ApiError(422, 'invalid', 'Pick a book of the Bible.', { book: 'Book' });
  const total = BOOKS[b].chapters;
  const n = Math.max(1, Math.min(count, total));
  return Array.from({ length: n }, (_, i) => {
    const from = Math.floor((i * total) / n) + 1;
    const to = Math.floor(((i + 1) * total) / n);
    return from === to ? `${BOOKS[b].en} ${from}` : `${BOOKS[b].en} ${from}-${to}`;
  });
}

function view(ctx: Ctx, s: SermonSeries): SermonSeriesView {
  return { ...s, weeks: s.weeks.map((w) => ({ ...w, status: (w.prepId && ctx.db.get('sermonPreps', w.prepId)?.status) || null })) };
}

// ---------- History ----------

export function preached(ctx: Ctx): PreachedSermon[] {
  const today = ctx.now.toISOString().slice(0, 10);
  const place = (passage: string) => { const p = parseReference(passage); return { book: p ? BOOK_CODES[p.book] : null, chapter: p?.chapter ?? null }; };
  const lib: PreachedSermon[] = ctx.db.all('sermons').map((s) => ({ id: s.id, from: 'library', date: s.date, title: s.title, preacher: s.speaker, passage: s.scripture ?? '', series: s.series ?? '', ...place(s.scripture ?? '') }));
  // Sermons preached from the workspace but never put in the library.
  const ws: PreachedSermon[] = ctx.db.all('sermonPreps').filter((p) => !p.sermonId && (p.status === 'preached' || (p.date && p.date < today && p.status === 'ready')))
    .map((p) => ({ id: p.id, from: 'workspace', date: p.date || p.updatedAt.slice(0, 10), title: p.title, preacher: p.preacher, passage: p.passage, series: p.series, ...place(p.passage) }));
  return [...lib, ...ws].sort((a, b) => b.date.localeCompare(a.date));
}

function history(ctx: Ctx): PreachingHistory {
  const sermons = preached(ctx);
  const books = BOOK_CODES.map((code, i) => {
    const mine = sermons.filter((s) => s.book === code);
    return { code, name: BOOKS[i].en, testament: (i > 38 ? 'nt' : 'ot') as 'ot' | 'nt', count: mine.length, last: mine[0]?.date ?? null };
  });
  const by = new Map<string, { name: string; count: number; last: string }>();
  for (const s of sermons) {
    const name = s.preacher.trim() || 'Not named';
    const p = by.get(name) ?? { name, count: 0, last: s.date };
    p.count++;
    by.set(name, p);
  }
  return { sermons, books, preachers: [...by.values()].sort((a, b) => b.count - a.count) };
}

// ---------- Translation check ----------

async function translationCheck(ctx: Ctx, ref: string): Promise<TranslationCheck> {
  const p = parseReference(ref);
  if (!p) throw new ApiError(422, 'invalid', 'Type a reference like John 3:16.', { ref: 'Book, chapter and verse' });
  const reference = tidyReference(ref);
  const counts = new Map<string, number>();
  for (const person of ctx.db.all('people')) if (person.status !== 'inactive') counts.set(person.language, (counts.get(person.language) ?? 0) + 1);
  if (!counts.has('en')) counts.set('en', 0);
  const langs = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 12);
  const rows = await Promise.all(langs.map(async ([code, people]) => {
    const info = LANGUAGES.find((l) => l.code === code);
    const bible = FEATURED_BIBLES.find((b) => b.app === code);
    const base = { language: code, english: info?.english ?? code, native: info?.label ?? code, people, translation: bible?.id ?? null, name: bible?.name ?? '', reference, text: null as string | null };
    if (!bible) return base;
    try {
      const v = await lookupPassage(ctx, reference, bible.id);
      return { ...base, reference: v.reference, text: v.verses.map((x) => `${v.verses.length > 1 ? `${x.verse} ` : ''}${x.text}`).join(' ') };
    } catch {
      return base;
    }
  }));
  return { reference, rows };
}

export function registerSermonPlanning(r: Router) {
  // Series
  r.get('/admin/sermon-series', PERM, (ctx) => ctx.db.all('sermonSeries').map((s) => view(ctx, s)).sort((a, b) => (b.weeks[0]?.date ?? b.createdAt).localeCompare(a.weeks[0]?.date ?? a.createdAt)));
  r.post('/admin/sermon-series', PERM, (ctx) => {
    const b = ctx.body as Record<string, unknown>;
    const title = text(b.title, 120);
    if (!title) throw new ApiError(422, 'invalid', 'Give the series a name.', { title: 'Needed' });
    const count = Math.max(1, Math.min(52, Math.round(Number(b.weeks) || 4)));
    if (b.startDate && !isDate(b.startDate)) throw new ApiError(422, 'invalid', 'Pick the first Sunday.', { startDate: 'YYYY-MM-DD' });
    const start = String(b.startDate || '');
    const passages = b.book ? splitBook(String(b.book).toUpperCase(), count) : Array.from({ length: count }, () => '');
    const now = ctx.now.toISOString();
    const s: SermonSeries = {
      id: ctx.id('ss'), title, description: text(b.description, 2000), createdBy: ctx.staff?.name ?? '', createdAt: now, updatedAt: now,
      weeks: passages.map((passage, i) => ({ id: ctx.id('wk'), date: start ? addDays(start, i * 7) : '', title: '', passage, preacher: text(b.preacher, 120), prepId: null })),
    };
    ctx.db.put('sermonSeries', s);
    ctx.audit('created', 'sermonSeries', s.id, `Planned the sermon series “${title}”`);
    return view(ctx, s);
  });
  r.get('/admin/sermon-series/:id', PERM, (ctx) => view(ctx, find(ctx, 'sermonSeries', ctx.params[0], 'Series')));
  r.put('/admin/sermon-series/:id', PERM, (ctx) => {
    const s = find(ctx, 'sermonSeries', ctx.params[0], 'Series');
    const b = ctx.body as Record<string, unknown>;
    const next: SermonSeries = { ...s, updatedAt: ctx.now.toISOString() };
    if (b.title !== undefined) next.title = text(b.title, 120) || s.title;
    if (b.description !== undefined) next.description = text(b.description, 2000);
    if (b.weeks !== undefined) next.weeks = weeks(ctx, b.weeks);
    ctx.db.put('sermonSeries', next);
    return view(ctx, next);
  });
  r.del('/admin/sermon-series/:id', PERM, (ctx) => {
    const s = find(ctx, 'sermonSeries', ctx.params[0], 'Series');
    ctx.db.del('sermonSeries', s.id);
    ctx.audit('deleted', 'sermonSeries', s.id, `Deleted the sermon series “${s.title}” (its sermons are kept)`);
    return undefined;
  });
  /** Starts (or opens) the sermon for one week, filled in from the plan. */
  r.post('/admin/sermon-series/:id/weeks/:week/start', PERM, (ctx) => {
    const s = find(ctx, 'sermonSeries', ctx.params[0], 'Series');
    const w = s.weeks.find((x) => x.id === ctx.params[1]);
    if (!w) throw new ApiError(404, 'not_found', 'That week is not in the series.');
    const old = w.prepId ? ctx.db.get('sermonPreps', w.prepId) : undefined;
    if (old) return old;
    const prep = { ...blankPrep(ctx), title: w.title || w.passage || `${s.title}, week ${s.weeks.indexOf(w) + 1}`, series: s.title, date: w.date, passage: w.passage, preacher: w.preacher || ctx.staff?.name || '' };
    ctx.db.put('sermonPreps', prep);
    ctx.db.put('sermonSeries', { ...s, weeks: s.weeks.map((x) => (x.id === w.id ? { ...x, prepId: prep.id } : x)), updatedAt: ctx.now.toISOString() });
    ctx.audit('created', 'sermonPrep', prep.id, `Started preparing “${prep.title}” for the series “${s.title}”`);
    return prep;
  });

  // Illustrations
  r.get('/admin/illustrations', PERM, (ctx) => {
    const q = String(ctx.query.q ?? '').trim().toLowerCase();
    const theme = String(ctx.query.theme ?? '').trim().toLowerCase();
    return ctx.db.all('illustrations')
      .filter((i) => (!theme || i.themes.includes(theme)) && (!q || `${i.title} ${i.text} ${i.themes.join(' ')} ${i.refs.join(' ')} ${i.source}`.toLowerCase().includes(q)))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  });
  const illustration = (ctx: Ctx, base: Illustration): Illustration => {
    const b = ctx.body as Record<string, unknown>;
    const next = { ...base, updatedAt: ctx.now.toISOString() };
    if (b.title !== undefined) next.title = text(b.title, 160);
    if (b.text !== undefined) next.text = text(b.text, 8000);
    if (b.kind !== undefined) next.kind = KINDS.includes(b.kind as IllustrationKind) ? (b.kind as IllustrationKind) : next.kind;
    if (b.themes !== undefined) next.themes = tags(b.themes);
    if (b.refs !== undefined) next.refs = [...new Set((Array.isArray(b.refs) ? b.refs : String(b.refs ?? '').split(/[;\n]/)).map((x) => tidyReference(String(x ?? ''))).filter(Boolean))].slice(0, 8);
    if (b.source !== undefined) next.source = text(b.source, 200);
    if (!next.text) throw new ApiError(422, 'invalid', 'Write the illustration.', { text: 'Needed' });
    if (!next.title) next.title = next.text.split('\n')[0].slice(0, 80);
    return next;
  };
  r.post('/admin/illustrations', PERM, (ctx) => {
    const now = ctx.now.toISOString();
    return ctx.db.put('illustrations', illustration(ctx, { id: ctx.id('il'), title: '', text: '', kind: 'story', themes: [], refs: [], source: '', uses: [], createdBy: ctx.staff?.name ?? '', createdAt: now, updatedAt: now }));
  });
  r.put('/admin/illustrations/:id', PERM, (ctx) => ctx.db.put('illustrations', illustration(ctx, find(ctx, 'illustrations', ctx.params[0], 'Illustration'))));
  r.del('/admin/illustrations/:id', PERM, (ctx) => { ctx.db.del('illustrations', find(ctx, 'illustrations', ctx.params[0], 'Illustration').id); return undefined; });
  /** Notes that a sermon used it, so the bank can say when it was last told. */
  r.post('/admin/illustrations/:id/use', PERM, (ctx) => {
    const i = find(ctx, 'illustrations', ctx.params[0], 'Illustration');
    const prep = find(ctx, 'sermonPreps', String(ctx.body.prepId ?? ''), 'Sermon');
    const use = { prepId: prep.id, title: prep.title, date: prep.date || ctx.now.toISOString().slice(0, 10) };
    return ctx.db.put('illustrations', { ...i, uses: [use, ...i.uses.filter((u) => u.prepId !== prep.id)].slice(0, 50), updatedAt: ctx.now.toISOString() });
  });

  // History and checks
  r.get('/admin/preaching-history', PERM, (ctx) => history(ctx));
  /** Earlier sermons on the same chapter (or, failing that, the same book). */
  r.get('/admin/preaching-history/check', PERM, (ctx) => {
    const p = parseReference(String(ctx.query.passage ?? ''));
    if (!p) return { chapter: [], book: [] };
    const others = preached(ctx).filter((s) => s.id !== String(ctx.query.except ?? '') && s.book === BOOK_CODES[p.book]);
    return { chapter: others.filter((s) => s.chapter === p.chapter), book: others.filter((s) => s.chapter !== p.chapter).slice(0, 10) };
  });
  r.get('/admin/translation-check', PERM, (ctx) => translationCheck(ctx, String(ctx.query.ref ?? '')));
}
