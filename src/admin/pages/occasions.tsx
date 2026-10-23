// Care › Weddings & funerals: pastoral services members ask for in the app or the office takes down
// from a phone call. Confirm the date and pastor, then work through the checklist for the occasion.
import { Check, Church, Plus, Trash2, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import { AdminApi, type OccasionInput } from '@/api/endpoints';
import type { OccasionKind, OccasionsHub, OccasionView } from '@/core/types';
import { Empty, ErrorState, Field, FormError, Loading, Modal, Segmented, useToast } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { useCan } from '@/lib/perms';
import { useAction, useApi } from '@/lib/use-api';

import { PersonSearch, type PickedPerson } from '../components/person-picker';
import { PageHeader } from '../layout';

export const OCCASION: Record<OccasionKind, string> = { wedding: 'Wedding', funeral: 'Funeral', dedication: 'Baby dedication', house_blessing: 'House blessing', baptism: 'Baptism', other: 'Other service' };
const day = (d: string | null) => (d ? formatDate(`${d}T12:00:00`) : 'Date not set');
const when = (o: OccasionView) => `${day(o.date)}${o.time ? `, ${o.time}` : ''}`;

export function OccasionsPage() {
  const q = useApi(AdminApi.occasions.hub);
  const can = useCan();
  const editable = can('care');
  const toast = useToast();
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const [editing, setEditing] = useState<OccasionView | 'new' | null>(null);
  const [open, setOpen] = useState<OccasionView | null>(null);
  if (q.error) return <><PageHeader title="Weddings & funerals" /><ErrorState error={q.error} onRetry={q.reload} /></>;
  if (!q.data) return <><PageHeader title="Weddings & funerals" /><Loading /></>;
  const d = q.data;
  const list = tab === 'upcoming' ? d.upcoming : d.past;
  const year = Object.entries(d.counts.thisYear).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${OCCASION[k as OccasionKind].toLowerCase()}${n === 1 ? '' : 's'}`).join(', ');
  const saved = (o: OccasionView, msg: string) => { setEditing(null); setOpen(o.status === 'cancelled' ? null : o); toast(msg); q.reload(); };

  return (
    <>
      <PageHeader
        title="Weddings & funerals"
        subtitle="Weddings, funerals, baby dedications and house blessings. Members ask from the app; you confirm the date and pastor and work through the checklist. The pastor is reminded the day before."
        actions={editable && <button className="btn primary" onClick={() => setEditing('new')}><Plus size={16} /> New service</button>}
      />
      <div className="stack">
        <div className="stat-row">
          <div className={`card card-pad co-stat ${d.counts.requests ? 'sg-risk' : ''}`}><span className="muted small">Requests waiting</span><b className="co-big">{d.counts.requests}</b></div>
          <div className="card card-pad co-stat"><span className="muted small">Coming up</span><b className="co-big">{d.upcoming.length}</b><span className="small muted">{d.counts.thisMonth} this month</span></div>
          <div className="card card-pad co-stat"><span className="muted small">This year</span><b className="co-big">{Object.values(d.counts.thisYear).reduce((a, b) => a + b, 0)}</b><span className="small muted">{year || 'None yet'}</span></div>
        </div>

        {d.requests.length > 0 && (
          <div className="card card-pad stack" style={{ gap: 8 }}>
            <b>Requests from the app</b>
            <ul className="lib-list">
              {d.requests.map((o) => (
                <li key={o.id}>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <b>{o.title}</b><span className="small muted"> · {o.requestedByName ?? o.contactName}{o.contactPhone ? ` · ${o.contactPhone}` : ''} · {o.date ? `hoping for ${day(o.date)}` : 'no date yet'}</span>
                    {o.requestNote && <div className="small">“{o.requestNote}”</div>}
                  </div>
                  {editable && <button className="btn sm primary" onClick={() => setEditing(o)}>Confirm date and pastor</button>}
                  <button className="btn sm ghost" onClick={() => setOpen(o)}>Open</button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <Segmented value={tab} onChange={setTab} options={[{ value: 'upcoming', label: `Coming up (${d.upcoming.length})` }, { value: 'past', label: 'Done and cancelled' }]} />
        {!list.length ? (
          <Empty icon={<Church size={28} />} title={tab === 'upcoming' ? 'Nothing scheduled' : 'Nothing here yet'} body="Members can ask for a wedding, funeral, dedication or house blessing from the app, or you can add one from a phone call." action={editable && tab === 'upcoming' && <button className="btn primary" onClick={() => setEditing('new')}>Add a service</button>} />
        ) : (
          <div className="card table-wrap">
            <table className="table">
              <thead><tr><th>When</th><th>Service</th><th>Pastor</th><th>Checklist</th></tr></thead>
              <tbody>
                {list.map((o) => (
                  <tr key={o.id} onClick={() => setOpen(o)} style={{ cursor: 'pointer' }}>
                    <td className="small"><b>{when(o)}</b>{o.place && <div className="muted ellipsis" style={{ maxWidth: 220 }}>{o.place}</div>}</td>
                    <td><b>{o.title}</b><div className="small muted">{OCCASION[o.kind]}{o.status === 'cancelled' ? ' · cancelled' : o.status === 'done' ? ' · done' : ''}</div></td>
                    <td className="small">{o.pastorName ?? <span className="badge warn">Not assigned</span>}</td>
                    <td>{o.total ? <div className="oc-progress"><div className="vg-bar"><span style={{ width: `${Math.round((o.done / o.total) * 100)}%` }} /></div><span className="small muted">{o.done}/{o.total}</span></div> : <span className="small muted">-</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {editing && <OccasionForm occasion={editing === 'new' ? null : editing} pastors={d.pastors} onClose={() => setEditing(null)} onDone={saved} />}
      {open && !editing && <Detail o={open} editable={editable} onEdit={() => setEditing(open)} onChange={(o) => { setOpen(o); q.reload(); }} onClose={() => setOpen(null)} onDeleted={() => { setOpen(null); toast('Removed.'); q.reload(); }} />}
    </>
  );
}

function OccasionForm({ occasion: o, pastors, onClose, onDone }: { occasion: OccasionView | null; pastors: OccasionsHub['pastors']; onClose: () => void; onDone: (o: OccasionView, msg: string) => void }) {
  const [f, setF] = useState<OccasionInput>({
    kind: o?.kind ?? 'wedding', personIds: o?.personIds ?? [], title: o?.title ?? '', date: o?.date ?? '', time: o?.time ?? '', place: o?.place ?? '',
    pastorId: o?.pastorId ?? '', contactName: o?.contactName ?? '', contactPhone: o?.contactPhone ?? '', notes: o?.notes ?? '',
  });
  const [people, setPeople] = useState<PickedPerson[]>(o?.people ?? []);
  const set = <K extends keyof OccasionInput>(k: K, v: OccasionInput[K]) => setF((x) => ({ ...x, [k]: v }));
  const save = useAction(async (e: FormEvent) => {
    e.preventDefault();
    const input = { ...f, personIds: people.map((p) => p.id), date: f.date || null, time: f.time || null, pastorId: f.pastorId || null };
    if (o) {
      const status = o.status === 'requested' && input.date ? 'scheduled' : undefined;
      const next = await AdminApi.occasions.update(o.id, { ...input, ...(status ? { status } : {}) });
      onDone(next, next.status === 'scheduled' && o.status === 'requested' ? 'Confirmed. The family has been told.' : 'Saved.');
    } else onDone(await AdminApi.occasions.create(input), 'Service added.');
  });
  const who = f.kind === 'wedding' ? 'Bride and groom' : f.kind === 'funeral' ? 'The one who has passed away' : f.kind === 'dedication' ? 'The child and parents' : 'People';
  return (
    <Modal title={o ? (o.status === 'requested' ? 'Confirm the service' : 'Edit service') : 'New service'} onClose={onClose}>
      <form className="stack" onSubmit={save.run}>
        <Field label="Service"><select value={f.kind} onChange={(e) => set('kind', e.target.value as OccasionKind)}>{(Object.keys(OCCASION) as OccasionKind[]).map((k) => <option key={k} value={k}>{OCCASION[k]}</option>)}</select></Field>
        <Field label={who} hint="People in the church directory. Leave empty if they are not in it.">
          <div className="stack" style={{ gap: 6 }}>
            {people.length > 0 && <div className="row wrap" style={{ gap: 6 }}>{people.map((p) => <span key={p.id} className="badge gray oc-chip">{p.name}<button type="button" aria-label={`Remove ${p.name}`} onClick={() => setPeople((x) => x.filter((y) => y.id !== p.id))}><X size={12} /></button></span>)}</div>}
            {people.length < 6 && <PersonSearch exclude={people.map((p) => p.id)} onPick={(p) => setPeople((x) => [...x, p])} placeholder="Add a person" />}
          </div>
        </Field>
        <Field label="Title" hint="Filled in from the names if left empty."><input value={f.title} onChange={(e) => set('title', e.target.value)} maxLength={140} placeholder={f.kind === 'funeral' ? 'Funeral of Mr. Joseph' : 'Wedding of Arun and Grace'} /></Field>
        <div className="co-grid">
          <Field label="Date"><input type="date" value={f.date ?? ''} onChange={(e) => set('date', e.target.value)} /></Field>
          <Field label="Time"><input type="time" value={f.time ?? ''} onChange={(e) => set('time', e.target.value)} /></Field>
        </div>
        <Field label="Place"><input value={f.place} onChange={(e) => set('place', e.target.value)} maxLength={200} placeholder="Church main hall, home address or cemetery" /></Field>
        <Field label="Pastor taking it">
          <select value={f.pastorId ?? ''} onChange={(e) => set('pastorId', e.target.value)}>
            <option value="">Not assigned yet</option>
            {pastors.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <div className="co-grid">
          <Field label="Family contact"><input value={f.contactName} onChange={(e) => set('contactName', e.target.value)} maxLength={100} /></Field>
          <Field label="Phone"><input value={f.contactPhone} onChange={(e) => set('contactPhone', e.target.value)} maxLength={20} inputMode="tel" /></Field>
        </div>
        <Field label="Notes" hint="Only the office sees this."><textarea rows={3} value={f.notes} onChange={(e) => set('notes', e.target.value)} maxLength={2000} /></Field>
        <FormError error={save.error} />
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={save.busy}>{o?.status === 'requested' ? 'Confirm' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  );
}

function Detail({ o, editable, onEdit, onChange, onClose, onDeleted }: { o: OccasionView; editable: boolean; onEdit: () => void; onChange: (o: OccasionView) => void; onClose: () => void; onDeleted: () => void }) {
  const [label, setLabel] = useState('');
  const act = useAction(async (fn: () => Promise<OccasionView>) => onChange(await fn()));
  const del = useAction(async () => { await AdminApi.occasions.remove(o.id); onDeleted(); });
  return (
    <Modal title={o.title} onClose={onClose} wide>
      <div className="stack">
        <div className="small muted">
          {OCCASION[o.kind]} · {when(o)}{o.place ? ` · ${o.place}` : ''} · {o.pastorName ? `led by ${o.pastorName}` : 'pastor not assigned'}
          {o.contactName && <> · family contact {o.contactName}{o.contactPhone ? ` ${o.contactPhone}` : ''}</>}
          {o.via === 'app' && o.requestedByName && <> · asked by {o.requestedByName} in the app</>}
        </div>
        {o.requestNote && <p style={{ margin: 0 }}>“{o.requestNote}”</p>}
        {o.notes && <p className="small" style={{ margin: 0 }}>{o.notes}</p>}
        {editable && (
          <div className="row wrap" style={{ gap: 8 }}>
            <button className="btn sm" onClick={onEdit}>{o.status === 'requested' ? 'Confirm date and pastor' : 'Edit details'}</button>
            {o.status === 'scheduled' && <button className="btn sm" onClick={() => void act.run(() => AdminApi.occasions.update(o.id, { status: 'done' }))}><Check size={14} /> Mark done</button>}
            {(o.status === 'requested' || o.status === 'scheduled') && <button className="btn sm ghost" onClick={() => void act.run(() => AdminApi.occasions.update(o.id, { status: 'cancelled' }))}>Cancel service</button>}
            {(o.status === 'done' || o.status === 'cancelled') && <button className="btn sm ghost" onClick={() => void act.run(() => AdminApi.occasions.update(o.id, { status: o.date ? 'scheduled' : 'requested' }))}>Reopen</button>}
            <button className="btn sm ghost" aria-label="Delete" onClick={() => { if (confirm('Delete this service and its checklist?')) void del.run(); }}><Trash2 size={14} /></button>
          </div>
        )}
        <FormError error={act.error ?? del.error} />
        <b className="small">Checklist {o.total ? `(${o.done} of ${o.total})` : ''}</b>
        <ul className="ds-log">
          {o.checklist.map((t) => (
            <li key={t.id} className={t.done ? 'oc-done' : ''}>
              <label className="row grow" style={{ gap: 8, cursor: editable ? 'pointer' : 'default' }}>
                <input type="checkbox" checked={t.done} disabled={!editable} onChange={() => void act.run(() => AdminApi.occasions.checklist(o.id, { toggle: t.id }))} />
                <span>{t.label}</span>
              </label>
              {editable && <button className="btn sm ghost" aria-label="Remove task" onClick={() => void act.run(() => AdminApi.occasions.checklist(o.id, { remove: t.id }))}><X size={14} /></button>}
            </li>
          ))}
          {!o.checklist.length && <li className="muted small">No checklist items.</li>}
        </ul>
        {editable && (
          <form className="row" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); if (label.trim()) void act.run(async () => { const r = await AdminApi.occasions.checklist(o.id, { label }); setLabel(''); return r; }); }}>
            <input className="input grow" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} placeholder="Add a task, e.g. Book the photographer" />
            <button className="btn sm">Add</button>
          </form>
        )}
      </div>
    </Modal>
  );
}
