// Talent bank and community outreach. Members say which of their skills they would give free to
// people in the neighbourhood: doctors and nurses, lawyers, teachers, people who can refer someone
// for a job. The church plans a free clinic, tuition evening, job fair or legal help day, sees who in
// the church has the skills it needs, asks them in one go, and shares a public link where people
// from the area register (with a reminder the day before). Afterwards the office records how many
// were helped.
import type { Ctx, Router } from '../engine.js';
import { ApiError } from '../errors.js';
import { featureOn } from '../features.js';
import type { Permission, Outreach, OutreachAnswer, OutreachDetail, OutreachHelper, OutreachKind, OutreachSignup, OutreachView, MyOutreachInvite, PublicOutreach, TalentArea, TalentBank } from '../types.js';
import { find, fullName, localDate, normPhone, settings } from '../util.js';
import { channelStatus, deliverAll } from './integrations.js';
import { notify } from './notify.js';

const DAY = 86_400_000;
const TOKEN_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';
const KINDS: { kind: OutreachKind; label: string; title: string; skills: string[] }[] = [
  { kind: 'clinic', label: 'Free health clinic', title: 'Free health check-up', skills: ['Doctor', 'Nurse', 'Pharmacist', 'Dentist', 'First aid', 'Counsellor'] },
  { kind: 'tuition', label: 'Tuition evening', title: 'Free tuition for children', skills: ['Teacher', 'Maths tutor', 'English tutor', 'Computer and IT'] },
  { kind: 'jobs', label: 'Job fair', title: 'Job help day', skills: ['Job referrals', 'CV writing', 'Interview practice', 'Computer and IT', 'Accountant'] },
  { kind: 'legal', label: 'Legal and paperwork help', title: 'Free legal and paperwork help', skills: ['Lawyer', 'Chartered accountant', 'Accountant'] },
  { kind: 'other', label: 'Something else', title: '', skills: [] },
];
const AREAS: Omit<TalentArea, 'people'>[] = [
  { key: 'medical', label: 'Medical', skills: ['Doctor', 'Nurse', 'Pharmacist', 'Dentist', 'First aid', 'Counsellor'] },
  { key: 'legal', label: 'Legal and money', skills: ['Lawyer', 'Chartered accountant', 'Accountant'] },
  { key: 'teaching', label: 'Teaching and tuition', skills: ['Teacher', 'Maths tutor', 'English tutor', 'Computer and IT'] },
  { key: 'jobs', label: 'Jobs and careers', skills: ['Job referrals', 'CV writing', 'Interview practice'] },
  { key: 'trades', label: 'Trades and repairs', skills: ['Electrician', 'Plumber', 'Carpenter', 'Painter', 'Mason', 'Tailor'] },
];
const KIND_KEYS = KINDS.map((k) => k.kind);
const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const isTime = (v: unknown): v is string => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const lower = (list: string[]) => new Set(list.map((s) => s.toLowerCase()));

const on = (ctx: Ctx) => featureOn(settings(ctx).features, 'outreach');
function guard(ctx: Ctx) {
  if (!on(ctx)) throw new ApiError(404, 'not_found', 'Community outreach is switched off for this church.');
}

/** "Sat 2 Nov, 10:00 to 13:00" for messages and the share text. */
function when(o: Pick<Outreach, 'date' | 'startTime' | 'endTime'>) {
  const d = new Date(`${o.date}T12:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  return `${d}${o.startTime ? `, ${o.startTime}${o.endTime ? ` to ${o.endTime}` : ''}` : ''}`;
}

const signupsOf = (ctx: Ctx, id: string) => ctx.db.all('outreachSignups').filter((s) => s.outreachId === id).sort((a, b) => a.at.localeCompare(b.at));
const linkOf = (ctx: Ctx, o: Outreach) => `${ctx.env.webUrl}/outreach/${o.token}`;

function view(ctx: Ctx, o: Outreach): OutreachView {
  const answers = Object.values(o.invited);
  return { ...o, signups: signupsOf(ctx, o.id).length, yes: answers.filter((a) => a === 'yes').length, asked: answers.length, link: linkOf(ctx, o) };
}

/** Members whose skills match what the day needs, plus anyone already asked. Neighbourhood givers first. */
function helpers(ctx: Ctx, o: Outreach): OutreachHelper[] {
  const need = lower(o.skills);
  const out: OutreachHelper[] = [];
  for (const sp of ctx.db.all('skillProfiles')) {
    const p = ctx.db.get('people', sp.id);
    if (!p || p.status === 'inactive') continue;
    const match = sp.skills.filter((s) => need.has(s.toLowerCase()));
    const answer = o.invited[sp.id] ?? null;
    if (!answer && (!match.length || !(sp.community || sp.serve))) continue;
    out.push({ personId: p.id, name: fullName(p), phone: p.phone ?? null, skills: match.length ? match : sp.skills.slice(0, 3), community: !!sp.community, answer });
  }
  for (const id of Object.keys(o.invited)) {
    if (out.some((h) => h.personId === id)) continue;
    const p = ctx.db.get('people', id);
    if (p) out.push({ personId: id, name: fullName(p), phone: p.phone ?? null, skills: [], community: false, answer: o.invited[id] });
  }
  return out.sort((a, b) => Number(!!b.answer) - Number(!!a.answer) || Number(b.community) - Number(a.community) || a.name.localeCompare(b.name));
}

function shareText(ctx: Ctx, o: Outreach) {
  const s = settings(ctx);
  return [`${o.title}, free for everyone`, `${when(o)}${o.place ? ` at ${o.place}` : ''}`, o.about, `Register here: ${linkOf(ctx, o)}`, s.name].filter(Boolean).join('\n');
}

function detail(ctx: Ctx, o: Outreach): OutreachDetail {
  return { ...view(ctx, o), helpers: helpers(ctx, o), list: signupsOf(ctx, o.id), shareText: shareText(ctx, o) };
}

function bank(ctx: Ctx): TalentBank {
  const profiles = ctx.db.all('skillProfiles').filter((sp) => sp.community && sp.skills.length && ctx.db.get('people', sp.id)?.status !== 'inactive');
  const all = ctx.db.all('outreaches').sort((a, b) => b.date.localeCompare(a.date));
  return {
    outreaches: all.map((o) => view(ctx, o)),
    areas: AREAS.map((a) => {
      const set = lower(a.skills);
      return { ...a, people: profiles.filter((sp) => sp.skills.some((s) => set.has(s.toLowerCase()))).length };
    }),
    givers: profiles.length,
    helped: all.reduce((n, o) => n + (o.served ?? 0), 0),
    kinds: KINDS,
  };
}

function input(ctx: Ctx, b: Record<string, unknown>, prev?: Outreach): Outreach {
  const kind = KIND_KEYS.includes(b.kind as OutreachKind) ? (b.kind as OutreachKind) : (prev?.kind ?? 'other');
  const preset = KINDS.find((k) => k.kind === kind)!;
  const o: Outreach = {
    id: prev?.id ?? ctx.id('or'),
    kind,
    title: clean(b.title ?? prev?.title, 100) || preset.title,
    date: (b.date ?? prev?.date) as string,
    startTime: clean(b.startTime ?? prev?.startTime, 5),
    endTime: clean(b.endTime ?? prev?.endTime, 5),
    place: clean(b.place ?? prev?.place, 120),
    about: clean(b.about ?? prev?.about, 800),
    skills: Array.isArray(b.skills) ? [...new Set(b.skills.map((s) => clean(s, 40)).filter(Boolean))].slice(0, 12) : (prev?.skills ?? preset.skills),
    capacity: b.capacity === undefined ? (prev?.capacity ?? null) : b.capacity === null || b.capacity === '' ? null : Math.max(1, Math.min(5000, Math.round(Number(b.capacity) || 0))) || null,
    token: prev?.token ?? ctx.env.random(10, TOKEN_ALPHABET),
    invited: prev?.invited ?? {},
    status: prev?.status ?? 'planned',
    served: prev?.served ?? null,
    report: prev?.report ?? '',
    by: prev?.by ?? ctx.staff?.name ?? 'Church office',
    createdAt: prev?.createdAt ?? ctx.now.toISOString(),
  };
  const fields: Record<string, string> = {};
  if (!o.title) fields.title = 'Required';
  if (!isDate(o.date)) fields.date = 'Choose the date';
  if (o.startTime && !isTime(o.startTime)) fields.startTime = 'Use a time like 10:00';
  if (o.endTime && !isTime(o.endTime)) fields.endTime = 'Use a time like 13:00';
  if (o.startTime && o.endTime && o.endTime <= o.startTime) fields.endTime = 'Ends before it starts';
  if (Object.keys(fields).length) throw new ApiError(422, 'invalid', 'Please check the highlighted fields.', fields);
  return o;
}

function publicOf(ctx: Ctx) {
  guard(ctx);
  const o = ctx.db.all('outreaches').find((x) => x.token === ctx.params[0]);
  if (!o || o.status === 'cancelled') throw new ApiError(404, 'not_found', 'This link is not open any more.');
  return o;
}
const isOpen = (ctx: Ctx, o: Outreach) => o.status === 'planned' && o.date >= localDate(ctx, ctx.now);
const isFull = (ctx: Ctx, o: Outreach) => o.capacity !== null && signupsOf(ctx, o.id).length >= o.capacity;

function invites(ctx: Ctx): MyOutreachInvite[] {
  const me = ctx.me();
  const today = localDate(ctx, ctx.now);
  return ctx.db.all('outreaches')
    .filter((o) => o.status === 'planned' && o.date >= today && o.invited[me])
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((o) => ({ id: o.id, title: o.title, kind: o.kind, date: o.date, startTime: o.startTime, endTime: o.endTime, place: o.place, about: o.about, answer: o.invited[me] }));
}

/** The day before: helpers who said yes get a reminder, and people who registered get one by WhatsApp or SMS. */
export async function outreachDue(ctx: Ctx, today: string) {
  if (!on(ctx)) return;
  const tomorrow = new Date(Date.parse(`${today}T12:00:00Z`) + DAY).toISOString().slice(0, 10);
  for (const o of ctx.db.all('outreaches').filter((x) => x.status === 'planned' && x.date === tomorrow)) {
    const key = `outreach:${o.id}:${tomorrow}`;
    if (ctx.db.get('meta', key)) continue;
    ctx.db.put('meta', { id: key, value: today });
    const yes = Object.entries(o.invited).filter(([, a]) => a === 'yes').map(([id]) => id);
    if (yes.length) await notify(ctx, 'outreach.reminder', { personIds: yes, title: `Tomorrow: ${o.title}`, body: `Thank you for helping. ${when(o)}${o.place ? ` at ${o.place}` : ''}. ${signupsOf(ctx, o.id).length} people have registered so far.`, link: '/app/skills' });
    const st = channelStatus(ctx);
    const channel = st.whatsapp.configured || !st.sms.configured ? 'whatsapp' : 'sms';
    const batch = signupsOf(ctx, o.id).filter((s) => s.remind && s.phone).map((s) => ({ to: s.phone, name: s.name, subject: o.title, text: `Hello ${s.name.split(' ')[0]}, a reminder: ${o.title} is tomorrow, ${when(o)}${o.place ? ` at ${o.place}` : ''}. It is free. ${settings(ctx).name}` }));
    if (batch.length) await deliverAll(ctx, channel, batch);
  }
}

export function registerOutreach(r: Router) {
  const VIEW = { perm: ['people.view', 'volunteers'] as Permission[] };
  const EDIT = { perm: ['people.edit', 'volunteers'] as Permission[] };

  r.get('/admin/outreach', { ...VIEW }, (ctx): TalentBank => { guard(ctx); return bank(ctx); });

  r.post('/admin/outreach', { ...EDIT }, (ctx): OutreachDetail => {
    guard(ctx);
    const o = input(ctx, ctx.body);
    ctx.db.put('outreaches', o);
    ctx.audit('created', 'outreaches', o.id, `Planned "${o.title}" on ${o.date}`);
    return detail(ctx, o);
  });

  r.get('/admin/outreach/:id', { ...VIEW }, (ctx): OutreachDetail => { guard(ctx); return detail(ctx, find(ctx, 'outreaches', ctx.params[0], 'Outreach')); });

  r.patch('/admin/outreach/:id', { ...EDIT }, (ctx): OutreachDetail => {
    guard(ctx);
    const prev = find(ctx, 'outreaches', ctx.params[0], 'Outreach');
    const o = input(ctx, ctx.body, prev);
    if (ctx.body.status === 'cancelled' || ctx.body.status === 'planned') o.status = ctx.body.status;
    ctx.db.put('outreaches', o);
    ctx.audit('updated', 'outreaches', o.id, `Updated "${o.title}"`);
    return detail(ctx, o);
  });

  r.del('/admin/outreach/:id', { ...EDIT }, (ctx) => {
    guard(ctx);
    const o = find(ctx, 'outreaches', ctx.params[0], 'Outreach');
    for (const s of signupsOf(ctx, o.id)) ctx.db.del('outreachSignups', s.id);
    ctx.db.del('outreaches', o.id);
    ctx.audit('deleted', 'outreaches', o.id, `Removed "${o.title}"`);
    return bank(ctx);
  });

  // Ask members to help. Each gets a push or WhatsApp message and answers in the app.
  r.post('/admin/outreach/:id/invite', { ...EDIT }, async (ctx): Promise<OutreachDetail> => {
    guard(ctx);
    const o = find(ctx, 'outreaches', ctx.params[0], 'Outreach');
    const ids = ((Array.isArray(ctx.body.personIds) ? ctx.body.personIds : []) as unknown[]).filter((id): id is string => typeof id === 'string' && !!ctx.db.get('people', id) && !o.invited[id]);
    if (!ids.length) throw new ApiError(422, 'invalid', 'Choose who to ask.', { personIds: 'Required' });
    const next = { ...o, invited: { ...o.invited, ...Object.fromEntries(ids.map((id) => [id, 'asked' as OutreachAnswer])) } };
    ctx.db.put('outreaches', next);
    await notify(ctx, 'outreach.invite', { personIds: ids, title: `Can you help at "${o.title}"?`, body: `${when(o)}${o.place ? ` at ${o.place}` : ''}. The church is offering this free to people in our area, and your skills would help. Say yes or no in the app.`, link: '/app/skills' });
    ctx.audit('updated', 'outreaches', o.id, `Asked ${ids.length} ${ids.length === 1 ? 'person' : 'people'} to help at "${o.title}"`);
    return detail(ctx, next);
  });

  r.patch('/admin/outreach/:id/signups/:sid', { ...EDIT }, (ctx): OutreachDetail => {
    guard(ctx);
    const o = find(ctx, 'outreaches', ctx.params[0], 'Outreach');
    const s = find(ctx, 'outreachSignups', ctx.params[1], 'Registration');
    if (s.outreachId !== o.id) throw new ApiError(404, 'not_found', 'Registration not found.');
    ctx.db.put('outreachSignups', { ...s, came: !!ctx.body.came });
    return detail(ctx, o);
  });

  r.del('/admin/outreach/:id/signups/:sid', { ...EDIT }, (ctx): OutreachDetail => {
    guard(ctx);
    const o = find(ctx, 'outreaches', ctx.params[0], 'Outreach');
    const s = find(ctx, 'outreachSignups', ctx.params[1], 'Registration');
    if (s.outreachId === o.id) ctx.db.del('outreachSignups', s.id);
    return detail(ctx, o);
  });

  r.post('/admin/outreach/:id/done', { ...EDIT }, (ctx): OutreachDetail => {
    guard(ctx);
    const o = find(ctx, 'outreaches', ctx.params[0], 'Outreach');
    const came = signupsOf(ctx, o.id).filter((s) => s.came).length;
    const served = ctx.body.served === undefined || ctx.body.served === '' ? came : Math.max(0, Math.min(100_000, Math.round(Number(ctx.body.served) || 0)));
    const next: Outreach = { ...o, status: 'done', served, report: clean(ctx.body.report, 1000) };
    ctx.db.put('outreaches', next);
    ctx.audit('updated', 'outreaches', o.id, `"${o.title}" done: ${served} helped`);
    return detail(ctx, next);
  });

  // ----- members -----
  r.get('/me/outreach', {}, (ctx): MyOutreachInvite[] => (on(ctx) ? invites(ctx) : []));
  r.post('/me/outreach/:id', {}, (ctx): MyOutreachInvite[] => {
    guard(ctx);
    const o = find(ctx, 'outreaches', ctx.params[0], 'Outreach');
    const me = ctx.me();
    if (!o.invited[me]) throw new ApiError(404, 'not_found', 'You were not asked to help at this one.');
    const answer: OutreachAnswer = ctx.body.answer === 'yes' ? 'yes' : 'no';
    ctx.db.put('outreaches', { ...o, invited: { ...o.invited, [me]: answer } });
    return invites(ctx);
  });

  // ----- the neighbourhood -----
  r.get('/public/outreach/:token', { public: true }, (ctx): PublicOutreach => {
    const o = publicOf(ctx);
    return { title: o.title, kind: o.kind, date: o.date, startTime: o.startTime, endTime: o.endTime, place: o.place, about: o.about, church: settings(ctx).name, open: isOpen(ctx, o), full: isFull(ctx, o) };
  });

  r.post('/public/outreach/:token', { public: true }, (ctx) => {
    const o = publicOf(ctx);
    const b = ctx.body as Record<string, unknown>;
    // Bots fill in every field; people never see this one.
    if (clean(b.website, 200)) return { ok: true };
    if (!isOpen(ctx, o)) throw new ApiError(409, 'closed', 'Registration for this day has closed.');
    const name = clean(b.name, 80);
    const phone = clean(b.phone, 20);
    const fields: Record<string, string> = {};
    if (!name) fields.name = 'Required';
    if (normPhone(phone).length < 10) fields.phone = 'A 10-digit mobile number';
    if (Object.keys(fields).length) throw new ApiError(422, 'validation', 'Please check the highlighted fields.', fields);
    const same = signupsOf(ctx, o.id).find((s) => normPhone(s.phone) === normPhone(phone) && s.name.toLowerCase() === name.toLowerCase());
    if (same) return { ok: true, again: true };
    if (isFull(ctx, o)) throw new ApiError(409, 'full', 'Sorry, this day is full.');
    const s: OutreachSignup = { id: ctx.id('os'), outreachId: o.id, name, phone, need: clean(b.need, 200), area: clean(b.area, 80), remind: b.remind !== false, came: false, at: ctx.now.toISOString() };
    ctx.db.put('outreachSignups', s);
    return { ok: true };
  });
}
