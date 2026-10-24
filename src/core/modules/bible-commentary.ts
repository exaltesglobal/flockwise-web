// Classic commentaries beside the Bible: Matthew Henry, Jamieson-Fausset-Brown, Adam Clarke, John
// Gill, Keil & Delitzsch, Calvin (all public domain) and Tyndale's open study notes (CC BY-SA),
// read chapter by chapter from the Free Use Bible API (bible.helloao.org) and kept in memory.
import { BOOKS } from '../bible.js';
import { BOOK_CODES, bookIndex } from '../bible-texts.js';
import type { Ctx, Router } from '../engine.js';
import { ApiError } from '../errors.js';
import type { BibleCommentary, BibleCommentaryInfo } from '../types.js';
import { remember } from './bible.js';

export const COMMENTARIES: BibleCommentaryInfo[] = [
  { id: 'matthew-henry', name: 'Matthew Henry Commentary', short: 'Matthew Henry', ot: true, nt: true },
  { id: 'jamieson-fausset-brown', name: 'Jamieson-Fausset-Brown Commentary', short: 'JFB', ot: true, nt: true },
  { id: 'tyndale', name: 'Tyndale Open Study Notes', short: 'Tyndale notes', ot: true, nt: true },
  { id: 'adam-clarke', name: 'Adam Clarke Commentary', short: 'Adam Clarke', ot: true, nt: true },
  { id: 'john-gill', name: 'John Gill Exposition', short: 'John Gill', ot: true, nt: true },
  { id: 'keil-delitzsch', name: 'Keil & Delitzsch Old Testament Commentary', short: 'Keil & Delitzsch', ot: true, nt: false },
  { id: 'john-calvin', name: "John Calvin's Commentaries", short: 'Calvin', ot: true, nt: true },
];
const LICENCE: Record<string, string> = { tyndale: 'Tyndale House Publishers, shared under CC BY-SA 4.0' };

const chapters = new Map<string, Promise<BibleCommentary>>();

type Raw = { book?: { introduction?: string }; chapter?: { introduction?: string; content?: { type?: string; number?: number; content?: unknown[] }[] } };
const text = (parts: unknown[] | undefined) => (parts ?? []).map((p) => (typeof p === 'string' ? p : typeof p === 'object' && p && 'text' in p ? String((p as { text: unknown }).text) : '')).join(' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

/** The Free Use Bible API's chapter JSON → notes by verse, with the chapter (or, for chapter 1, the book) introduction. */
export function parseCommentary(raw: Raw, info: BibleCommentaryInfo, book: string, chapter: number): BibleCommentary {
  const notes = (raw.chapter?.content ?? []).filter((c) => c.type === 'verse' && Number(c.number) > 0).map((c) => ({ verse: Number(c.number), text: text(c.content) })).filter((n) => n.text);
  const intro = [chapter === 1 ? raw.book?.introduction ?? '' : '', raw.chapter?.introduction ?? ''].map((x) => x.trim()).filter(Boolean).join('\n\n');
  return { commentary: info, book, chapter, intro, notes, source: `${info.name}. ${LICENCE[info.id] ?? 'Public domain'}. Text from the Free Use Bible API (bible.helloao.org).` };
}

export function commentary(ctx: Ctx, id: string, book: string, chapter: number): Promise<BibleCommentary> {
  const info = COMMENTARIES.find((c) => c.id === id);
  if (!info) throw new ApiError(404, 'not_found', 'That commentary is not available.');
  const b = bookIndex(book);
  if (b < 0 || !Number.isInteger(chapter) || chapter < 1 || chapter > BOOKS[b].chapters) throw new ApiError(404, 'not_found', 'That chapter is not in the Bible.');
  if (!ctx.env.http || ctx.env.demo) throw new ApiError(503, 'offline', 'Commentaries need the internet. They work in the live app.');
  const code = BOOK_CODES[b];
  return remember(chapters, `${id}/${code}/${chapter}`, 600, async () => {
    const r = await ctx.env.http!({ method: 'GET', url: `https://bible.helloao.org/api/c/${id}/${code}/${chapter}.json`, timeoutMs: 20_000, headers: { Accept: 'application/json' } }).catch((e: Error) => ({ status: 0, headers: {}, text: e.message }));
    if (r.status === 404) return { commentary: info, book: code, chapter, intro: '', notes: [], source: `${info.name} has no notes on this chapter.` };
    if (r.status !== 200) throw new ApiError(502, 'commentary_unreachable', `Could not reach the commentary library (${r.status || r.text.slice(0, 80)}). Try again in a minute.`);
    let raw: Raw;
    try { raw = JSON.parse(r.text) as Raw; } catch { throw new ApiError(502, 'commentary_unreadable', 'Could not read that commentary chapter.'); }
    return parseCommentary(raw, info, code, chapter);
  });
}

export function registerBibleCommentary(r: Router) {
  r.get('/public/bible/commentaries', { public: true }, () => COMMENTARIES);
  r.get('/public/bible/commentary/:id/:book/:chapter', { public: true }, (ctx) => commentary(ctx, ctx.params[0], ctx.params[1].toUpperCase(), Number(ctx.params[2])));
}
