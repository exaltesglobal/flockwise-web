// Tools for the leadership team. Meetings: elders, deacons and committee meetings with an agenda,
// minutes, decisions and action items with owners; open actions carry over to the next meeting of
// the same kind until they are done. The leadership pipeline: who is growing into a leader, the
// steps they have taken, their mentor and how long they have been at each stage. Counselling notes:
// written and read only in the pastor's browser, encrypted with a passphrase the server never sees,
// so not even the church owner or the Flockwise team can read them.
import type { Ctx, Router } from '../engine.js';
import { ApiError } from '../errors.js';
import type {
  CounselNote, LeaderPipeline, LeaderStage, LeaderStep, LeaderTrack, LeaderTrackView, Meeting, MeetingAction, MeetingAgendaItem, MeetingKind, MeetingView,
  MeetingsHub, OpenMeetingAction,
} from '../types.js';
import { DAY, find, fullName, localDate, settings } from '../util.js';
import { notify } from './notify.js';

const KINDS: MeetingKind[] = ['elders', 'deacons', 'committee', 'staff', 'ministry', 'other'];
const KIND_LABEL: Record<MeetingKind, string> = { elders: 'Elders meeting', deacons: 'Deacons meeting', committee: 'Committee meeting', staff: 'Staff meeting', ministry: 'Ministry meeting', other: 'Meeting' };
export const STAGES: LeaderStage[] = ['spotted', 'training', 'apprentice', 'ready', 'leading'];
export const DEFAULT_STEPS = ['Membership class', 'Baptised', 'Serving regularly', 'Leadership course', 'Apprentice with a leader', 'Interview with the pastor', 'Commissioned'];

const clean = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
const dateOr = (v: unknown, fallback: string | null) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : fallback);
const nameOf = (ctx: Ctx, id: string | null) => {
  const p = id ? ctx.db.get('people', id) : null;
  return p ? fullName(p) : null;
};
const peopleIds = (ctx: Ctx, v: unknown) => [...new Set(Array.isArray(v) ? v.map(String) : [])].filter((id) => ctx.db.get('people', id)).slice(0, 60);

// ----- meetings -----

function openActions(ctx: Ctx, meetings: Meeting[]): OpenMeetingAction[] {
  const today = localDate(ctx, ctx.now);
  return meetings.flatMap((m) => m.actions.filter((a) => !a.doneAt).map((a) => ({
    ...a, meetingId: m.id, meetingTitle: m.title, meetingDate: m.date, ownerName: nameOf(ctx, a.ownerId), overdue: !!a.due && a.due < today,
  }))).sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.meetingDate.localeCompare(b.meetingDate));
}

function meetingView(ctx: Ctx, m: Meeting): MeetingView {
  const earlier = ctx.db.all('meetings').filter((x) => x.kind === m.kind && x.id !== m.id && (x.date < m.date || (x.date === m.date && x.createdAt < m.createdAt)));
  const named = (ids: string[]) => ids.map((id) => ({ id, name: nameOf(ctx, id) ?? 'Removed person' }));
  return { ...m, attendees: named(m.attendeeIds), apologies: named(m.apologyIds), openActions: m.actions.filter((a) => !a.doneAt).length, carried: openActions(ctx, earlier) };
}

function agendaOf(ctx: Ctx, v: unknown, before: MeetingAgendaItem[] = []): MeetingAgendaItem[] {
  if (!Array.isArray(v)) return before;
  return v.slice(0, 40).map((x) => {
    const i = (x ?? {}) as Record<string, unknown>;
    const title = clean(i.title, 200);
    return { id: typeof i.id === 'string' && i.id ? i.id.slice(0, 40) : ctx.id('ag'), title, minutes: Math.max(0, Math.min(240, Math.round(Number(i.minutes) || 0))), notes: clean(i.notes, 4000) };
  }).filter((x) => x.title || x.notes);
}

function actionsOf(ctx: Ctx, v: unknown, before: MeetingAction[] = []): MeetingAction[] {
  if (!Array.isArray(v)) return before;
  return v.slice(0, 60).map((x) => {
    const i = (x ?? {}) as Record<string, unknown>;
    const ownerId = typeof i.ownerId === 'string' && ctx.db.get('people', i.ownerId) ? i.ownerId : null;
    const doneAt = i.done === true ? (before.find((b) => b.id === i.id)?.doneAt ?? ctx.now.toISOString()) : i.done === false ? null : typeof i.doneAt === 'string' ? i.doneAt : null;
    return { id: typeof i.id === 'string' && i.id ? i.id.slice(0, 40) : ctx.id('ac'), text: clean(i.text, 300), ownerId, due: dateOr(i.due, null), doneAt };
  }).filter((x) => x.text);
}

function meetingFrom(ctx: Ctx, b: Record<string, unknown>, before?: Meeting): Meeting {
  const kind = KINDS.includes(b.kind as MeetingKind) ? (b.kind as MeetingKind) : (before?.kind ?? 'elders');
  const date = dateOr(b.date, before?.date ?? localDate(ctx, ctx.now))!;
  const attendeeIds = b.attendeeIds !== undefined ? peopleIds(ctx, b.attendeeIds) : (before?.attendeeIds ?? []);
  return {
    id: before?.id ?? ctx.id('mt'),
    title: clean(b.title ?? before?.title, 120) || KIND_LABEL[kind],
    kind,
    date,
    time: b.time !== undefined ? clean(b.time, 10) : (before?.time ?? ''),
    place: b.place !== undefined ? clean(b.place, 120) : (before?.place ?? ''),
    attendeeIds,
    apologyIds: b.apologyIds !== undefined ? peopleIds(ctx, b.apologyIds).filter((id) => attendeeIds.includes(id)) : (before?.apologyIds ?? []).filter((id) => attendeeIds.includes(id)),
    agenda: agendaOf(ctx, b.agenda, before?.agenda),
    minutes: b.minutes !== undefined ? clean(b.minutes, 20000) : (before?.minutes ?? ''),
    decisions: Array.isArray(b.decisions) ? b.decisions.map((d) => clean(d, 500)).filter(Boolean).slice(0, 40) : (before?.decisions ?? []),
    actions: actionsOf(ctx, b.actions, before?.actions),
    status: b.status === 'held' || b.status === 'planned' ? b.status : (before?.status ?? 'planned'),
    agendaSentAt: before?.agendaSentAt ?? null,
    minutesSentAt: before?.minutesSentAt ?? null,
    createdBy: before?.createdBy ?? ctx.staff?.name ?? 'Office',
    createdAt: before?.createdAt ?? ctx.now.toISOString(),
    updatedAt: ctx.now.toISOString(),
  };
}

const sortMeetings = (a: Meeting, b: Meeting) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt);

/** A plain-text agenda or minutes for the message body. */
export function meetingText(ctx: Ctx, m: Meeting, what: 'agenda' | 'minutes'): string {
  const lines: string[] = [`${m.title}, ${m.date}${m.time ? ` at ${m.time}` : ''}${m.place ? `, ${m.place}` : ''}`];
  if (what === 'agenda') {
    m.agenda.forEach((a, i) => lines.push(`${i + 1}. ${a.title}${a.minutes ? ` (${a.minutes} min)` : ''}`));
    const carried = meetingView(ctx, m).carried;
    if (carried.length) lines.push('', 'Open actions from before:', ...carried.map((a) => `- ${a.text}${a.ownerName ? ` (${a.ownerName})` : ''}`));
  } else {
    if (m.decisions.length) lines.push('', 'Decisions:', ...m.decisions.map((d) => `- ${d}`));
    if (m.actions.length) lines.push('', 'Actions:', ...m.actions.map((a) => `- ${a.text}${a.ownerId ? ` (${nameOf(ctx, a.ownerId)})` : ''}${a.due ? `, by ${a.due}` : ''}${a.doneAt ? ' [done]' : ''}`));
    if (m.minutes) lines.push('', m.minutes);
  }
  return lines.join('\n');
}

/** Daily: the owner of an action due tomorrow gets one reminder. */
export async function meetingActionReminders(ctx: Ctx, today: string) {
  const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + DAY).toISOString().slice(0, 10);
  const church = settings(ctx).name;
  for (const m of ctx.db.all('meetings')) {
    for (const a of m.actions) {
      if (a.doneAt || a.due !== tomorrow || !a.ownerId) continue;
      await notify(ctx, 'meeting.action', { personIds: [a.ownerId], title: `${church}: due tomorrow`, body: `From the ${m.title} on ${m.date}: ${a.text}`, link: `/admin/meetings?open=${m.id}` });
    }
  }
}

// ----- the leadership pipeline -----

function trackView(ctx: Ctx, t: LeaderTrack): LeaderTrackView {
  const p = ctx.db.get('people', t.personId);
  const leads = ctx.db.all('groups').filter((g) => g.leaderId === t.personId).map((g) => g.name);
  return {
    ...t, name: p ? fullName(p) : 'Removed person', phone: p?.phone ?? null, mentorName: nameOf(ctx, t.mentorId),
    done: t.steps.filter((s) => s.doneOn).length, leads,
    daysInStage: Math.max(0, Math.floor((Date.parse(`${localDate(ctx, ctx.now)}T00:00:00Z`) - Date.parse(`${t.stageSince}T00:00:00Z`)) / DAY)),
  };
}

function stepsOf(ctx: Ctx, v: unknown, before: LeaderStep[]): LeaderStep[] {
  if (!Array.isArray(v)) return before;
  return v.slice(0, 30).map((x) => {
    const i = (x ?? {}) as Record<string, unknown>;
    return { id: typeof i.id === 'string' && i.id ? i.id.slice(0, 40) : ctx.id('st'), title: clean(i.title, 120), doneOn: dateOr(i.doneOn, null) };
  }).filter((s) => s.title);
}

export function pipeline(ctx: Ctx): LeaderPipeline {
  const tracks = ctx.db.all('leaderTracks').map((t) => trackView(ctx, t)).sort((a, b) => STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage) || a.name.localeCompare(b.name));
  const counts = Object.fromEntries(STAGES.map((s) => [s, tracks.filter((t) => t.stage === s).length])) as Record<LeaderStage, number>;
  const on = new Set(tracks.map((t) => t.personId));
  const suggestions: LeaderPipeline['suggestions'] = [];
  for (const m of ctx.db.all('mentorships').filter((x) => x.status === 'active' && x.focus === 'leadership')) {
    if (on.has(m.menteeId)) continue;
    const name = nameOf(ctx, m.menteeId);
    if (name) { suggestions.push({ personId: m.menteeId, name, reason: `Being mentored for leadership by ${nameOf(ctx, m.mentorId) ?? 'a mentor'}` }); on.add(m.menteeId); }
  }
  for (const z of ctx.db.all('zones').filter((x) => x.active)) {
    for (const id of z.leaderIds.slice(1)) {
      if (on.has(id)) continue;
      const name = nameOf(ctx, id);
      if (name) { suggestions.push({ personId: id, name, reason: `Helps lead ${z.name}` }); on.add(id); }
    }
  }
  return { tracks, counts, suggestions: suggestions.slice(0, 12), defaultSteps: DEFAULT_STEPS };
}

// ----- counselling notes -----

const b64 = (v: unknown, max: number) => (typeof v === 'string' && /^[A-Za-z0-9+/=]+$/.test(v) && v.length <= max ? v : null);
function me(ctx: Ctx) {
  if (!ctx.staff) throw new ApiError(403, 'forbidden', 'Counselling notes are for church staff.');
  return ctx.staff;
}
const myKey = (ctx: Ctx) => ctx.db.all('counselKeys').find((k) => k.staffId === me(ctx).id) ?? null;
const myNotes = (ctx: Ctx) => ctx.db.all('counselNotes').filter((n) => n.staffId === me(ctx).id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
function myNote(ctx: Ctx, id: string): CounselNote {
  const n = ctx.db.get('counselNotes', id);
  if (!n || n.staffId !== me(ctx).id) throw new ApiError(404, 'not_found', 'That note is not here.');
  return n;
}

/** Daily: a follow-up due today reminds the pastor, without saying who it is about. */
export async function counselReminders(ctx: Ctx, today: string) {
  for (const n of ctx.db.all('counselNotes')) {
    if (!n.followUp || n.followUp > today || n.followUpNotified === n.followUp) continue;
    ctx.db.put('counselNotes', { ...n, followUpNotified: n.followUp });
    const staff = ctx.db.get('staff', n.staffId);
    if (!staff?.personId || staff.status !== 'active') continue;
    await notify(ctx, 'counsel.followup', { personIds: [staff.personId], title: 'A counselling follow-up is due', body: 'Open your counselling notes to see who.', link: '/admin/counselling' });
  }
}

export function registerLeaders(r: Router) {
  // Meetings
  r.get('/admin/meetings', { perm: 'care' }, (ctx): MeetingsHub => {
    const all = ctx.db.all('meetings').sort(sortMeetings);
    return { meetings: all.map((m) => meetingView(ctx, m)), actions: openActions(ctx, all) };
  });
  r.post('/admin/meetings', { perm: 'care' }, (ctx) => {
    const b = ctx.body as Record<string, unknown>;
    const m = meetingFrom(ctx, b);
    // A new meeting starts with the people from the last meeting of its kind.
    if (b.attendeeIds === undefined) {
      const last = ctx.db.all('meetings').filter((x) => x.kind === m.kind).sort(sortMeetings)[0];
      if (last) m.attendeeIds = last.attendeeIds.filter((id) => ctx.db.get('people', id));
    }
    ctx.db.put('meetings', m);
    ctx.audit('created', 'meeting', m.id, m.title);
    return meetingView(ctx, m);
  });
  r.get('/admin/meetings/:id', { perm: 'care' }, (ctx) => meetingView(ctx, find(ctx, 'meetings', ctx.params[0], 'Meeting')));
  r.put('/admin/meetings/:id', { perm: 'care' }, (ctx) => {
    const m = meetingFrom(ctx, ctx.body as Record<string, unknown>, find(ctx, 'meetings', ctx.params[0], 'Meeting'));
    ctx.db.put('meetings', m);
    return meetingView(ctx, m);
  });
  r.del('/admin/meetings/:id', { perm: 'care' }, (ctx) => {
    const m = find(ctx, 'meetings', ctx.params[0], 'Meeting');
    ctx.db.del('meetings', m.id);
    ctx.audit('deleted', 'meeting', m.id, m.title);
    return { ok: true };
  });
  // Tick an action from anywhere: the open actions list or a later meeting's carried list.
  r.put('/admin/meetings/:id/actions/:aid', { perm: 'care' }, (ctx) => {
    const m = find(ctx, 'meetings', ctx.params[0], 'Meeting');
    const a = m.actions.find((x) => x.id === ctx.params[1]);
    if (!a) throw new ApiError(404, 'not_found', 'That action is not on this meeting.');
    const done = (ctx.body as { done?: boolean }).done !== false;
    const next = { ...m, actions: m.actions.map((x) => (x.id === a.id ? { ...x, doneAt: done ? (x.doneAt ?? ctx.now.toISOString()) : null } : x)), updatedAt: ctx.now.toISOString() };
    ctx.db.put('meetings', next);
    return meetingView(ctx, next);
  });
  r.post('/admin/meetings/:id/send', { perm: 'care' }, async (ctx) => {
    const m = find(ctx, 'meetings', ctx.params[0], 'Meeting');
    const what = (ctx.body as { what?: string }).what === 'minutes' ? 'minutes' : 'agenda';
    const to = m.attendeeIds.filter((id) => ctx.db.get('people', id));
    if (!to.length) throw new ApiError(422, 'invalid', 'Add the people in this meeting first.');
    if (what === 'minutes' && !m.minutes && !m.decisions.length && !m.actions.length) throw new ApiError(422, 'invalid', 'Write the minutes, decisions or actions first.');
    await notify(ctx, what === 'minutes' ? 'meeting.minutes' : 'meeting.agenda', {
      personIds: to, title: `${what === 'minutes' ? 'Minutes' : 'Agenda'}: ${m.title}, ${m.date}`, body: meetingText(ctx, m, what), link: `/admin/meetings?open=${m.id}`,
    });
    const next = { ...m, [what === 'minutes' ? 'minutesSentAt' : 'agendaSentAt']: ctx.now.toISOString(), ...(what === 'minutes' ? { status: 'held' as const } : {}) };
    ctx.db.put('meetings', next);
    ctx.audit('sent', 'meeting', m.id, `${what} to ${to.length}`);
    return meetingView(ctx, next);
  });

  // Leadership pipeline
  r.get('/admin/leader-pipeline', { perm: ['care', 'people.view'] }, (ctx) => pipeline(ctx));
  r.post('/admin/leader-pipeline', { perm: 'care' }, (ctx) => {
    const b = ctx.body as Record<string, unknown>;
    const person = find(ctx, 'people', String(b.personId ?? ''), 'Person');
    if (ctx.db.all('leaderTracks').some((t) => t.personId === person.id)) throw new ApiError(409, 'exists', `${fullName(person)} is already on the pipeline.`);
    const today = localDate(ctx, ctx.now);
    const stage = STAGES.includes(b.stage as LeaderStage) ? (b.stage as LeaderStage) : 'spotted';
    const t: LeaderTrack = {
      id: ctx.id('lt'), personId: person.id, aim: clean(b.aim, 80) || 'Group leader', stage,
      mentorId: typeof b.mentorId === 'string' && b.mentorId !== person.id && ctx.db.get('people', b.mentorId) ? b.mentorId : null,
      steps: Array.isArray(b.steps) ? stepsOf(ctx, b.steps, []) : DEFAULT_STEPS.map((title) => ({ id: ctx.id('st'), title, doneOn: null })),
      notes: clean(b.notes, 4000), startedOn: today, stageSince: today, createdAt: ctx.now.toISOString(), updatedAt: ctx.now.toISOString(),
    };
    ctx.db.put('leaderTracks', t);
    ctx.audit('created', 'leader-pipeline', t.id, `${fullName(person)}: ${t.aim}`);
    return trackView(ctx, t);
  });
  r.put('/admin/leader-pipeline/:id', { perm: 'care' }, (ctx) => {
    const t = find(ctx, 'leaderTracks', ctx.params[0], 'Pipeline entry');
    const b = ctx.body as Record<string, unknown>;
    const stage = STAGES.includes(b.stage as LeaderStage) ? (b.stage as LeaderStage) : t.stage;
    const next: LeaderTrack = {
      ...t,
      aim: b.aim !== undefined ? clean(b.aim, 80) || t.aim : t.aim,
      stage,
      stageSince: stage !== t.stage ? localDate(ctx, ctx.now) : t.stageSince,
      mentorId: b.mentorId === null ? null : typeof b.mentorId === 'string' && b.mentorId !== t.personId && ctx.db.get('people', b.mentorId) ? b.mentorId : t.mentorId,
      steps: stepsOf(ctx, b.steps, t.steps),
      notes: b.notes !== undefined ? clean(b.notes, 4000) : t.notes,
      updatedAt: ctx.now.toISOString(),
    };
    ctx.db.put('leaderTracks', next);
    if (stage !== t.stage) ctx.audit('updated', 'leader-pipeline', t.id, `Now ${stage}`);
    return trackView(ctx, next);
  });
  r.del('/admin/leader-pipeline/:id', { perm: 'care' }, (ctx) => {
    const t = find(ctx, 'leaderTracks', ctx.params[0], 'Pipeline entry');
    ctx.db.del('leaderTracks', t.id);
    return { ok: true };
  });

  // Counselling notes: each pastor sees only their own, and only ciphertext reaches the server.
  r.get('/admin/counsel/key', { perm: 'care' }, (ctx) => myKey(ctx));
  r.put('/admin/counsel/key', { perm: 'care' }, (ctx) => {
    const b = ctx.body as Record<string, unknown>;
    const salt = b64(b.salt, 200), iv = b64(b.iv, 100), check = b64(b.check, 400);
    if (!salt || !iv || !check) throw new ApiError(422, 'invalid', 'The passphrase could not be set up.');
    const old = myKey(ctx);
    if (old && b.reset !== true) throw new ApiError(409, 'exists', 'You already have a passphrase.');
    // A new passphrase cannot read old notes, so starting again removes them.
    if (old) for (const n of myNotes(ctx)) ctx.db.del('counselNotes', n.id);
    const key = ctx.db.put('counselKeys', { id: old?.id ?? ctx.id('ck'), staffId: me(ctx).id, salt, iv, check, createdAt: ctx.now.toISOString() });
    if (old) ctx.audit('reset', 'counselling', key.id, 'Passphrase reset; old notes removed');
    return key;
  });
  r.get('/admin/counsel/notes', { perm: 'care' }, (ctx) => myNotes(ctx));
  r.post('/admin/counsel/notes', { perm: 'care' }, (ctx) => {
    if (!myKey(ctx)) throw new ApiError(409, 'no_key', 'Set your passphrase first.');
    const b = ctx.body as Record<string, unknown>;
    const iv = b64(b.iv, 100), data = b64(b.data, 200_000);
    if (!iv || !data) throw new ApiError(422, 'invalid', 'The note was not encrypted.');
    return ctx.db.put('counselNotes', { id: ctx.id('cn'), staffId: me(ctx).id, iv, data, followUp: dateOr(b.followUp, null), followUpNotified: null, createdAt: ctx.now.toISOString(), updatedAt: ctx.now.toISOString() });
  });
  r.put('/admin/counsel/notes/:id', { perm: 'care' }, (ctx) => {
    const n = myNote(ctx, ctx.params[0]);
    const b = ctx.body as Record<string, unknown>;
    const iv = b64(b.iv, 100), data = b64(b.data, 200_000);
    if (!iv || !data) throw new ApiError(422, 'invalid', 'The note was not encrypted.');
    const followUp = b.followUp === undefined ? n.followUp : dateOr(b.followUp, null);
    return ctx.db.put('counselNotes', { ...n, iv, data, followUp, followUpNotified: followUp === n.followUp ? n.followUpNotified : null, updatedAt: ctx.now.toISOString() });
  });
  r.del('/admin/counsel/notes/:id', { perm: 'care' }, (ctx) => {
    ctx.db.del('counselNotes', myNote(ctx, ctx.params[0]).id);
    return { ok: true };
  });
}
