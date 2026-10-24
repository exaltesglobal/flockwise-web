// Sermon transcripts: the words as preached, from Sunday's live captions or a caption file (.srt or
// .vtt, such as YouTube's) or pasted text. AI adds a summary, chapters and short moments to share.
// Members read and search it beside the recording, and a chapter jumps the audio or video there.
import type { Ctx, Router } from '../engine.js';
import { ApiError } from '../errors.js';
import type { Sermon, SermonTranscript, SermonTranscriptAdmin, TranscriptChapter, TranscriptClip, TranscriptLine, TranscriptSource } from '../types.js';
import { find } from '../util.js';
import { chapterSermon } from './ai.js';
import { publicPageOf } from './ministry.js';

const PERM = { perm: ['comms', 'services'] } as { perm: ('comms' | 'services')[] };
const MAX_LINES = 4000;
const MAX_CHARS = 250_000;

const TIME = /^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?/;
function seconds(s: string): number | null {
  const m = TIME.exec(s.trim());
  if (!m) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + (m[4] ? Number(m[4].padEnd(3, '0')) / 1000 : 0);
}
const clean = (s: string) => s.replace(/<[^>]*>/g, '').replace(/\{[^}]*\}/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

/** Short cues or long paragraphs into readable stretches of about 20 to 50 words, each keeping its first time. */
export function chunk(cues: TranscriptLine[]): TranscriptLine[] {
  const out: TranscriptLine[] = [];
  let cur: TranscriptLine | null = null;
  let words = 0;
  const flush = () => { if (cur && cur.text) out.push(cur); cur = null; words = 0; };
  for (const c of cues) {
    for (const piece of c.text.length > 400 ? c.text.split(/(?<=[.!?।])\s+/) : [c.text]) {
      if (!piece.trim()) continue;
      if (!cur) cur = { at: c.at, text: '' };
      cur.text = cur.text ? `${cur.text} ${piece.trim()}` : piece.trim();
      words += piece.trim().split(/\s+/).length;
      if ((words >= 20 && /[.!?।]["”’)]?$/.test(piece.trim())) || words >= 50) flush();
    }
  }
  flush();
  return out;
}

/** A caption file (.srt, .vtt), lines with [mm:ss] times, or plain paragraphs. */
export function parseTranscript(text: string): TranscriptLine[] {
  const src = text.replace(/\r/g, '').replace(/^﻿/, '').slice(0, MAX_CHARS * 2);
  const cues: TranscriptLine[] = [];
  if (/-->/.test(src)) {
    let prev = new Set<string>();
    for (const block of src.split(/\n{2,}/)) {
      const rows = block.split('\n');
      const ti = rows.findIndex((r) => r.includes('-->'));
      if (ti < 0) continue;
      const at = seconds(rows[ti].split('-->')[0]);
      const said = rows.slice(ti + 1).map(clean).filter(Boolean);
      // YouTube's automatic captions repeat the line before; keep only what is new.
      const fresh = said.filter((r) => !prev.has(r));
      prev = new Set(said);
      if (fresh.length) cues.push({ at, text: fresh.join(' ') });
    }
  } else {
    const stamped = src.split('\n').filter((l) => l.trim());
    const withTime = stamped.filter((l) => /^\s*\[?\(?\d{1,2}:\d{2}/.test(l)).length;
    if (withTime >= Math.max(2, stamped.length / 3)) {
      for (const l of stamped) {
        const m = /^\s*[[(]?((?:\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d+)?)[\])]?\s*[-–:]?\s*(.*)$/.exec(l);
        if (m) cues.push({ at: seconds(m[1]), text: clean(m[2]) });
        else if (cues.length) cues[cues.length - 1].text += ` ${clean(l)}`;
      }
    } else {
      for (const p of src.split(/\n{2,}/)) if (clean(p)) cues.push({ at: null, text: clean(p) });
    }
  }
  return chunk(cues.filter((c) => c.text)).slice(0, MAX_LINES);
}

/** The service whose live captions belong to this sermon: its own service, or one that day with captions. */
function captionsFor(ctx: Ctx, s: Sermon, eventId?: string | null) {
  const ids = eventId ? [eventId] : [s.eventId, ...ctx.db.all('events').filter((e) => e.startsAt.slice(0, 10) === s.date).map((e) => e.id)].filter((x): x is string => !!x);
  for (const id of ids) {
    const log = ctx.db.get('captions', id);
    if (log?.lines.length) return { log, event: ctx.db.get('events', id) };
  }
  return null;
}

function stamp(ctx: Ctx, s: Sermon, t: SermonTranscript | null) {
  ctx.db.put('sermons', { ...s, transcript: t ? { lines: t.lines.length, chapters: t.chapters.length, clips: t.clips.length } : null });
}

function cleanChapters(raw: unknown, lines: number): TranscriptChapter[] {
  const last = Math.max(0, lines - 1);
  return (Array.isArray(raw) ? raw : []).slice(0, 20).map((c: Record<string, unknown>) => ({ line: Math.max(0, Math.min(last, Math.round(Number(c.line) || 0))), title: String(c.title ?? '').trim().slice(0, 120), summary: String(c.summary ?? '').trim().slice(0, 300) })).filter((c) => c.title).sort((a, b) => a.line - b.line);
}
function cleanClips(raw: unknown, lines: number): TranscriptClip[] {
  const last = Math.max(0, lines - 1);
  return (Array.isArray(raw) ? raw : []).slice(0, 12).map((c: Record<string, unknown>) => {
    const line = Math.max(0, Math.min(last, Math.round(Number(c.line) || 0)));
    return { line, endLine: Math.max(line, Math.min(last, Math.round(Number(c.endLine) || line))), title: String(c.title ?? '').trim().slice(0, 120), quote: String(c.quote ?? '').trim().slice(0, 500) };
  }).filter((c) => c.quote);
}

function published(ctx: Ctx, id: string) {
  const s = ctx.db.get('sermons', id);
  const t = s?.published ? ctx.db.get('sermonTranscripts', id) : null;
  if (!s || !t) throw new ApiError(404, 'not_found', 'This sermon has no transcript yet.');
  return t;
}

export function registerSermonTranscripts(r: Router) {
  r.get('/admin/sermons/:id/transcript', PERM, (ctx): SermonTranscriptAdmin => {
    const s = find(ctx, 'sermons', ctx.params[0], 'Sermon');
    const c = captionsFor(ctx, s);
    return { transcript: ctx.db.get('sermonTranscripts', s.id) ?? null, captions: c ? { eventId: c.log.eventId, title: c.event?.title ?? 'Service', lines: c.log.lines.length } : null };
  });

  r.put('/admin/sermons/:id/transcript', PERM, (ctx) => {
    const s = find(ctx, 'sermons', ctx.params[0], 'Sermon');
    const source: TranscriptSource = ctx.body.source === 'captions' ? 'captions' : ctx.body.source === 'file' ? 'file' : 'typed';
    let lines: TranscriptLine[];
    if (source === 'captions') {
      const c = captionsFor(ctx, s, ctx.body.eventId ? String(ctx.body.eventId) : null);
      if (!c) throw new ApiError(404, 'not_found', 'No live captions were saved for this sermon’s service.');
      const t0 = Date.parse(c.log.lines[0].at);
      lines = chunk(c.log.lines.map((l) => ({ at: Math.max(0, Math.round((Date.parse(l.at) - t0) / 1000)), text: l.text.trim() })));
    } else {
      lines = parseTranscript(String(ctx.body.text ?? ''));
    }
    if (lines.reduce((n, l) => n + l.text.split(/\s+/).length, 0) < 30) throw new ApiError(422, 'invalid', 'That is too short for a sermon transcript.', { text: 'Paste the whole sermon or a caption file' });
    let chars = 0;
    lines = lines.filter((l) => (chars += l.text.length) <= MAX_CHARS);
    const t: SermonTranscript = {
      id: s.id, sermonId: s.id, source, language: ctx.body.language ? String(ctx.body.language).slice(0, 8) : null,
      offset: Math.max(-3600, Math.min(3 * 3600, Math.round(Number(ctx.body.offset) || 0))),
      lines, summary: '', chapters: [], clips: [], madeBy: null, updatedAt: ctx.now.toISOString(),
    };
    ctx.db.put('sermonTranscripts', t);
    stamp(ctx, s, t);
    ctx.audit('updated', 'sermon', s.id, `Added the transcript of “${s.title}”`);
    return t;
  });

  r.patch('/admin/sermons/:id/transcript', PERM, (ctx) => {
    const s = find(ctx, 'sermons', ctx.params[0], 'Sermon');
    const t = ctx.db.get('sermonTranscripts', s.id);
    if (!t) throw new ApiError(404, 'not_found', 'Add the transcript first.');
    const next: SermonTranscript = { ...t, updatedAt: ctx.now.toISOString() };
    if (ctx.body.offset !== undefined) next.offset = Math.max(-3600, Math.min(3 * 3600, Math.round(Number(ctx.body.offset) || 0)));
    if (ctx.body.summary !== undefined) next.summary = String(ctx.body.summary ?? '').trim().slice(0, 1500);
    if (ctx.body.chapters !== undefined) { next.chapters = cleanChapters(ctx.body.chapters, t.lines.length); next.madeBy = 'office'; }
    if (ctx.body.clips !== undefined) next.clips = cleanClips(ctx.body.clips, t.lines.length);
    if (ctx.body.line !== undefined) {
      const i = Number((ctx.body.line as { index?: unknown }).index);
      if (!Number.isInteger(i) || !t.lines[i]) throw new ApiError(422, 'invalid', 'That line is not in the transcript.');
      next.lines = t.lines.map((l, j) => (j === i ? { ...l, text: String((ctx.body.line as { text?: unknown }).text ?? '').trim().slice(0, 2000) || l.text } : l));
    }
    ctx.db.put('sermonTranscripts', next);
    stamp(ctx, s, next);
    return next;
  });

  r.post('/admin/sermons/:id/transcript/chapters', PERM, async (ctx) => {
    const s = find(ctx, 'sermons', ctx.params[0], 'Sermon');
    const t = ctx.db.get('sermonTranscripts', s.id);
    if (!t) throw new ApiError(404, 'not_found', 'Add the transcript first.');
    const out = await chapterSermon(ctx, { title: s.title, passage: s.scripture }, t.lines);
    const next: SermonTranscript = { ...t, ...out, madeBy: 'ai', updatedAt: ctx.now.toISOString() };
    ctx.db.put('sermonTranscripts', next);
    stamp(ctx, s, next);
    return next;
  });

  r.del('/admin/sermons/:id/transcript', PERM, (ctx) => {
    const s = find(ctx, 'sermons', ctx.params[0], 'Sermon');
    ctx.db.del('sermonTranscripts', s.id);
    stamp(ctx, s, null);
    ctx.audit('deleted', 'sermon', s.id, `Removed the transcript of “${s.title}”`);
    return undefined;
  });

  r.get('/sermons/:id/transcript', {}, (ctx) => published(ctx, ctx.params[0]));
  r.get('/public/sermons/:id/transcript', { public: true }, (ctx) => {
    if (!publicPageOf(ctx).enabled) throw new ApiError(404, 'not_found', 'Not published.');
    return published(ctx, ctx.params[0]);
  });
}
