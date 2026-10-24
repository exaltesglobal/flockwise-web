// Ask the pastor, live. A QR code on the screen opens a page where anyone in the room sends a
// question or answers a poll from their phone, with their name or without. No sign-in: each phone
// keeps a random device id, which limits votes and spam. The office approves questions when it
// wants to, AI sorts them into themes, and the stage display shows them grouped with the votes.
import type { Ctx, Router } from '../engine.js';
import { ApiError } from '../errors.js';
import type { AskAdmin, AskPoll, AskPollView, AskPublic, AskQuestion, AskQuestionStatus, AskQuestionView, AskSession, AskSessionSummary, AskStage } from '../types.js';
import { featureOn } from '../features.js';
import { find, settings } from '../util.js';
import { groupQuestions } from './ai.js';
import { screenKey } from './present.js';

const PERM = { perm: ['services', 'comms', 'care'] } as { perm: ('services' | 'comms' | 'care')[] };
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const STATUSES: AskQuestionStatus[] = ['new', 'approved', 'answered', 'hidden'];

function newCode(ctx: Ctx) {
  const used = new Set(ctx.db.all('askSessions').map((s) => s.code));
  for (;;) {
    const bytes = crypto.getRandomValues(new Uint8Array(5));
    const code = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('');
    if (!used.has(code)) return code;
  }
}
const device = (v: unknown) => {
  const d = String(v ?? '').trim();
  if (!/^[\w-]{8,64}$/.test(d)) throw new ApiError(400, 'bad_request', 'Open the page again from the QR code.');
  return d;
};

function bySession(ctx: Ctx, code: string) {
  if (!featureOn(settings(ctx).features, 'ask-live')) throw new ApiError(404, 'not_found', 'This church is not taking questions here.');
  const s = ctx.db.all('askSessions').find((x) => x.code === code.toUpperCase());
  if (!s) throw new ApiError(404, 'not_found', 'This code is not in use. Check the code on the screen.');
  return s;
}

function questionView(q: AskQuestion, me?: string): AskQuestionView {
  return { id: q.id, text: q.text, name: q.name, status: q.status, votes: q.votes.length, theme: q.theme, createdAt: q.createdAt, ...(me ? { mine: q.device === me, voted: q.votes.includes(me) } : {}) };
}
const byVotes = (a: AskQuestionView, b: AskQuestionView) => Number(a.status === 'answered') - Number(b.status === 'answered') || b.votes - a.votes || a.createdAt.localeCompare(b.createdAt);

export function pollView(p: AskPoll, me?: string): AskPollView {
  const counts = p.options.map(() => 0);
  for (const v of Object.values(p.votes)) if (counts[v] !== undefined) counts[v]++;
  return { id: p.id, question: p.question, options: p.options.map((label, i) => ({ label, count: counts[i] })), total: Object.keys(p.votes).length, open: p.open, myVote: me !== undefined && p.votes[me] !== undefined ? p.votes[me] : null };
}

/** What everyone in the room may see: approved questions when the office checks them, else all but hidden ones. */
const visible = (s: AskSession, q: AskQuestion, me?: string) => q.status !== 'hidden' && (!s.moderate || q.status !== 'new' || q.device === me);
const questionsOf = (ctx: Ctx, s: AskSession) => ctx.db.all('askQuestions').filter((q) => q.sessionId === s.id);
const pollOf = (ctx: Ctx, s: AskSession) => (s.pollId ? ctx.db.get('askPolls', s.pollId) ?? null : null);

function adminView(ctx: Ctx, s: AskSession): AskAdmin {
  return {
    session: s,
    eventTitle: s.eventId ? ctx.db.get('events', s.eventId)?.title ?? null : null,
    questions: questionsOf(ctx, s).map((q) => questionView(q)).sort((a, b) => Number(b.status === 'new') - Number(a.status === 'new') || byVotes(a, b)),
    polls: ctx.db.all('askPolls').filter((p) => p.sessionId === s.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((p) => pollView(p)),
    screenKey: screenKey(ctx),
  };
}

function stageView(ctx: Ctx, s: AskSession): AskStage {
  const shown = questionsOf(ctx, s).filter((q) => q.status === 'approved' || (!s.moderate && q.status === 'new')).map((q) => questionView(q)).sort(byVotes);
  const themes = new Map<string | null, AskQuestionView[]>();
  for (const q of shown) themes.set(q.theme, [...(themes.get(q.theme) ?? []), q]);
  const groups = [...themes].map(([theme, questions]) => ({ theme, questions })).sort((a, b) => Number(a.theme === null) - Number(b.theme === null) || b.questions.reduce((n, q) => n + q.votes, 0) - a.questions.reduce((n, q) => n + q.votes, 0));
  const poll = pollOf(ctx, s);
  return { title: s.title, code: s.code, stage: s.stage, groups, poll: poll ? pollView(poll) : null, open: s.open };
}

function cleanSession(ctx: Ctx, body: Record<string, unknown>): Partial<AskSession> {
  const out: Partial<AskSession> = {};
  if (body.title !== undefined) out.title = String(body.title ?? '').trim().slice(0, 120) || 'Questions for the pastor';
  if (body.eventId !== undefined) out.eventId = body.eventId ? find(ctx, 'events', String(body.eventId), 'Event').id : null;
  for (const k of ['open', 'anonymous', 'moderate'] as const) if (typeof body[k] === 'boolean') out[k] = body[k] as boolean;
  if (body.stage === 'questions' || body.stage === 'poll' || body.stage === 'off') out.stage = body.stage;
  return out;
}

export function registerAskLive(r: Router) {
  // ----- office -----
  r.get('/admin/ask', PERM, (ctx): AskSessionSummary[] => {
    const qs = ctx.db.all('askQuestions');
    return ctx.db.all('askSessions').sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((s) => {
      const mine = qs.filter((q) => q.sessionId === s.id);
      return { ...s, questions: mine.length, waiting: mine.filter((q) => q.status === 'new').length, eventTitle: s.eventId ? ctx.db.get('events', s.eventId)?.title ?? null : null };
    });
  });
  r.post('/admin/ask', PERM, (ctx) => {
    const s: AskSession = {
      title: 'Questions for the pastor', eventId: null, open: true, anonymous: true, moderate: false, pollId: null, stage: 'questions',
      ...cleanSession(ctx, ctx.body),
      id: ctx.id('ask'), code: newCode(ctx), createdBy: ctx.staff?.name ?? null, createdAt: ctx.now.toISOString(),
    };
    ctx.db.put('askSessions', s);
    ctx.audit('created', 'askSession', s.id, `Opened “${s.title}” for questions (code ${s.code})`);
    return adminView(ctx, s);
  });
  r.get('/admin/ask/:id', PERM, (ctx) => adminView(ctx, find(ctx, 'askSessions', ctx.params[0], 'Session')));
  r.put('/admin/ask/:id', PERM, (ctx) => {
    const s = find(ctx, 'askSessions', ctx.params[0], 'Session');
    const next = { ...s, ...cleanSession(ctx, ctx.body) };
    ctx.db.put('askSessions', next);
    return adminView(ctx, next);
  });
  r.del('/admin/ask/:id', PERM, (ctx) => {
    const s = find(ctx, 'askSessions', ctx.params[0], 'Session');
    for (const q of questionsOf(ctx, s)) ctx.db.del('askQuestions', q.id);
    for (const p of ctx.db.all('askPolls').filter((x) => x.sessionId === s.id)) ctx.db.del('askPolls', p.id);
    ctx.db.del('askSessions', s.id);
    ctx.audit('deleted', 'askSession', s.id, `Deleted “${s.title}” and its questions`);
    return undefined;
  });

  r.put('/admin/ask/:id/questions/:qid', PERM, (ctx) => {
    const s = find(ctx, 'askSessions', ctx.params[0], 'Session');
    const q = find(ctx, 'askQuestions', ctx.params[1], 'Question');
    if (q.sessionId !== s.id) throw new ApiError(404, 'not_found', 'Question not found.');
    const status = STATUSES.includes(ctx.body.status as AskQuestionStatus) ? (ctx.body.status as AskQuestionStatus) : q.status;
    const theme = ctx.body.theme !== undefined ? String(ctx.body.theme ?? '').trim().slice(0, 40) || null : q.theme;
    ctx.db.put('askQuestions', { ...q, status, theme });
    return adminView(ctx, s);
  });
  /** Approve every waiting question at once. */
  r.post('/admin/ask/:id/approve-all', PERM, (ctx) => {
    const s = find(ctx, 'askSessions', ctx.params[0], 'Session');
    for (const q of questionsOf(ctx, s)) if (q.status === 'new') ctx.db.put('askQuestions', { ...q, status: 'approved' });
    return adminView(ctx, s);
  });
  r.post('/admin/ask/:id/group', PERM, async (ctx) => {
    const s = find(ctx, 'askSessions', ctx.params[0], 'Session');
    const list = questionsOf(ctx, s).filter((q) => q.status !== 'hidden');
    if (list.length < 3) throw new ApiError(422, 'invalid', 'Wait for a few more questions before grouping them.');
    const themes = await groupQuestions(ctx, list.map((q) => ({ id: q.id, text: q.text })));
    for (const q of list) if (themes[q.id]) ctx.db.put('askQuestions', { ...q, theme: themes[q.id] });
    return adminView(ctx, s);
  });

  r.post('/admin/ask/:id/polls', PERM, (ctx) => {
    const s = find(ctx, 'askSessions', ctx.params[0], 'Session');
    const question = String(ctx.body.question ?? '').trim().slice(0, 200);
    const options = (Array.isArray(ctx.body.options) ? ctx.body.options : []).map((o: unknown) => String(o ?? '').trim().slice(0, 80)).filter(Boolean).slice(0, 6);
    if (!question || options.length < 2) throw new ApiError(422, 'invalid', 'A poll needs a question and at least two answers.', { question: 'Required' });
    for (const p of ctx.db.all('askPolls')) if (p.sessionId === s.id && p.open) ctx.db.put('askPolls', { ...p, open: false });
    const p: AskPoll = { id: ctx.id('apl'), sessionId: s.id, question, options, votes: {}, open: true, createdAt: ctx.now.toISOString() };
    ctx.db.put('askPolls', p);
    ctx.db.put('askSessions', { ...s, pollId: p.id, stage: 'poll' });
    return adminView(ctx, ctx.db.get('askSessions', s.id)!);
  });
  r.put('/admin/ask/:id/polls/:pid', PERM, (ctx) => {
    const s = find(ctx, 'askSessions', ctx.params[0], 'Session');
    const p = find(ctx, 'askPolls', ctx.params[1], 'Poll');
    if (p.sessionId !== s.id) throw new ApiError(404, 'not_found', 'Poll not found.');
    const open = !!ctx.body.open;
    if (open) for (const x of ctx.db.all('askPolls')) if (x.sessionId === s.id && x.open && x.id !== p.id) ctx.db.put('askPolls', { ...x, open: false });
    ctx.db.put('askPolls', { ...p, open });
    // Opening a poll puts it in front of the room; closing it leaves the results up until the office moves on.
    if (open || ctx.body.show) ctx.db.put('askSessions', { ...s, pollId: p.id, stage: 'poll' });
    return adminView(ctx, ctx.db.get('askSessions', s.id)!);
  });
  r.del('/admin/ask/:id/polls/:pid', PERM, (ctx) => {
    const s = find(ctx, 'askSessions', ctx.params[0], 'Session');
    const p = find(ctx, 'askPolls', ctx.params[1], 'Poll');
    ctx.db.del('askPolls', p.id);
    if (s.pollId === p.id) ctx.db.put('askSessions', { ...s, pollId: null, stage: s.stage === 'poll' ? 'questions' : s.stage });
    return adminView(ctx, ctx.db.get('askSessions', s.id)!);
  });

  // ----- stage display -----
  r.get('/admin/ask/:id/stage', { staff: true }, (ctx) => stageView(ctx, find(ctx, 'askSessions', ctx.params[0], 'Session')));
  r.get('/screens/ask/:id', { public: true }, (ctx) => {
    const key = settings(ctx).screenKey;
    if (!key || String(ctx.query.key ?? '') !== key) throw new ApiError(404, 'not_found', 'This screen link is not valid. Copy a fresh link from the Ask page.');
    return stageView(ctx, find(ctx, 'askSessions', ctx.params[0], 'Session'));
  });

  // ----- phones in the room -----
  r.get('/public/ask/:code', { public: true }, (ctx): AskPublic => {
    const s = bySession(ctx, ctx.params[0]);
    const me = ctx.query.device ? String(ctx.query.device) : undefined;
    const st = settings(ctx);
    const poll = pollOf(ctx, s);
    return {
      churchName: st.name, logoUrl: st.logoUrl ?? null, title: s.title, open: s.open, anonymous: s.anonymous,
      poll: poll && (poll.open || s.stage === 'poll') ? pollView(poll, me) : null,
      questions: questionsOf(ctx, s).filter((q) => visible(s, q, me)).map((q) => questionView(q, me)).sort(byVotes).slice(0, 100),
    };
  });
  r.post('/public/ask/:code/questions', { public: true }, (ctx) => {
    const s = bySession(ctx, ctx.params[0]);
    if (!s.open) throw new ApiError(409, 'closed', 'Questions are closed for now.');
    const d = device(ctx.body.device);
    const text = String(ctx.body.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
    if (text.length < 3) throw new ApiError(422, 'invalid', 'Write your question first.', { text: 'Required' });
    const name = String(ctx.body.name ?? '').trim().slice(0, 60) || null;
    if (!name && !s.anonymous) throw new ApiError(422, 'invalid', 'Please add your name.', { name: 'Required' });
    const since = ctx.now.getTime() - 10 * 60_000;
    const recent = questionsOf(ctx, s).filter((q) => q.device === d && Date.parse(q.createdAt) > since);
    if (recent.length >= 5) throw new ApiError(429, 'slow_down', 'You have sent a few questions already. Give the pastor a moment.');
    if (questionsOf(ctx, s).some((q) => q.device === d && q.text.toLowerCase() === text.toLowerCase())) throw new ApiError(409, 'duplicate', 'You have sent that question already.');
    const q: AskQuestion = { id: ctx.id('aq'), sessionId: s.id, text, name, device: d, status: 'new', votes: [], theme: null, createdAt: ctx.now.toISOString() };
    ctx.db.put('askQuestions', q);
    return questionView(q, d);
  });
  r.post('/public/ask/:code/questions/:qid/vote', { public: true }, (ctx) => {
    const s = bySession(ctx, ctx.params[0]);
    const d = device(ctx.body.device);
    const q = ctx.db.get('askQuestions', ctx.params[1]);
    if (!q || q.sessionId !== s.id || !visible(s, q, d)) throw new ApiError(404, 'not_found', 'Question not found.');
    const votes = q.votes.includes(d) ? q.votes.filter((v) => v !== d) : [...q.votes, d];
    ctx.db.put('askQuestions', { ...q, votes });
    return questionView({ ...q, votes }, d);
  });
  r.post('/public/ask/:code/poll', { public: true }, (ctx) => {
    const s = bySession(ctx, ctx.params[0]);
    const d = device(ctx.body.device);
    const p = pollOf(ctx, s);
    if (!p || !p.open) throw new ApiError(409, 'closed', 'This poll has closed.');
    const option = Math.round(Number(ctx.body.option));
    if (!(option >= 0 && option < p.options.length)) throw new ApiError(422, 'invalid', 'Choose one of the answers.');
    const next = { ...p, votes: { ...p.votes, [d]: option } };
    ctx.db.put('askPolls', next);
    return pollView(next, d);
  });
}
