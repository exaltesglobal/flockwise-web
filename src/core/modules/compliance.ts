// FCRA and trust compliance guard. Foreign money (from foreign citizens, OCI card holders and
// foreign bodies) must reach the church only through its FCRA account and be spent from there;
// an Indian citizen living abroad is a local source. The guard keeps a list of foreign givers,
// stops the office (and the member app) from recording their gift on the local side, and checks
// the year for what goes wrong in practice: a foreign giver's gift in the main account, money from
// abroad on the main bank statement, FCRA spending running ahead of FCRA receipts, administrative
// spending above the 20% limit, FCRA money passed on to another body, a registration near its end.
// It also prepares the FC-4 figures and the Form 10BD list for 80G, with the due dates.
// These are working figures for the treasurer and the auditor, not legal advice.
import type { Ctx, Router } from '../engine.js';
import { ApiError } from '../errors.js';
import { featureOn } from '../features.js';
import { narrationKind } from '../bank-presets.js';
import { permsOf } from '../perms.js';
import type { Collections, ComplianceDeadline, ComplianceGuard, ComplianceState, ComplianceWarning, ComplianceYear, Fc4Figures, ForeignDonor, ForeignDonorKind, Form10bd, Form10bdRow } from '../types.js';
import { eligible80g, fiscalYearRange, fullName, giftDate, localDate, normEmail, settings } from '../util.js';
import { notify } from './notify.js';

const READ = ['giving.view', 'settings'] as ('giving.view' | 'settings')[];
const WRITE = ['giving.edit', 'settings'] as ('giving.edit' | 'settings')[];
const KINDS: ForeignDonorKind[] = ['foreign_citizen', 'oci', 'foreign_org', 'nri_indian'];
const KIND_LABEL: Record<ForeignDonorKind, string> = { foreign_citizen: 'foreign citizen', oci: 'OCI card holder', foreign_org: 'foreign organisation', nri_indian: 'Indian citizen abroad' };
const DAY = 86_400_000;
const ADMIN_LIMIT = 0.2;
/** Words banks put on money that came from abroad. */
const FOREIGN_RE = /\b(swift|inward remit\w*|foreign (inward )?remit\w*|firc|fire?x|forex|\btt ref|telegraphic|wire transfer|western union|moneygram|paypal|wise\b|transferwise|remitly|xoom|usd|gbp|eur|cad|aud|sgd|aed|chf|nzd|sek|nok)\b/i;
/** Expense heads that look like money passed on to another organisation. */
const PASS_ON_RE = /\b(grant|sub-?grant|transfer to|contribution to|donation to|support to|aid to)\b/i;
const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const rupees = (n: number) => `₹${(n / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const nameKey = (s: string) => `name:${s.trim().toLowerCase().replace(/\s+/g, ' ')}`;

function guard(ctx: Ctx) {
  if (!featureOn(settings(ctx).features, 'fcra-guard')) throw new ApiError(404, 'not_found', 'The FCRA and 80G guard is switched off for this church.');
}

export function complianceState(ctx: Ctx): ComplianceState {
  return ctx.db.get('complianceState', 'main') ?? { id: 'main', registrationValidTo: null, adminHeadIds: [], openingBalances: {}, filed: {}, dismissed: [] };
}

function yearOf(ctx: Ctx, q: unknown) {
  const cur = fiscalYearRange(ctx);
  const want = typeof q === 'string' && /^\d{4}/.test(q) ? Math.min(Number(q.slice(0, 4)), cur.start) : cur.start;
  return fiscalYearRange(ctx, String(want));
}
const yearView = (r: ReturnType<typeof fiscalYearRange>): ComplianceYear => ({ label: r.label, from: r.from.toISOString().slice(0, 10), to: new Date(r.to.getTime() - DAY).toISOString().slice(0, 10) });
const inYear = (r: ReturnType<typeof fiscalYearRange>, iso: string) => iso >= r.from.toISOString() && iso < r.to.toISOString();
const inYearDate = (r: ReturnType<typeof fiscalYearRange>, ymd: string) => ymd >= r.from.toISOString().slice(0, 10) && ymd < r.to.toISOString().slice(0, 10);

/** The foreign-giver record for a person or a name, if any. */
export function foreignDonorFor(ctx: Ctx, personId: string | null | undefined, name?: string | null): ForeignDonor | null {
  const all = ctx.db.all('foreignDonors');
  return (personId && all.find((d) => d.personId === personId)) || (name ? all.find((d) => !d.personId && nameKey(d.name) === nameKey(name)) : undefined) || null;
}
const isForeign = (d: ForeignDonor | null) => !!d && d.kind !== 'nri_indian';

/**
 * Called before a gift is saved. Throws when a giver on the foreign list is about to land in the
 * main account, unless the office says this gift came from an Indian source.
 */
export function checkGiftAccount(ctx: Ctx, g: { donorId?: string | null; donorName?: string | null; foreign: boolean; indianSource?: boolean; member?: boolean }) {
  const s = settings(ctx);
  if (s.country !== 'IN' || g.foreign || g.indianSource || !featureOn(s.features, 'fcra-guard')) return;
  const f = foreignDonorFor(ctx, g.donorId, g.donorName);
  if (!isForeign(f)) return;
  if (g.member) throw new ApiError(422, 'fcra_wrong_account', s.fcra.registered ? 'Gifts from foreign citizens and OCI card holders go to the church\'s FCRA account. Choose "foreign citizen or OCI" as your citizenship.' : 'This church cannot accept gifts from foreign citizens or OCI card holders.', { donorCitizenship: 'Foreign citizen or OCI' });
  throw new ApiError(422, 'fcra_wrong_account', `${f!.name} is on the foreign givers list (${KIND_LABEL[f!.kind]}, ${f!.country || 'country not set'}). ${s.fcra.registered ? 'Record this as a foreign (FCRA) gift so it stays out of the main account' : 'This church has no FCRA registration, so it cannot accept this gift'}, or tick "From an Indian source" if this gift came from an Indian account.`, { donorCitizenship: 'Foreign giver' });
}

type Gift = Collections['donations'];
const donorKey = (d: Gift) => (d.donorId ? `p:${d.donorId}` : nameKey(d.donorName));

function warnings(ctx: Ctx, r: ReturnType<typeof fiscalYearRange>, st: ComplianceState, today: string): ComplianceWarning[] {
  const s = settings(ctx);
  const out: ComplianceWarning[] = [];
  if (s.country !== 'IN') return out;
  const gifts = ctx.db.all('donations').filter((d) => d.status === 'succeeded');
  const year = gifts.filter((d) => inYear(r, giftDate(d)));
  const foreignYear = year.filter((d) => d.fcra);

  if (!s.fcra.registered && foreignYear.length)
    out.push({ id: 'unregistered', level: 'stop', title: `${foreignYear.length} foreign gift${foreignYear.length === 1 ? '' : 's'} without an FCRA registration`, detail: `${rupees(foreignYear.reduce((t, d) => t + d.amount, 0))} is recorded as foreign money, but the church settings show no FCRA registration. A church without registration (or prior permission) cannot accept foreign contributions.`, fix: 'Add the registration in Settings › Giving if you have one. If not, speak to your auditor about returning these gifts.', donationIds: foreignYear.map((d) => d.id) });

  // A foreign giver's gifts on the local side.
  const everForeign = new Set(gifts.filter((d) => d.fcra).map(donorKey));
  const byDonor = new Map<string, Gift[]>();
  for (const d of year) if (!d.fcra) byDonor.set(donorKey(d), [...(byDonor.get(donorKey(d)) ?? []), d]);
  for (const [key, list] of byDonor) {
    const first = list[0];
    const flag = foreignDonorFor(ctx, first.donorId, first.donorName);
    if (flag && !isForeign(flag)) continue;
    if (!flag && !everForeign.has(key)) continue;
    const total = list.reduce((t, d) => t + d.amount, 0);
    out.push({
      id: `local:${key}`,
      level: flag ? 'stop' : 'warn',
      title: flag ? `${first.donorName}: foreign giver, ${list.length} gift${list.length === 1 ? '' : 's'} in the main account` : `${first.donorName} gave as a foreign giver before, and ${list.length} gift${list.length === 1 ? '' : 's'} went to the main account`,
      detail: flag ? `${first.donorName} is on the foreign givers list (${KIND_LABEL[flag.kind]}). ${rupees(total)} this year is recorded on the local side.` : `Some of ${first.donorName}'s gifts are recorded as foreign (FCRA) and ${rupees(total)} this year as local. Only one of these can be right, unless they changed citizenship.`,
      fix: flag ? 'Foreign money that reached the main account cannot simply stay there. Ask your auditor: the usual course is to return it or report it to the Home Ministry and move it as directed. Then mark the gifts as foreign here.' : 'Check the giver\'s citizenship. If they are a foreign citizen or OCI holder, add them to the foreign givers list and mark these gifts as foreign. If they are Indian, add them as an Indian citizen abroad so this warning stops.',
      donationIds: list.map((d) => d.id),
      personId: first.donorId,
      canMarkForeign: s.fcra.registered,
      canDismiss: !flag,
    });
  }

  // An Indian citizen abroad recorded as foreign.
  for (const f of ctx.db.all('foreignDonors').filter((x) => x.kind === 'nri_indian')) {
    const list = foreignYear.filter((d) => (f.personId ? d.donorId === f.personId : nameKey(d.donorName) === nameKey(f.name)));
    if (list.length)
      out.push({ id: `nri:${f.id}`, level: 'warn', title: `${f.name}: Indian citizen abroad, recorded as foreign`, detail: `${list.length} gift${list.length === 1 ? '' : 's'} (${rupees(list.reduce((t, d) => t + d.amount, 0))}) are on the FCRA side. Gifts from Indian citizens abroad, including from NRE or NRO accounts, are local money.`, fix: 'Check with the giver. If they hold an Indian passport, these gifts belong in the main account; ask your auditor how to correct them.', donationIds: list.map((d) => d.id), personId: f.personId });
  }

  // Money from abroad on the main bank statement.
  for (const l of ctx.db.all('bankLines')) {
    if (l.account !== 'main' || l.amount <= 0 || !inYearDate(r, l.date) || !FOREIGN_RE.test(`${l.narration} ${l.ref ?? ''}`)) continue;
    const id = `bank:${l.id}`;
    if (st.dismissed.includes(id)) continue;
    out.push({ id, level: 'warn', title: `Main account: ${rupees(l.amount)} on ${l.date} looks like money from abroad`, detail: `The bank wrote “${l.narration.slice(0, 120)}”. Foreign contributions must come straight into the FCRA account.`, fix: 'Find out who sent it. If it came from an Indian citizen abroad, set this aside. If it is foreign money, speak to your auditor before using it.', bankLineId: l.id, canDismiss: true });
  }

  if (s.fcra.registered) {
    const heads = new Map(ctx.db.all('accountHeads').map((h) => [h.id, h]));
    const spent = ctx.db.all('expenses').filter((e) => e.status === 'paid' && e.fcra && inYearDate(r, e.date));
    const received = foreignYear.reduce((t, d) => t + d.amount, 0);
    const spentTotal = spent.reduce((t, e) => t + e.amount, 0);
    const opening = st.openingBalances[r.label] ?? null;
    if (spentTotal > received + (opening ?? 0))
      out.push({ id: 'overspent', level: 'warn', title: 'FCRA spending is ahead of FCRA money', detail: `${rupees(spentTotal)} was paid from the FCRA account this year against ${rupees(received)} received${opening !== null ? ` and ${rupees(opening)} brought forward` : ''}. Either local money paid for FCRA work, or the opening balance is missing.`, fix: opening === null ? 'Enter the FCRA account balance on 1 April in the guard settings.' : 'Check that no expense is marked FCRA by mistake, and that local money did not go into the FCRA account.', expenseIds: spent.map((e) => e.id) });
    if (st.adminHeadIds.length && received > 0) {
      const admin = spent.filter((e) => st.adminHeadIds.includes(e.headId)).reduce((t, e) => t + e.amount, 0);
      const share = admin / received;
      if (share > ADMIN_LIMIT * 0.75)
        out.push({ id: 'admin-share', level: share > ADMIN_LIMIT ? 'stop' : 'warn', title: `Administrative spending is ${Math.round(share * 100)}% of foreign money this year`, detail: `${rupees(admin)} on administrative heads against ${rupees(received)} received. The FCRA limit is 20% of the foreign contribution received in the year.`, fix: share > ADMIN_LIMIT ? 'Pay further office costs from local money and talk to your auditor about this year.' : 'You are close to the limit. Plan the rest of the year\'s office costs from local money.' });
    } else if (!st.adminHeadIds.length && received > 0) {
      out.push({ id: 'admin-heads', level: 'info', title: 'Mark your administrative expense heads', detail: 'FCRA allows at most 20% of the year\'s foreign money on administrative expenses (salaries of office staff, rent, travel, phone and the like). Choose which heads count so the guard can watch the limit.', fix: 'Open the guard settings and tick the administrative heads.' });
    }
    const passed = spent.filter((e) => PASS_ON_RE.test(heads.get(e.headId)?.name ?? '') || PASS_ON_RE.test(e.description));
    if (passed.length)
      out.push({ id: 'pass-on', level: 'warn', title: `${passed.length} FCRA payment${passed.length === 1 ? '' : 's'} look like money passed to another body`, detail: `${rupees(passed.reduce((t, e) => t + e.amount, 0))}, for example “${passed[0].description.slice(0, 80) || passed[0].payee}”. Since 2020 the law does not allow FCRA money to be transferred to any other person or organisation.`, fix: 'Check each payment. Paying a supplier for goods or services is fine; a grant to another church, mission or trust is not.', expenseIds: passed.map((e) => e.id) });
    const cash = spent.filter((e) => e.method === 'cash');
    if (cash.length)
      out.push({ id: 'fcra-cash', level: 'info', title: `${cash.length} FCRA payment${cash.length === 1 ? '' : 's'} made in cash`, detail: `${rupees(cash.reduce((t, e) => t + e.amount, 0))}. Payments from foreign money are easiest to defend when they leave the FCRA account by bank transfer or cheque.`, fix: 'Keep bills and vouchers for each, and pay by bank where you can.', expenseIds: cash.map((e) => e.id) });
    if (!st.registrationValidTo)
      out.push({ id: 'validity', level: 'info', title: 'Add the date your FCRA registration runs to', detail: 'Registration is valid for five years and must be renewed before it ends. The guard reminds you in good time.', fix: 'Enter the validity date in the guard settings.' });
    else {
      const left = Math.round((new Date(`${st.registrationValidTo}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / DAY);
      if (left < 0) out.push({ id: 'validity', level: 'stop', title: 'The FCRA registration has expired', detail: `It ran to ${st.registrationValidTo}. Foreign money cannot be received or used until it is renewed.`, fix: 'Do not accept or spend foreign money. Talk to your auditor about the renewal status on fcraonline.nic.in.' });
      else if (left <= 240) out.push({ id: 'validity', level: 'warn', title: `FCRA registration ends in ${left} days`, detail: `It runs to ${st.registrationValidTo}. Renewal has to be applied for well before that date.`, fix: 'Start the renewal on fcraonline.nic.in now, and check the current deadline for applying.' });
    }
  }

  // 80G and Form 10BD.
  if (s.receipts80g.enabled) {
    if (!s.receipts80g.registrationNumber || !s.receipts80g.pan)
      out.push({ id: '80g-setup', level: 'warn', title: 'The church\'s 80G details are incomplete', detail: 'Receipts, Form 10BD and the 10BE certificates need the church\'s PAN and its 80G registration number.', fix: 'Add both in Settings › Giving.' });
    const eligible = year.filter((d) => eligible80g(ctx, d));
    const noPan = new Map<string, Gift[]>();
    for (const d of eligible) if (!d.pan) noPan.set(donorKey(d), [...(noPan.get(donorKey(d)) ?? []), d]);
    if (noPan.size)
      out.push({ id: '80g-pan', level: 'warn', title: `${noPan.size} giver${noPan.size === 1 ? '' : 's'} with 80G gifts but no PAN`, detail: `${rupees([...noPan.values()].flat().reduce((t, d) => t + d.amount, 0))} this year. Form 10BD needs a PAN or Aadhaar for each giver, or they cannot claim the deduction.`, fix: 'Ask these givers for their PAN and add it to their gifts before you file 10BD.', donationIds: [...noPan.values()].flat().map((d) => d.id) });
    const funds = new Map(ctx.db.all('funds').map((f) => [f.id, f]));
    const bigCash = year.filter((d) => d.method === 'cash' && d.amount > 200000 && funds.get(d.fundId)?.taxDeductible && !d.fcra);
    if (bigCash.length)
      out.push({ id: '80g-cash', level: 'info', title: `${bigCash.length} cash gift${bigCash.length === 1 ? '' : 's'} above ₹2,000`, detail: 'Cash gifts above ₹2,000 do not qualify for 80G, so they are left out of 10BD and their receipts say so.', fix: 'Encourage larger gifts by UPI, cheque or bank transfer.', donationIds: bigCash.map((d) => d.id) });
  }
  return out.filter((w) => !st.dismissed.includes(w.id));
}

function deadlines(ctx: Ctx, st: ComplianceState, today: string): ComplianceDeadline[] {
  const s = settings(ctx);
  if (s.country !== 'IN') return [];
  const cur = fiscalYearRange(ctx);
  const prev = fiscalYearRange(ctx, String(cur.start - 1));
  const endYear = cur.start; // the previous year ended on 31 March of this calendar year
  const out: Omit<ComplianceDeadline, 'status' | 'filed'>[] = [];
  if (s.receipts80g.enabled) {
    out.push({ key: `10bd:${prev.label}`, label: `Form 10BD for ${prev.label}`, body: 'The statement of donations received with 80G, filed on the income tax portal. Use the 10BD list below.', due: `${endYear}-05-31`, link: 'https://www.incometax.gov.in' });
    out.push({ key: `10be:${prev.label}`, label: `10BE certificates for ${prev.label}`, body: 'After 10BD is accepted, download each giver\'s 10BE certificate from the portal and send it to them.', due: `${endYear}-05-31`, link: 'https://www.incometax.gov.in' });
  }
  if (s.fcra.registered) {
    out.push({ key: `fc4:${prev.label}`, label: `FC-4 annual return for ${prev.label}`, body: 'The FCRA annual return with the receipts and payments account, income and expenditure, balance sheet and the auditor\'s certificate. Use the FC-4 figures below.', due: `${endYear}-12-31`, link: 'https://fcraonline.nic.in' });
    // Quarterly disclosure of foreign receipts, for the quarters of this year that have ended.
    for (let q = 1; q <= 4; q++) {
      const end = new Date(Date.UTC(cur.start, 3 + q * 3, 0));
      const endYmd = end.toISOString().slice(0, 10);
      if (endYmd >= today) break;
      const due = new Date(end.getTime() + 15 * DAY).toISOString().slice(0, 10);
      out.push({ key: `fcq:${cur.label}:Q${q}`, label: `Foreign receipts for ${cur.label} quarter ${q}`, body: 'Who gave foreign money in the quarter, how much and when, published as the current Home Ministry rule asks (on the church website or the FCRA portal). Check the current rule with your auditor.', due, link: 'https://fcraonline.nic.in' });
    }
    if (st.registrationValidTo) {
      const applyBy = new Date(new Date(`${st.registrationValidTo}T00:00:00Z`).getTime() - 120 * DAY).toISOString().slice(0, 10);
      out.push({ key: `renew:${st.registrationValidTo}`, label: 'Apply to renew FCRA registration', body: `The registration runs to ${st.registrationValidTo}. Apply on the FCRA portal well before it ends; check the current window for applying.`, due: applyBy, link: 'https://fcraonline.nic.in' });
    }
  }
  return out
    .map((d) => {
      const filed = st.filed[d.key] ?? null;
      const days = Math.round((new Date(`${d.due}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / DAY);
      return { ...d, filed, status: filed ? 'filed' : days < 0 ? 'overdue' : days <= 45 ? 'due' : 'upcoming' } as ComplianceDeadline;
    })
    .sort((a, b) => a.due.localeCompare(b.due));
}

export function fc4(ctx: Ctx, q?: unknown): Fc4Figures {
  const s = settings(ctx);
  const st = complianceState(ctx);
  const r = yearOf(ctx, q);
  const gifts = ctx.db.all('donations').filter((d) => d.status === 'succeeded' && d.fcra && inYear(r, giftDate(d)));
  const donors = new Map<string, Fc4Figures['donors'][number]>();
  for (const d of gifts) {
    const k = donorKey(d);
    const f = foreignDonorFor(ctx, d.donorId, d.donorName);
    const p = d.donorId ? ctx.db.get('people', d.donorId) : null;
    const row = donors.get(k) ?? { key: k, name: d.donorName, kind: f?.kind ?? 'unknown', country: f?.country ?? '', address: p?.address ?? null, purpose: '', gifts: 0, amount: 0 };
    row.gifts++;
    row.amount += d.amount;
    if (!row.purpose.split(', ').includes(d.fundName)) row.purpose = row.purpose ? `${row.purpose}, ${d.fundName}` : d.fundName;
    donors.set(k, row);
  }
  const interest = ctx.db.all('bankLines').filter((l) => l.account === 'fcra' && l.amount > 0 && inYearDate(r, l.date) && (l.match?.kind === 'interest' || narrationKind(l.narration) === 'interest')).reduce((t, l) => t + l.amount, 0);
  const heads = new Map(ctx.db.all('accountHeads').map((h) => [h.id, h]));
  const byHead = new Map<string, Fc4Figures['utilisation'][number]>();
  for (const e of ctx.db.all('expenses').filter((x) => x.status === 'paid' && x.fcra && inYearDate(r, x.date))) {
    const row = byHead.get(e.headId) ?? { headId: e.headId, name: heads.get(e.headId)?.name ?? 'Other', amount: 0, admin: st.adminHeadIds.includes(e.headId) };
    row.amount += e.amount;
    byHead.set(e.headId, row);
  }
  const utilisation = [...byHead.values()].sort((a, b) => b.amount - a.amount);
  const received = gifts.reduce((t, d) => t + d.amount, 0);
  const utilised = utilisation.reduce((t, h) => t + h.amount, 0);
  const adminSpent = utilisation.filter((h) => h.admin).reduce((t, h) => t + h.amount, 0);
  const openingBalance = st.openingBalances[r.label] ?? 0;
  return {
    year: yearView(r),
    bank: { registrationNumber: s.fcra.registrationNumber, accountLast4: s.fcra.accountLast4 },
    openingBalance,
    donors: [...donors.values()].sort((a, b) => b.amount - a.amount),
    received,
    interest,
    utilisation,
    utilised,
    adminSpent,
    adminShare: received > 0 && st.adminHeadIds.length ? adminSpent / received : null,
    closingBalance: openingBalance + received + interest - utilised,
  };
}

export function form10bd(ctx: Ctx, q?: unknown): Form10bd {
  const s = settings(ctx);
  const r = yearOf(ctx, q);
  const year = ctx.db.all('donations').filter((d) => d.status === 'succeeded' && !d.eventId && !d.formResponseId && inYear(r, giftDate(d)));
  const funds = new Map(ctx.db.all('funds').map((f) => [f.id, f]));
  const rows = new Map<string, Form10bdRow>();
  for (const d of year.filter((x) => eligible80g(ctx, x))) {
    const p = d.donorId ? ctx.db.get('people', d.donorId) : null;
    const mode: Form10bdRow['mode'] = d.method === 'cash' ? 'Cash' : 'Electronic modes including account payee cheque/draft';
    const donationType: Form10bdRow['donationType'] = /corpus/i.test(funds.get(d.fundId)?.name ?? '') ? 'Corpus' : 'Others';
    const id = d.pan ?? '';
    const k = `${id || donorKey(d)}|${mode}|${donationType}`;
    const row = rows.get(k) ?? { key: k, donorId: d.donorId, idCode: id ? '1' : '', idNumber: id, name: p ? fullName(p) : d.donorName, address: p?.address ?? '', donationType, mode, gifts: 0, amount: 0, missing: [] };
    row.gifts++;
    row.amount += d.amount;
    row.missing = [...(row.idNumber ? [] : (['ID'] as const)), ...(row.address ? [] : (['address'] as const))];
    rows.set(k, row);
  }
  const list = [...rows.values()].sort((a, b) => a.name.localeCompare(b.name));
  const bigCash = year.filter((d) => d.method === 'cash' && d.amount > 200000 && funds.get(d.fundId)?.taxDeductible && !d.fcra);
  const foreign = year.filter((d) => d.fcra && funds.get(d.fundId)?.taxDeductible);
  return {
    year: yearView(r),
    registration: s.receipts80g.registrationNumber,
    pan: s.receipts80g.pan,
    rows: list,
    total: list.reduce((t, x) => t + x.amount, 0),
    missingId: list.filter((x) => x.missing.includes('ID')).length,
    missingAddress: list.filter((x) => x.missing.includes('address')).length,
    cashOverLimit: { gifts: bigCash.length, amount: bigCash.reduce((t, d) => t + d.amount, 0) },
    foreignLeftOut: { gifts: foreign.length, amount: foreign.reduce((t, d) => t + d.amount, 0) },
  };
}

export function complianceGuard(ctx: Ctx, q?: unknown): ComplianceGuard {
  const s = settings(ctx);
  const st = complianceState(ctx);
  const r = yearOf(ctx, q);
  const today = localDate(ctx, ctx.now);
  const year = ctx.db.all('donations').filter((d) => d.status === 'succeeded' && inYear(r, giftDate(d)));
  const foreign = year.filter((d) => d.fcra);
  const foreignReceived = foreign.reduce((t, d) => t + d.amount, 0);
  const spent = ctx.db.all('expenses').filter((e) => e.status === 'paid' && e.fcra && inYearDate(r, e.date));
  const admin = spent.filter((e) => st.adminHeadIds.includes(e.headId)).reduce((t, e) => t + e.amount, 0);
  const all = ctx.db.all('donations').filter((d) => d.status === 'succeeded');
  return {
    year: yearView(r),
    india: s.country === 'IN',
    registered: s.fcra.registered,
    fcra: { registrationNumber: s.fcra.registrationNumber, accountLast4: s.fcra.accountLast4, validTo: st.registrationValidTo },
    receipts80g: { ...s.receipts80g },
    summary: { foreignReceived, foreignGifts: foreign.length, foreignSpent: spent.reduce((t, e) => t + e.amount, 0), localReceived: year.filter((d) => !d.fcra).reduce((t, d) => t + d.amount, 0), adminShare: foreignReceived > 0 && st.adminHeadIds.length ? admin / foreignReceived : null },
    warnings: warnings(ctx, r, st, today).sort((a, b) => ['stop', 'warn', 'info'].indexOf(a.level) - ['stop', 'warn', 'info'].indexOf(b.level)),
    deadlines: deadlines(ctx, st, today),
    donors: ctx.db
      .all('foreignDonors')
      .map((f) => {
        const mine = all.filter((d) => (f.personId ? d.donorId === f.personId : nameKey(d.donorName) === nameKey(f.name)) && inYear(r, giftDate(d)));
        return { ...f, gifts: mine.length, amount: mine.reduce((t, d) => t + d.amount, 0) };
      })
      .sort((a, b) => a.name.localeCompare(b.name)),
    heads: ctx.db.all('accountHeads').filter((h) => h.active !== false).map((h) => ({ id: h.id, name: h.name, admin: st.adminHeadIds.includes(h.id) })),
    currency: s.currency,
  };
}

function saveState(ctx: Ctx, next: ComplianceState) {
  return ctx.db.put('complianceState', next);
}

function staffIds(ctx: Ctx): string[] {
  const out = new Set<string>();
  for (const s of ctx.db.all('staff')) {
    if (s.status !== 'active') continue;
    const perms = permsOf(ctx.db, s);
    if (!perms.includes('settings') && !perms.includes('giving.edit')) continue;
    const p = (s.personId && ctx.db.get('people', s.personId)) || ctx.db.all('people').find((x) => normEmail(x.email) === normEmail(s.email));
    if (p) out.add(p.id);
  }
  return [...out];
}

/** Daily: a month and a week before each return is due, and once for each new stop-level warning. */
export async function complianceDue(ctx: Ctx, today: string) {
  const s = settings(ctx);
  if (s.country !== 'IN' || !featureOn(s.features, 'fcra-guard')) return;
  const st = complianceState(ctx);
  const lines: string[] = [];
  for (const d of deadlines(ctx, st, today)) {
    if (d.filed) continue;
    const days = Math.round((new Date(`${d.due}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / DAY);
    if (days !== 30 && days !== 7) continue;
    const key = `compliance:${d.key}:${days}`;
    if (ctx.db.get('meta', key)) continue;
    ctx.db.put('meta', { id: key, value: today });
    lines.push(`${d.label} is due in ${days} days (${d.due}).`);
  }
  for (const w of warnings(ctx, fiscalYearRange(ctx), st, today).filter((x) => x.level === 'stop')) {
    const key = `compliance:warn:${w.id}:${(w.donationIds ?? []).length}`;
    if (ctx.db.get('meta', key)) continue;
    ctx.db.put('meta', { id: key, value: today });
    lines.push(w.title);
  }
  if (lines.length) await notify(ctx, 'compliance.due', { personIds: staffIds(ctx), title: `${s.name}: FCRA and 80G guard`, body: lines.join('\n'), link: '/admin/compliance' });
}

const csvCell = (x: unknown) => `"${String(x ?? '').replace(/"/g, '""')}"`;

export function registerCompliance(r: Router) {
  r.get('/admin/compliance', { perm: READ }, (ctx): ComplianceGuard => {
    guard(ctx);
    return complianceGuard(ctx, ctx.query.year);
  });
  r.get('/admin/compliance/fc4', { perm: READ }, (ctx): Fc4Figures => {
    guard(ctx);
    return fc4(ctx, ctx.query.year);
  });
  r.get('/admin/compliance/10bd', { perm: READ }, (ctx): Form10bd => {
    guard(ctx);
    return form10bd(ctx, ctx.query.year);
  });
  // In the column order of the income tax portal's Form 10BD upload template.
  r.get('/admin/compliance/10bd.csv', { perm: READ }, (ctx) => {
    guard(ctx);
    const f = form10bd(ctx, ctx.query.year);
    const head = ['Sr. No.', 'ID Code', 'Unique Identification Number', 'Section Code', 'Unique Registration Number (URN)', 'Date of Issuance of URN', 'Name of donor', 'Address of donor', 'Donation Type', 'Mode of receipt', 'Amount of donation (Indian rupees)'];
    const rows = f.rows.map((x, i) => [i + 1, x.idCode, x.idNumber, 'Section 80G', '', '', x.name, x.address, x.donationType, x.mode, (x.amount / 100).toFixed(2)]);
    return { csv: `${[head, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')}\n`, filename: `form-10bd-${f.year.label}.csv` };
  });
  r.get('/admin/compliance/fc4.csv', { perm: READ }, (ctx) => {
    guard(ctx);
    const f = fc4(ctx, ctx.query.year);
    const m = (n: number) => (n / 100).toFixed(2);
    const lines = [
      ['FC-4 working figures', f.year.label], ['FCRA registration', f.bank.registrationNumber ?? ''], [],
      ['Opening balance', m(f.openingBalance)], ['Foreign contribution received', m(f.received)], ['Interest on FCRA account', m(f.interest)], ['Utilised', m(f.utilised)], ['Of which administrative', m(f.adminSpent)], ['Closing balance', m(f.closingBalance)], [],
      ['Donor', 'Type', 'Country', 'Address', 'Purpose', 'Gifts', 'Amount'], ...f.donors.map((d) => [d.name, d.kind === 'unknown' ? '' : KIND_LABEL[d.kind], d.country, d.address ?? '', d.purpose, d.gifts, m(d.amount)]), [],
      ['Utilisation head', 'Administrative', 'Amount'], ...f.utilisation.map((h) => [h.name, h.admin ? 'yes' : 'no', m(h.amount)]),
    ];
    return { csv: `${lines.map((row) => row.map(csvCell).join(',')).join('\n')}\n`, filename: `fc4-figures-${f.year.label}.csv` };
  });

  r.put('/admin/compliance/settings', { perm: WRITE }, (ctx): ComplianceGuard => {
    guard(ctx);
    const st = complianceState(ctx);
    const b = ctx.body ?? {};
    const next = { ...st };
    if (b.registrationValidTo !== undefined) {
      if (b.registrationValidTo && !/^\d{4}-\d{2}-\d{2}$/.test(String(b.registrationValidTo))) throw new ApiError(422, 'invalid', 'Enter the date as YYYY-MM-DD.', { registrationValidTo: 'Invalid date' });
      next.registrationValidTo = b.registrationValidTo ? String(b.registrationValidTo) : null;
    }
    if (Array.isArray(b.adminHeadIds)) {
      const known = new Set(ctx.db.all('accountHeads').map((h) => h.id));
      next.adminHeadIds = [...new Set((b.adminHeadIds as unknown[]).map(String))].filter((id) => known.has(id));
    }
    if (b.openingBalance && typeof b.openingBalance === 'object') {
      const label = yearOf(ctx, String(b.openingBalance.year ?? '')).label;
      const amount = Number(b.openingBalance.amount);
      if (!Number.isFinite(amount) || amount < 0) throw new ApiError(422, 'invalid', 'Enter the opening balance.', { openingBalance: 'Invalid amount' });
      next.openingBalances = { ...st.openingBalances, [label]: Math.round(amount) };
    }
    saveState(ctx, next);
    ctx.audit('updated', 'compliance', 'main', 'Updated the FCRA guard settings');
    return complianceGuard(ctx, ctx.query.year);
  });

  r.post('/admin/compliance/donors', { perm: WRITE }, (ctx): ComplianceGuard => {
    guard(ctx);
    const b = ctx.body ?? {};
    const kind = KINDS.includes(b.kind) ? (b.kind as ForeignDonorKind) : null;
    if (!kind) throw new ApiError(422, 'invalid', 'Choose who the giver is.', { kind: 'Required' });
    const person = b.personId ? ctx.db.get('people', String(b.personId)) : null;
    if (b.personId && !person) throw new ApiError(404, 'not_found', 'That person was not found.');
    const name = person ? fullName(person) : clean(b.name, 120);
    if (!name) throw new ApiError(422, 'invalid', 'Enter the giver\'s name.', { name: 'Required' });
    const country = clean(b.country, 60);
    if (kind !== 'nri_indian' && !country) throw new ApiError(422, 'invalid', 'Enter the giver\'s country; FC-4 asks for it.', { country: 'Required' });
    const existing = foreignDonorFor(ctx, person?.id ?? null, person ? null : name);
    ctx.db.put('foreignDonors', { id: existing?.id ?? ctx.id('fg'), personId: person?.id ?? null, name, kind, country, note: clean(b.note, 300), by: ctx.staff?.name ?? 'Church office', at: ctx.now.toISOString() });
    ctx.audit(existing ? 'updated' : 'created', 'foreignDonor', existing?.id ?? name, `${name} marked as ${KIND_LABEL[kind]}`);
    return complianceGuard(ctx, ctx.query.year);
  });
  r.del('/admin/compliance/donors/:id', { perm: WRITE }, (ctx): ComplianceGuard => {
    guard(ctx);
    const f = ctx.db.get('foreignDonors', ctx.params[0]);
    if (!f) throw new ApiError(404, 'not_found', 'That giver is not on the list.');
    ctx.db.del('foreignDonors', f.id);
    ctx.audit('deleted', 'foreignDonor', f.id, `${f.name} taken off the foreign givers list`);
    return complianceGuard(ctx, ctx.query.year);
  });

  // Moves gifts to the FCRA side of the books, after the money itself has been put right.
  r.post('/admin/compliance/gifts/foreign', { perm: WRITE }, (ctx): ComplianceGuard => {
    guard(ctx);
    if (!settings(ctx).fcra.registered) throw new ApiError(422, 'fcra_not_registered', 'This church has no FCRA registration on record.');
    const ids: string[] = Array.isArray(ctx.body?.donationIds) ? (ctx.body.donationIds as unknown[]).map(String).slice(0, 500) : [];
    if (!ids.length) throw new ApiError(422, 'invalid', 'Choose the gifts to move.');
    let n = 0;
    for (const id of ids) {
      const d = ctx.db.get('donations', id);
      if (!d || d.fcra) continue;
      ctx.db.put('donations', { ...d, fcra: true, donorCitizenship: 'OTHER', pan: null });
      n++;
    }
    ctx.audit('updated', 'donation', ids[0], `Moved ${n} gift${n === 1 ? '' : 's'} to the FCRA account`);
    return complianceGuard(ctx, ctx.query.year);
  });

  r.post('/admin/compliance/dismiss', { perm: WRITE }, (ctx): ComplianceGuard => {
    guard(ctx);
    const id = clean(ctx.body?.id, 200);
    if (!id) throw new ApiError(422, 'invalid', 'Which warning?');
    if (!/^(bank:|local:)/.test(id)) throw new ApiError(422, 'invalid', 'This warning cannot be set aside; put the cause right instead.');
    const st = complianceState(ctx);
    saveState(ctx, { ...st, dismissed: [...new Set([...st.dismissed, id])].slice(-500) });
    ctx.audit('updated', 'compliance', id, 'Set aside an FCRA guard warning');
    return complianceGuard(ctx, ctx.query.year);
  });

  r.post('/admin/compliance/filed', { perm: WRITE }, (ctx): ComplianceGuard => {
    guard(ctx);
    const key = clean(ctx.body?.key, 60);
    if (!/^(fc4|10bd|10be|fcq|renew):/.test(key)) throw new ApiError(422, 'invalid', 'Which return?');
    const st = complianceState(ctx);
    saveState(ctx, { ...st, filed: { ...st.filed, [key]: { at: ctx.now.toISOString(), by: ctx.staff?.name ?? 'Church office', ack: clean(ctx.body?.ack, 80) } } });
    ctx.audit('updated', 'compliance', key, `Marked ${key} as filed`);
    return complianceGuard(ctx, ctx.query.year);
  });
  r.del('/admin/compliance/filed/:key', { perm: WRITE }, (ctx): ComplianceGuard => {
    guard(ctx);
    const st = complianceState(ctx);
    const filed = { ...st.filed };
    delete filed[decodeURIComponent(ctx.params[0])];
    saveState(ctx, { ...st, filed });
    return complianceGuard(ctx, ctx.query.year);
  });
}
