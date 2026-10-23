// Benevolence fund: quiet requests for help from members, reviewed and approved by the pastors,
// paid out as vouchers against the benevolence head. Only staff with the care permission get here.
import { HandCoins, Plus, StickyNote } from 'lucide-react';
import { useState } from 'react';

import type { AidKind, AidRequest, AidStatus, ExpenseMethod } from '@/api/admin-types';
import { AdminApi } from '@/api/endpoints';
import { Empty, ErrorState, Field, FormError, Loading, Modal, Segmented, useToast } from '@/components/ui';
import { formatDate, formatMoney } from '@/lib/format';
import { useAction, useApi } from '@/lib/use-api';

import { PersonSearch } from '../components/person-picker';
import { PageHeader } from '../layout';

export const KIND: Record<AidKind, string> = { medical: 'Medical', education: 'School or college fees', rent: 'Rent or housing', food: 'Food and essentials', funeral: 'Funeral', other: 'Other' };
const STATUS: Record<AidStatus, { label: string; badge: string }> = {
  requested: { label: 'New', badge: 'warn' }, reviewing: { label: 'Looking into it', badge: 'accent' }, approved: { label: 'Approved', badge: 'ok' },
  paid: { label: 'Paid', badge: 'ok' }, declined: { label: 'Declined', badge: 'gray' }, withdrawn: { label: 'Withdrawn', badge: 'gray' },
};
const VIA: { value: ExpenseMethod; label: string }[] = [{ value: 'upi', label: 'UPI' }, { value: 'bank_transfer', label: 'Bank transfer' }, { value: 'cash', label: 'Cash' }, { value: 'cheque', label: 'Cheque' }];
type Filter = 'open' | 'approved' | 'paid' | 'closed' | 'all';

export function BenevolencePage() {
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>('open');
  const { data, error, reload } = useApi(() => AdminApi.benevolence.hub(filter), [filter]);
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const setFund = useAction((fundId: string | null) => AdminApi.benevolence.setFund(fundId));
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const s = data.summary;
  const cur = data.requests[0]?.currency ?? 'INR';
  const current = open ? data.requests.find((a) => a.id === open) ?? null : null;
  return (
    <>
      <PageHeader title="Benevolence" subtitle="Quiet help for members in a hard season. Only staff with the care permission see this page; nothing here reaches the directory or the audit log by name."
        actions={<button className="btn primary" onClick={() => setCreating(true)}><Plus size={16} /> New request</button>} />
      <div className="row wrap" style={{ gap: 10, alignItems: 'center' }}>
        <span className="small muted">Paid from fund</span>
        <select className="select" style={{ width: 'auto' }} value={s.fundId ?? ''} disabled={setFund.busy} aria-label="Benevolence fund" onChange={async (e) => { if (await setFund.run(e.target.value || null)) { toast('Fund saved'); reload(); } }}>
          <option value="">Choose a giving fund…</option>
          {data.funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </div>
      <div className="stat-row">
        <div className="card mini-stat"><b>{formatMoney(s.received, cur)}</b><span>Given to the fund</span></div>
        <div className="card mini-stat"><b>{formatMoney(s.paid, cur)}</b><span>Paid out</span></div>
        <div className="card mini-stat"><b style={{ color: s.balance < 0 ? 'var(--danger)' : undefined }}>{formatMoney(s.balance, cur)}</b><span>Balance</span></div>
        <div className="card mini-stat"><b>{s.open}</b><span>Open requests</span></div>
        <div className="card mini-stat"><b>{formatMoney(s.approvedUnpaid, cur)}</b><span>Approved, not yet paid</span></div>
      </div>
      <Segmented value={filter} onChange={(f) => { setFilter(f); setOpen(null); }} options={[{ value: 'open', label: 'Open' }, { value: 'approved', label: 'Approved' }, { value: 'paid', label: 'Paid' }, { value: 'closed', label: 'Closed' }, { value: 'all', label: 'All' }]} />
      <div className="card">
        {data.requests.length === 0 ? <Empty icon={<HandCoins size={26} />} title={filter === 'open' ? 'No open requests' : 'Nothing here'} body="Members ask under “Ask for help” in the app; the pastors are told by email and push." /> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Person</th><th>For</th><th className="num">Asked</th><th className="num">Approved</th><th>Status</th><th>Requested</th></tr></thead>
            <tbody>{data.requests.map((a) => (
              <tr key={a.id} className="clickable" onClick={() => setOpen(a.id)}>
                <td><b>{a.personName}</b><div className="small muted">{a.phone ?? ''}</div></td>
                <td className="small">{KIND[a.kind]}<div className="muted ellipsis" style={{ maxWidth: 280 }}>{a.reason}</div></td>
                <td className="num">{formatMoney(a.amount, a.currency)}</td>
                <td className="num">{a.approved !== null ? formatMoney(a.approved, a.currency) : '—'}</td>
                <td><span className={`badge ${STATUS[a.status].badge}`}>{STATUS[a.status].label}</span></td>
                <td className="small">{formatDate(a.requestedAt)}<div className="muted">{a.source === 'member' ? 'from the app' : `by ${a.requestedBy}`}</div></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
      {current && <Detail a={current} onClose={() => setOpen(null)} onChanged={reload} />}
      {creating && <NewRequest onClose={() => setCreating(false)} onSaved={() => { setCreating(false); toast('Request added'); reload(); }} />}
    </>
  );
}

function Detail({ a, onClose, onChanged }: { a: AidRequest; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const [mode, setMode] = useState<'approve' | 'decline' | 'pay' | null>(null);
  const [amount, setAmount] = useState(String((a.approved ?? a.amount) / 100));
  const [note, setNote] = useState('');
  const [via, setVia] = useState<ExpenseMethod>('upi');
  const [ref, setRef] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [text, setText] = useState('');
  const update = useAction((input: { status?: 'reviewing' | 'approved' | 'declined' | 'withdrawn'; approved?: number; note?: string }) => AdminApi.benevolence.update(a.id, input));
  const pay = useAction(() => AdminApi.benevolence.pay(a.id, { via, reference: ref, date, amount: Math.round(Number(amount) * 100) }));
  const addNote = useAction(() => AdminApi.benevolence.addNote(a.id, text));
  const done = (msg: string) => { toast(msg); setMode(null); onChanged(); };
  const open = a.status === 'requested' || a.status === 'reviewing';
  return (
    <Modal side title={a.personName} onClose={onClose}>
      <div className="stack">
        <div className="row wrap" style={{ gap: 8, alignItems: 'center' }}>
          <span className={`badge ${STATUS[a.status].badge}`}>{STATUS[a.status].label}</span>
          <span className="small muted">{KIND[a.kind]} · asked {formatMoney(a.amount, a.currency)}{a.approved !== null ? ` · approved ${formatMoney(a.approved, a.currency)}` : ''}</span>
        </div>
        <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{a.reason}</p>
        <div className="small muted">Requested {formatDate(a.requestedAt)} {a.source === 'member' ? 'from the app' : `by ${a.requestedBy}`}{a.phone ? ` · ${a.phone}` : ''}</div>
        {a.decidedAt && <div className="small">{a.status === 'withdrawn' ? 'Withdrawn' : a.status === 'declined' ? 'Declined' : 'Approved'} by {a.decidedBy} on {formatDate(a.decidedAt)}{a.decisionNote ? ` — ${a.decisionNote}` : ''}</div>}
        {a.paidAt && <div className="small">Paid {formatDate(a.paidAt)} by {a.paidBy} ({VIA.find((v) => v.value === a.paidVia)?.label ?? a.paidVia}{a.paidRef ? `, ref ${a.paidRef}` : ''}); voucher in Accounts.</div>}
        <FormError error={update.error ?? pay.error ?? addNote.error} />
        {!mode && (
          <div className="row wrap" style={{ gap: 8 }}>
            {a.status === 'requested' && <button className="btn" disabled={update.busy} onClick={async () => { if (await update.run({ status: 'reviewing' })) done('Marked as being looked at'); }}>Looking into it</button>}
            {open && <button className="btn primary" onClick={() => setMode('approve')}>Approve</button>}
            {open && <button className="btn" onClick={() => setMode('decline')}>Decline</button>}
            {a.status === 'approved' && <button className="btn primary" onClick={() => setMode('pay')}>Record payment</button>}
            {(open || a.status === 'approved') && <button className="btn ghost" disabled={update.busy} onClick={async () => { if (window.confirm('Withdraw this request?') && (await update.run({ status: 'withdrawn' }))) done('Withdrawn'); }}>Withdraw</button>}
          </div>
        )}
        {mode === 'approve' && (
          <div className="card card-pad stack">
            <Field label={`Amount approved (${a.currency})`}><input className="input" type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
            <Field label="Note to the member (optional)"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Half now; the rest when the final bill comes." /></Field>
            <div className="row" style={{ gap: 8 }}><button className="btn primary" disabled={update.busy || !Number(amount)} onClick={async () => { if (await update.run({ status: 'approved', approved: Math.round(Number(amount) * 100), note })) done('Approved; the member has been told'); }}>Approve {formatMoney(Math.round(Number(amount) * 100) || 0, a.currency)}</button><button className="btn ghost" onClick={() => setMode(null)}>Cancel</button></div>
          </div>
        )}
        {mode === 'decline' && (
          <div className="card card-pad stack">
            <Field label="Note to the member" hint="Kindly worded; it goes to them as written."><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Referred to the district welfare scheme; the pastor will call." /></Field>
            <div className="row" style={{ gap: 8 }}><button className="btn danger" disabled={update.busy} onClick={async () => { if (await update.run({ status: 'declined', note })) done('Declined; the member has been told'); }}>Decline</button><button className="btn ghost" onClick={() => setMode(null)}>Cancel</button></div>
          </div>
        )}
        {mode === 'pay' && (
          <div className="card card-pad stack">
            <div className="grid cols-2">
              <Field label={`Amount paid (${a.currency})`}><input className="input" type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
              <Field label="Paid by"><select className="select" value={via} onChange={(e) => setVia(e.target.value as ExpenseMethod)}>{VIA.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}</select></Field>
              <Field label="Reference"><input className="input" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="UTR, cheque no." /></Field>
              <Field label="Date"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            </div>
            <div className="row" style={{ gap: 8 }}><button className="btn primary" disabled={pay.busy || !Number(amount)} onClick={async () => { if (await pay.run()) done('Payment recorded; voucher written'); }}>Record payment</button><button className="btn ghost" onClick={() => setMode(null)}>Cancel</button></div>
          </div>
        )}
        <div className="stack" style={{ gap: 6 }}>
          <b className="small">Office notes</b>
          {a.notes.length === 0 && <span className="small muted">None yet.</span>}
          {a.notes.map((n, i) => <div key={i} className="small"><StickyNote size={12} /> {n.text} <span className="muted">— {n.by}, {formatDate(n.at)}</span></div>)}
          <div className="row" style={{ gap: 8 }}>
            <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a note (only the office sees it)" />
            <button className="btn sm" disabled={addNote.busy || !text.trim()} onClick={async () => { if (await addNote.run()) { setText(''); onChanged(); } }}>Add</button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function NewRequest({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [person, setPerson] = useState<{ id: string; name: string } | null>(null);
  const [kind, setKind] = useState<AidKind>('medical');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const save = useAction(() => AdminApi.benevolence.create({ personId: person!.id, kind, amount: Math.round(Number(amount) * 100), reason }));
  return (
    <Modal title="New request for help" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!person || !Number(amount) || !reason.trim() || save.busy} onClick={async () => { if (await save.run()) onSaved(); }}>Add</button></>}>
      <div className="stack">
        <FormError error={save.error} />
        <div className="field">
          <span>Person</span>
          {person ? <div className="row" style={{ gap: 8 }}><b>{person.name}</b><button type="button" className="link-btn small" onClick={() => setPerson(null)}>change</button></div>
            : <PersonSearch autoFocus placeholder="Search by name or phone" onPick={(p) => setPerson({ id: p.id, name: p.name })} />}
        </div>
        <div className="grid cols-2">
          <Field label="For"><select className="select" value={kind} onChange={(e) => setKind(e.target.value as AidKind)}>{(Object.keys(KIND) as AidKind[]).map((k) => <option key={k} value={k}>{KIND[k]}</option>)}</select></Field>
          <Field label="Amount asked"><input className="input" type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        </div>
        <Field label="What it is for"><textarea className="input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
