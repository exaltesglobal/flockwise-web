// Building project tracker: a new church building (or a hall, a roof, a parsonage), open to the
// members so they can trust where the money goes. The office sets the budget and stages, posts
// progress with photos, and lists each contractor bill as it comes in and is paid. Money raised is
// counted from the project's fund (gifts and pledges); spent is the paid bills. Members see the
// same figures in the app, their own pledge, and a gentle reminder on the 1st when it is behind.
import type { Ctx, Router } from '../engine.js';
import { ApiError } from '../errors.js';
import { featureOn } from '../features.js';
import type { BuildingBill, BuildingHub, BuildingMoney, BuildingPhoto, BuildingProject, BuildingProjectView, BuildingStage, BuildingUpdate, MemberBuildingProject } from '../types.js';
import { dateOnly, find, fullName, giftDate, localDate, settings } from '../util.js';
import { notify } from './notify.js';

const READ = ['giving.view', 'settings'] as ('giving.view' | 'settings')[];
const WRITE = ['giving.edit', 'settings'] as ('giving.edit' | 'settings')[];
const STATUS: BuildingProject['status'][] = ['planning', 'building', 'paused', 'done'];
const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const paise = (v: unknown) => Math.max(0, Math.round(Number(v) || 0));
const ymd = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const link = (v: unknown) => {
  const s = clean(v, 1000);
  return s && (/^https:\/\//i.test(s) || s.startsWith('/')) ? s : null;
};

function guard(ctx: Ctx) {
  if (!featureOn(settings(ctx).features, 'building-project')) throw new ApiError(404, 'not_found', 'The building project is switched off for this church.');
}

function photos(v: unknown): BuildingPhoto[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 12).map((p) => ({ url: link((p as BuildingPhoto)?.url) ?? '', caption: clean((p as BuildingPhoto)?.caption, 140) })).filter((p) => p.url);
}

function stages(ctx: Ctx, v: unknown, prev: BuildingStage[]): BuildingStage[] {
  if (!Array.isArray(v)) return prev;
  return v.slice(0, 20).map((x) => {
    const old = prev.find((p) => p.id === x?.id);
    const status: BuildingStage['status'] = x?.status === 'doing' || x?.status === 'done' ? x.status : 'todo';
    return { id: old?.id ?? ctx.id('bs'), name: clean(x?.name, 80) || 'Stage', budget: paise(x?.budget), status, doneAt: status === 'done' ? (old?.doneAt ?? localDate(ctx, ctx.now)) : null };
  });
}

function money(ctx: Ctx, p: BuildingProject): BuildingMoney {
  const gifts = ctx.db.all('donations').filter((d) => d.fundId === p.fundId && d.status === 'succeeded');
  const raised = gifts.reduce((t, d) => t + d.amount, 0);
  const today = localDate(ctx, ctx.now);
  const pledges = ctx.db.all('pledges').filter((x) => x.fundId === p.fundId);
  let pledgeGiven = 0;
  let behind = 0;
  for (const pl of pledges) {
    const given = gifts.filter((d) => d.donorId === pl.personId && dateOnly(giftDate(d)) >= pl.startDate && dateOnly(giftDate(d)) <= pl.endDate).reduce((t, d) => t + d.amount, 0);
    pledgeGiven += Math.min(given, pl.amount);
    if (expectedBy(pl, today) - given > Math.max(100_00, pl.amount * 0.05)) behind++;
  }
  const bills = ctx.db.all('buildingBills').filter((b) => b.projectId === p.id);
  const spent = bills.filter((b) => b.status === 'paid').reduce((t, b) => t + b.amount, 0);
  const due = bills.filter((b) => b.status === 'due').reduce((t, b) => t + b.amount, 0);
  const months = new Map<string, { month: string; raised: number; spent: number }>();
  const add = (m: string, k: 'raised' | 'spent', n: number) => { const row = months.get(m) ?? { month: m, raised: 0, spent: 0 }; row[k] += n; months.set(m, row); };
  for (const d of gifts) add(giftDate(d).slice(0, 7), 'raised', d.amount);
  for (const b of bills.filter((x) => x.status === 'paid')) add((b.paidAt ?? b.billDate).slice(0, 7), 'spent', b.amount);
  return {
    budget: p.budget,
    raised,
    gifts: gifts.length,
    givers: new Set(gifts.map((d) => d.donorId ?? d.donorName)).size,
    pledged: pledges.reduce((t, x) => t + x.amount, 0),
    pledgeGiven,
    pledgers: new Set(pledges.map((x) => x.personId)).size,
    behind,
    spent,
    due,
    balance: raised - spent,
    byMonth: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)).slice(-18),
  };
}

/** How much of a pledge should be in by today, spread evenly over its months. */
function expectedBy(pl: { amount: number; startDate: string; endDate: string }, today: string) {
  if (today < pl.startDate) return 0;
  if (today >= pl.endDate) return pl.amount;
  const span = new Date(`${pl.endDate}T00:00:00Z`).getTime() - new Date(`${pl.startDate}T00:00:00Z`).getTime();
  const done = new Date(`${today}T00:00:00Z`).getTime() - new Date(`${pl.startDate}T00:00:00Z`).getTime();
  return span > 0 ? Math.round((pl.amount * done) / span) : pl.amount;
}

function view(ctx: Ctx, p: BuildingProject): BuildingProjectView {
  return {
    ...p,
    fundName: ctx.db.get('funds', p.fundId)?.name ?? 'Fund',
    money: money(ctx, p),
    updates: ctx.db.all('buildingUpdates').filter((u) => u.projectId === p.id).sort((a, b) => b.date.localeCompare(a.date) || b.at.localeCompare(a.at)),
    bills: ctx.db.all('buildingBills').filter((b) => b.projectId === p.id).sort((a, b) => b.billDate.localeCompare(a.billDate) || b.at.localeCompare(a.at)),
  };
}

function hub(ctx: Ctx): BuildingHub {
  return {
    projects: ctx.db.all('buildingProjects').sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((p) => view(ctx, p)),
    funds: ctx.db.all('funds').filter((f) => !f.system && f.active).map((f) => ({ id: f.id, name: f.name })),
    currency: settings(ctx).currency,
  };
}

function memberView(ctx: Ctx, p: BuildingProject, me: string): MemberBuildingProject {
  const v = view(ctx, p);
  const today = localDate(ctx, ctx.now);
  const pl = ctx.db.all('pledges').filter((x) => x.personId === me && x.fundId === p.fundId && x.endDate >= today).sort((a, b) => a.endDate.localeCompare(b.endDate))[0];
  const mine = ctx.db.all('donations').filter((d) => d.donorId === me && d.fundId === p.fundId && d.status === 'succeeded');
  const { behind: _b, ...m } = v.money;
  return {
    id: p.id, title: p.title, description: p.description, fundId: p.fundId, budget: p.budget, startDate: p.startDate, targetDate: p.targetDate, status: p.status, coverUrl: p.coverUrl, stages: p.stages, showBills: p.showBills, createdAt: p.createdAt, updatedAt: p.updatedAt,
    fundName: v.fundName,
    money: m,
    updates: v.updates.slice(0, 30),
    bills: p.showBills ? v.bills.map((b) => ({ id: b.id, projectId: b.projectId, contractor: b.contractor, work: b.work, stageId: b.stageId, amount: b.amount, billDate: b.billDate, billNumber: b.billNumber, status: b.status, paidAt: b.paidAt, billUrl: p.showBillFiles ? b.billUrl : null })) : null,
    myPledge: pl ? { amount: pl.amount, given: mine.filter((d) => dateOnly(giftDate(d)) >= pl.startDate && dateOnly(giftDate(d)) <= pl.endDate).reduce((t, d) => t + d.amount, 0), endDate: pl.endDate } : null,
    myGiven: mine.reduce((t, d) => t + d.amount, 0),
  };
}

function project(ctx: Ctx, id: string) {
  return find(ctx, 'buildingProjects', id, 'Building project');
}

const rupees = (n: number) => `₹${(n / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

/** Members whose pledge to a project's fund is behind, with a line for each. */
function behindPledgers(ctx: Ctx, p: BuildingProject) {
  const today = localDate(ctx, ctx.now);
  const gifts = ctx.db.all('donations').filter((d) => d.fundId === p.fundId && d.status === 'succeeded');
  const out: { personId: string; short: number; given: number; amount: number }[] = [];
  for (const pl of ctx.db.all('pledges').filter((x) => x.fundId === p.fundId && x.startDate <= today && x.endDate >= today)) {
    const given = gifts.filter((d) => d.donorId === pl.personId && dateOnly(giftDate(d)) >= pl.startDate && dateOnly(giftDate(d)) <= pl.endDate).reduce((t, d) => t + d.amount, 0);
    const short = expectedBy(pl, today) - given;
    if (short > Math.max(100_00, pl.amount * 0.05)) out.push({ personId: pl.personId, short, given, amount: pl.amount });
  }
  return out;
}

async function remind(ctx: Ctx, p: BuildingProject) {
  const list = behindPledgers(ctx, p);
  for (const x of list)
    await notify(ctx, 'building.pledge', { personIds: [x.personId], title: `${p.title}: your pledge`, body: `Thank you for pledging ${rupees(x.amount)} to ${p.title}. ${rupees(x.given)} has come in so far. If you can, the next part would keep the work on track. You can see the progress and give in the app.`, link: `/app/building/${p.id}` });
  return list.length;
}

/** Daily: on the 1st, reminders for pledges that are behind (once a month). */
export async function buildingDue(ctx: Ctx, today: string) {
  if (!today.endsWith('-01') || !featureOn(settings(ctx).features, 'building-project')) return;
  for (const p of ctx.db.all('buildingProjects').filter((x) => x.published && x.pledgeReminders && x.status !== 'done')) {
    const key = `building:remind:${p.id}:${today.slice(0, 7)}`;
    if (ctx.db.get('meta', key)) continue;
    ctx.db.put('meta', { id: key, value: today });
    await remind(ctx, p);
  }
}

function input(ctx: Ctx, b: Record<string, any>, prev: BuildingProject | null): BuildingProject { // eslint-disable-line @typescript-eslint/no-explicit-any
  const title = b.title !== undefined ? clean(b.title, 120) : (prev?.title ?? '');
  if (!title) throw new ApiError(422, 'invalid', 'Give the project a name.', { title: 'Required' });
  const fundId = b.fundId !== undefined ? String(b.fundId) : (prev?.fundId ?? '');
  const fund = ctx.db.get('funds', fundId);
  if (!fund || fund.system) throw new ApiError(422, 'invalid', 'Choose the fund the gifts go to.', { fundId: 'Required' });
  const startDate = b.startDate !== undefined ? ymd(b.startDate) : (prev?.startDate ?? null);
  if (!startDate) throw new ApiError(422, 'invalid', 'Enter the start date.', { startDate: 'Required' });
  const targetDate = b.targetDate !== undefined ? ymd(b.targetDate) : (prev?.targetDate ?? null);
  if (targetDate && targetDate < startDate) throw new ApiError(422, 'invalid', 'The target date is before the start.', { targetDate: 'Before the start' });
  const bool = (k: 'published' | 'showBills' | 'showBillFiles' | 'pledgeReminders', d: boolean) => (b[k] !== undefined ? !!b[k] : (prev?.[k] ?? d));
  return {
    id: prev?.id ?? ctx.id('bp'),
    title,
    description: b.description !== undefined ? clean(b.description, 3000) : (prev?.description ?? ''),
    fundId,
    budget: b.budget !== undefined ? paise(b.budget) : (prev?.budget ?? 0),
    startDate,
    targetDate,
    status: STATUS.includes(b.status) ? b.status : (prev?.status ?? 'planning'),
    coverUrl: b.coverUrl !== undefined ? link(b.coverUrl) : (prev?.coverUrl ?? null),
    stages: stages(ctx, b.stages, prev?.stages ?? []),
    published: bool('published', false),
    showBills: bool('showBills', true),
    showBillFiles: bool('showBillFiles', false),
    pledgeReminders: bool('pledgeReminders', true),
    createdAt: prev?.createdAt ?? ctx.now.toISOString(),
    updatedAt: ctx.now.toISOString(),
  };
}

function billInput(ctx: Ctx, p: BuildingProject, b: Record<string, any>, prev: BuildingBill | null): BuildingBill { // eslint-disable-line @typescript-eslint/no-explicit-any
  const contractor = b.contractor !== undefined ? clean(b.contractor, 120) : (prev?.contractor ?? '');
  const work = b.work !== undefined ? clean(b.work, 300) : (prev?.work ?? '');
  const amount = b.amount !== undefined ? paise(b.amount) : (prev?.amount ?? 0);
  const fields: Record<string, string> = {};
  if (!contractor) fields.contractor = 'Required';
  if (!work) fields.work = 'Required';
  if (!amount) fields.amount = 'Required';
  const billDate = b.billDate !== undefined ? ymd(b.billDate) : (prev?.billDate ?? null);
  if (!billDate) fields.billDate = 'Required';
  if (Object.keys(fields).length) throw new ApiError(422, 'invalid', 'Please fill in the contractor, the work, the amount and the bill date.', fields);
  const stageId = b.stageId !== undefined ? (p.stages.some((s) => s.id === b.stageId) ? String(b.stageId) : null) : (prev?.stageId ?? null);
  const status: BuildingBill['status'] = b.status === 'paid' || b.status === 'due' ? b.status : (prev?.status ?? 'due');
  const paidAt = status === 'paid' ? (ymd(b.paidAt) ?? prev?.paidAt ?? localDate(ctx, ctx.now)) : null;
  return {
    id: prev?.id ?? ctx.id('bb'),
    projectId: p.id,
    contractor,
    work,
    stageId,
    amount,
    billDate: billDate!,
    billNumber: b.billNumber !== undefined ? clean(b.billNumber, 60) : (prev?.billNumber ?? ''),
    billUrl: b.billUrl !== undefined ? link(b.billUrl) : (prev?.billUrl ?? null),
    status,
    paidAt,
    voucher: b.voucher !== undefined ? clean(b.voucher, 60) : (prev?.voucher ?? ''),
    by: prev?.by ?? ctx.staff?.name ?? 'Church office',
    at: prev?.at ?? ctx.now.toISOString(),
  };
}

export function registerBuilding(r: Router) {
  r.get('/admin/building', { perm: READ }, (ctx): BuildingHub => {
    guard(ctx);
    return hub(ctx);
  });
  r.post('/admin/building', { perm: WRITE }, (ctx): BuildingProjectView => {
    guard(ctx);
    const p = ctx.db.put('buildingProjects', input(ctx, ctx.body ?? {}, null));
    ctx.audit('created', 'buildingProject', p.id, `Started the building project ${p.title}`);
    return view(ctx, p);
  });
  r.patch('/admin/building/:id', { perm: WRITE }, (ctx): BuildingProjectView => {
    guard(ctx);
    const prev = project(ctx, ctx.params[0]);
    const p = ctx.db.put('buildingProjects', input(ctx, ctx.body ?? {}, prev));
    ctx.audit('updated', 'buildingProject', p.id, `Updated the building project ${p.title}`);
    return view(ctx, p);
  });
  r.del('/admin/building/:id', { perm: WRITE }, (ctx): BuildingHub => {
    guard(ctx);
    const p = project(ctx, ctx.params[0]);
    for (const u of ctx.db.all('buildingUpdates').filter((x) => x.projectId === p.id)) ctx.db.del('buildingUpdates', u.id);
    for (const b of ctx.db.all('buildingBills').filter((x) => x.projectId === p.id)) ctx.db.del('buildingBills', b.id);
    ctx.db.del('buildingProjects', p.id);
    ctx.audit('deleted', 'buildingProject', p.id, `Removed the building project ${p.title}`);
    return hub(ctx);
  });

  r.post('/admin/building/:id/updates', { perm: WRITE }, async (ctx): Promise<BuildingProjectView> => {
    guard(ctx);
    const p = project(ctx, ctx.params[0]);
    const b = ctx.body ?? {};
    const title = clean(b.title, 140);
    if (!title) throw new ApiError(422, 'invalid', 'Give the update a heading.', { title: 'Required' });
    const u: BuildingUpdate = { id: ctx.id('bu'), projectId: p.id, date: ymd(b.date) ?? localDate(ctx, ctx.now), title, body: clean(b.body, 3000), photos: photos(b.photos), stageId: p.stages.some((s) => s.id === b.stageId) ? String(b.stageId) : null, by: ctx.staff?.name ?? 'Church office', at: ctx.now.toISOString() };
    ctx.db.put('buildingUpdates', u);
    ctx.audit('created', 'buildingUpdate', u.id, `Posted "${u.title}" on ${p.title}`);
    if (p.published && b.notify !== false) {
      const ids = ctx.db.all('people').filter((x) => x.status === 'member' || x.status === 'regular').map((x) => x.id);
      await notify(ctx, 'building.update', { personIds: ids, title: `${p.title}: ${u.title}`, body: u.body.slice(0, 200) || 'New photos of the work.', link: `/app/building/${p.id}` });
    }
    return view(ctx, p);
  });
  r.del('/admin/building/:id/updates/:uid', { perm: WRITE }, (ctx): BuildingProjectView => {
    guard(ctx);
    const p = project(ctx, ctx.params[0]);
    const u = ctx.db.get('buildingUpdates', ctx.params[1]);
    if (!u || u.projectId !== p.id) throw new ApiError(404, 'not_found', 'That update was not found.');
    ctx.db.del('buildingUpdates', u.id);
    return view(ctx, p);
  });

  r.post('/admin/building/:id/bills', { perm: WRITE }, (ctx): BuildingProjectView => {
    guard(ctx);
    const p = project(ctx, ctx.params[0]);
    const bill = ctx.db.put('buildingBills', billInput(ctx, p, ctx.body ?? {}, null));
    ctx.audit('created', 'buildingBill', bill.id, `Bill from ${bill.contractor} for ${rupees(bill.amount)} on ${p.title}`);
    return view(ctx, p);
  });
  r.patch('/admin/building/:id/bills/:bid', { perm: WRITE }, (ctx): BuildingProjectView => {
    guard(ctx);
    const p = project(ctx, ctx.params[0]);
    const prev = ctx.db.get('buildingBills', ctx.params[1]);
    if (!prev || prev.projectId !== p.id) throw new ApiError(404, 'not_found', 'That bill was not found.');
    const bill = ctx.db.put('buildingBills', billInput(ctx, p, ctx.body ?? {}, prev));
    if (bill.status !== prev.status) ctx.audit('updated', 'buildingBill', bill.id, `${bill.contractor}'s bill marked ${bill.status}`);
    return view(ctx, p);
  });
  r.del('/admin/building/:id/bills/:bid', { perm: WRITE }, (ctx): BuildingProjectView => {
    guard(ctx);
    const p = project(ctx, ctx.params[0]);
    const bill = ctx.db.get('buildingBills', ctx.params[1]);
    if (!bill || bill.projectId !== p.id) throw new ApiError(404, 'not_found', 'That bill was not found.');
    ctx.db.del('buildingBills', bill.id);
    ctx.audit('deleted', 'buildingBill', bill.id, `Removed ${bill.contractor}'s bill from ${p.title}`);
    return view(ctx, p);
  });

  r.post('/admin/building/:id/remind', { perm: WRITE }, async (ctx) => {
    guard(ctx);
    const p = project(ctx, ctx.params[0]);
    const sent = await remind(ctx, p);
    ctx.audit('sent', 'buildingProject', p.id, `Pledge reminders for ${p.title} to ${sent} member${sent === 1 ? '' : 's'}`);
    return { sent };
  });
  r.get('/admin/building/:id/behind', { perm: READ }, (ctx) => {
    guard(ctx);
    const p = project(ctx, ctx.params[0]);
    return behindPledgers(ctx, p).map((x) => {
      const person = ctx.db.get('people', x.personId);
      return { ...x, name: person ? fullName(person) : 'Member', phone: person?.phone ?? null };
    });
  });

  // ----- member -----
  r.get('/me/building', {}, (ctx): MemberBuildingProject[] => {
    if (!featureOn(settings(ctx).features, 'building-project')) return [];
    const me = ctx.me();
    return ctx.db.all('buildingProjects').filter((p) => p.published).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((p) => memberView(ctx, p, me));
  });
}
