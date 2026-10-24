// Journey map. Each person's walk with the church as a simple timeline, worked out from what the
// records already hold: first visit, coming regularly, a group, baptism, courses, serving,
// being mentored and mentoring others. The office adds what records cannot know, like the day
// someone gave their life to Jesus. Pastors see how many people are at each step, who has been
// stuck at one for months, and what seems to help people take the next step.
import type { Ctx, Router } from '../engine.js';
import { ApiError } from '../errors.js';
import { featureOn } from '../features.js';
import type { Collections, JourneyHelp, JourneyHub, JourneyStage, JourneyStageKey, JourneyStep, JourneyStuck, MyJourney } from '../types.js';
import { find, fullName, localDate, settings } from '../util.js';

const DAY = 86_400_000;
const STUCK_DAYS = 180;
const STAGES: { key: JourneyStageKey; label: string; next: string }[] = [
  { key: 'came', label: 'Came for the first time', next: 'coming regularly' },
  { key: 'regular', label: 'Coming regularly', next: 'joining a group' },
  { key: 'group', label: 'In a group', next: 'baptism' },
  { key: 'baptised', label: 'Baptised', next: 'serving' },
  { key: 'serving', label: 'Serving', next: 'leading or mentoring' },
  { key: 'leading', label: 'Leading or mentoring', next: '' },
];
const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : null);
const earliest = (xs: (string | null | undefined)[]) => xs.filter((x): x is string => !!x).sort()[0] ?? null;

function guard(ctx: Ctx) {
  if (!featureOn(settings(ctx).features, 'journey-map')) throw new ApiError(404, 'not_found', 'The journey map is switched off for this church.');
}

/** Everything the timelines need, read once. */
function index(ctx: Ctx) {
  const services = new Set(ctx.db.all('events').filter((e) => e.kind === 'service').map((e) => e.id));
  const events = new Map(ctx.db.all('events').map((e) => [e.id, e]));
  const visits = new Map<string, string[]>();
  for (const c of ctx.db.all('checkins')) if (!c.isChild && services.has(c.eventId)) visits.set(c.personId, [...(visits.get(c.personId) ?? []), c.at]);
  for (const v of visits.values()) v.sort();
  const by = <T extends { personId: string }>(rows: T[]) => { const m = new Map<string, T[]>(); for (const r of rows) m.set(r.personId, [...(m.get(r.personId) ?? []), r]); return m; };
  return {
    visits,
    events,
    groups: new Map(ctx.db.all('groups').map((g) => [g.id, g])),
    members: by(ctx.db.all('groupMembers')),
    courses: new Map(ctx.db.all('courses').map((c) => [c.id, c])),
    enrolments: by(ctx.db.all('courseEnrollments')),
    serving: by(ctx.db.all('assignments').filter((a) => a.status === 'accepted')),
    mentee: by(ctx.db.all('mentorships').map((m) => ({ ...m, personId: m.menteeId }))),
    mentor: by(ctx.db.all('mentorships').map((m) => ({ ...m, personId: m.mentorId }))),
    leadsGroup: new Map(ctx.db.all('groups').filter((g) => g.leaderId).map((g) => [g.leaderId!, g])),
    tracks: by(ctx.db.all('leaderTracks')),
    marks: by(ctx.db.all('journeyMarks')),
  };
}
type Index = ReturnType<typeof index>;

export function timeline(ctx: Ctx, p: Collections['people'], ix: Index = index(ctx)): JourneyStep[] {
  const out: JourneyStep[] = [];
  const add = (kind: JourneyStep['kind'], label: string, date: string | null, detail: string | null = null, markId: string | null = null) => out.push({ kind, label, date, detail, markId });
  const visits = ix.visits.get(p.id) ?? [];
  add('first_visit', 'First came', day(earliest([p.joinedAt, visits[0]])));
  if (visits.length >= 3) add('regular', 'Started coming regularly', day(visits[2]), `${visits.length} services`);
  for (const m of ix.marks.get(p.id) ?? []) add(m.kind, m.label, m.date, null, m.id);
  if (p.baptismDate) add('baptised', 'Baptised', p.baptismDate);
  for (const g of (ix.members.get(p.id) ?? []).sort((a, b) => a.since.localeCompare(b.since))) add('group', 'Joined a group', day(g.since), ix.groups.get(g.groupId)?.name ?? null);
  for (const e of ix.enrolments.get(p.id) ?? []) if (e.status === 'completed') add('course', 'Finished a course', day(e.completedAt), ix.courses.get(e.courseId)?.name ?? null);
  const served = (ix.serving.get(p.id) ?? []).map((a) => ix.events.get(a.eventId)?.startsAt ?? a.createdAt).sort();
  if (served.length) add('serving', 'Started serving', day(served[0]), `${served.length} time${served.length === 1 ? '' : 's'}`);
  for (const m of ix.mentee.get(p.id) ?? []) add('mentored', 'Started being mentored', m.startedOn, ctx.db.get('people', m.mentorId) ? `by ${fullName(ctx.db.get('people', m.mentorId)!)}` : null);
  for (const m of ix.mentor.get(p.id) ?? []) add('mentoring', 'Started mentoring someone', m.startedOn, ctx.db.get('people', m.menteeId) ? fullName(ctx.db.get('people', m.menteeId)!) : null);
  const g = ix.leadsGroup.get(p.id);
  if (g) add('leading', 'Leads a group', null, g.name);
  for (const t of ix.tracks.get(p.id) ?? []) add('leading', 'Growing as a leader', t.startedOn, t.aim);
  return out.sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'));
}

/** When each stage was first reached, or null. A later stage reached without a date counts as reached. */
function stagesOf(steps: JourneyStep[], status?: Collections['people']['status']): Record<JourneyStageKey, { reached: boolean; on: string | null }> {
  const first = (kinds: JourneyStep['kind'][]) => {
    const hits = steps.filter((s) => kinds.includes(s.kind));
    return { reached: hits.length > 0, on: earliest(hits.map((h) => h.date)) };
  };
  const out = {
    came: first(['first_visit']),
    regular: first(['regular']),
    group: first(['group']),
    baptised: first(['baptised']),
    serving: first(['serving']),
    leading: first(['leading', 'mentoring']),
  };
  // Someone the office calls a regular or a member comes regularly, even without three check-ins on record.
  if (!out.regular.reached && (status === 'regular' || status === 'member')) out.regular.reached = true;
  // Reaching a later step means the earlier ones were passed, even when they were never recorded.
  const keys = STAGES.map((x) => x.key);
  for (let i = keys.length - 2; i >= 0; i--) if (out[keys[i + 1]].reached) out[keys[i]].reached = true;
  return out;
}

const median = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return Math.round(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2); };
const between = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);

export function journeyHub(ctx: Ctx): JourneyHub {
  const ix = index(ctx);
  const today = localDate(ctx, ctx.now);
  const people = ctx.db.all('people').filter((p) => p.status !== 'inactive');
  const rows = people.map((p) => { const steps = timeline(ctx, p, ix); return { p, steps, st: stagesOf(steps, p.status) }; });

  const stages: JourneyStage[] = STAGES.map((s, i) => {
    const prev = i ? STAGES[i - 1].key : null;
    const gaps = prev ? rows.map((r) => (r.st[prev].on && r.st[s.key].on ? between(r.st[prev].on!, r.st[s.key].on!) : null)).filter((x): x is number => x !== null && x >= 0) : [];
    return { key: s.key, label: s.label, count: rows.filter((r) => r.st[s.key].reached).length, medianDays: median(gaps) };
  });

  // Stuck: the furthest step they have reached was more than six months ago, and the next is not taken.
  const stuck: JourneyStuck[] = STAGES.slice(0, -1).map((s, i) => {
    const next = STAGES[i + 1].key;
    const list = rows
      .filter((r) => r.st[s.key].reached && !r.st[next].reached && STAGES.slice(i + 1).every((x) => !r.st[x.key].reached))
      .map((r) => { const since = r.st[s.key].on ?? r.st.came.on; return { id: r.p.id, name: fullName(r.p), since, days: since ? between(since, today) : null }; })
      .filter((x) => x.days === null || x.days >= STUCK_DAYS)
      .sort((a, b) => (b.days ?? 0) - (a.days ?? 0));
    return { stage: s.key, label: s.label, next: s.next, people: list.slice(0, 50) };
  }).filter((s) => s.people.length);

  // What helps: among people at one step, how many took the next one with and without a helper.
  const helps: JourneyHelp[] = [];
  // Helpers and outcomes use only what is recorded, so a later step does not count as proof of an earlier one.
  const own: Record<JourneyStageKey, JourneyStep['kind'][]> = { came: ['first_visit'], regular: ['regular'], group: ['group'], baptised: ['baptised'], serving: ['serving'], leading: ['leading', 'mentoring'] };
  const did = (r: (typeof rows)[number], k: JourneyStageKey) => r.steps.some((s) => own[k].includes(s.kind));
  const has = {
    group: (r: (typeof rows)[number]) => did(r, 'group'),
    course: (r: (typeof rows)[number]) => r.steps.some((s) => s.kind === 'course'),
    mentor: (r: (typeof rows)[number]) => r.steps.some((s) => s.kind === 'mentored'),
  };
  const tries: [JourneyStageKey, JourneyStageKey, keyof typeof has, string][] = [
    ['regular', 'baptised', 'group', 'People in a group'],
    ['regular', 'baptised', 'course', 'People who finished a course'],
    ['regular', 'baptised', 'mentor', 'People with a mentor'],
    ['regular', 'serving', 'group', 'People in a group'],
    ['baptised', 'serving', 'course', 'People who finished a course'],
    ['baptised', 'serving', 'mentor', 'People with a mentor'],
    ['serving', 'leading', 'mentor', 'People with a mentor'],
  ];
  const verb: Record<JourneyStageKey, string> = { came: 'came', regular: 'came regularly', group: 'joined a group', baptised: 'got baptised', serving: 'started serving', leading: 'started leading or mentoring' };
  for (const [from, to, helper, who] of tries) {
    const pool = rows.filter((r) => r.st[from].reached);
    const yes = pool.filter((r) => has[helper](r));
    const no = pool.filter((r) => !has[helper](r));
    if (yes.length < 3 || no.length < 3) continue;
    const rate = (xs: typeof pool) => Math.round((xs.filter((r) => did(r, to)).length / xs.length) * 100);
    const w = rate(yes);
    const wo = rate(no);
    if (w - wo < 10) continue;
    helps.push({ text: `${who} ${verb[to]} more often: ${w}% against ${wo}%.`, withRate: w, withoutRate: wo, withCount: yes.length, withoutCount: no.length });
  }
  helps.sort((a, b) => b.withRate - b.withoutRate - (a.withRate - a.withoutRate));
  return { stages, stuck, helps: helps.slice(0, 5), people: rows.length };
}

/** The next step to suggest to a member, from where they are. */
function nextFor(steps: JourneyStep[]): MyJourney['next'] {
  const st = stagesOf(steps);
  const own = (k: JourneyStep['kind']) => steps.some((s) => s.kind === k);
  st.group.reached = own('group');
  st.baptised.reached = own('baptised');
  st.serving.reached = own('serving');
  if (!st.group.reached) return { label: 'Join a small group', link: '/app/groups' };
  if (!st.baptised.reached) return { label: 'Talk to a pastor about baptism', link: '/app/occasions' };
  if (!steps.some((s) => s.kind === 'course')) return { label: 'Take a course', link: '/app/courses' };
  if (!st.serving.reached) return { label: 'Find a place to serve', link: '/app/serving' };
  return null;
}

export function registerJourney(r: Router) {
  r.get('/admin/journey', { perm: 'people.view' }, (ctx): JourneyHub => { guard(ctx); return journeyHub(ctx); });

  r.get('/admin/people/:id/journey', { perm: 'people.view' }, (ctx): JourneyStep[] => {
    guard(ctx);
    return timeline(ctx, find(ctx, 'people', ctx.params[0], 'Person'));
  });

  r.post('/admin/people/:id/journey', { perm: 'people.edit' }, (ctx): JourneyStep[] => {
    guard(ctx);
    const p = find(ctx, 'people', ctx.params[0], 'Person');
    const kind = ctx.body.kind === 'faith' ? 'faith' : 'custom';
    const label = kind === 'faith' ? clean(ctx.body.label, 80) || 'Gave their life to Jesus' : clean(ctx.body.label, 80);
    if (!label) throw new ApiError(422, 'invalid', 'Say what happened.', { label: 'Required' });
    if (!isDate(ctx.body.date)) throw new ApiError(422, 'invalid', 'Choose the date.', { date: 'Required' });
    if (ctx.body.date > localDate(ctx, ctx.now)) throw new ApiError(422, 'invalid', 'That date is in the future.', { date: 'In the future' });
    ctx.db.put('journeyMarks', { id: ctx.id('jm'), personId: p.id, kind, label, date: ctx.body.date, by: ctx.staff?.name ?? 'Church office', createdAt: ctx.now.toISOString() });
    ctx.audit('created', 'journeyMarks', p.id, `Added a step to ${fullName(p)}'s journey`);
    return timeline(ctx, p);
  });

  r.del('/admin/journey-marks/:id', { perm: 'people.edit' }, (ctx): JourneyStep[] => {
    guard(ctx);
    const m = find(ctx, 'journeyMarks', ctx.params[0], 'Step');
    ctx.db.del('journeyMarks', m.id);
    const p = find(ctx, 'people', m.personId, 'Person');
    return timeline(ctx, p);
  });

  r.get('/me/journey', {}, (ctx): MyJourney => {
    guard(ctx);
    const steps = timeline(ctx, find(ctx, 'people', ctx.me(), 'Person'));
    return { steps, next: nextFor(steps) };
  });
}
