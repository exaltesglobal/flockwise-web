// Settings › Privacy: India's DPDP Act. The grievance officer and notice members see, data requests with
// due dates (correction, erasure, a copy of their data), and a quick check of consent across the church.
import { Download, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { useState } from 'react';

import type { DataRequest, DataRequestKind, PrivacyOverview } from '@/api/admin-types';
import { adminSession } from '@/api/client';
import { AdminApi } from '@/api/endpoints';
import { Empty, ErrorState, Field, FormError, Loading, Modal, Segmented, useToast } from '@/components/ui';
import { downloadJson, formatDate, formatRelative } from '@/lib/format';
import { useCan } from '@/lib/perms';
import { useSession } from '@/lib/session';
import { useAction, useApi } from '@/lib/use-api';

import { PersonField, type PickedPerson } from '../components/person-picker';

const KIND: Record<DataRequestKind, string> = { access: 'Copy of their data', correction: 'Correction', erasure: 'Erase their data', grievance: 'Privacy concern' };

export function PrivacySettings() {
  const { data, error, reload, setData } = useApi(() => AdminApi.privacy.get(), []);
  const can = useCan();
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <Loading />;
  return (
    <div className="stack">
      <Summary d={data} />
      <Requests d={data} reload={reload} />
      {can('settings') && <Officer d={data} onSaved={setData} />}
    </div>
  );
}

function Summary({ d }: { d: PrivacyOverview }) {
  return (
    <section className="card card-pad stack">
      <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
        <div className="int-logo api"><ShieldCheck size={22} /></div>
        <div className="grow" style={{ minWidth: 0 }}>
          <h3 style={{ margin: 0 }}>Privacy and the DPDP Act</h3>
          <p className="muted small" style={{ margin: '4px 0 0' }}>India’s Digital Personal Data Protection Act, 2023 gives members the right to know what you hold, to correct it, to withdraw consent and to have it erased. Flockwise records every consent change, lets members download their data from the app, and keeps their requests here with a 30-day due date.</p>
        </div>
      </div>
      <div className="stat-row">
        <div className="mini-stat"><b className={d.overdue ? 'danger-text' : ''}>{d.open}</b><span>open requests{d.overdue ? `, ${d.overdue} overdue` : ''}</span></div>
        <div className="mini-stat"><b>{d.optedOut.whatsapp}</b><span>said no to WhatsApp</span></div>
        <div className="mini-stat"><b>{d.optedOut.sms}</b><span>said no to SMS</span></div>
        <div className="mini-stat"><b>{d.toReview}</b><span>inactive for {d.settings.reviewAfterMonths}+ months</span></div>
      </div>
      {d.minorsWithContact > 0 && <div className="alert warn">{d.minorsWithContact} children under 18 have their own phone or email saved. The Act needs a parent’s consent for children’s data, so contact the parent instead and clear the child’s details.</div>}
      {!d.settings.officerName && <div className="alert">Name a person members can contact about their data (below). The Act calls them the grievance officer.</div>}
    </section>
  );
}

function Requests({ d, reload }: { d: PrivacyOverview; reload: () => void }) {
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const [open, setOpen] = useState<DataRequest | null>(null);
  const [adding, setAdding] = useState(false);
  const rows = d.requests.filter((r) => filter === 'all' || r.status === 'open');
  const now = new Date().toISOString();
  return (
    <section className="card table-wrap">
      <div className="card-head row wrap between" style={{ gap: 8 }}>
        <h2>Data requests</h2>
        <div className="row" style={{ gap: 8 }}>
          <Segmented value={filter} onChange={setFilter} options={[{ value: 'open', label: `Open (${d.open})` }, { value: 'all', label: 'All' }]} />
          <button className="btn sm" onClick={() => setAdding(true)}><Plus size={14} /> Record one</button>
        </div>
      </div>
      {rows.length === 0 ? <Empty icon={<ShieldCheck size={26} />} title={filter === 'open' ? 'No open requests' : 'No requests yet'} body="Members ask from Me › Your data in the app. Record requests that come by phone or letter here." /> : (
        <table className="table">
          <thead><tr><th>Person</th><th>Asked for</th><th>Received</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} onClick={() => setOpen(r)} style={{ cursor: 'pointer' }}>
                <td><b>{r.personName}</b>{r.contact && <div className="small muted">{r.contact}</div>}</td>
                <td>{KIND[r.kind]}{r.details && <div className="small muted clamp2">{r.details}</div>}</td>
                <td className="small nowrap">{formatRelative(r.createdAt)}</td>
                <td>{r.status === 'open' ? <span className={`badge ${r.dueAt < now ? 'danger' : 'warn'}`}>{r.dueAt < now ? 'Overdue' : `Due ${formatDate(r.dueAt)}`}</span> : <span className={`badge ${r.status === 'done' ? 'ok' : 'gray'}`}>{r.status === 'done' ? 'Done' : 'Declined'}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {open && <RequestModal r={open} onClose={() => setOpen(null)} onDone={() => { setOpen(null); reload(); }} />}
      {adding && <NewRequest onClose={() => setAdding(false)} onDone={() => { setAdding(false); reload(); }} />}
    </section>
  );
}

function RequestModal({ r, onClose, onDone }: { r: DataRequest; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const role = useSession(adminSession)?.staff?.role;
  const [response, setResponse] = useState(r.response);
  const [confirmErase, setConfirmErase] = useState(false);
  const update = useAction((status: 'done' | 'declined' | 'open') => AdminApi.privacy.update(r.id, { status, response }));
  const erase = useAction(() => AdminApi.privacy.erase(r.id));
  const exp = useAction(() => AdminApi.privacy.exportPerson(r.personId!));
  const canErase = role === 'owner' || role === 'admin';
  const close = async (status: 'done' | 'declined') => { if (await update.run(status)) { toast(status === 'done' ? 'Marked done' : 'Declined'); onDone(); } };
  return (
    <Modal title={`${KIND[r.kind]}: ${r.personName}`} onClose={onClose} footer={r.status === 'open' ? (
      <>
        <button className="btn ghost" onClick={() => close('declined')} disabled={update.busy}>Decline</button>
        {r.kind !== 'erasure' && <button className="btn primary" onClick={() => close('done')} disabled={update.busy}>Mark done</button>}
      </>
    ) : <button className="btn" onClick={onClose}>Close</button>}>
      <div className="stack">
        <dl className="int-facts">
          <div><dt>Received</dt><dd>{formatDate(r.createdAt)}</dd></div>
          <div><dt>Due</dt><dd>{formatDate(r.dueAt)}</dd></div>
          {r.contact && <div><dt>Contact</dt><dd>{r.contact}</dd></div>}
          {r.closedAt && <div><dt>Closed</dt><dd>{formatDate(r.closedAt)} by {r.closedBy}</dd></div>}
        </dl>
        {r.details && <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{r.details}</p>}
        {r.kind === 'access' && r.personId && <div><button className="btn sm" disabled={exp.busy} onClick={async () => { const d = await exp.run(); if (d) downloadJson(`${r.personName.replace(/\s+/g, '-').toLowerCase()}-data.json`, d); }}><Download size={14} /> Download their data</button><div className="small muted" style={{ marginTop: 4 }}>Send it to them, or tell them they can download it themselves from Me › Your data.</div></div>}
        {r.kind === 'correction' && <p className="small muted" style={{ margin: 0 }}>Make the change on their profile in People, then mark this done.</p>}
        <Field label="Reply to the person" hint="They see this in the app.">
          <textarea className="textarea" rows={3} value={response} onChange={(e) => setResponse(e.target.value)} disabled={r.status !== 'open'} />
        </Field>
        {r.kind === 'erasure' && r.status === 'open' && (
          <div className="alert warn stack" style={{ gap: 8 }}>
            <div>Erasing deletes their profile, attendance, serving, group membership, prayer requests and form answers. Gift records stay with name and PAN only, because the Income Tax Act requires them. Church registers (baptism, marriage) stay as permanent records.</div>
            {!canErase ? <div className="small">Only the owner or an admin can erase.</div> : confirmErase ? (
              <div className="row wrap" style={{ gap: 8 }}>
                <button className="btn sm danger" disabled={erase.busy} onClick={async () => { if (await erase.run()) { toast(`${r.personName} erased`); onDone(); } }}><Trash2 size={14} /> Erase {r.personName}</button>
                <button className="btn sm ghost" onClick={() => setConfirmErase(false)}>Cancel</button>
              </div>
            ) : <div><button className="btn sm danger" onClick={() => setConfirmErase(true)}><Trash2 size={14} /> Erase…</button></div>}
          </div>
        )}
        <FormError error={update.error ?? erase.error ?? exp.error} />
      </div>
    </Modal>
  );
}

function NewRequest({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [who, setWho] = useState<PickedPerson | null>(null);
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [kind, setKind] = useState<DataRequestKind>('correction');
  const [details, setDetails] = useState('');
  const save = useAction(() => AdminApi.privacy.create({ personId: who?.id ?? null, personName: who ? undefined : name, contact: contact || undefined, kind, details }));
  return (
    <Modal title="Record a data request" onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={(!who && !name.trim()) || save.busy} onClick={async () => { if (await save.run()) onDone(); }}>Save</button></>}>
      <div className="stack">
        <Field label="Person"><PersonField value={who} onChange={setWho} /></Field>
        {!who && <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Or type their name" aria-label="Name" />}
        {!who && <input className="input" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Phone or email" aria-label="Contact" />}
        <Field label="Asked for">
          <select className="select" value={kind} onChange={(e) => setKind(e.target.value as DataRequestKind)}>
            {Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Details"><textarea className="textarea" rows={3} value={details} onChange={(e) => setDetails(e.target.value)} /></Field>
        <FormError error={save.error} />
      </div>
    </Modal>
  );
}

function Officer({ d, onSaved }: { d: PrivacyOverview; onSaved: (d: PrivacyOverview) => void }) {
  const toast = useToast();
  const [f, setF] = useState(d.settings);
  const save = useAction(() => AdminApi.privacy.saveSettings(f));
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));
  return (
    <section className="card card-pad stack">
      <h3 style={{ margin: 0 }}>Grievance officer and privacy notice</h3>
      <div className="grid cols-3">
        <Field label="Name"><input className="input" value={f.officerName} onChange={(e) => set({ officerName: e.target.value })} placeholder="e.g. the church secretary" /></Field>
        <Field label="Email"><input className="input" type="email" value={f.officerEmail} onChange={(e) => set({ officerEmail: e.target.value })} /></Field>
        <Field label="Phone"><input className="input" value={f.officerPhone} onChange={(e) => set({ officerPhone: e.target.value })} /></Field>
      </div>
      <Field label="Notice members see" hint="Say what you keep, why, and how they can change it. Shown in the member app next to their consent choices.">
        <textarea className="textarea" rows={4} value={f.notice} onChange={(e) => set({ notice: e.target.value })} />
      </Field>
      <Field label="Review people inactive for (months)" hint="They are counted above so you can decide whether to keep their data.">
        <input className="input" style={{ maxWidth: 120 }} type="number" min={6} max={120} value={f.reviewAfterMonths} onChange={(e) => set({ reviewAfterMonths: Number(e.target.value) })} />
      </Field>
      <FormError error={save.error} />
      <div><button className="btn primary" disabled={save.busy} onClick={async () => { const r = await save.run(); if (r) { onSaved(r); toast('Saved'); } }}>Save</button></div>
    </section>
  );
}
