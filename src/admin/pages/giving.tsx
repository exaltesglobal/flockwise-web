import { Download, Gift, Pencil, Plus, Search } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';

import type { AdminDonation, AdminFund, DonationQuery, FundInput, OfflineDonationInput, PaymentMethod } from '@/api/admin-types';
import { adminSession } from '@/api/client';
import { AdminApi } from '@/api/endpoints';
import type { Currency } from '@/api/types';
import { Empty, ErrorState, Field, FormError, Loading, Modal, Segmented, useToast } from '@/components/ui';
import { downloadCsv, formatDate, formatMoney, formatNumber } from '@/lib/format';
import { useAction, useApi } from '@/lib/use-api';

import { PageHeader } from '../layout';

const METHOD: Record<PaymentMethod, string> = { upi: 'UPI', card: 'Card', netbanking: 'Netbanking', wallet: 'Wallet', cash: 'Cash', cheque: 'Cheque', bank_transfer: 'Bank transfer' };
const STATUS_TONE = { succeeded: 'ok', pending: 'warn', failed: 'danger', refunded: 'gray' } as const;

type Tab = 'donations' | 'funds' | 'receipts';

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
          { value: 'funds', label: 'Funds' },
          ...(isIndia ? [{ value: 'receipts' as Tab, label: '80G receipts' }] : []),
        ]} />
      </div>
      {tab === 'donations' && <Donations funds={funds.data ?? []} currency={currency} onChanged={funds.reload} />}
      {tab === 'funds' && <Funds funds={funds} currency={currency} />}
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
  const toast = useToast();

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
            <input className="input" placeholder="Search donor or PAN" value={q} onChange={(e) => setQ(e.target.value)} />
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
          <button className="btn primary" onClick={() => setRecording(true)}><Plus size={16} /> Record cash or cheque</button>
        </div>
        {list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : !list.data ? <Loading /> : rows.length === 0 ? (
          <Empty icon={<Gift size={32} />} title="No gifts in this period" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Date</th><th>Donor</th><th>Fund</th><th>Method</th><th>Status</th><th className="num">Amount</th></tr></thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={d.id}>
                    <td className="small" style={{ whiteSpace: 'nowrap' }}>{formatDate(d.createdAt)}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{d.donorName}</div>
                      <div className="small muted">{d.pan ? <span className="mono">{d.pan}</span> : 'No PAN'}{d.fcra && <span className="badge warn" style={{ marginLeft: 6 }}>FCRA</span>}</div>
                    </td>
                    <td className="small">{d.fundName}{d.frequency === 'monthly' && <span className="badge gray" style={{ marginLeft: 6 }}>Monthly</span>}</td>
                    <td className="small">{METHOD[d.method]}</td>
                    <td><span className={`badge ${STATUS_TONE[d.status]}`}>{d.status}</span></td>
                    <td className="num" style={{ fontWeight: 600 }}>{formatMoney(d.amount, d.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {cursor && <div style={{ padding: 16, textAlign: 'center', borderTop: '1px solid var(--border)' }}><button className="btn" onClick={more}>Load more</button></div>}
      </div>
      {recording && <OfflineGiftForm funds={funds.filter((f) => f.active)} currency={currency} onClose={() => setRecording(false)} onSaved={() => { setRecording(false); list.reload(); onChanged(); toast('Gift recorded'); }} />}
    </>
  );
}

function OfflineGiftForm({ funds, currency, onClose, onSaved }: { funds: AdminFund[]; currency: Currency; onClose: () => void; onSaved: () => void }) {
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
    const r = await save.run({ donorId, donorName: donorName.trim(), fundId, amount: amt, method, pan: pan.trim().toUpperCase() || undefined, donorCitizenship: foreign ? 'OTHER' : 'IN', receivedAt });
    if (r) onSaved();
  }

  return (
    <Modal title="Record a cash or cheque gift" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" form="gift-form" disabled={save.busy || !donorName.trim() || !amt}>Save gift</button></>}
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
                    <td style={{ fontWeight: 600 }}>{d.name}</td>
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
    </div>
  );
}
