// From the sermon workspace to Sunday and the week after: the outline as projector slides in the
// service plan (in two languages if wanted), fill-in-the-blank notes on members' phones, and the
// week's cell-group kit sent to every cell leader.
import { FEATURED_BIBLES, parseReference } from '../bible-texts.js';
import type { Ctx, Router } from '../engine.js';
import { ApiError } from '../errors.js';
import { LANGUAGES } from '../languages.js';
import type { GroupKit, PlanItem, SermonFill, SermonPrep } from '../types.js';
import { find } from '../util.js';
import { writeGroupKit } from './ai.js';
import { lookupPassage } from './bible.js';
import { notify } from './notify.js';
import { unbracket } from './sermon-prep.js';

const PERM = { perm: ['services', 'comms'] } as { perm: ('services' | 'comms')[] };
const dayOf = (iso: string) => iso.slice(0, 10);
const addDays = (date: string, days: number) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
const verseText = (v: { verses: { verse: number; text: string }[] }) => v.verses.map((x) => `${v.verses.length > 1 ? `${x.verse} ` : ''}${x.text}`).join(' ');
const read = (ctx: Ctx, ref: string, tr: string) => lookupPassage(ctx, ref, tr).catch(() => null);

// ---------- Slides ----------

/** Services near the sermon's Sunday (or the next three weeks), to put its slides in. */
function servicesFor(ctx: Ctx, p: SermonPrep) {
  const today = dayOf(ctx.now.toISOString());
  const [from, to] = p.date ? [addDays(p.date, -1), addDays(p.date, 1)] : [today, addDays(today, 21)];
  return ctx.db.all('events')
    .filter((e) => (e.kind === 'service' || ctx.db.get('plans', e.id)) && dayOf(e.startsAt) >= from && dayOf(e.startsAt) <= to)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .map((e) => ({ eventId: e.id, title: e.title, startsAt: e.startsAt, hasSlides: (ctx.db.get('plans', e.id)?.items ?? []).some((i) => i.id.startsWith(`sp-${p.id}-`)) }));
}

/** The reading and one item per point, each paragraph a slide; a second Bible adds its words under each verse. */
export async function sermonItems(ctx: Ctx, p: SermonPrep, second: string | null): Promise<PlanItem[]> {
  const both = async (ref: string) => {
    const [a, b] = await Promise.all([read(ctx, ref, p.translation), second ? read(ctx, ref, second) : null]);
    if (!a) return [ref];
    return a.verses.map((v, i) => [`${a.verses.length > 1 ? `${v.verse} ` : ''}${v.text}`, b?.verses[i] ? b.verses[i].text : ''].filter(Boolean).join('\n'));
  };
  const items: PlanItem[] = [];
  const base = { songId: null, key: null, notes: '', person: p.preacher };
  if (p.passage && parseReference(p.passage)) items.push({ ...base, id: `sp-${p.id}-reading`, kind: 'reading', title: p.passage, minutes: 3, text: (await both(p.passage)).join('\n\n') });
  for (const [i, x] of p.points.entries()) {
    const heading = unbracket(x.heading) || `Point ${i + 1}`;
    const refs = x.refs.filter((r) => parseReference(r));
    const verses = await Promise.all(refs.map(async (r) => `${r}\n${(await both(r)).join('\n')}`));
    items.push({ ...base, id: `sp-${p.id}-p${i + 1}`, kind: 'sermon', title: `${i + 1}. ${heading}`, minutes: x.minutes, text: [heading, ...verses].join('\n\n') });
  }
  return items;
}

// ---------- Cell-group kit ----------

/** The memory verse: the first single verse in the outline, else the first verse of the passage. */
function memoryRef(p: SermonPrep): string | null {
  const single = [...p.points.flatMap((x) => x.refs), p.passage].find((r) => { const q = parseReference(r); return q?.from && (!q.to || q.to === q.from); });
  if (single) return single;
  const q = parseReference(p.passage);
  return q ? `${p.passage.replace(/\s*\d+(:.*)?$/, '')} ${q.chapter}:${q.from ?? 1}` : null;
}

export async function makeKit(ctx: Ctx, p: SermonPrep, language: string): Promise<GroupKit> {
  const bible = FEATURED_BIBLES.find((b) => b.app === language)?.id ?? p.translation;
  const ref = memoryRef(p);
  const verse = ref ? (await read(ctx, ref, bible)) ?? (await read(ctx, ref, p.translation)) : null;
  const memoryVerse = { reference: verse?.reference ?? ref ?? '', text: verse ? verseText(verse) : '' };
  const outline = p.points.map((x, i) => `${i + 1}. ${unbracket(x.heading)}${x.refs.length ? ` (${x.refs.join('; ')})` : ''}${x.body ? `\n${x.body.slice(0, 600)}` : ''}`).join('\n');
  const now = ctx.now.toISOString();
  if (ctx.env.ai) {
    try {
      const k = await writeGroupKit(ctx, { title: p.title, passage: p.passage, bigIdea: p.bigIdea, outline, memoryVerse: `${memoryVerse.reference} ${memoryVerse.text}` }, language);
      return { language, ...k, memoryVerse, madeBy: 'ai', createdAt: now };
    } catch {
      /* over the month's allowance or no answer: fall back to the outline */
    }
  }
  // Without AI: questions straight from the outline, in English for the leader to adapt.
  const points = p.points.map((x) => unbracket(x.heading)).filter(Boolean);
  return {
    language: 'en', madeBy: 'outline', createdAt: now, memoryVerse,
    summary: [p.bigIdea, points.length ? `We looked at ${points.join('; ')}.` : ''].filter(Boolean).join(' '),
    icebreaker: 'What was the best part of your week, and what was the hardest?',
    questions: [
      `Read ${p.passage || 'the passage'} together. What stands out to you?`,
      ...points.slice(0, 2).map((h) => `The sermon said: “${h}”. What does that mean for us?`),
      'What is one thing you will do differently this week because of this?',
    ].slice(0, 4),
    prayer: 'Pray for one another to live out what we heard, and for those who could not be with us.',
  };
}

function cellLeaders(ctx: Ctx): string[] {
  return [...new Set(ctx.db.all('groups').filter((g) => g.type === 'cell' && g.leaderId).map((g) => g.leaderId as string))];
}

// ---------- Member notes ----------

export const blanks = (headings: string[]) => headings.flatMap((h) => [...h.matchAll(/\[([^\]]*)\]/g)].map((m) => m[1]));

export function registerSermonSunday(r: Router) {
  r.get('/admin/sermon-prep/:id/services', PERM, (ctx) => servicesFor(ctx, find(ctx, 'sermonPreps', ctx.params[0], 'Sermon')));

  /** Puts the outline into the service plan as slides, replacing any made from this sermon before. */
  r.post('/admin/sermon-prep/:id/slides', PERM, async (ctx) => {
    const p = find(ctx, 'sermonPreps', ctx.params[0], 'Sermon');
    const ev = find(ctx, 'events', String(ctx.body.eventId ?? ''), 'Service');
    const second = ctx.body.second ? String(ctx.body.second).slice(0, 40) : null;
    if (!p.passage && !p.points.length) throw new ApiError(422, 'invalid', 'Add the passage or some points first.');
    const items = await sermonItems(ctx, p, second);
    const plan = ctx.db.get('plans', ev.id) ?? { id: ev.id, eventId: ev.id, theme: '', notes: '', items: [], updatedAt: '' };
    const kept = plan.items.filter((i) => !i.id.startsWith(`sp-${p.id}-`));
    // After the plan's own sermon slot if there is one, else at the end.
    const slot = kept.findIndex((i) => i.kind === 'sermon');
    const next = slot >= 0 ? [...kept.slice(0, slot + 1), ...items, ...kept.slice(slot + 1)] : [...kept, ...items];
    const saved = ctx.db.put('plans', { ...plan, items: next, updatedAt: ctx.now.toISOString() });
    ctx.audit('updated', 'plan', ev.id, `Added the slides for “${p.title}” to ${ev.title}`);
    return { plan: saved, added: items.length };
  });

  r.post('/admin/sermon-prep/:id/kit', PERM, async (ctx) => {
    const p = find(ctx, 'sermonPreps', ctx.params[0], 'Sermon');
    if (!p.points.length && !p.passage) throw new ApiError(422, 'invalid', 'Add the passage and your points first.');
    const lang = String(ctx.body.language ?? 'en');
    const language = LANGUAGES.some((l) => l.code === lang) ? lang : 'en';
    const kit = await makeKit(ctx, p, language);
    const kits = { ...p.kits, [kit.language]: kit };
    const next = ctx.db.put('sermonPreps', { ...p, kits, updatedAt: ctx.now.toISOString() });
    const sermon = p.sermonId ? ctx.db.get('sermons', p.sermonId) : undefined;
    if (sermon) ctx.db.put('sermons', { ...sermon, kits });
    return { prep: next, kit };
  });

  /** Tells every cell leader the kit is ready, with a link to it on the sermon in the app. */
  r.post('/admin/sermon-prep/:id/kit/send', PERM, async (ctx) => {
    const p = find(ctx, 'sermonPreps', ctx.params[0], 'Sermon');
    if (!p.kits || !Object.keys(p.kits).length) throw new ApiError(422, 'invalid', 'Make the kit first.');
    if (!p.sermonId || !ctx.db.get('sermons', p.sermonId)?.published) throw new ApiError(422, 'invalid', 'Put the sermon in the library first, so leaders can open the kit in the app.');
    const leaders = cellLeaders(ctx);
    if (!leaders.length) throw new ApiError(422, 'invalid', 'No cell group has a leader yet. Set a leader on each cell group under Groups.');
    await notify(ctx, 'kit.ready', { personIds: leaders, title: `This week's cell kit: ${p.title}`, body: `Questions, a memory verse and a prayer focus from Sunday's sermon${p.passage ? ` on ${p.passage}` : ''}.`, link: `/app/sermons?open=${p.sermonId}` });
    const next = ctx.db.put('sermonPreps', { ...p, kitSentAt: ctx.now.toISOString() });
    ctx.audit('sent', 'sermonPrep', p.id, `Sent the cell-group kit for “${p.title}” to ${leaders.length} leader${leaders.length === 1 ? '' : 's'}`);
    return { prep: next, leaders: leaders.length };
  });

  // Members' fill-in notes, private to each member.
  r.get('/me/sermons/:id/notes', {}, (ctx) => {
    const s = find(ctx, 'sermons', ctx.params[0], 'Sermon');
    return { fill: ctx.db.get('sermonFills', `${s.id}:${ctx.me()}`) ?? null };
  });
  r.put('/me/sermons/:id/notes', {}, (ctx) => {
    const s = find(ctx, 'sermons', ctx.params[0], 'Sermon');
    if (!s.published) throw new ApiError(404, 'not_found', 'Sermon not found.');
    const count = blanks(s.outline?.points.map((x) => x.heading) ?? []).length;
    const answers = (Array.isArray(ctx.body.answers) ? ctx.body.answers : []).slice(0, count).map((a: unknown) => String(a ?? '').slice(0, 120));
    const fill: SermonFill = { id: `${s.id}:${ctx.me()}`, sermonId: s.id, personId: ctx.me(), answers, note: String(ctx.body.note ?? '').slice(0, 8000), updatedAt: ctx.now.toISOString() };
    return ctx.db.put('sermonFills', fill);
  });
  r.get('/me/sermon-notes', {}, (ctx) => ctx.db.all('sermonFills').filter((f) => f.personId === ctx.me()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
}
