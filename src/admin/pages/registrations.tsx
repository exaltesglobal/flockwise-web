// People › Registrations: families who registered themselves from the public link or QR code. Each
// one waits here; the office sees who might already be in People, links them instead of making a
// second record, and approves the family into People as one household, or declines it.
import { AlertTriangle, Check, Copy, ExternalLink, Settings2, UserPlus, UsersRound, X } from 'lucide-react';
import { useState } from 'react';

import { AdminApi } from '@/api/endpoints';
import type { RegistrationSettings, RegistrationView, RegistrationsHub } from '@/core/types';
import { QrCode } from '@/components/qr';
import { Empty, ErrorState, Field, FormError, Loading, Modal, Segmented, useToast } from '@/components/ui';
import { formatDate, formatRelative } from '@/lib/format';
import { useCan } from '@/lib/perms';
import { useAction, useApi } from '@/lib/use-api';

import { PageHeader } from '../layout';

const REL: Record<string, string> = { head: 'Head', spouse: 'Spouse', child: 'Child', parent: 'Parent', other: 'Relative' };
const WHY: Record<string, string> = { phone: 'same phone', email: 'same email', name: 'same name' };
const yearsOld = (d: string | null) => (d ? Math.floor((Date.now() - Date.parse(`${d}T12:00:00`)) / 31_557_600_000) : null);

export function RegistrationsPage() {
  const q = useApi(AdminApi.registrations.get);
  const can = useCan();
  const editable = can('people.edit');
  const [tab, setTab] = useState<'pending' | 'recent'>('pending');
  const [setup, setSetup] = useState(false);
  const toast = useToast();
  const title = 'Registrations';
  if (q.error) return <><PageHeader title={title} /><ErrorState error={q.error} onRetry={q.reload} /></>;
  if (!q.data) return <><PageHeader title={title} /><Loading /></>;
  const d = q.data;
  const replace = (x: RegistrationView) => q.setData({ ...d, pending: d.pending.filter((p) => p.id !== x.id), recent: [x, ...d.recent.filter((p) => p.id !== x.id)] });
  const copy = () => navigator.clipboard?.writeText(d.publicUrl).then(() => toast('Link copied'), () => undefined);
  const list = tab === 'pending' ? d.pending : d.recent;
  return (
    <>
      <PageHeader
        title={title}
        subtitle="Share the link or QR code on the screen, the notice board or WhatsApp. Families register everyone in the house themselves; nothing reaches People until you approve it."
        actions={<>
          <button className="btn" onClick={copy}><Copy size={15} /> Copy link</button>
          {editable && <button className="btn" onClick={() => setSetup(true)}><Settings2 size={15} /> Form and QR</button>}
        </>}
      />
      {!d.settings.enabled && <div className="alert warn" style={{ marginBottom: 12, alignItems: "center" }}><AlertTriangle size={16} /> The registration form is closed. {editable && <button className="btn sm" onClick={() => setSetup(true)}>Open it</button>}</div>}
      <div className="row between wrap" style={{ gap: 8, marginBottom: 12 }}>
        <Segmented value={tab} onChange={setTab} options={[{ value: 'pending', label: `Waiting (${d.pending.length})` }, { value: 'recent', label: 'Handled' }]} />
        <a className="small" href={d.publicUrl} target="_blank" rel="noreferrer">Open the form <ExternalLink size={12} /></a>
      </div>
      {!list.length ? (
        tab === 'pending'
          ? <Empty icon={<UsersRound size={28} />} title="No one waiting" body="When a family fills in the registration form, they show up here for you to approve." action={editable && <button className="btn primary" onClick={() => setSetup(true)}>Get the QR code</button>} />
          : <Empty title="Nothing handled yet" />
      ) : (
        <div className="stack">
          {list.map((x) => <RegistrationCard key={x.id} x={x} editable={editable && x.status === 'pending'} defaultStatus={d.settings.defaultStatus} onDone={(n, msg) => { replace(n); toast(msg); }} />)}
        </div>
      )}
      {setup && <SetupModal hub={d} onClose={() => setSetup(false)} onSaved={(s) => { q.setData({ ...d, settings: s }); toast('Saved'); }} />}
    </>
  );
}

function RegistrationCard({ x, editable, defaultStatus, onDone }: { x: RegistrationView; editable: boolean; defaultStatus: RegistrationSettings['defaultStatus']; onDone: (x: RegistrationView, msg: string) => void }) {
  const [status, setStatus] = useState<'visitor' | 'regular' | 'member'>(x.wantsMembership ? 'member' : defaultStatus);
  // Which form member is the same as someone already in People (by member index).
  const [link, setLink] = useState<Record<number, string>>({});
  const approve = useAction(async () => onDone(await AdminApi.registrations.approve(x.id, { status, link }), `${x.householdName} added to People.`));
  const decline = useAction(async () => onDone(await AdminApi.registrations.decline(x.id), `${x.householdName} declined.`));
  const tone = x.status === 'approved' ? 'ok' : x.status === 'declined' ? 'gray' : 'warn';
  return (
    <article className="card card-pad stack" style={{ gap: 10 }}>
      <div className="row between wrap" style={{ gap: 8 }}>
        <div className="stack" style={{ gap: 2 }}>
          <b style={{ fontSize: 16 }}>{x.householdName}</b>
          <span className="small muted">{[x.phone, x.email, x.area].filter(Boolean).join(' · ')} · {formatRelative(x.createdAt)}</span>
        </div>
        <span className={`badge ${tone}`}>{x.status === 'pending' ? 'Waiting' : x.status === 'approved' ? `Approved${x.decidedBy ? ` by ${x.decidedBy}` : ''}` : 'Declined'}</span>
      </div>
      <div className="table-wrap">
        <table className="table reg-table">
          <thead><tr><th>Name</th><th>Relation</th><th>Age</th><th>Contact</th>{editable && x.matches.length > 0 && <th>Already in People?</th>}</tr></thead>
          <tbody>
            {x.members.map((m, i) => (
              <tr key={i}>
                <td>{m.firstName} {m.lastName}{m.baptised && <span className="badge gray" style={{ marginLeft: 6 }}>Baptised</span>}</td>
                <td>{REL[m.relation]}{m.gender ? ` · ${m.gender === 'male' ? 'M' : 'F'}` : ''}</td>
                <td>{yearsOld(m.birthDate) ?? '-'}</td>
                <td className="small">{[m.phone, m.email].filter(Boolean).join(', ') || '-'}</td>
                {editable && x.matches.length > 0 && (
                  <td>
                    <select className="input small" value={link[i] ?? ''} onChange={(e) => setLink((l) => { const n = { ...l }; if (e.target.value) n[i] = e.target.value; else delete n[i]; return n; })}>
                      <option value="">New person</option>
                      {x.matches.map((p) => <option key={p.personId} value={p.personId}>Same as {p.name} ({WHY[p.why]})</option>)}
                    </select>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {x.matches.length > 0 && x.status === 'pending' && (
        <div className="alert warn small"><AlertTriangle size={15} /> Might already be in People: {x.matches.map((p) => `${p.name} (${WHY[p.why]})`).join(', ')}. Pick "Same as" to update that record instead of adding a new one.</div>
      )}
      {(x.address || x.previousChurch || x.howHeard || x.note || x.wantsMembership) && (
        <div className="small stack" style={{ gap: 2 }}>
          {x.address && <span><span className="muted">Address:</span> {x.address}</span>}
          {x.previousChurch && <span><span className="muted">Previous church:</span> {x.previousChurch}</span>}
          {x.howHeard && <span><span className="muted">Heard about us:</span> {x.howHeard}</span>}
          {x.wantsMembership && <span><b>Would like to become members.</b></span>}
          {x.note && <span><span className="muted">Note:</span> {x.note}</span>}
        </div>
      )}
      <span className="small muted">Contact by {[x.consent.whatsapp && 'WhatsApp/SMS', x.consent.email && 'email'].filter(Boolean).join(' and ') || 'no messages'}{x.consent.directory ? ' · in the directory' : ''}{x.decidedAt ? ` · handled ${formatDate(x.decidedAt)}` : ''}</span>
      {editable && (
        <div className="row wrap" style={{ gap: 8, alignItems: 'center' }}>
          <FormError error={approve.error ?? decline.error} />
          <label className="row small" style={{ gap: 6, whiteSpace: "nowrap" }}>Add as
            <select className="input small" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
              <option value="visitor">Visitors</option><option value="regular">Regulars</option><option value="member">Members</option>
            </select>
          </label>
          <span className="grow" />
          <button className="btn ghost" disabled={decline.busy || approve.busy} onClick={() => void decline.run()}><X size={15} /> Decline</button>
          <button className="btn primary" disabled={approve.busy || decline.busy} onClick={() => void approve.run()}><Check size={15} /> Approve {x.members.length > 1 ? `all ${x.members.length}` : ''}</button>
        </div>
      )}
    </article>
  );
}

function SetupModal({ hub, onClose, onSaved }: { hub: RegistrationsHub; onClose: () => void; onSaved: (s: RegistrationSettings) => void }) {
  const [s, setS] = useState(hub.settings);
  const save = useAction(async () => { onSaved(await AdminApi.registrations.settings(s)); onClose(); });
  return (
    <Modal title="Registration form and QR code" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={save.busy} onClick={() => void save.run()}>Save</button></>}>
      <div className="stack">
        <FormError error={save.error} />
        <div className="row wrap" style={{ gap: 16, alignItems: 'flex-start' }}>
          <QrCode value={hub.publicUrl} size={150} label="Scan to register your family" />
          <div className="stack grow" style={{ gap: 8, minWidth: 200 }}>
            <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={s.enabled} onChange={(e) => setS({ ...s, enabled: e.target.checked })} /> <b>The form is open</b></label>
            <p className="small muted" style={{ margin: 0 }}>Put the QR on the screen after the service, on the welcome card or the notice board. The link works on WhatsApp too.</p>
            <input className="input small" readOnly value={hub.publicUrl} onFocus={(e) => e.currentTarget.select()} />
          </div>
        </div>
        <Field label="Welcome text at the top" hint="Leave blank for a short welcome with the church name"><textarea className="input" rows={3} maxLength={600} value={s.intro} onChange={(e) => setS({ ...s, intro: e.target.value })} /></Field>
        <div className="stack" style={{ gap: 6 }}>
          <span className="small muted">Also ask</span>
          <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={s.askBaptism} onChange={(e) => setS({ ...s, askBaptism: e.target.checked })} /> Whether each person is baptised</label>
          <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={s.askPreviousChurch} onChange={(e) => setS({ ...s, askPreviousChurch: e.target.checked })} /> The church they came from</label>
          <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={s.askHowHeard} onChange={(e) => setS({ ...s, askHowHeard: e.target.checked })} /> How they heard about the church</label>
        </div>
        <div className="grid cols-2">
          <Field label="Add approved families as">
            <select className="input" value={s.defaultStatus} onChange={(e) => setS({ ...s, defaultStatus: e.target.value as RegistrationSettings['defaultStatus'] })}>
              <option value="visitor">Visitors</option><option value="regular">Regulars</option><option value="member">Members</option>
            </select>
          </Field>
          <Field label="Tag them with"><input className="input" maxLength={40} value={s.tag} onChange={(e) => setS({ ...s, tag: e.target.value })} /></Field>
        </div>
        <p className="small muted" style={{ margin: 0 }}><UserPlus size={13} /> Families who tick "we would like to become members" are added as members.</p>
      </div>
    </Modal>
  );
}
