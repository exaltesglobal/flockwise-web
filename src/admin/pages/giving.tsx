import { Camera, Download, FileText, Gift, Pencil, PenLine, Plus, Printer, RotateCcw, Search, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';

import type { AdminDonation, AdminFund, DonationQuery, FundInput, OfflineDonationInput, PaymentMethod } from '@/api/admin-types';
import { adminSession } from '@/api/client';
import { AdminApi } from '@/api/endpoints';
import type { Currency } from '@/api/types';
import type { BatchView, RecurringStatus } from '@/core/types';
import { Empty, ErrorState, Field, FormError, Loading, Modal, Segmented, useToast } from '@/components/ui';
import { downloadCsv, formatDate, formatMoney, formatNumber } from '@/lib/format';
import { shrinkPhoto } from '@/lib/photo';
import { useSession } from '@/lib/session';
import { useCan } from '@/lib/perms';
import { printHtml, statementHtml } from '@/lib/print';
import { useAction, useApi } from '@/lib/use-api';

import { PersonField, type PickedPerson } from '../components/person-picker';

import { PageHeader } from '../layout';

const METHOD: Record<PaymentMethod, string> = { upi: 'UPI', card: 'Card', netbanking: 'Netbanking', wallet: 'Wallet', cash: 'Cash', cheque: 'Cheque', bank_transfer: 'Bank transfer' };
const STATUS_TONE = { succeeded: 'ok', pending: 'warn', failed: 'danger', refunded: 'gray' } as const;

type Tab = 'donations' | 'monthly' | 'batches' | 'funds' | 'pledges' | 'receipts';

/** Indian financial year (1 April – 31 March) as YYYY-MM-DD bounds. */
function fiscalYear(offset = 0) {
  const now = new Date();
  const start = (now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1) + offset;
  return { label: `FY ${start}-${String(start + 1).slice(2)}`, from: `${start}-04-01`, to: `${start + 1}-03-31` };
}

function ranges() {
  const now = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return {
    month: { label: 'This month', from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(now) },
    last30: { label: 'Last 30 days', from: iso(new Date(now.getTime() - 30 * 86400000)), to: iso(now) },
    fy: { ...fiscalYear(), label: `This financial year` },
    all: { label: 'All time', from: '', to: '' },
  };
}

export function GivingPage() {
  const [tab, setTab] = useState<Tab>('donations');
  const funds = useApi(AdminApi.giving.funds);
  const currency = (adminSession.get()?.church.currency ?? 'INR') as Currency;
  const isIndia = adminSession.get()?.church.country === 'IN';

  return (
    <>
      <PageHeader title="Giving" subtitle="Online gifts arrive automatically from Razorpay or Stripe. Record cash and cheques here too." />
      <div>
        <Segmented value={tab} onChange={setTab} options={[
          { value: 'donations', label: 'Donations' },
          { value: 'monthly', label: 'Monthly gifts' },
          { value: 'batches', label: 'Batches' },
          { value: 'funds', label: 'Funds' },
          { value: 'pledges', label: 'Pledges' },
          ...(isIndia ? [{ value: 'receipts' as Tab, label: '80G receipts' }] : []),
        ]} />
      </div>
      {tab === 'donations' && <Donations funds={funds.data ?? []} currency={currency} onChanged={funds.reload} />}
      {tab === 'monthly' && <MonthlyGifts currency={currency} />}
      {tab === 'batches' && <Batches funds={funds.data ?? []} currency={currency} />}
      {tab === 'funds' && <Funds funds={funds} currency={currency} />}
      {tab === 'pledges' && <Pledges funds={funds.data ?? []} currency={currency} />}
      {tab === 'receipts' && <Receipts currency={currency} />}
    </>
  );
}

function Donations({ funds, currency, onChanged }: { funds: AdminFund[]; currency: Currency; onChanged: () => void }) {
  const R = useMemo(ranges, []);
  const [range, setRange] = useState<keyof typeof R>('month');
  const [fundId, setFundId] = useState('');
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [extra, setExtra] = useState<AdminDonation[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [statementFor, setStatementFor] = useState<string | null>(null);
  const toast = useToast();
  const can = useCan();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  const query: DonationQuery = { fundId, q: debounced, from: R[range].from, to: R[range].to };
  const list = useApi(async () => {
    const p = await AdminApi.giving.donations(query);
    setExtra([]);
    setCursor(p.nextCursor);
    return p;
  }, [range, fundId, debounced]);
  const rows = [...(list.data?.data ?? []), ...extra];

  async function more() {
    if (!cursor) return;
    const p = await AdminApi.giving.donations({ ...query, cursor });
    setExtra((e) => [...e, ...p.data]);
    setCursor(p.nextCursor);
  }

  async function exportCsv() {
    const all: AdminDonation[] = [];
    let next: string | null | undefined;
    do {
      const p = await AdminApi.giving.donations({ ...query, cursor: next ?? undefined });
      all.push(...p.data);
      next = p.nextCursor;
    } while (next);
    downloadCsv(`flockwise-donations-${R[range].from || 'all'}-${R[range].to || 'time'}.csv`, [
      ['Date', 'Donor', 'Fund', 'Amount', 'Currency', 'Method', 'Frequency', 'Status', 'PAN', 'Citizenship', 'FCRA account'],
      ...all.map((d) => [d.createdAt.slice(0, 10), d.donorName, d.fundName, (d.amount / 100).toFixed(2), d.currency, METHOD[d.method], d.frequency, d.status, d.pan, d.donorCitizenship, d.fcra ? 'Yes' : 'No']),
    ]);
    toast(`Exported ${all.length} donations`);
  }

  return (
    <>
      <div className="grid cols-3">
        <div className="card kpi">
          <span className="label">Total received · {R[range].label.toLowerCase()}</span>
          <span className="value">{list.data ? formatMoney(list.data.totalAmount, currency) : '…'}</span>
        </div>
        <div className="card kpi">
          <span className="label">Gifts</span>
          <span className="value">{list.data ? formatNumber(list.data.total) : '…'}</span>
        </div>
        <div className="card kpi">
          <span className="label">Average gift</span>
          <span className="value">{list.data && list.data.total ? formatMoney(Math.round(list.data.totalAmount / list.data.total / 100) * 100, currency) : '…'}</span>
        </div>
      </div>
      <div className="card">
        <div className="toolbar">
          <div className="search">
            <Search size={16} />
            <input className="input" placeholder="Search donor, PAN or receipt no." value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select className="select" style={{ width: 180 }} value={range} onChange={(e) => setRange(e.target.value as keyof typeof R)}>
            {Object.entries(R).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select className="select" style={{ width: 190 }} value={fundId} onChange={(e) => setFundId(e.target.value)}>
            <option value="">All funds</option>
            {funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <div className="grow" />
          <button className="btn" onClick={exportCsv}><Download size={16} /> Export</button>
          {can('giving.edit') && <button className="btn primary" onClick={() => setRecording(true)}><Plus size={16} /> Record cash or cheque</button>}
        </div>
        {list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : !list.data ? <Loading /> : rows.length === 0 ? (
          <Empty icon={<Gift size={32} />} title="No gifts in this period" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Date</th><th>Donor</th><th>Fund</th><th>Method</th><th>Receipt</th><th>Status</th><th className="num">Amount</th><th /></tr></thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={d.id}>
                    <td className="small" style={{ whiteSpace: 'nowrap' }}>{formatDate(d.createdAt)}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{d.donorId ? <button className="link-btn" style={{ color: 'var(--text)' }} title="Giving statement" onClick={() => setStatementFor(d.donorId)}>{d.donorName}</button> : d.donorName}</div>
                      <div className="small muted">{d.pan ? <span className="mono">{d.pan}</span> : 'No PAN'}{d.fcra && <span className="badge warn" style={{ marginLeft: 6 }}>FCRA</span>}</div>
                    </td>
                    <td className="small">{d.fundName}{d.frequency === 'monthly' && <span className="badge gray" style={{ marginLeft: 6 }}>Monthly</span>}</td>
                    <td className="small">{METHOD[d.method]}</td>
                    <td className="mono small">{d.receiptNumber ?? <span className="muted">—</span>}</td>
                    <td><span className={`badge ${STATUS_TONE[d.status]}`}>{d.status}</span></td>
                    <td className="num" style={{ fontWeight: 600 }}>{formatMoney(d.amount, d.currency)}</td>
                    <td style={{ textAlign: 'right' }}>
                      {can('giving.edit') && d.status === 'succeeded' && <button className="btn ghost icon sm" title="Mark refunded" onClick={async () => {
                        if (!confirm(`Mark the ${formatMoney(d.amount, d.currency)} gift from ${d.donorName} as refunded? Refund the money in Razorpay or by bank first.`)) return;
                        await AdminApi.giving.refund(d.id);
                        toast('Marked refunded');
                        list.reload();
                        onChanged();
                      }}><RotateCcw size={15} /></button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {cursor && <div style={{ padding: 16, textAlign: 'center', borderTop: '1px solid var(--border)' }}><button className="btn" onClick={more}>Load more</button></div>}
      </div>
      {statementFor && <StatementModal personId={statementFor} onClose={() => setStatementFor(null)} />}
      {recording && <OfflineGiftForm funds={funds.filter((f) => f.active)} currency={currency} onClose={() => setRecording(false)} onSaved={() => { setRecording(false); list.reload(); onChanged(); toast('Gift recorded'); }} />}
    </>
  );
}

function OfflineGiftForm({ funds, currency, onClose, onSaved, batch }: { funds: AdminFund[]; currency: Currency; onClose: () => void; onSaved: () => void; batch?: { id: string; name: string } }) {
  const [donorName, setDonorName] = useState('');
  const [donorId, setDonorId] = useState<string | null>(null);
  const [matches, setMatches] = useState<{ id: string; name: string }[]>([]);
  const [fundId, setFundId] = useState(funds[0]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<OfflineDonationInput['method']>('cash');
  const [pan, setPan] = useState('');
  const [foreign, setForeign] = useState(false);
  const [receivedAt, setReceivedAt] = useState(new Date().toISOString().slice(0, 10));
  const save = useAction(AdminApi.giving.recordOffline);
  const amt = Math.round(Number(amount) * 100);
  const cashOver2k = currency === 'INR' && method === 'cash' && amt > 200000;

  useEffect(() => {
    if (donorId || donorName.trim().length < 2) return setMatches([]);
    const t = setTimeout(async () => {
      const p = await AdminApi.people.list({ q: donorName });
      setMatches(p.data.slice(0, 5).map((x) => ({ id: x.id, name: `${x.firstName} ${x.lastName}` })));
    }, 200);
    return () => clearTimeout(t);
  }, [donorName, donorId]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const r = await save.run({ donorId, donorName: donorName.trim(), fundId, amount: amt, method, pan: pan.trim().toUpperCase() || undefined, donorCitizenship: foreign ? 'OTHER' : 'IN', receivedAt, batchId: batch?.id ?? null });
    if (!r) return;
    if (batch) {
      // Batch entry: stay open for the next envelope.
      setDonorName(''); setDonorId(null); setAmount(''); setPan(''); setForeign(false);
    }
    onSaved();
  }

  return (
    <Modal title={batch ? `Add to ${batch.name}` : 'Record a cash or cheque gift'} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>{batch ? 'Done' : 'Cancel'}</button><button className="btn primary" form="gift-form" disabled={save.busy || !donorName.trim() || !amt}>{batch ? 'Save and add another' : 'Save gift'}</button></>}
    >
      <form id="gift-form" className="stack" onSubmit={onSubmit}>
        <FormError error={save.error} />
        <Field label="Donor" hint={donorId ? 'Linked to their Flockwise profile' : 'Start typing to find someone, or enter any name'}>
          <input className="input" autoFocus value={donorName} onChange={(e) => { setDonorName(e.target.value); setDonorId(null); }} />
        </Field>
        {matches.length > 0 && (
          <div className="row wrap" style={{ gap: 6, marginTop: -4 }}>
            {matches.map((m) => <button type="button" key={m.id} className="btn sm" onClick={() => { setDonorName(m.name); setDonorId(m.id); setMatches([]); }}>{m.name}</button>)}
          </div>
        )}
        <div className="grid cols-2">
          <Field label="Fund">
            <select className="select" value={fundId} onChange={(e) => setFundId(e.target.value)}>{funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
          </Field>
          <Field label={`Amount (${currency})`}><input className="input" type="number" min={1} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <Field label="Method">
            <select className="select" value={method} onChange={(e) => setMethod(e.target.value as OfflineDonationInput['method'])}>
              <option value="cash">Cash</option><option value="cheque">Cheque</option><option value="bank_transfer">Bank transfer</option>
            </select>
          </Field>
          <Field label="Date received"><input className="input" type="date" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} /></Field>
        </div>
        {currency === 'INR' && (
          <>
            <Field label="PAN (for 80G receipt)" hint="Optional"><input className="input mono" maxLength={10} value={pan} onChange={(e) => setPan(e.target.value.toUpperCase())} placeholder="ABCDE1234F" /></Field>
            {cashOver2k && <div className="alert warn">Cash gifts above ₹2,000 are not eligible for an 80G deduction. You can still record it.</div>}
            <label className="check">
              <input type="checkbox" checked={foreign} onChange={(e) => setForeign(e.target.checked)} />
              <span>Donor is a foreign citizen or OCI holder <span className="small muted">(must go to the FCRA account)</span></span>
            </label>
          </>
        )}
      </form>
    </Modal>
  );
}

function Funds({ funds, currency }: { funds: ReturnType<typeof useApi<AdminFund[]>>; currency: Currency }) {
  const [editing, setEditing] = useState<AdminFund | 'new' | null>(null);
  const toast = useToast();
  if (funds.error) return <ErrorState error={funds.error} onRetry={funds.reload} />;
  if (!funds.data) return <Loading />;
  return (
    <>
      <div className="row between">
        <p className="muted small">Raised figures are for the current financial year.</p>
        <button className="btn primary" onClick={() => setEditing('new')}><Plus size={16} /> New fund</button>
      </div>
      <div className="grid cols-3">
        {funds.data.map((f) => (
          <div key={f.id} className="card card-pad stack" style={{ opacity: f.active ? 1 : 0.6 }}>
            <div className="row between" style={{ alignItems: 'flex-start' }}>
              <h3>{f.name}</h3>
              <button className="btn ghost icon sm" onClick={() => setEditing(f)} title="Edit"><Pencil size={15} /></button>
            </div>
            <p className="small muted">{f.description}</p>
            <div className="row" style={{ gap: 6 }}>
              {f.active ? <span className="badge ok">Active</span> : <span className="badge gray">Closed</span>}
              {f.taxDeductible && currency === 'INR' && <span className="badge">80G</span>}
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-heading)', fontSize: 22, fontWeight: 600 }}>{formatMoney(f.raisedThisYear, currency)}</div>
              {f.goal ? (
                <>
                  <div className="progress" style={{ margin: '8px 0 4px' }}><i style={{ width: `${Math.min(100, (f.raisedThisYear / f.goal) * 100)}%` }} /></div>
                  <span className="small muted">{Math.round((f.raisedThisYear / f.goal) * 100)}% of {formatMoney(f.goal, currency)} goal</span>
                </>
              ) : <span className="small muted">raised this year</span>}
              {f.pledged > 0 && <div className="small muted">{formatMoney(f.pledged, currency)} pledged</div>}
            </div>
          </div>
        ))}
      </div>
      {editing && <FundForm fund={editing === 'new' ? null : editing} currency={currency} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); funds.reload(); toast('Saved'); }} />}
    </>
  );
}

function FundForm({ fund, currency, onClose, onSaved }: { fund: AdminFund | null; currency: Currency; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<FundInput>({ name: fund?.name ?? '', description: fund?.description ?? '', taxDeductible: fund?.taxDeductible ?? true, active: fund?.active ?? true, goal: fund?.goal ?? null });
  const save = useAction((input: FundInput) => (fund ? AdminApi.giving.updateFund(fund.id, input) : AdminApi.giving.createFund(input)));
  const set = <K extends keyof FundInput>(k: K, v: FundInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <Modal title={fund ? 'Edit fund' : 'New fund'} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={save.busy || !form.name.trim()} onClick={async () => { if (await save.run(form)) onSaved(); }}>Save</button></>}
    >
      <div className="stack">
        <FormError error={save.error} />
        <Field label="Name"><input className="input" autoFocus value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Building Fund" /></Field>
        <Field label="Description" hint="Shown to members when they give"><input className="input" value={form.description} onChange={(e) => set('description', e.target.value)} /></Field>
        <Field label={`Goal (${currency})`} hint="Optional. Shows a progress bar."><input className="input" type="number" min={0} value={form.goal ? form.goal / 100 : ''} onChange={(e) => set('goal', e.target.value ? Math.round(Number(e.target.value) * 100) : null)} /></Field>
        {currency === 'INR' && (
          <label className="check"><input type="checkbox" checked={form.taxDeductible} onChange={(e) => set('taxDeductible', e.target.checked)} /><span>Eligible for 80G tax deduction</span></label>
        )}
        <label className="check"><input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} /><span>Active <span className="small muted">(members can give to it)</span></span></label>
      </div>
    </Modal>
  );
}

function Receipts({ currency }: { currency: Currency }) {
  const years = [fiscalYear(0), fiscalYear(-1)];
  const [fy, setFy] = useState(0);
  const report = useApi(() => AdminApi.giving.receipts80g(years[fy].from.slice(0, 4) + '-' + years[fy].to.slice(2, 4)), [fy]);
  const toast = useToast();
  const [statementFor, setStatementFor] = useState<string | null>(null);
  const donors = report.data?.donors ?? [];
  const withPan = donors.filter((d) => d.pan);

  return (
    <div className="stack lg">
      <div className="alert info">
        <Gift size={16} />
        <span>
          Indian churches with 80G registration must file <b>Form 10BD</b> by 31 May listing donors, then issue each donor a <b>Form 10BE</b> certificate.
          This list excludes FCRA gifts, non-80G funds and cash gifts above ₹2,000. Check the export against the Income Tax portal template before filing.
        </span>
      </div>
      <div className="card">
        <div className="toolbar">
          <select className="select" style={{ width: 160 }} value={fy} onChange={(e) => setFy(Number(e.target.value))}>
            {years.map((y, i) => <option key={y.label} value={i}>{y.label}</option>)}
          </select>
          <span className="small muted">{withPan.length} donors with PAN · {donors.length - withPan.length} without PAN (cannot be reported)</span>
          <div className="grow" />
          <button className="btn" disabled={!withPan.length} onClick={() => {
            downloadCsv(`form-10bd-${years[fy].label.replace(/\s/g, '-')}.csv`, [
              ['Sr. No.', 'Unique Identification Number', 'ID Code', 'Section Code', 'Name of donor', 'Donation Type', 'Mode of receipt', 'Amount of donation (INR)'],
              ...withPan.map((d, i) => [i + 1, d.pan, 'PAN', 'Section 80G', d.name, 'Others', d.modes.every((m) => m === 'cash') ? 'Cash' : 'Electronic modes including account payee cheque/draft', (d.total / 100).toFixed(2)]),
            ]);
            toast('Form 10BD data exported');
          }}><Download size={16} /> Export Form 10BD data</button>
        </div>
        {report.error ? <ErrorState error={report.error} onRetry={report.reload} /> : !report.data ? <Loading /> : donors.length === 0 ? <Empty title="No 80G-eligible gifts in this year" /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Donor</th><th>PAN</th><th className="num">Gifts</th><th>Modes</th><th className="num">Total</th></tr></thead>
              <tbody>
                {donors.slice(0, 200).map((d, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{d.donorId ? <button className="link-btn" style={{ color: 'var(--text)' }} onClick={() => setStatementFor(d.donorId)}>{d.name}</button> : d.name}</td>
                    <td>{d.pan ? <span className="mono">{d.pan}</span> : <span className="badge warn">Missing</span>}</td>
                    <td className="num">{d.count}</td>
                    <td className="small">{d.modes.map((m) => METHOD[m]).join(', ')}</td>
                    <td className="num" style={{ fontWeight: 600 }}>{formatMoney(d.total, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {statementFor && <StatementModal personId={statementFor} financialYear={years[fy].from.slice(0, 4) + '-' + years[fy].to.slice(2, 4)} onClose={() => setStatementFor(null)} />}
    </div>
  );
}

export function StatementModal({ personId, financialYear, onClose }: { personId: string; financialYear?: string; onClose: () => void }) {
  const { data, error, reload } = useApi(() => AdminApi.giving.statement(personId, financialYear), [personId, financialYear]);
  return (
    <Modal title={data ? `${data.donor.name} · FY ${data.financialYear}` : 'Giving statement'} onClose={onClose}
      footer={data && <button className="btn primary" onClick={() => printHtml(`Statement ${data.donor.name}`, statementHtml(data))}><Printer size={15} /> Print or save PDF</button>}
    >
      {error ? <ErrorState error={error} onRetry={reload} /> : !data ? <Loading /> : (
        <div className="stack">
          <div className="stat-row">
            <div className="card mini-stat"><b>{formatMoney(data.total, data.currency)}</b><span>{data.gifts.length} gifts</span></div>
            <div className="card mini-stat"><b>{formatMoney(data.eligible80g, data.currency)}</b><span>Eligible for 80G</span></div>
          </div>
          {data.donor.pan ? <span className="small muted">PAN <span className="mono">{data.donor.pan}</span></span> : <div className="alert warn">No PAN on file. The donor needs to give a PAN to claim 80G.</div>}
          {data.gifts.length === 0 ? <Empty icon={<FileText size={28} />} title="No gifts in this financial year" /> : (
            <div className="table-wrap card">
              <table className="table">
                <thead><tr><th>Date</th><th>Receipt</th><th>Fund</th><th className="num">Amount</th></tr></thead>
                <tbody>{data.gifts.map((g) => <tr key={g.id}><td className="small">{formatDate(g.date)}</td><td className="mono small">{g.receiptNumber ?? '—'}</td><td className="small">{g.fundName}{!g.eligible80g && <span className="badge gray" style={{ marginLeft: 6 }}>not 80G</span>}</td><td className="num">{formatMoney(g.amount, data.currency)}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

const RG: Record<RecurringStatus, [string, string]> = {
  pending: ['Waiting for approval', 'gray'],
  active: ['Active', 'ok'],
  failing: ['Payment failing', 'warn'],
  paused: ['Paused', 'gray'],
  halted: ['Stopped: payments failed', 'danger'],
  cancelled: ['Cancelled', 'gray'],
  completed: ['Completed', 'ok'],
};

/** Monthly gifts on UPI AutoPay, card or e-mandate (Razorpay subscriptions). */
function MonthlyGifts({ currency }: { currency: Currency }) {
  const [status, setStatus] = useState('');
  const q = useApi(() => AdminApi.giving.recurring(status || undefined), [status]);
  const cancel = useAction(AdminApi.giving.cancelRecurring);
  const can = useCan();
  const toast = useToast();
  const sum = q.data?.summary;
  return (
    <>
      {sum && (
        <div className="grid cols-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
          <div className="card kpi"><span className="label">Active monthly givers</span><span className="value">{formatNumber(sum.active)}</span></div>
          <div className="card kpi"><span className="label">Comes in each month</span><span className="value">{formatMoney(sum.monthly, currency)}</span><span className="delta muted">{formatMoney(sum.monthly * 12, currency)} a year</span></div>
          <button className="card kpi" style={{ textAlign: 'left', font: 'inherit', color: 'inherit', cursor: 'pointer' }} onClick={() => setStatus('attention')}><span className="label">Payments failing</span><span className="value">{sum.failing}</span><span className="delta muted">Show them →</span></button>
          <button className="card kpi" style={{ textAlign: 'left', font: 'inherit', color: 'inherit', cursor: 'pointer' }} onClick={() => setStatus('pending')}><span className="label">Not approved yet</span><span className="value">{sum.pending}</span><span className="delta muted">Started but never approved</span></button>
        </div>
      )}
      <div className="card">
        <div className="toolbar">
          <div className="seg-scroll">
            <Segmented value={status} onChange={setStatus} options={[{ value: '', label: 'All' }, { value: 'active', label: 'Active' }, { value: 'attention', label: 'Needs attention' }, { value: 'paused', label: 'Paused' }, { value: 'pending', label: 'Not approved' }, { value: 'cancelled', label: 'Cancelled' }]} />
          </div>
          <div className="grow" />
          <span className="small muted hide-sm">Givers approve once in their UPI app, by card or by bank e-mandate. They can pause or stop it from the member app.</span>
        </div>
        <FormError error={cancel.error} />
        {q.error ? <ErrorState error={q.error} onRetry={q.reload} /> : !q.data ? <Loading /> : q.data.rows.length === 0 ? <Empty icon={<Gift size={32} />} title="No monthly gifts here" body="When members choose Monthly on the give page, their gifts appear here." /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Giver</th><th>Fund</th><th className="num">Each month</th><th>Status</th><th className="hide-sm">Given so far</th><th className="hide-sm">Next</th><th /></tr></thead>
              <tbody>
                {q.data.rows.map((g) => (
                  <tr key={g.id}>
                    <td style={{ fontWeight: 600 }}>{g.donorName}{g.pledgeId && <div className="small muted">Paying a pledge{g.totalCount ? ` · ${g.chargedCount} of ${g.totalCount}` : ''}</div>}</td>
                    <td className="small">{g.fundName}</td>
                    <td className="num nowrap" style={{ fontWeight: 600 }}>{formatMoney(g.amount, g.currency)}</td>
                    <td><span className={`badge ${RG[g.status][1]}`}>{RG[g.status][0]}</span>{g.method && <div className="small muted">{METHOD[g.method]}</div>}</td>
                    <td className="small hide-sm">{formatMoney(g.totalGiven, g.currency)} · {g.chargedCount} {g.chargedCount === 1 ? 'gift' : 'gifts'}</td>
                    <td className="small muted hide-sm nowrap">{g.nextChargeAt && (g.status === 'active' || g.status === 'failing') ? formatDate(g.nextChargeAt) : '—'}</td>
                    <td style={{ textAlign: 'right' }}>{can('giving.edit') && !['cancelled', 'completed'].includes(g.status) && <button className="btn ghost sm" disabled={cancel.busy} onClick={async () => { if (!confirm(`Stop ${g.donorName}'s monthly gift? Razorpay will take no more money.`)) return; if (await cancel.run(g.id)) { toast('Monthly gift stopped'); q.reload(); } }}>Stop</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function Pledges({ funds, currency }: { funds: AdminFund[]; currency: Currency }) {
  const list = useApi(AdminApi.giving.pledges);
  const [adding, setAdding] = useState(false);
  const toast = useToast();
  const can = useCan();
  const rows = list.data ?? [];
  const pledged = rows.reduce((s, p) => s + p.amount, 0);
  const given = rows.reduce((s, p) => s + Math.min(p.given, p.amount), 0);
  return (
    <>
      <div className="grid cols-3">
        <div className="card kpi"><span className="label">Pledged</span><span className="value">{formatMoney(pledged, currency)}</span></div>
        <div className="card kpi"><span className="label">Given towards pledges</span><span className="value">{formatMoney(given, currency)}</span></div>
        <div className="card kpi"><span className="label">Fulfilled</span><span className="value">{pledged ? Math.round((given / pledged) * 100) : 0}%</span></div>
      </div>
      <div className="card">
        <div className="toolbar">
          <span className="small muted">Members can pledge from the app. Gifts to the same fund between the start and end dates count towards a pledge.</span>
          <div className="grow" />
          {can('giving.edit') && <button className="btn primary" onClick={() => setAdding(true)}><Plus size={16} /> Record pledge</button>}
        </div>
        {list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : !list.data ? <Loading /> : rows.length === 0 ? <Empty icon={<Gift size={32} />} title="No pledges yet" body="Use pledges for building campaigns and faith promises." /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Person</th><th>Fund</th><th>Period</th><th style={{ width: 220 }}>Progress</th><th className="num">Pledged</th><th /></tr></thead>
              <tbody>
                {rows.map((p) => {
                  const pct = Math.min(100, Math.round((p.given / p.amount) * 100));
                  return (
                    <tr key={p.id}>
                      <td style={{ fontWeight: 600 }}>{p.personName}{p.autopay && <div><span className={`badge ${RG[p.autopay.status][1]}`}>AutoPay {formatMoney(p.autopay.amount, p.currency)}/mo · {RG[p.autopay.status][0].toLowerCase()}</span></div>}</td>
                      <td className="small">{p.fundName}</td>
                      <td className="small muted">{formatDate(p.startDate)} – {formatDate(p.endDate)}</td>
                      <td><div className="progress"><i style={{ width: `${pct}%`, background: pct >= 100 ? 'var(--ok)' : undefined }} /></div><span className="small muted">{formatMoney(p.given, p.currency)} · {pct}%</span></td>
                      <td className="num" style={{ fontWeight: 600 }}>{formatMoney(p.amount, p.currency)}</td>
                      <td style={{ textAlign: 'right' }}>{can('giving.edit') && <button className="btn ghost icon sm danger" title="Remove" onClick={async () => { if (!confirm('Remove this pledge?')) return; await AdminApi.giving.removePledge(p.id); toast('Removed'); list.reload(); }}><Trash2 size={15} /></button>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {adding && <PledgeForm funds={funds.filter((f) => f.active)} currency={currency} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); list.reload(); toast('Pledge recorded'); }} />}
    </>
  );
}

function PledgeForm({ funds, currency, onClose, onSaved }: { funds: AdminFund[]; currency: Currency; onClose: () => void; onSaved: () => void }) {
  const [person, setPerson] = useState<PickedPerson | null>(null);
  const [fundId, setFundId] = useState(funds[0]?.id ?? '');
  const [amount, setAmount] = useState('');
  const today = new Date().toISOString().slice(0, 10);
  const [startDate, setStart] = useState(today);
  const [endDate, setEnd] = useState(`${new Date().getFullYear() + 1}-03-31`);
  const save = useAction(AdminApi.giving.createPledge);
  const amt = Math.round(Number(amount) * 100);
  return (
    <Modal title="Record a pledge" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={save.busy || !person || !amt} onClick={async () => { if (await save.run({ personId: person!.id, fundId, amount: amt, startDate, endDate })) onSaved(); }}>Save</button></>}
    >
      <div className="stack">
        <FormError error={save.error} />
        <Field label="Person"><PersonField value={person} onChange={setPerson} /></Field>
        <div className="grid cols-2">
          <Field label="Fund"><select className="select" value={fundId} onChange={(e) => setFundId(e.target.value)}>{funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></Field>
          <Field label={`Total pledged (${currency})`}><input className="input" type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <Field label="Starts"><input className="input" type="date" value={startDate} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field label="Complete by"><input className="input" type="date" value={endDate} onChange={(e) => setEnd(e.target.value)} /></Field>
        </div>
      </div>
    </Modal>
  );
}

function Batches({ funds, currency }: { funds: AdminFund[]; currency: Currency }) {
  const { data, error, reload } = useApi(AdminApi.batches.list);
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const can = useCan();
  const toast = useToast();
  if (open) return <BatchDetail id={open} funds={funds} currency={currency} onBack={() => { setOpen(null); reload(); }} />;
  return (
    <div className="card">
      <div className="toolbar">
        <span className="small muted grow">Count Sunday's cash and cheques together, check the total, then commit the batch so it can't change.</span>
        {can('giving.edit') && <button className="btn primary" onClick={() => setCreating(true)}><Plus size={16} /> New batch</button>}
      </div>
      {error ? <ErrorState error={error} onRetry={reload} /> : !data ? <Loading /> : data.length === 0 ? <Empty icon={<Gift size={28} />} title="No batches yet" /> : (
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Batch</th><th>Date</th><th className="num">Gifts</th><th className="num">Total</th><th>Status</th></tr></thead>
          <tbody>{data.map((b) => (
            <tr key={b.id} className="clickable" onClick={() => setOpen(b.id)}>
              <td><b>{b.name}</b><div className="small muted">By {b.createdBy}</div></td>
              <td className="small">{formatDate(b.date)}</td>
              <td className="num">{b.count}</td>
              <td className="num">{formatMoney(b.total, currency)}{b.difference ? <div className="small" style={{ color: 'var(--danger)' }}>{b.difference > 0 ? '+' : ''}{formatMoney(b.difference, currency)} vs counted</div> : null}</td>
              <td>{b.status === 'committed' ? <span className="badge ok">Committed</span> : <span className="badge warn">Open</span>}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
      {creating && <NewBatch currency={currency} onClose={() => setCreating(false)} onSaved={(id) => { setCreating(false); toast('Batch opened'); setOpen(id); }} />}
    </div>
  );
}

function NewBatch({ currency, onClose, onSaved }: { currency: Currency; onClose: () => void; onSaved: (id: string) => void }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [name, setName] = useState('');
  const [expected, setExpected] = useState('');
  const save = useAction(() => AdminApi.batches.create({ name: name.trim() || undefined, date, expectedTotal: expected ? Math.round(Number(expected) * 100) : null }));
  return (
    <Modal title="New deposit batch" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={save.busy} onClick={async () => { const b = await save.run(); if (b) onSaved(b.id); }}>Open batch</button></>}>
      <div className="stack">
        <FormError error={save.error} />
        <Field label="Date"><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Name" hint="Leave empty for “Sunday offering <date>”."><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label={`Counted total (${currency})`} hint="What the counting team got. Flockwise checks the entries add up to this."><input type="number" min={0} className="input" value={expected} onChange={(e) => setExpected(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function BatchDetail({ id, funds, currency, onBack }: { id: string; funds: AdminFund[]; currency: Currency; onBack: () => void }) {
  const { data, error, reload } = useApi(() => AdminApi.batches.get(id), [id]);
  const [adding, setAdding] = useState(false);
  const [looseFund, setLooseFund] = useState('');
  const can = useCan();
  const toast = useToast();
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const b = data.batch;
  const open = b.status === 'open';
  const commit = async () => {
    if (b.sheet && b.signed < 2 && !window.confirm('Only one person has signed the count. Commit anyway?')) return;
    try { await AdminApi.batches.commit(b.id, !!(b.sheet && b.signed < 2), looseFund || undefined); }
    catch (e) {
      if (!window.confirm(`${(e as Error).message}\n\nCommit anyway?`)) return;
      await AdminApi.batches.commit(b.id, true, looseFund || undefined);
    }
    toast('Batch committed'); reload();
  };
  return (
    <div className="stack">
      <button className="link-btn small" style={{ alignSelf: 'flex-start' }} onClick={onBack}>← All batches</button>
      <div className="card card-pad stack">
        <div className="row wrap" style={{ gap: 8 }}>
          <h2 className="grow">{b.name}</h2>
          {open ? <span className="badge warn">Open</span> : <span className="badge ok">Committed by {b.committedBy}</span>}
        </div>
        <div className="stat-row">
          <div className="card mini-stat"><b>{b.count}</b><span>Gifts</span></div>
          <div className="card mini-stat"><b>{formatMoney(b.total, currency)}</b><span>Entered</span></div>
          {b.expectedTotal !== null && <div className="card mini-stat"><b>{formatMoney(b.expectedTotal, currency)}</b><span>Counted</span></div>}
          {b.sheet && b.loose > 0 && open ? <div className="card mini-stat"><b>{formatMoney(b.loose, currency)}</b><span>Loose offering, recorded on commit</span></div>
            : b.difference !== null && <div className="card mini-stat"><b style={{ color: b.difference ? 'var(--danger)' : 'var(--ok)' }}>{b.difference ? formatMoney(b.difference, currency) : 'Balanced'}</b><span>Difference</span></div>}
          {b.byMethod.map((m) => <div key={m.method} className="card mini-stat"><b>{formatMoney(m.total, currency)}</b><span>{METHOD[m.method as PaymentMethod] ?? m.method} · {m.count}</span></div>)}
        </div>
        {can('giving.edit') && (
          <div className="row wrap" style={{ gap: 8 }}>
            {open && <button className="btn primary" onClick={() => setAdding(true)}><Plus size={15} /> Add gifts</button>}
            {open && <button className="btn" disabled={!b.count && !b.loose} onClick={commit}>Commit batch</button>}
            {open && b.sheet && b.loose > 0 && (
              <select className="select" style={{ width: 'auto' }} value={looseFund} onChange={(e) => setLooseFund(e.target.value)} aria-label="Loose offering goes to">
                <option value="">Loose cash → general fund</option>
                {funds.filter((f) => f.active).map((f) => <option key={f.id} value={f.id}>Loose cash → {f.name}</option>)}
              </select>
            )}
            {!open && <button className="btn" onClick={async () => { await AdminApi.batches.reopen(b.id); reload(); }}><RotateCcw size={15} /> Reopen</button>}
            {open && !b.count && <button className="btn ghost danger" onClick={async () => { await AdminApi.batches.remove(b.id); onBack(); }}><Trash2 size={15} /> Delete</button>}
            <button className="btn ghost" disabled={!data.donations.length} onClick={() => downloadCsv(`${b.name}.csv`, [['Donor', 'Fund', 'Method', 'Amount', 'Receipt'], ...data.donations.map((d) => [d.donorName, d.fundName, d.method, d.amount / 100, d.receiptNumber])])}><Download size={15} /> Export</button>
          </div>
        )}
      </div>
      <CountingRoom batch={b} currency={currency} editable={can('giving.edit') && open} onChanged={reload} />
      <div className="card">
        {data.donations.length === 0 ? <Empty title="No gifts in this batch yet" /> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Donor</th><th>Fund</th><th>Method</th><th className="num">Amount</th><th>Receipt</th></tr></thead>
            <tbody>{data.donations.map((d) => <tr key={d.id} style={{ opacity: d.status === 'refunded' ? 0.5 : 1 }}><td>{d.donorName}</td><td className="small">{d.fundName}</td><td className="small">{METHOD[d.method]}</td><td className="num">{formatMoney(d.amount, currency)}</td><td className="small mono">{d.receiptNumber ?? '—'}</td></tr>)}</tbody>
          </table></div>
        )}
      </div>
      {adding && <OfflineGiftForm batch={{ id: b.id, name: b.name }} funds={funds.filter((f) => f.active)} currency={currency} onClose={() => setAdding(false)} onSaved={() => { reload(); toast('Added'); }} />}
    </div>
  );
}

// ---------- the counting room ----------

const DENOMS: Record<string, number[]> = { INR: [500, 200, 100, 50, 20, 10], USD: [100, 50, 20, 10, 5, 1], GBP: [50, 20, 10, 5], EUR: [100, 50, 20, 10, 5] };
const symbol = (currency: Currency) => formatMoney(0, currency).replace(/[\d.,\s]/g, '');

/** What two counters found in the plate: notes by denomination, coins, cheques, UPI, a photo, two signatures. */
function CountingRoom({ batch: b, currency, editable, onChanged }: { batch: BatchView; currency: Currency; editable: boolean; onChanged: () => void }) {
  const session = useSession(adminSession);
  const toast = useToast();
  const denoms = DENOMS[currency] ?? DENOMS.USD;
  const sheet = b.sheet ?? null;
  const [notes, setNotes] = useState<Record<string, string>>(() => Object.fromEntries(denoms.map((d) => [String(d), sheet?.notes[String(d)] ? String(sheet.notes[String(d)]) : ''])));
  const [coins, setCoins] = useState(sheet ? String(sheet.coins / 100 || '') : '');
  const [cheques, setCheques] = useState(sheet ? String(sheet.cheques / 100 || '') : '');
  const [upi, setUpi] = useState(sheet ? String(sheet.upi / 100 || '') : '');
  const [photo, setPhoto] = useState<string | null | undefined>(undefined);
  const [signer, setSigner] = useState(session ? `${session.member.firstName} ${session.member.lastName}`.trim() : '');
  const [editing, setEditing] = useState(!sheet);
  const save = useAction(() => AdminApi.batches.count(b.id, { notes: Object.fromEntries(Object.entries(notes).map(([d, n]) => [d, Math.round(Number(n) || 0)])), coins: Math.round(Number(coins) * 100 || 0), cheques: Math.round(Number(cheques) * 100 || 0), upi: Math.round(Number(upi) * 100 || 0), ...(photo !== undefined ? { photoUrl: photo } : {}) }));
  const sign = useAction((name: string) => AdminApi.batches.sign(b.id, name));
  const unsign = useAction(() => AdminApi.batches.unsign(b.id));
  const major = (v: string) => Math.round(Number(v) * 100 || 0);
  const liveTotal = denoms.reduce((s, d) => s + d * (Math.round(Number(notes[String(d)]) || 0) * 100), 0) + major(coins) + major(cheques) + major(upi);
  const photoUrl = photo === undefined ? sheet?.photoUrl ?? null : photo;
  const takePhoto = async (f: File) => { try { setPhoto((await shrinkPhoto(f, 1200, 0.7)).preview); } catch { toast('That photo could not be read'); } };
  if (!editable && !sheet) return null;
  return (
    <div className="card">
      <div className="card-head">
        <h2>Counting room</h2>
        <span className="small muted">{sheet ? `Counted ${formatMoney(sheet.total, currency)} by ${sheet.countedBy || 'the office'} · ${sheet.counters.length} of 2 signatures` : 'Count the plate by denomination, take a photo, and have two people sign before the batch is committed.'}</span>
      </div>
      <div className="card-body stack">
        {editing && editable ? (
          <>
            <div className="count-grid">
              {denoms.map((d) => (
                <label key={d} className="count-row">
                  <span className="count-denom">{symbol(currency)}{d}</span>
                  <span className="muted">×</span>
                  <input className="input" inputMode="numeric" value={notes[String(d)]} onChange={(e) => setNotes({ ...notes, [String(d)]: e.target.value.replace(/\D/g, '') })} aria-label={`${d} notes`} />
                  <span className="count-amt">{formatMoney(d * (Math.round(Number(notes[String(d)]) || 0) * 100), currency)}</span>
                </label>
              ))}
              <label className="count-row"><span className="count-denom">Coins</span><span className="muted">{symbol(currency)}</span><input className="input" inputMode="decimal" value={coins} onChange={(e) => setCoins(e.target.value)} aria-label="Coins" /><span className="count-amt">{formatMoney(major(coins), currency)}</span></label>
              <label className="count-row"><span className="count-denom">Cheques</span><span className="muted">{symbol(currency)}</span><input className="input" inputMode="decimal" value={cheques} onChange={(e) => setCheques(e.target.value)} aria-label="Cheques" /><span className="count-amt">{formatMoney(major(cheques), currency)}</span></label>
              <label className="count-row"><span className="count-denom">UPI / QR</span><span className="muted">{symbol(currency)}</span><input className="input" inputMode="decimal" value={upi} onChange={(e) => setUpi(e.target.value)} aria-label="UPI" /><span className="count-amt">{formatMoney(major(upi), currency)}</span></label>
            </div>
            <div className="row wrap" style={{ gap: 10, alignItems: 'center' }}>
              <b style={{ fontSize: 18 }}>Total {formatMoney(liveTotal, currency)}</b>
              <span className="grow" />
              {photoUrl ? <span className="row" style={{ gap: 6 }}><img src={photoUrl} alt="Count sheet" className="count-photo" /><button type="button" className="btn ghost icon sm" aria-label="Remove photo" onClick={() => setPhoto(null)}><X size={14} /></button></span>
                : <label className="btn sm"><Camera size={14} /> Photo of the count sheet<input type="file" accept="image/*" capture="environment" hidden onChange={(e) => { if (e.target.files?.[0]) void takePhoto(e.target.files[0]); e.target.value = ''; }} /></label>}
              <button className="btn primary" disabled={save.busy || liveTotal === 0} onClick={async () => { if (await save.run()) { setEditing(false); toast(sheet ? 'Count updated; signatures cleared' : 'Count saved'); onChanged(); } }}>Save count</button>
              {sheet && <button className="btn ghost" onClick={() => setEditing(false)}>Cancel</button>}
            </div>
            <FormError error={save.error} />
          </>
        ) : sheet && (
          <>
            <div className="row wrap" style={{ gap: 14 }}>
              <div className="count-summary small">
                {Object.entries(sheet.notes).sort((a, c) => Number(c[0]) - Number(a[0])).map(([d, n]) => <span key={d}>{symbol(currency)}{d} × {n}</span>)}
                {sheet.coins > 0 && <span>Coins {formatMoney(sheet.coins, currency)}</span>}
                {sheet.cheques > 0 && <span>Cheques {formatMoney(sheet.cheques, currency)}</span>}
                {sheet.upi > 0 && <span>UPI {formatMoney(sheet.upi, currency)}</span>}
              </div>
              {sheet.photoUrl && <a href={sheet.photoUrl} target="_blank" rel="noreferrer"><img src={sheet.photoUrl} alt="Count sheet" className="count-photo" /></a>}
              {editable && <button className="btn ghost sm" onClick={() => setEditing(true)}><Pencil size={14} /> Change count</button>}
            </div>
            <div className="row wrap" style={{ gap: 8, alignItems: 'center' }}>
              {sheet.counters.map((c) => <span key={c.name} className="badge ok"><PenLine size={12} /> {c.name}</span>)}
              {sheet.counters.length < 2 && editable && (
                <>
                  <input className="input" style={{ width: 200 }} value={signer} onChange={(e) => setSigner(e.target.value)} placeholder="Counter's name" aria-label="Counter's name" />
                  <button className="btn sm" disabled={sign.busy || !signer.trim()} onClick={async () => { if (await sign.run(signer.trim())) { toast(`${signer.trim()} signed`); setSigner(''); onChanged(); } }}><PenLine size={14} /> Sign as {sheet.counters.length === 0 ? 'first' : 'second'} counter</button>
                </>
              )}
              {sheet.counters.length > 0 && editable && <button className="btn ghost sm" disabled={unsign.busy} onClick={async () => { if (await unsign.run()) onChanged(); }}>Clear signatures</button>}
              {sheet.counters.length < 2 && <span className="small muted">Two signatures are needed before the batch is committed.</span>}
            </div>
            <FormError error={sign.error ?? unsign.error} />
          </>
        )}
      </div>
    </div>
  );
}
