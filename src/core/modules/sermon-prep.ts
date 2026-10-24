// Sermon workspace: one page per sermon, from the first study notes to the pulpit. Passage, big
// idea, an outline of points with their verses and planned minutes, and private study notes. The
// preaching view reads it with every verse filled in, and publishing turns it into a sermon in the
// library for members.
import { parseReference } from '../bible-texts.js';
import type { Ctx, Router } from '../engine.js';
import { ApiError } from '../errors.js';
import type { Sermon, SermonComment, SermonPoint, SermonPrep, SermonPrepStatus, SermonPrepSummary, SermonPreach } from '../types.js';
import { find } from '../util.js';
import { notify } from './notify.js';
import { lookupPassage, tidyReference } from './bible.js';

const PERM = { perm: ['services', 'comms'] } as { perm: ('services' | 'comms')[] };
const STATUSES: SermonPrepStatus[] = ['draft', 'ready', 'preached'];
const text = (v: unknown, max: number) => String(v ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);

/** Verse references typed in any form, tidied ("jn 3 16" stays as typed if it is not a reference). */
function refs(v: unknown): string[] {
  const list = Array.isArray(v) ? v : String(v ?? '').split(/[;\n]/);
  return [...new Set(list.map((r) => tidyReference(String(r ?? ''))).filter((r) => r && r.length <= 60))].slice(0, 12);
}

function points(ctx: Ctx, v: unknown): SermonPoint[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 20).map((p: Record<string, unknown>) => ({
    id: typeof p?.id === 'string' && /^[\w-]{1,40}$/.test(p.id) ? p.id : ctx.id('pt'),
    heading: text(p?.heading, 200),
    body: text(p?.body, 6000),
    refs: refs(p?.refs),
    minutes: Math.max(0, Math.min(90, Math.round(Number(p?.minutes) || 0))),
  }));
}

/** Applies the editable fields present in the body. */
function edit(ctx: Ctx, base: SermonPrep): SermonPrep {
  const b = ctx.body as Record<string, unknown>;
  const next: SermonPrep = { ...base };
  if (b.title !== undefined) next.title = text(b.title, 160);
  if (b.preacher !== undefined) next.preacher = text(b.preacher, 120);
  if (b.date !== undefined) {
    if (b.date && !/^\d{4}-\d{2}-\d{2}$/.test(String(b.date))) throw new ApiError(422, 'invalid', 'Use a date.', { date: 'YYYY-MM-DD' });
    next.date = String(b.date ?? '');
  }
  if (b.series !== undefined) next.series = text(b.series, 120);
  if (b.passage !== undefined) next.passage = tidyReference(text(b.passage, 80));
  if (b.bigIdea !== undefined) next.bigIdea = text(b.bigIdea, 400);
  if (b.intro !== undefined) next.intro = text(b.intro, 6000);
  if (b.close !== undefined) next.close = text(b.close, 6000);
  if (b.study !== undefined) next.study = text(b.study, 40_000);
  if (b.translation !== undefined) next.translation = text(b.translation, 40) || 'eng-kjv2006';
  if (b.status !== undefined) next.status = STATUSES.includes(b.status as SermonPrepStatus) ? (b.status as SermonPrepStatus) : next.status;
  if (b.points !== undefined) next.points = points(ctx, b.points);
  next.updatedAt = ctx.now.toISOString();
  return next;
}

export function blankPrep(ctx: Ctx): SermonPrep {
  const now = ctx.now.toISOString();
  return {
    id: ctx.id('sp'), title: '', preacher: ctx.staff?.name ?? '', date: '', series: '', passage: '', bigIdea: '', intro: '', points: [], close: '', study: '',
    translation: 'eng-kjv2006', status: 'draft', sermonId: null, createdBy: ctx.staff?.name ?? '', createdAt: now, updatedAt: now,
  };
}

const summary = (p: SermonPrep): SermonPrepSummary => ({
  id: p.id, title: p.title, preacher: p.preacher, date: p.date, series: p.series, passage: p.passage, status: p.status, sermonId: p.sermonId, updatedAt: p.updatedAt,
  points: p.points.length, minutes: p.points.reduce((n, x) => n + x.minutes, 0),
});

/** "God [loves] the world" → "God loves the world": brackets mark the blanks in fill-in notes. */
export const unbracket = (s: string) => s.replace(/\[([^\]]*)\]/g, '$1');

/** The outline as notes for members: big idea, points with their verses, and the close. */
export function sermonNotes(p: SermonPrep): string {
  const out: string[] = [];
  if (p.bigIdea) out.push(`**${p.bigIdea}**`);
  if (p.intro) out.push(p.intro);
  p.points.forEach((x, i) => {
    out.push(`## ${i + 1}. ${unbracket(x.heading) || 'Point'}`);
    if (x.body) out.push(x.body);
    if (x.refs.length) out.push(`_${x.refs.join('; ')}_`);
  });
  if (p.close) out.push(`## In closing\n${p.close}`);
  return out.join('\n\n');
}

export function registerSermonPrep(r: Router) {
  r.get('/admin/sermon-prep', PERM, (ctx) => ctx.db.all('sermonPreps').sort((a, b) => (b.date || b.updatedAt).localeCompare(a.date || a.updatedAt)).map(summary));

  r.post('/admin/sermon-prep', PERM, (ctx) => {
    const p = edit(ctx, blankPrep(ctx));
    if (!p.title) p.title = p.passage || 'Untitled sermon';
    ctx.db.put('sermonPreps', p);
    ctx.audit('created', 'sermonPrep', p.id, `Started preparing “${p.title}”`);
    return p;
  });

  r.get('/admin/sermon-prep/:id', PERM, (ctx) => find(ctx, 'sermonPreps', ctx.params[0], 'Sermon'));
  r.put('/admin/sermon-prep/:id', PERM, (ctx) => ctx.db.put('sermonPreps', edit(ctx, find(ctx, 'sermonPreps', ctx.params[0], 'Sermon'))));
  r.del('/admin/sermon-prep/:id', PERM, (ctx) => {
    const p = find(ctx, 'sermonPreps', ctx.params[0], 'Sermon');
    ctx.db.del('sermonPreps', p.id);
    ctx.audit('deleted', 'sermonPrep', p.id, `Deleted the sermon draft “${p.title}”`);
    return undefined;
  });

  /** A copy to start next week's sermon from (same series and preacher, no outline text). */
  r.post('/admin/sermon-prep/:id/copy', PERM, (ctx) => {
    const p = find(ctx, 'sermonPreps', ctx.params[0], 'Sermon');
    const now = ctx.now.toISOString();
    const copy: SermonPrep = { ...p, id: ctx.id('sp'), title: `${p.title} (copy)`, status: 'draft', sermonId: null, comments: [], kits: undefined, kitSentAt: null, points: p.points.map((x) => ({ ...x, id: ctx.id('pt') })), createdBy: ctx.staff?.name ?? '', createdAt: now, updatedAt: now };
    return ctx.db.put('sermonPreps', copy);
  });

  /** Puts the sermon in the library (or updates the entry made before), with the outline as its notes. */
  r.post('/admin/sermon-prep/:id/publish', PERM, (ctx) => {
    const p = find(ctx, 'sermonPreps', ctx.params[0], 'Sermon');
    if (!p.title.trim()) throw new ApiError(422, 'invalid', 'Give the sermon a title first.', { title: 'Needed' });
    const old = p.sermonId ? ctx.db.get('sermons', p.sermonId) : undefined;
    const sermon: Sermon = {
      ...(old ?? { id: ctx.id('sm'), description: '', videoUrl: '', audioUrl: '', notesUrl: '', imageUrl: '', eventId: null, createdAt: ctx.now.toISOString() }),
      title: p.title, speaker: p.preacher, date: p.date || ctx.now.toISOString().slice(0, 10), series: p.series, scripture: p.passage,
      description: old?.description || p.bigIdea, notes: sermonNotes(p),
      outline: p.points.length ? { bigIdea: p.bigIdea, points: p.points.map((x) => ({ heading: x.heading, refs: x.refs })) } : null, kits: p.kits ?? old?.kits, published: ctx.body.published === undefined ? old?.published ?? true : !!ctx.body.published,
    };
    ctx.db.put('sermons', sermon);
    const next = ctx.db.put('sermonPreps', { ...p, sermonId: sermon.id, updatedAt: ctx.now.toISOString() });
    ctx.audit(old ? 'updated' : 'created', 'sermon', sermon.id, `${old ? 'Updated' : 'Published'} the sermon “${sermon.title}” from the workspace`);
    return { prep: next, sermon };
  });

  // Co-preparation: comments from other staff, and asking them for feedback.
  const staffPeople = (ctx: Ctx, ids: string[]) => ids.map((id) => ctx.db.get('staff', id)).filter((s): s is NonNullable<typeof s> => !!s && s.status === 'active');
  const tellStaff = async (ctx: Ctx, staff: ReturnType<typeof staffPeople>, title: string, body: string, prepId: string) => {
    const link = `/admin/sermon-prep?open=${prepId}`;
    await notify(ctx, 'sermon.feedback', { personIds: staff.map((s) => s.personId).filter((x): x is string => !!x), title, body });
    const mails = staff.filter((s) => s.email).map((s) => ({ to: s.email, name: s.name, subject: title, text: `${body}\n\n${ctx.env.webUrl}${link}` }));
    if (mails.length) await ctx.env.deliver('email', mails).catch(() => undefined);
  };
  r.post('/admin/sermon-prep/:id/share', PERM, async (ctx) => {
    const p = find(ctx, 'sermonPreps', ctx.params[0], 'Sermon');
    const ids = Array.isArray(ctx.body.staffIds) ? ctx.body.staffIds.map(String) : [];
    const staff = staffPeople(ctx, ids).filter((s) => s.id !== ctx.staff?.id);
    if (!staff.length) throw new ApiError(422, 'invalid', 'Pick who to ask.', { staffIds: 'Pick at least one' });
    const note = text(ctx.body.message, 600);
    await tellStaff(ctx, staff, `${ctx.staff?.name ?? 'The preacher'} asks for your thoughts on “${p.title}”`, `${note ? `${note}\n\n` : ''}Open the draft and add your comments beside it${p.date ? ` before ${p.date}` : ''}.`, p.id);
    ctx.audit('sent', 'sermonPrep', p.id, `Asked ${staff.map((s) => s.name).join(', ')} for feedback on “${p.title}”`);
    return { asked: staff.length };
  });
  r.post('/admin/sermon-prep/:id/comments', PERM, async (ctx) => {
    const p = find(ctx, 'sermonPreps', ctx.params[0], 'Sermon');
    const body = text(ctx.body.text, 2000);
    if (!body) throw new ApiError(422, 'invalid', 'Write a comment.', { text: 'Needed' });
    const pointId = typeof ctx.body.pointId === 'string' && p.points.some((x) => x.id === ctx.body.pointId) ? ctx.body.pointId : null;
    const c: SermonComment = { id: ctx.id('cm'), by: ctx.staff?.name ?? 'Someone', staffId: ctx.staff?.id ?? null, text: body, pointId, at: ctx.now.toISOString(), resolved: false };
    const next = ctx.db.put('sermonPreps', { ...p, comments: [...(p.comments ?? []), c].slice(-200) });
    // Tell the preacher when someone else comments.
    const preacher = ctx.db.all('staff').find((s) => s.name === p.createdBy && s.id !== ctx.staff?.id);
    if (preacher) await tellStaff(ctx, [preacher], `${c.by} commented on “${p.title}”`, body.slice(0, 300), p.id);
    return next;
  });
  r.put('/admin/sermon-prep/:id/comments/:cid', PERM, (ctx) => {
    const p = find(ctx, 'sermonPreps', ctx.params[0], 'Sermon');
    if (!(p.comments ?? []).some((c) => c.id === ctx.params[1])) throw new ApiError(404, 'not_found', 'Comment not found.');
    return ctx.db.put('sermonPreps', { ...p, comments: (p.comments ?? []).map((c) => (c.id === ctx.params[1] ? { ...c, resolved: !!ctx.body.resolved } : c)) });
  });
  r.del('/admin/sermon-prep/:id/comments/:cid', PERM, (ctx) => {
    const p = find(ctx, 'sermonPreps', ctx.params[0], 'Sermon');
    const c = (p.comments ?? []).find((x) => x.id === ctx.params[1]);
    if (!c) throw new ApiError(404, 'not_found', 'Comment not found.');
    if (c.staffId && c.staffId !== ctx.staff?.id) throw new ApiError(403, 'forbidden', 'Only the person who wrote a comment can delete it.');
    return ctx.db.put('sermonPreps', { ...p, comments: (p.comments ?? []).filter((x) => x.id !== c.id) });
  });

  /** The sermon with every verse's words, for the preaching view. A verse that cannot be read comes back null. */
  r.get('/admin/sermon-prep/:id/preach', PERM, async (ctx): Promise<SermonPreach> => {
    const p = find(ctx, 'sermonPreps', ctx.params[0], 'Sermon');
    const tr = String(ctx.query.tr ?? '') || p.translation;
    const all = [...new Set([p.passage, ...p.points.flatMap((x) => x.refs)].filter((x) => x && parseReference(x)))].slice(0, 40);
    const found = await Promise.all(all.map((ref) => lookupPassage(ctx, ref, tr).then((v) => ({ reference: v.reference, text: v.verses.map((x) => `${v.verses.length > 1 ? `${x.verse} ` : ''}${x.text}`).join(' ') }), () => null)));
    return { prep: p, verses: Object.fromEntries(all.map((ref, i) => [ref, found[i]])) };
  });
}
