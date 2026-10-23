// People › Safeguarding: who works with children, whether their police verification, training and
// declaration are current, and the rules the rota follows.
import { Plus, ShieldAlert, ShieldCheck, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import { AdminApi } from '@/api/endpoints';
import type { SafeguardKind, SafeguardPersonView, SafeguardSettings, SafeguardStatus } from '@/core/types';
import { Empty, ErrorState, Field, FormError, Loading, Modal, Segmented, useToast } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { useCan } from '@/lib/perms';
import { useAction, useApi } from '@/lib/use-api';

import { PageHeader } from '../layout';

const LABEL: Record<SafeguardKind, string> = { police: 'Police verification', training: 'Child-protection training', declaration: 'Signed declaration', reference: 'Reference' };
const SHORT: Record<SafeguardKind, string> = { police: 'Police', training: 'Training', declaration: 'Declaration', reference: 'Reference' };
const STATUS: Record<SafeguardStatus, { label: string; badge: string }> = { cleared: { label: 'Cleared', badge: 'ok' }, expiring: { label: 'Renew soon', badge: 'warn' }, expired: { label: 'Expired', badge: 'danger' }, missing: { label: 'Not cleared', badge: 'danger' } };
type Filter = 'all' | 'attention' | 'cleared';
const today = () => new Date().toISOString().slice(0, 10);

export function SafeguardingPage() {
  const hub = useApi(AdminApi.safeguarding.hub);
  const can = useCan();
  const editable = can('people.edit');
  const [filter, setFilter] = useState<Filter>('attention');
  const [recording, setRecording] = useState<SafeguardPersonView | null>(null);
  const [rules, setRules] = useState(false);
  const toast = useToast();
  const remove = useAction(async (personId: string, checkId: string) => { await AdminApi.safeguarding.removeCheck(personId, checkId); hub.reload(); });

  if (hub.error) return <><PageHeader title="Safeguarding" /><ErrorState error={hub.error} onRetry={hub.reload} /></>;
  if (!hub.data) return <><PageHeader title="Safeguarding" /><Loading /></>;
  const d = hub.data;
  const shown = d.people.filter((p) => filter === 'all' || (filter === 'cleared' ? p.status === 'cleared' : p.status !== 'cleared'));
  const teamNames = d.teams.filter((t) => d.settings.teamIds.includes(t.id)).map((t) => t.name);

  return (
    <>
      <PageHeader
        title="Safeguarding"
        subtitle="Everyone who works with children: police verification, child-protection training and a signed declaration, and when each runs out."
        actions={editable && <button className="btn" onClick={() => setRules(true)}>Rules</button>}
      />
      <div className="stack sg">
        <div className="stat-row">
          <div className="card card-pad sg-stat"><span className="muted small">Cleared</span><b>{d.counts.cleared}</b></div>
          <div className="card card-pad sg-stat"><span className="muted small">Renew within 60 days</span><b>{d.counts.expiring}</b></div>
          <div className="card card-pad sg-stat"><span className="muted small">Expired or missing</span><b>{d.counts.expired + d.counts.missing}</b></div>
          <div className={`card card-pad sg-stat ${d.atRisk ? 'sg-risk' : ''}`}><span className="muted small">On the rota without clearance</span><b>{d.atRisk}</b><span className="muted small">next 30 days</span></div>
        </div>
        <p className="muted small" style={{ margin: 0 }}>
          Covers {teamNames.length ? teamNames.join(', ') : 'no teams yet'}{d.settings.sundaySchool ? ' and Sunday school teachers' : ''}. Needs {d.settings.required.map((k) => LABEL[k].toLowerCase()).join(', ')}. The rota {d.settings.blockRota ? 'refuses' : 'warns about'} anyone not cleared.
        </p>
        <Segmented value={filter} onChange={setFilter} options={[{ value: 'attention', label: `Needs attention (${d.people.length - d.counts.cleared})` }, { value: 'cleared', label: `Cleared (${d.counts.cleared})` }, { value: 'all', label: `Everyone (${d.people.length})` }]} />
        {!shown.length ? (
          <Empty icon={<ShieldCheck size={28} />} title={filter === 'attention' ? 'Everyone is cleared' : 'Nobody here'} body={d.people.length ? undefined : 'Choose which teams work with children under Rules.'} />
        ) : (
          <div className="card table-wrap">
            <table className="table sg-table">
              <thead><tr><th>Person</th><th>Serves in</th><th>Checks</th><th>Status</th>{editable && <th />}</tr></thead>
              <tbody>
                {shown.map((p) => (
                  <tr key={p.personId}>
                    <td><b>{p.name}</b>{p.phone && <div className="small muted">{p.phone}</div>}{p.scheduled.length > 0 && p.status !== 'cleared' && <div className="small sg-warn"><ShieldAlert size={12} /> On the rota {formatDate(p.scheduled[0].startsAt)}</div>}</td>
                    <td className="small">{p.roles.join(', ')}</td>
                    <td>
                      <div className="sg-chips">
                        {p.items.map((i) => (
                          <span key={i.kind} className={`badge ${i.state === 'cleared' ? 'ok' : i.state === 'expiring' ? 'warn' : 'danger'}`} title={i.check ? `${LABEL[i.kind]} · ${formatDate(i.check.issuedOn)}${i.expiresOn ? ` · until ${formatDate(i.expiresOn)}` : ''}${i.check.reference ? ` · ${i.check.reference}` : ''}` : `${LABEL[i.kind]} missing`}>
                            {SHORT[i.kind]}{i.expiresOn && i.state !== 'missing' ? ` · ${i.state === 'expired' ? 'expired' : 'to'} ${formatDate(i.expiresOn)}` : i.state === 'missing' ? ' · missing' : ''}
                          </span>
                        ))}
                      </div>
                      {editable && p.checks.length > 0 && (
                        <details className="small sg-history"><summary>{p.checks.length} record{p.checks.length === 1 ? '' : 's'}</summary>
                          <ul>{p.checks.map((c) => <li key={c.id}>{LABEL[c.kind]} · {formatDate(c.issuedOn)}{c.reference ? ` · ${c.reference}` : ''} <span className="muted">by {c.recordedBy}</span> <button className="btn sm ghost" onClick={() => { if (confirm('Remove this record?')) void remove.run(p.personId, c.id); }}><Trash2 size={12} /></button></li>)}</ul>
                        </details>
                      )}
                    </td>
                    <td><span className={`badge ${STATUS[p.status].badge}`}>{STATUS[p.status].label}</span></td>
                    {editable && <td><button className="btn sm" onClick={() => setRecording(p)}><Plus size={14} /> Record</button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <FormError error={remove.error} />
      </div>
      {recording && <RecordCheck person={recording} validMonths={d.settings.validMonths} onClose={() => setRecording(null)} onDone={(v) => { setRecording(null); toast(`${v.name}: ${STATUS[v.status].label.toLowerCase()}.`); hub.reload(); }} />}
      {rules && <RulesDialog settings={d.settings} teams={d.teams} onClose={() => setRules(false)} onDone={() => { setRules(false); toast('Rules saved.'); hub.reload(); }} />}
    </>
  );
}

function RecordCheck({ person, validMonths, onClose, onDone }: { person: SafeguardPersonView; validMonths: Record<SafeguardKind, number>; onClose: () => void; onDone: (v: SafeguardPersonView) => void }) {
  const first = person.items.find((i) => i.state !== 'cleared')?.kind ?? 'police';
  const [kind, setKind] = useState<SafeguardKind>(first);
  const [issuedOn, setIssuedOn] = useState(today());
  const [expiresOn, setExpiresOn] = useState('');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const save = useAction(async (e: FormEvent) => { e.preventDefault(); onDone(await AdminApi.safeguarding.addCheck(person.personId, { kind, issuedOn, expiresOn: expiresOn || null, reference, note })); });
  return (
    <Modal title={`Record a check for ${person.name}`} onClose={onClose}>
      <form className="stack" onSubmit={save.run}>
        <Field label="What">
          <select value={kind} onChange={(e) => setKind(e.target.value as SafeguardKind)}>{(Object.keys(LABEL) as SafeguardKind[]).map((k) => <option key={k} value={k}>{LABEL[k]}</option>)}</select>
        </Field>
        <Field label={kind === 'police' ? 'Date on the certificate' : kind === 'training' ? 'Date of the training' : 'Date signed or received'}><input type="date" value={issuedOn} max={today()} onChange={(e) => setIssuedOn(e.target.value)} required /></Field>
        <Field label="Valid until" hint={validMonths[kind] ? `Leave blank for ${validMonths[kind]} months from that date.` : 'Leave blank if it does not expire.'}><input type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} /></Field>
        <Field label={kind === 'police' ? 'Certificate or application number' : 'Reference'}><input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={80} placeholder={kind === 'police' ? 'From the police clearance certificate' : ''} /></Field>
        <Field label="Note"><input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder={kind === 'reference' ? 'Who gave the reference' : 'Kept in the office file'} /></Field>
        <p className="small muted" style={{ margin: 0 }}>Keep the paper copy in the office file; record only the date and number here.</p>
        <FormError error={save.error} />
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={save.busy}>Save</button>
        </div>
      </form>
    </Modal>
  );
}

function RulesDialog({ settings, teams, onClose, onDone }: { settings: SafeguardSettings; teams: { id: string; name: string }[]; onClose: () => void; onDone: () => void }) {
  const [s, setS] = useState<SafeguardSettings>(settings);
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const save = useAction(async (e: FormEvent) => { e.preventDefault(); await AdminApi.safeguarding.settings(s); onDone(); });
  return (
    <Modal title="Safeguarding rules" onClose={onClose}>
      <form className="stack" onSubmit={save.run}>
        <Field label="Teams that work with children">
          <div className="sg-checks">{teams.map((t) => <label key={t.id} className="row small" style={{ gap: 6 }}><input type="checkbox" checked={s.teamIds.includes(t.id)} onChange={() => setS({ ...s, teamIds: toggle(s.teamIds, t.id) })} /> {t.name}</label>)}</div>
        </Field>
        <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={s.sundaySchool} onChange={(e) => setS({ ...s, sundaySchool: e.target.checked })} /> Sunday school teachers too</label>
        <Field label="Needed to be cleared, and how long each lasts">
          <div className="stack" style={{ gap: 6 }}>
            {(Object.keys(LABEL) as SafeguardKind[]).map((k) => (
              <div key={k} className="row small" style={{ gap: 8, justifyContent: 'space-between' }}>
                <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={s.required.includes(k)} onChange={() => setS({ ...s, required: toggle(s.required, k) })} /> {LABEL[k]}</label>
                <label className="row" style={{ gap: 6 }}><input type="number" min={0} max={120} value={s.validMonths[k]} onChange={(e) => setS({ ...s, validMonths: { ...s.validMonths, [k]: Number(e.target.value) } })} style={{ width: 70 }} /> months</label>
              </div>
            ))}
            <span className="muted small">0 months means it does not expire.</span>
          </div>
        </Field>
        <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={s.blockRota} onChange={(e) => setS({ ...s, blockRota: e.target.checked })} /> Do not let the rota schedule anyone who is not cleared (otherwise it only warns)</label>
        <FormError error={save.error} />
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={save.busy}>Save rules</button>
        </div>
      </form>
    </Modal>
  );
}
