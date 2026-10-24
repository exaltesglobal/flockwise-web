// "My day": one page each morning for a pastor or leader, about them rather than the whole church.
// Their calls from the morning list, today's services and where they serve, their visits, meetings
// and action items, care cases assigned to them, counselling follow-ups (a count only), the sermon
// they are preparing next, and the queues that wait on the office (registrations, help requests…).
import type { Ctx, Router } from '../engine.js';
import { featureOn } from '../features.js';
import type { MyDay } from '../types.js';
import { localDate, settings } from '../util.js';
import { morningList } from './morning-list.js';

export function myDay(ctx: Ctx): MyDay {
  const staff = ctx.staff!;
  const me = staff.personId;
  const today = localDate(ctx, ctx.now);
  const on = (key: string) => featureOn(settings(ctx).features, key);
  const nowIso = ctx.now.toISOString();

  const calls = ctx.can('care') && on('morninglist')
    ? morningList(ctx, ctx.can('giving.view'), me).today.filter((r) => !r.doneToday).slice(0, 5).map((r) => ({ personId: r.personId, name: r.name, phone: r.phone, reason: r.reasons[0]?.text ?? '' }))
    : null;

  const todays = ctx.db.all('events').filter((e) => localDate(ctx, new Date(e.startsAt)) === today).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const serving = me ? ctx.db.all('assignments').filter((a) => a.personId === me && a.status !== 'declined').flatMap((a) => {
    const ev = todays.find((e) => e.id === a.eventId);
    const team = ev ? ctx.db.get('teams', a.teamId) : null;
    return ev && team ? [{ eventTitle: ev.title, startsAt: ev.startsAt, team: team.name, position: team.positions.find((p) => p.id === a.positionId)?.name ?? '' }] : [];
  }) : [];

  const visits = ctx.db.all('visits').filter((v) => v.status === 'planned' && v.plannedFor === today && v.visitorIds.includes(staff.id)).map((v) => {
    const people = v.personIds.map((id) => ctx.db.get('people', id)).filter((p) => !!p);
    return { visitId: v.id, familyName: v.familyName, purpose: v.purpose, address: people.find((p) => p!.address?.trim())?.address ?? null, phone: people.find((p) => p!.phone)?.phone ?? null, zoneName: v.zoneId ? (ctx.db.get('zones', v.zoneId)?.name ?? null) : null };
  });

  const meetings = ctx.can('care') ? ctx.db.all('meetings').filter((m) => m.date === today && (!me || !m.attendeeIds.length || m.attendeeIds.includes(me))).map((m) => ({ id: m.id, title: m.title, time: m.time, place: m.place })).sort((a, b) => a.time.localeCompare(b.time)) : [];
  const actions = me ? ctx.db.all('meetings').flatMap((m) => m.actions.filter((a) => a.ownerId === me && !a.doneAt).map((a) => ({ meetingId: m.id, actionId: a.id, text: a.text, due: a.due, overdue: !!a.due && a.due < today, meetingTitle: m.title })))
    .sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999')).slice(0, 10) : [];

  const careCases = ctx.db.all('care').filter((c) => c.status !== 'closed' && c.assignedTo === staff.id)
    .map((c) => ({ id: c.id, title: c.title, personName: c.personName, dueAt: c.dueAt, overdue: !!c.dueAt && c.dueAt < nowIso, urgent: c.priority === 'urgent' }))
    .sort((a, b) => Number(b.urgent) - Number(a.urgent) || (a.dueAt ?? '9999').localeCompare(b.dueAt ?? '9999')).slice(0, 8);

  const counselFollowUps = ctx.db.all('counselNotes').filter((n) => n.staffId === staff.id && n.followUp && n.followUp <= today).length;

  // The next sermon they are preparing: by the preacher's name, else one they started.
  const first = staff.name.replace(/^(pastor|rev\.?|fr\.?|bro\.?|sis\.?)\s+/i, '').trim().toLowerCase();
  const preps = ctx.db.all('sermonPreps').filter((p) => p.date >= today && p.status !== 'preached' && (p.preacher.toLowerCase().includes(first) || p.createdBy === staff.name)).sort((a, b) => a.date.localeCompare(b.date));
  const next = preps[0];
  const sermon = next ? { id: next.id, title: next.title, date: next.date, status: next.status, points: next.points.length, comments: (next.comments ?? []).filter((c) => !c.resolved && c.staffId !== staff.id).length } : null;

  const waiting: MyDay['waiting'] = [];
  const add = (key: string, label: string, count: number, link: string) => { if (count) waiting.push({ key, label, count, link }); };
  if (ctx.can('people.view') && on('registration')) add('registrations', 'Registrations to approve', ctx.db.all('registrations').filter((r) => r.status === 'pending').length, '/admin/registrations');
  if (ctx.can('groups')) add('join', 'Requests to join a group', ctx.db.count('joinRequests'), '/admin/groups');
  if (ctx.can('care') && on('benevolence')) add('aid', 'Requests for help', ctx.db.all('aidRequests').filter((a) => a.status === 'requested' || a.status === 'reviewing').length, '/admin/benevolence');
  if (ctx.can('care') && on('occasions')) add('occasions', 'Wedding and funeral requests', ctx.db.all('occasions').filter((o) => o.status === 'requested').length, '/admin/occasions');
  if (ctx.can('care')) add('prayer', 'Prayer requests open', ctx.db.all('prayer').filter((p) => p.status === 'open').length, '/admin/care');
  if (ctx.can('care')) add('unassigned', 'Care cases with nobody assigned', ctx.db.all('care').filter((c) => c.status !== 'closed' && !c.assignedTo).length, '/admin/care');

  return {
    date: today, name: staff.name, calls,
    events: todays.filter((e) => e.published !== false).map((e) => ({ id: e.id, title: e.title, startsAt: e.startsAt, location: e.location ?? null })),
    serving, visits, meetings, actions, careCases, counselFollowUps, sermon, waiting,
  };
}

export function registerMyDay(r: Router) {
  r.get('/admin/my-day', { staff: true }, (ctx) => myDay(ctx));
}
