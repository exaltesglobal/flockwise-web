// Hall hire: which halls, grounds and rooms are for hire and at what rate, and the requests that come
// in from the public page. Approve sends the renter a payment link; a paid hire holds the slot on the
// calendar as an approved booking. Money lands in the hidden "Hall rentals" fund, not as a donation.
import { Check, Copy, ExternalLink, KeyRound, RotateCcw, Wallet, X } from 'lucide-react';
import { useState } from 'react';

import type { RentalOffer, RentalStatus, RentalView, Resource } from '@/api/admin-types';
import { AdminApi } from '@/api/endpoints';
import { Empty, ErrorState, Field, FormError, Loading, Modal, Segmented, useToast } from '@/components/ui';
import { formatDate, formatMoney, formatTime } from '@/lib/format';
import { useCan } from '@/lib/perms';
import { useAction, useApi } from '@/lib/use-api';

import { PageHeader } from '../layout';

const STATUS: Record<RentalStatus, { label: string; tone: string }> = {
  requested: { label: 'New request', tone: 'warn' }, awaiting_payment: { label: 'Awaiting payment', tone: 'accent' }, paid: { label: 'Paid', tone: 'ok' },
  declined: { label: 'Declined', tone: 'danger' }, cancelled: { label: 'Withdrawn', tone: 'gray' }, refunded: { label: 'Refunded', tone: 'gray' },
};
type Filter = 'open' | 'paid' | 'closed' | 'all';
const when = (x: Pick<RentalView, 'startsAt' | 'endsAt'>) => `${formatDate(x.startsAt)}, ${formatTime(x.startsAt)} to ${formatTime(x.endsAt)}`;

export function RentalsPage() {
  const toast = useToast();
  const canEdit = useCan()('events', 'settings');
  const [filter, setFilter] = useState<Filter>('open');
  const [tab, setTab] = useState<'requests' | 'spaces'>('requests');
  const { data, error, reload } = useApi(() => AdminApi.rentals.hub(filter === 'all' ? undefined : filter), [filter]);
  const [open, setOpen] = useState<string | null>(null);
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const cur = 'INR';
  const forHire = data.spaces.filter((s) => s.offer.enabled).length;
  const current = open ? data.rentals.find((x) => x.id === open) ?? null : null;
  return (
    <>
      <PageHeader title="Hall hire" subtitle="Put the hall, ground or a room up for hire with an hourly rate and a deposit. Outsiders ask for a date from your public page, you approve, and they pay online through your own Razorpay. A paid hire holds the slot on the calendar."
        actions={<a className="btn" href={data.publicUrl} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Public hire page</a>} />
      <div className="stat-row">
        <div className="card mini-stat"><b>{data.summary.open}</b><span>New requests</span></div>
        <div className="card mini-stat"><b>{data.summary.awaitingPayment}</b><span>Awaiting payment</span></div>
        <div className="card mini-stat"><b>{formatMoney(data.summary.paidThisYear, cur)}</b><span>Hire income this year</span></div>
        <div className="card mini-stat"><b>{formatMoney(data.summary.depositsHeld, cur)}</b><span>Deposits held</span></div>
        <div className="card mini-stat"><b>{forHire}</b><span>Space{forHire === 1 ? '' : 's'} for hire</span></div>
      </div>
      <div className="row between wrap" style={{ gap: 10 }}>
        <Segmented value={tab} onChange={setTab} options={[{ value: 'requests', label: 'Requests' }, { value: 'spaces', label: 'Spaces for hire' }]} />
        {tab === 'requests' && <Segmented value={filter} onChange={(f) => { setFilter(f); setOpen(null); }} options={[{ value: 'open', label: 'Open' }, { value: 'paid', label: 'Paid' }, { value: 'closed', label: 'Closed' }, { value: 'all', label: 'All' }]} />}
      </div>
      {tab === 'spaces' ? <Spaces spaces={data.spaces} canEdit={canEdit} onChanged={reload} /> : (
        <div className="card">
          {data.rentals.length === 0 ? (
            <Empty icon={<KeyRound size={26} />} title={forHire ? 'No requests here' : 'Nothing is for hire yet'} body={forHire ? 'Requests from the public hire page appear here the moment they are sent.' : 'Open “Spaces for hire”, switch on the hall and set an hourly rate. Then share the public hire page.'} action={!forHire && canEdit ? <button className="btn primary" onClick={() => setTab('spaces')}>Set up spaces</button> : undefined} />
          ) : (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>When</th><th>Space</th><th>Who</th><th>For</th><th className="num">To pay</th><th>Status</th></tr></thead>
              <tbody>{data.rentals.map((x) => (
                <tr key={x.id} className="clickable" onClick={() => setOpen(x.id)}>
                  <td><b>{formatDate(x.startsAt)}</b><div className="small muted">{formatTime(x.startsAt)} to {formatTime(x.endsAt)} · {x.hours} h</div></td>
                  <td>{x.resourceName}{x.conflicts.length > 0 && <div className="small" style={{ color: 'var(--danger)' }}>Clashes with {x.conflicts[0].title}</div>}</td>
                  <td>{x.renterName}{x.organisation && <div className="small muted">{x.organisation}</div>}</td>
                  <td className="small">{x.purpose}{x.guests ? <div className="muted">{x.guests} people</div> : null}</td>
                  <td className="num">{formatMoney(x.total, cur)}{x.deposit > 0 && <div className="small muted">incl. {formatMoney(x.deposit, cur)} deposit</div>}</td>
                  <td><span className={`badge ${STATUS[x.status].tone}`}>{STATUS[x.status].label}</span></td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </div>
      )}
      {current && <Detail x={current} canEdit={canEdit} onClose={() => setOpen(null)} onChanged={() => { reload(); }} toast={toast} />}
    </>
  );
}

function Detail({ x, canEdit, onClose, onChanged, toast }: { x: RentalView; canEdit: boolean; onClose: () => void; onChanged: () => void; toast: (m: string) => void }) {
  const [mode, setMode] = useState<'view' | 'approve' | 'decline' | 'paid' | 'refund'>('view');
  const [amount, setAmount] = useState(String(x.amount / 100));
  const [deposit, setDeposit] = useState(String(x.deposit / 100));
  const [note, setNote] = useState('');
  const [via, setVia] = useState<'cash' | 'bank_transfer' | 'cheque' | 'upi'>('bank_transfer');
  const [reference, setReference] = useState('');
  const [newNote, setNewNote] = useState('');
  const act = useAction(async () => {
    if (mode === 'approve') return AdminApi.rentals.approve(x.id, { amount: Math.round(Number(amount) * 100), deposit: Math.round(Number(deposit) * 100), note: note || undefined, force: x.conflicts.length > 0 });
    if (mode === 'decline') return AdminApi.rentals.decline(x.id, note);
    if (mode === 'paid') return AdminApi.rentals.markPaid(x.id, { via, reference: reference || undefined });
    return AdminApi.rentals.refund(x.id, note);
  });
  const addNote = useAction(() => AdminApi.rentals.addNote(x.id, newNote));
  const cur = x.currency;
  const run = async (done: string) => { const r = await act.run(); if (r) { toast(done); setMode('view'); setNote(''); onChanged(); } };
  const openish = x.status === 'requested' || x.status === 'awaiting_payment';
  return (
    <Modal side title={`${x.resourceName} · ${x.renterName}`} onClose={onClose}>
      <div className="stack">
        <div className="row wrap" style={{ gap: 8 }}>
          <span className={`badge ${STATUS[x.status].tone}`}>{STATUS[x.status].label}</span>
          {x.bookingStatus && <span className="small muted">Calendar: {x.bookingStatus}</span>}
        </div>
        {x.conflicts.length > 0 && <div className="callout small" style={{ background: "var(--warn-tint)" }}>Clashes with “{x.conflicts[0].title}” ({when(x.conflicts[0])}). Approving anyway double-books the space.</div>}
        <dl className="kv">
          <dt>When</dt><dd>{when(x)} · {x.hours} h</dd>
          <dt>For</dt><dd>{x.purpose}{x.guests ? ` · ${x.guests} people` : ''}</dd>
          <dt>Contact</dt><dd>{x.renterPhone}{x.renterEmail && <><br />{x.renterEmail}</>}{x.organisation && <><br />{x.organisation}</>}</dd>
          <dt>Hire</dt><dd>{formatMoney(x.amount, cur)} <span className="small muted">({formatMoney(x.ratePerHour, cur)}/h)</span></dd>
          {x.deposit > 0 && <><dt>Deposit</dt><dd>{formatMoney(x.deposit, cur)}</dd></>}
          <dt>Total</dt><dd><b>{formatMoney(x.total, cur)}</b></dd>
          {x.paidAt && <><dt>Paid</dt><dd>{formatDate(x.paidAt)}</dd></>}
          <dt>Asked</dt><dd>{formatDate(x.createdAt)}{x.decidedBy && <> · decided by {x.decidedBy}</>}</dd>
        </dl>
        {x.status === 'awaiting_payment' && (
          <div className="row wrap" style={{ gap: 8 }}>
            <input className="input small" readOnly value={x.payUrl} style={{ flex: 1, minWidth: 0 }} onFocus={(e) => e.currentTarget.select()} />
            <button className="btn sm" onClick={() => { navigator.clipboard?.writeText(x.payUrl).then(() => toast('Payment link copied'), () => undefined); }}><Copy size={14} /> Copy pay link</button>
          </div>
        )}
        <FormError error={act.error} />
        {canEdit && mode === 'view' && (
          <div className="row wrap" style={{ gap: 8 }}>
            {openish && <button className="btn primary" onClick={() => setMode('approve')}><Check size={16} /> {x.status === 'requested' ? 'Approve & send pay link' : 'Re-send with new amount'}</button>}
            {openish && <button className="btn" onClick={() => setMode('paid')}><Wallet size={16} /> Paid offline</button>}
            {openish && <button className="btn danger" onClick={() => setMode('decline')}><X size={16} /> Decline</button>}
            {x.status === 'paid' && <button className="btn danger" onClick={() => setMode('refund')}><RotateCcw size={16} /> Cancel & refund</button>}
          </div>
        )}
        {mode === 'approve' && (
          <div className="stack card card-pad" style={{ gap: 10 }}>
            <div className="grid cols-2">
              <Field label="Hire amount (₹)"><input className="input" type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
              <Field label="Deposit (₹)"><input className="input" type="number" min={0} value={deposit} onChange={(e) => setDeposit(e.target.value)} /></Field>
            </div>
            <Field label="Note for the file (optional)"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn primary" disabled={act.busy} onClick={() => run('Approved. The renter has the payment link.')}>Approve &amp; email the pay link</button>
              <button className="btn" onClick={() => setMode('view')}>Back</button>
            </div>
          </div>
        )}
        {mode === 'decline' && (
          <div className="stack card card-pad" style={{ gap: 10 }}>
            <Field label="Reason (sent to the renter)"><textarea className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn danger" disabled={act.busy} onClick={() => run('Declined and the renter told.')}>Decline</button>
              <button className="btn" onClick={() => setMode('view')}>Back</button>
            </div>
          </div>
        )}
        {mode === 'paid' && (
          <div className="stack card card-pad" style={{ gap: 10 }}>
            <p className="small muted">Records {formatMoney(x.total, cur)} received outside Razorpay, confirms the booking and tells the renter.</p>
            <div className="grid cols-2">
              <Field label="Paid by"><select className="input" value={via} onChange={(e) => setVia(e.target.value as typeof via)}><option value="bank_transfer">Bank transfer</option><option value="upi">UPI</option><option value="cash">Cash</option><option value="cheque">Cheque</option></select></Field>
              <Field label="Reference (optional)"><input className="input" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="UTR, cheque no." /></Field>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn primary" disabled={act.busy} onClick={() => run('Marked paid; the booking is on the calendar.')}>Mark paid</button>
              <button className="btn" onClick={() => setMode('view')}>Back</button>
            </div>
          </div>
        )}
        {mode === 'refund' && (
          <div className="stack card card-pad" style={{ gap: 10 }}>
            <p className="small muted">Frees the slot and marks the payment refunded here. Make the refund itself from your Razorpay dashboard or bank.</p>
            <Field label="Why"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn danger" disabled={act.busy} onClick={() => run('Cancelled and marked refunded.')}>Cancel booking</button>
              <button className="btn" onClick={() => setMode('view')}>Back</button>
            </div>
          </div>
        )}
        <div className="stack" style={{ gap: 6 }}>
          <b className="small">Office notes</b>
          {x.notes ? <p className="small" style={{ whiteSpace: 'pre-wrap' }}>{x.notes}</p> : <span className="small muted">None yet.</span>}
          {canEdit && (
            <div className="row" style={{ gap: 8 }}>
              <input className="input" placeholder="Add a note" value={newNote} onChange={(e) => setNewNote(e.target.value)} />
              <button className="btn" disabled={!newNote.trim() || addNote.busy} onClick={async () => { if (await addNote.run()) { setNewNote(''); onChanged(); } }}>Add</button>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

function Spaces({ spaces, canEdit, onChanged }: { spaces: { resource: Resource; offer: RentalOffer }[]; canEdit: boolean; onChanged: () => void }) {
  const [editing, setEditing] = useState<{ resource: Resource; offer: RentalOffer } | null>(null);
  return (
    <div className="card">
      {spaces.length === 0 ? <Empty icon={<KeyRound size={26} />} title="No rooms or grounds yet" body="Add the hall, ground and rooms under Calendar & rooms first; then they can be offered for hire here." /> : (
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Space</th><th>For hire</th><th className="num">Rate / hour</th><th className="num">Minimum</th><th className="num">Deposit</th><th></th></tr></thead>
          <tbody>{spaces.map(({ resource, offer }) => (
            <tr key={resource.id}>
              <td><b>{resource.name}</b><div className="small muted">{resource.capacity ? `${resource.capacity} people · ` : ''}{offer.blurb || resource.description}</div></td>
              <td>{offer.enabled ? <span className="badge ok">Yes</span> : <span className="badge gray">No</span>}</td>
              <td className="num">{offer.ratePerHour ? formatMoney(offer.ratePerHour, 'INR') : '—'}</td>
              <td className="num">{offer.minHours} h</td>
              <td className="num">{offer.deposit ? formatMoney(offer.deposit, 'INR') : '—'}</td>
              <td className="num">{canEdit && <button className="btn sm" onClick={() => setEditing({ resource, offer })}>Edit</button>}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
      {editing && <EditSpace resource={editing.resource} offer={editing.offer} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onChanged(); }} />}
    </div>
  );
}

function EditSpace({ resource, offer, onClose, onSaved }: { resource: Resource; offer: RentalOffer; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ enabled: offer.enabled, ratePerHour: String(offer.ratePerHour / 100 || ''), minHours: String(offer.minHours), deposit: String(offer.deposit / 100 || ''), blurb: offer.blurb, terms: offer.terms, photoUrl: offer.photoUrl ?? '' });
  const save = useAction(() => AdminApi.rentals.setSpace(resource.id, { enabled: f.enabled, ratePerHour: Math.round(Number(f.ratePerHour) * 100) || 0, minHours: Number(f.minHours) || 1, deposit: Math.round(Number(f.deposit) * 100) || 0, blurb: f.blurb, terms: f.terms, photoUrl: f.photoUrl || null }));
  return (
    <Modal title={`Hire terms: ${resource.name}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={save.busy} onClick={async () => { if (await save.run()) onSaved(); }}>Save</button></>}>
      <div className="stack">
        <FormError error={save.error} />
        <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={f.enabled} onChange={(e) => setF({ ...f, enabled: e.target.checked })} /> Offer {resource.name} for hire on the public page</label>
        <div className="grid cols-3">
          <Field label="Rate per hour (₹)"><input className="input" type="number" min={0} value={f.ratePerHour} onChange={(e) => setF({ ...f, ratePerHour: e.target.value })} /></Field>
          <Field label="Minimum hours"><input className="input" type="number" min={1} max={24} value={f.minHours} onChange={(e) => setF({ ...f, minHours: e.target.value })} /></Field>
          <Field label="Refundable deposit (₹)"><input className="input" type="number" min={0} value={f.deposit} onChange={(e) => setF({ ...f, deposit: e.target.value })} /></Field>
        </div>
        <Field label="One line for the public page" hint="Seats, kitchen, parking, sound system…"><input className="input" value={f.blurb} onChange={(e) => setF({ ...f, blurb: e.target.value })} /></Field>
        <Field label="Terms of hire" hint="Shown before they send the request. No alcohol, clean-up, decorations, timings."><textarea className="input" rows={4} value={f.terms} onChange={(e) => setF({ ...f, terms: e.target.value })} /></Field>
        <Field label="Photo URL (optional)"><input className="input" value={f.photoUrl} onChange={(e) => setF({ ...f, photoUrl: e.target.value })} placeholder="https://…" /></Field>
      </div>
    </Modal>
  );
}
