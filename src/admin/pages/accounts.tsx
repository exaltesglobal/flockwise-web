// Church accounts: budget against actual, expense requests with approval and payment vouchers,
// expense heads with budgets, and the Tally export.
import { Check, Download, FilePlus2, Landmark, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import type { AccountHead, Currency, ExpenseMethod, ExpenseStatus, ExpenseView, TallySettings } from '@/api/admin-types';
import { adminSession } from '@/api/client';
import { AdminApi } from '@/api/endpoints';
import { BarChart, Empty, ErrorState, Field, FormError, Loading, Modal, Segmented, useToast } from '@/components/ui';
import { formatDate, formatMoney, formatMoneyShort } from '@/lib/format';
import { useCan } from '@/lib/perms';
import { useSession } from '@/lib/session';
import { useAction, useApi } from '@/lib/use-api';

import { PageHeader } from '../layout';

type Tab = 'overview' | 'expenses' | 'budgets' | 'tally';
const METHODS: { value: ExpenseMethod; label: string }[] = [
  { value: 'bank_transfer', label: 'Bank transfer / NEFT' },
  { value: 'upi', label: 'UPI' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'cash', label: 'Cash' },
];
const STATUS: Record<ExpenseStatus, { label: string; badge: string }> = {
  submitted: { label: 'Waiting for approval', badge: 'warn' },
  approved: { label: 'Approved, to pay', badge: '' },
  rejected: { label: 'Turned down', badge: 'gray' },
  paid: { label: 'Paid', badge: 'ok' },
};
const today = () => new Date().toISOString().slice(0, 10);

/** Indian financial year starting in April. */
function fy(offset = 0) {
  const now = new Date();
  const start = (now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1) + offset;
  return { start: String(start), label: `${start}-${String(start + 1).slice(2)}`, from: `${start}-04-01`, to: `${start + 1}-03-31` };
}

function useCurrency() {
  return ((useSession(adminSession)?.church.currency ?? 'INR') as Currency);
}

export function AccountsPage() {
  const can = useCan();
  const finance = can('giving.view');
  const [tab, setTab] = useState<Tab>(finance ? 'overview' : 'expenses');
  const [creating, setCreating] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  return (
    <>
      <PageHeader
        title="Accounts"
        subtitle={finance ? 'Budget against actual, expense requests and payment vouchers, and export to Tally for your auditor.' : 'Ask the treasurer for money for your ministry, and follow your requests.'}
        actions={<button className="btn primary" onClick={() => setCreating(true)}><FilePlus2 size={16} /> {can('giving.edit') ? 'New expense' : 'Request money'}</button>}
      />
      {finance && (
        <div className="seg-scroll" style={{ marginBottom: 14 }}>
          <Segmented value={tab} onChange={setTab} options={[{ value: 'overview', label: 'Overview' }, { value: 'expenses', label: 'Expenses' }, { value: 'budgets', label: 'Heads & budgets' }, { value: 'tally', label: 'Tally export' }]} />
        </div>
      )}
      {tab === 'overview' && <Overview key={reloadKey} onOpenExpenses={() => setTab('expenses')} />}
      {tab === 'expenses' && <Expenses key={reloadKey} />}
      {tab === 'budgets' && <Budgets />}
      {tab === 'tally' && <Tally />}
      {creating && <ExpenseForm onClose={() => setCreating(false)} onSaved={() => { setCreating(false); setReloadKey((k) => k + 1); }} />}
    </>
  );
}

function Overview({ onOpenExpenses }: { onOpenExpenses: () => void }) {
  const currency = useCurrency();
  const [year, setYear] = useState<'0' | '-1'>('0');
  const y = fy(Number(year));
  const { data, error, reload } = useApi(() => AdminApi.accounts.summary(y.start), [year]);
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const m = (v: number) => formatMoney(v, currency);
  const net = data.totals.income - data.totals.expense;
  return (
    <div className="stack">
      <div className="row wrap" style={{ gap: 10 }}>
        <Segmented value={year} onChange={setYear} options={[{ value: '0', label: `FY ${fy(0).label}` }, { value: '-1', label: `FY ${fy(-1).label}` }]} />
      </div>
      <div className="stat-row">
        <div className="card mini-stat"><b>{m(data.totals.income)}</b><span>Income this year</span></div>
        <div className="card mini-stat"><b>{m(data.totals.expense)}</b><span>Expenses paid{data.totals.budget > 0 ? ` of ${m(data.totals.budget)} budget` : ''}</span></div>
        <div className="card mini-stat"><b className={net < 0 ? 'danger-text' : ''}>{m(Math.abs(net))}</b><span>{net >= 0 ? 'Surplus' : 'Deficit'} so far</span></div>
        <button className="card mini-stat" style={{ textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit' }} onClick={onOpenExpenses}><b>{m(data.totals.pendingApproval)}</b><span>Waiting for approval · Review →</span></button>
      </div>
      <div className="card">
        <div className="card-head"><h2>Month by month</h2><span className="small muted">Expenses paid</span></div>
        <div className="card-body"><BarChart data={data.months.map((x) => ({ label: new Date(`${x.month}-01`).toLocaleDateString('en-IN', { month: 'short' }), value: x.expense }))} format={(v) => formatMoneyShort(v, currency)} /></div>
      </div>
      <div className="grid cols-2" style={{ alignItems: 'start' }}>
        <div className="card table-wrap">
          <div className="card-head"><h2>Budget against actual</h2></div>
          <table className="table">
            <thead><tr><th>Head</th><th className="num">Budget</th><th className="num">Spent</th><th>Used</th></tr></thead>
            <tbody>
              {data.expenses.map((r) => {
                const pct = r.budget ? Math.round(((r.spent + r.committed) / r.budget) * 100) : null;
                return (
                  <tr key={r.headId}>
                    <td>{r.name}{r.committed > 0 && <div className="small muted">+ {formatMoneyShort(r.committed, currency)} approved</div>}</td>
                    <td className="num small">{r.budget ? formatMoneyShort(r.budget, currency) : '—'}</td>
                    <td className="num small">{formatMoneyShort(r.spent, currency)}</td>
                    <td style={{ minWidth: 90 }}>{pct === null ? <span className="small muted">No budget</span> : <div className="row" style={{ gap: 6 }}><div className={`progress grow ${pct > 100 ? 'over' : ''}`}><i style={{ width: `${Math.min(100, pct)}%` }} /></div><span className={`small ${pct > 100 ? 'danger-text' : ''}`}>{pct}%</span></div>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="card table-wrap">
          <div className="card-head"><h2>Income by fund</h2></div>
          {data.income.length === 0 ? <p className="small muted" style={{ padding: '0 16px 16px' }}>No gifts recorded this year.</p> : (
            <table className="table">
              <thead><tr><th>Fund</th><th className="num">Gifts</th><th className="num">Amount</th></tr></thead>
              <tbody>{data.income.map((r) => <tr key={r.fundId}><td>{r.name}</td><td className="num small">{r.gifts}</td><td className="num">{m(r.amount)}</td></tr>)}</tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function Expenses() {
  const can = useCan();
  const currency = useCurrency();
  const session = useSession(adminSession);
  const [status, setStatus] = useState<ExpenseStatus | 'all'>('all');
  const { data, error, reload } = useApi(() => AdminApi.expenses.list({ status: status === 'all' ? undefined : status }), [status]);
  const [open, setOpen] = useState<ExpenseView | null>(null);
  const approver = ['owner', 'admin', 'finance'].includes(session?.staff?.role ?? '');
  return (
    <div className="stack">
      <div className="seg-scroll">
        <Segmented value={status} onChange={setStatus} options={[{ value: 'all', label: 'All' }, { value: 'submitted', label: 'Waiting' }, { value: 'approved', label: 'To pay' }, { value: 'paid', label: 'Paid' }, { value: 'rejected', label: 'Turned down' }]} />
      </div>
      {error ? <ErrorState error={error} onRetry={reload} /> : !data ? <Loading /> : data.length === 0 ? (
        <div className="card"><Empty icon={<Landmark size={28} />} title="No expenses here" body={can('giving.view') ? 'Requests from ministry leaders and bills you record appear here.' : 'Ask for money for your ministry with “Request money”. You’ll see each request’s progress here.'} /></div>
      ) : (
        <div className="card table-wrap">
          <table className="table">
            <thead><tr><th>Date</th><th>Payee and purpose</th><th className="hide-sm">Head</th><th className="num">Amount</th><th>Status</th></tr></thead>
            <tbody>
              {data.map((e) => (
                <tr key={e.id} className="clickable" onClick={() => setOpen(e)}>
                  <td className="small nowrap">{formatDate(`${e.date}T12:00:00`)}</td>
                  <td><strong>{e.payee}</strong><div className="small muted">{e.description}</div></td>
                  <td className="small hide-sm">{e.headName}</td>
                  <td className="num nowrap">{formatMoney(e.amount, currency)}</td>
                  <td><span className={`badge ${STATUS[e.status].badge}`}>{STATUS[e.status].label}</span>{e.voucherNumber && <div className="small muted mono">{e.voucherNumber}</div>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open && <ExpenseDrawer e={open} approver={approver} mine={open.mine} onClose={() => setOpen(null)} onChanged={(next) => { setOpen(next); reload(); }} />}
    </div>
  );
}

function ExpenseDrawer({ e, approver, mine, onClose, onChanged }: { e: ExpenseView; approver: boolean; mine: boolean; onClose: () => void; onChanged: (e: ExpenseView | null) => void }) {
  const can = useCan();
  const toast = useToast();
  const currency = useCurrency();
  const [note, setNote] = useState('');
  const [pay, setPay] = useState({ method: 'bank_transfer' as ExpenseMethod, date: today(), reference: '' });
  const decide = useAction(AdminApi.expenses.decide);
  const doPay = useAction(AdminApi.expenses.pay);
  const remove = useAction(AdminApi.expenses.remove);
  return (
    <Modal side title={formatMoney(e.amount, currency)} onClose={onClose}>
      <div className="stack">
        <div>
          <span className={`badge ${STATUS[e.status].badge}`}>{STATUS[e.status].label}</span>
          <h3 style={{ margin: '8px 0 2px' }}>{e.payee}</h3>
          <div className="small">{e.description}</div>
        </div>
        <dl className="register-dl">
          <div><dt>Head</dt><dd>{e.headName}</dd></div>
          <div><dt>Date</dt><dd>{formatDate(`${e.date}T12:00:00`)}</dd></div>
          <div><dt>Asked by</dt><dd>{e.submittedBy} · {formatDate(e.submittedAt)}</dd></div>
          {e.decidedBy && <div><dt>{e.status === 'rejected' ? 'Turned down by' : 'Approved by'}</dt><dd>{e.decidedBy}{e.decisionNote ? `: ${e.decisionNote}` : ''}</dd></div>}
          {e.voucherNumber && <div><dt>Voucher</dt><dd className="mono">{e.voucherNumber}</dd></div>}
          {e.method && <div><dt>Paid by</dt><dd>{METHODS.find((x) => x.value === e.method)?.label}{e.reference ? ` · ${e.reference}` : ''}{e.fcra ? ' · FCRA account' : ''}</dd></div>}
          {e.billUrl && <div><dt>Bill</dt><dd><a href={e.billUrl} target="_blank" rel="noreferrer">Open bill</a></dd></div>}
        </dl>
        {e.status === 'submitted' && approver && !mine && (
          <div className="callout stack" style={{ gap: 8 }}>
            <strong className="small">Approve this request?</strong>
            <input className="input" value={note} onChange={(ev) => setNote(ev.target.value)} placeholder="Note (needed to turn it down)" />
            <FormError error={decide.error} />
            <div className="row" style={{ gap: 8 }}>
              <button className="btn primary sm" disabled={decide.busy} onClick={async () => { const r = await decide.run(e.id, true, note || undefined); if (r) { toast('Approved'); onChanged(r); } }}><Check size={15} /> Approve</button>
              <button className="btn ghost sm" disabled={decide.busy || !note.trim()} onClick={async () => { const r = await decide.run(e.id, false, note); if (r) onChanged(r); }}><X size={15} /> Turn down</button>
            </div>
          </div>
        )}
        {e.status === 'submitted' && mine && approver && <p className="small muted">Someone else approves your own requests.</p>}
        {e.status === 'approved' && can('giving.edit') && (
          <form className="callout stack" style={{ gap: 8 }} onSubmit={async (ev: FormEvent) => { ev.preventDefault(); const r = await doPay.run(e.id, { method: pay.method, date: pay.date, reference: pay.reference || undefined }); if (r) { toast(`Paid · ${r.voucherNumber}`); onChanged(r); } }}>
            <strong className="small">Record the payment</strong>
            <div className="grid cols-2">
              <select className="select" value={pay.method} onChange={(ev) => setPay({ ...pay, method: ev.target.value as ExpenseMethod })}>{METHODS.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</select>
              <input className="input" type="date" value={pay.date} max={today()} onChange={(ev) => setPay({ ...pay, date: ev.target.value })} />
            </div>
            {pay.method !== 'cash' && <input className="input" value={pay.reference} onChange={(ev) => setPay({ ...pay, reference: ev.target.value })} placeholder={pay.method === 'cheque' ? 'Cheque number' : 'UTR / transaction reference'} />}
            <FormError error={doPay.error} />
            <button className="btn primary sm" disabled={doPay.busy}>Mark paid</button>
          </form>
        )}
        {e.status !== 'paid' && (mine || can('giving.edit')) && (
          <button className="btn ghost sm" disabled={remove.busy} onClick={async () => { await remove.run(e.id); if (!remove.error) { toast('Request withdrawn'); onChanged(null); onClose(); } }}>Withdraw request</button>
        )}
      </div>
    </Modal>
  );
}

function ExpenseForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const can = useCan();
  const treasurer = can('giving.edit');
  const heads = useApi(AdminApi.accounts.heads);
  const [form, setForm] = useState({ headId: '', amount: '', payee: '', description: '', date: today(), method: 'bank_transfer' as ExpenseMethod, reference: '', billUrl: '', paid: treasurer, fcra: false });
  const save = useAction(() => AdminApi.expenses.create({ ...form, method: form.paid ? form.method : null, reference: form.reference || undefined, billUrl: form.billUrl || undefined }));
  const err = save.error?.fields ?? {};
  return (
    <Modal title={treasurer ? 'New expense' : 'Request money'} onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" form="expense-form" disabled={save.busy || !form.headId}>{save.busy ? 'Saving…' : form.paid ? 'Record payment' : 'Send request'}</button></>}>
      <form id="expense-form" className="stack" onSubmit={async (e) => { e.preventDefault(); if (await save.run()) onSaved(); }}>
        {treasurer && <Segmented value={form.paid ? 'paid' : 'request'} onChange={(v) => setForm({ ...form, paid: v === 'paid' })} options={[{ value: 'paid', label: 'Already paid' }, { value: 'request', label: 'Needs approval' }]} />}
        <div className="grid cols-2">
          <Field label="Head" error={err.headId}>
            <select className="select" value={form.headId} onChange={(e) => setForm({ ...form, headId: e.target.value })}>
              <option value="">Choose</option>
              {(heads.data ?? []).filter((h) => h.active).map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          </Field>
          <Field label="Amount (₹)" error={err.amount}><input className="input" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="12,500" /></Field>
          <Field label="Pay to" error={err.payee}><input className="input" value={form.payee} onChange={(e) => setForm({ ...form, payee: e.target.value })} placeholder="Shop, person or organisation" /></Field>
          <Field label="Date"><input className="input" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
        </div>
        <Field label="What is it for" error={err.description}><input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="e.g. Two microphones for the youth service" /></Field>
        <Field label="Link to the bill or quote (optional)" hint="A Google Drive or photo link"><input className="input" value={form.billUrl} onChange={(e) => setForm({ ...form, billUrl: e.target.value })} placeholder="https://" /></Field>
        {form.paid && (
          <div className="grid cols-2">
            <Field label="Paid by" error={err.method}><select className="select" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value as ExpenseMethod })}>{METHODS.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</select></Field>
            {form.method !== 'cash' && <Field label="Reference"><input className="input" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="UTR or cheque number" /></Field>}
          </div>
        )}
        {treasurer && <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={form.fcra} onChange={(e) => setForm({ ...form, fcra: e.target.checked })} /> Paid from the FCRA account</label>}
        <FormError error={save.error} />
      </form>
    </Modal>
  );
}

function Budgets() {
  const can = useCan();
  const currency = useCurrency();
  const toast = useToast();
  const y = fy(0);
  const { data, error, reload } = useApi(AdminApi.accounts.heads);
  const [edits, setEdits] = useState<Record<string, { budget?: string; tallyName?: string }>>({});
  const [newName, setNewName] = useState('');
  const save = useAction(async (h: AccountHead) => AdminApi.accounts.updateHead(h.id, { ...edits[h.id], fy: y.start }));
  const add = useAction(() => AdminApi.accounts.createHead({ name: newName.trim() }));
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const editable = can('giving.edit');
  return (
    <div className="stack">
      <div className="card table-wrap">
        <table className="table">
          <thead><tr><th>Expense head</th><th>Budget FY {y.label} (₹)</th><th className="hide-sm">Name in Tally</th><th /></tr></thead>
          <tbody>
            {data.map((h) => {
              const e = edits[h.id] ?? {};
              const dirty = e.budget !== undefined || e.tallyName !== undefined;
              return (
                <tr key={h.id}>
                  <td>{h.name}{!h.active && <span className="badge gray" style={{ marginLeft: 6 }}>Off</span>}</td>
                  <td>{editable ? <input className="input" style={{ maxWidth: 160 }} inputMode="decimal" value={e.budget ?? (h.budgets[y.label] ? String(h.budgets[y.label] / 100) : '')} onChange={(ev) => setEdits({ ...edits, [h.id]: { ...e, budget: ev.target.value } })} placeholder="0" /> : formatMoney(h.budgets[y.label] ?? 0, currency)}</td>
                  <td className="hide-sm">{editable ? <input className="input" value={e.tallyName ?? h.tallyName ?? ''} onChange={(ev) => setEdits({ ...edits, [h.id]: { ...e, tallyName: ev.target.value } })} placeholder={h.name} /> : h.tallyName ?? h.name}</td>
                  <td>{dirty && <button className="btn sm" disabled={save.busy} onClick={async () => { if (await save.run(h)) { const { [h.id]: _, ...rest } = edits; void _; setEdits(rest); reload(); toast('Saved'); } }}>Save</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <FormError error={save.error} />
      {editable && (
        <form className="row" style={{ gap: 8 }} onSubmit={async (e) => { e.preventDefault(); if (await add.run()) { setNewName(''); reload(); } }}>
          <input className="input grow" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Add an expense head, e.g. Pastor's housing" />
          <button className="btn" disabled={!newName.trim() || add.busy}>Add head</button>
        </form>
      )}
    </div>
  );
}

function Tally() {
  const can = useCan();
  const toast = useToast();
  const currency = useCurrency();
  const settings = useApi(AdminApi.accounts.tally);
  const funds = useApi(AdminApi.giving.funds);
  const [form, setForm] = useState<TallySettings | null>(null);
  const t = form ?? settings.data;
  const [range, setRange] = useState({ from: fy(0).from, to: today() });
  const [opts, setOpts] = useState({ gifts: true, expenses: true, ledgers: true, daily: false });
  const save = useAction(() => AdminApi.accounts.saveTally(form!));
  const exp = useAction(() => AdminApi.accounts.tallyExport({ ...range, gifts: opts.gifts ? undefined : '0', expenses: opts.expenses ? undefined : '0', ledgers: opts.ledgers ? undefined : '0', daily: opts.daily ? '1' : undefined }));
  const [last, setLast] = useState<{ receipts: number; payments: number; incomeTotal: number; expenseTotal: number } | null>(null);

  async function download() {
    const out = await exp.run();
    if (!out) return;
    const url = URL.createObjectURL(new Blob([out.xml], { type: 'application/xml' }));
    Object.assign(document.createElement('a'), { href: url, download: out.filename }).click();
    URL.revokeObjectURL(url);
    setLast(out);
  }

  if (settings.error) return <ErrorState error={settings.error} onRetry={settings.reload} />;
  if (!t) return <Loading />;
  const set = (k: keyof TallySettings, v: string) => setForm({ ...t, [k]: v });
  return (
    <div className="grid cols-2" style={{ alignItems: 'start' }}>
      <div className="card card-body stack">
        <h2>Export to Tally</h2>
        <p className="small muted">Download vouchers for Tally Prime, then in Tally choose Import › Vouchers and pick the file. Gifts become Receipt vouchers and paid expenses become Payment vouchers.</p>
        <div className="grid cols-2">
          <Field label="From"><input className="input" type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></Field>
          <Field label="To"><input className="input" type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></Field>
        </div>
        <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={opts.gifts} onChange={(e) => setOpts({ ...opts, gifts: e.target.checked })} /> Gifts and offerings</label>
        {opts.gifts && <label className="row small" style={{ gap: 6, marginLeft: 22 }}><input type="checkbox" checked={opts.daily} onChange={(e) => setOpts({ ...opts, daily: e.target.checked })} /> One voucher per day and fund instead of per gift</label>}
        <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={opts.expenses} onChange={(e) => setOpts({ ...opts, expenses: e.target.checked })} /> Paid expenses</label>
        <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={opts.ledgers} onChange={(e) => setOpts({ ...opts, ledgers: e.target.checked })} /> Create missing fund and expense ledgers</label>
        <FormError error={exp.error} />
        <button className="btn primary" disabled={exp.busy || (!opts.gifts && !opts.expenses)} onClick={download}><Download size={16} /> {exp.busy ? 'Preparing…' : 'Download Tally file'}</button>
        {last && <p className="small">Exported {last.receipts} receipts ({formatMoney(last.incomeTotal, currency)}) and {last.payments} payments ({formatMoney(last.expenseTotal, currency)}).</p>}
      </div>
      <div className="card card-body stack">
        <h2>Ledger names in Tally</h2>
        <p className="small muted">Use the exact names from your Tally company so the vouchers land in the right ledgers.</p>
        <Field label="Company name in Tally"><input className="input" value={t.companyName} disabled={!can('giving.edit')} onChange={(e) => set('companyName', e.target.value)} /></Field>
        <div className="grid cols-2">
          <Field label="Bank ledger"><input className="input" value={t.bankLedger} disabled={!can('giving.edit')} onChange={(e) => set('bankLedger', e.target.value)} /></Field>
          <Field label="Cash ledger"><input className="input" value={t.cashLedger} disabled={!can('giving.edit')} onChange={(e) => set('cashLedger', e.target.value)} /></Field>
          <Field label="FCRA bank ledger"><input className="input" value={t.fcraBankLedger} disabled={!can('giving.edit')} onChange={(e) => set('fcraBankLedger', e.target.value)} /></Field>
          <Field label="Group for fund ledgers"><input className="input" value={t.incomeGroup} disabled={!can('giving.edit')} onChange={(e) => set('incomeGroup', e.target.value)} /></Field>
        </div>
        {(funds.data ?? []).length > 0 && (
          <div className="stack" style={{ gap: 6 }}>
            <span className="small upper muted">Fund ledgers</span>
            {funds.data!.map((f) => (
              <div key={f.id} className="row" style={{ gap: 8 }}>
                <span className="small" style={{ width: '40%', minWidth: 0 }}>{f.name}</span>
                <input className="input grow" value={t.fundLedgers[f.id] ?? ''} placeholder={f.name} disabled={!can('giving.edit')} onChange={(e) => setForm({ ...t, fundLedgers: { ...t.fundLedgers, [f.id]: e.target.value } })} />
              </div>
            ))}
          </div>
        )}
        <FormError error={save.error} />
        {can('giving.edit') && <button className="btn" disabled={!form || save.busy} onClick={async () => { const r = await save.run(); if (r) { setForm(null); settings.reload(); toast('Ledger names saved'); } }}>Save ledger names</button>}
      </div>
    </div>
  );
}
