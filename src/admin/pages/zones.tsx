// Zones, prayer cells and family units with their leaders, and pastoral home visits: plan by
// area, log what happened, and see which families have not been visited this year.
import { CalendarCheck, Check, Home, ListChecks, MapPin, Pencil, Plus, Sparkles, Trash2, UserPlus, Users, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';

import type { VisitAction, VisitPurpose, VisitView, ZoneFamily, ZoneView } from '@/api/admin-types';
import { adminSession } from '@/api/client';
import { AdminApi } from '@/api/endpoints';
import { Empty, ErrorState, Field, FormError, Loading, Modal, Segmented, useToast } from '@/components/ui';
import { VISIT_PURPOSES } from '@/core/modules/zones';
import { formatDate, formatRelative } from '@/lib/format';
import { useCan } from '@/lib/perms';
import { useSession } from '@/lib/session';
import { useAction, useApi } from '@/lib/use-api';

import { DictateButton } from '../components/dictate';
import { PersonSearch, type PickedPerson } from '../components/person-picker';
import { PageHeader } from '../layout';

const LABELS = ['Zone', 'Prayer cell', 'Family unit', 'Kudumba unit', 'Ward', 'Area', 'Cell group'];
const day = (d: string | null) => (d ? formatDate(`${d}T12:00:00`) : '—');
const plural = (label: string) => (label.endsWith('y') ? `${label.slice(0, -1)}ies` : `${label}s`);
const today = () => new Date().toISOString().slice(0, 10);

type Tab = 'zones' | 'visits' | 'due' | 'report';

export function ZonesPage() {
  const can = useCan();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>((params.get('tab') as Tab) || 'zones');
  const settings = useApi(AdminApi.settings.get);
  const label = settings.data?.zoneLabel || 'Zone';
  const zones = useApi(AdminApi.zones.list);
  const [editing, setEditing] = useState<ZoneView | 'new' | null>(null);
  const [visitVersion, setVisitVersion] = useState(0);
  const [visit, setVisit] = useState<{ family?: ZoneFamily; edit?: VisitView } | null>(null);
  const openZone = params.get('zone');
  const setOpenZone = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('zone', id);
    else next.delete('zone');
    setParams(next, { replace: true });
  };

  const [saving, setSaving] = useState(false);
  async function setLabel(v: string) {
    setSaving(true);
    try {
      await AdminApi.settings.update({ zoneLabel: v });
      settings.reload();
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title={`${plural(label)} & visits`}
        subtitle={`Families grouped by ${label.toLowerCase()} with their leaders, and pastoral home visits: plan them, log them, and see who hasn’t been visited this year.`}
        actions={
          <>
            {can('care') && <button className="btn" onClick={() => setVisit({})}><CalendarCheck size={16} /> Plan or log a visit</button>}
            {can('people.edit') && <button className="btn primary" onClick={() => setEditing('new')}><Plus size={16} /> New {label.toLowerCase()}</button>}
          </>
        }
      />
      <div className="row wrap" style={{ gap: 10, marginBottom: 14 }}>
        <div className="seg-scroll">
          <Segmented value={tab} onChange={setTab} options={[{ value: 'zones', label: plural(label) }, { value: 'visits', label: 'Visits' }, { value: 'due', label: 'Not visited this year' }, { value: 'report', label: 'Report' }]} />
        </div>
        <span className="grow" />
        {can('settings') && (
          <label className="row small muted" style={{ gap: 6 }}>
            Call them
            <select className="select" style={{ width: 'auto' }} value={label} disabled={saving} onChange={(e) => setLabel(e.target.value)}>
              {LABELS.map((l) => <option key={l} value={l}>{plural(l)}</option>)}
            </select>
          </label>
        )}
      </div>

      {tab === 'zones' && (zones.error ? <ErrorState error={zones.error} onRetry={zones.reload} /> : !zones.data ? <Loading /> : zones.data.length === 0 ? (
        <div className="card"><Empty icon={<MapPin size={28} />} title={`No ${plural(label).toLowerCase()} yet`} body={`Create a ${label.toLowerCase()} for each area, then add families to it. Leaders and visits follow from there.`} action={can('people.edit') && <button className="btn primary" onClick={() => setEditing('new')}><Plus size={16} /> New {label.toLowerCase()}</button>} /></div>
      ) : (
        <div className="zone-grid">
          {zones.data.filter((z) => !z.parentId || !zones.data!.some((p) => p.id === z.parentId)).map((z) => (
            <ZoneCard key={z.id} z={z} units={zones.data!.filter((u) => u.parentId === z.id)} onOpen={setOpenZone} />
          ))}
        </div>
      ))}
      {tab === 'visits' && <VisitsTab onEdit={(v) => setVisit({ edit: v })} zones={zones.data ?? []} version={visitVersion} />}
      {tab === 'due' && <DueTab zones={zones.data ?? []} label={label} onPlan={(f) => setVisit({ family: f })} />}
      {tab === 'report' && <ReportTab label={label} />}

      {openZone && <ZoneDrawer id={openZone} label={label} onClose={() => setOpenZone(null)} onEdit={setEditing} onVisit={(family) => setVisit({ family })} onEditVisit={(v) => setVisit({ edit: v })} onChanged={zones.reload} />}
      {editing && <ZoneForm zone={editing === 'new' ? null : editing} zones={zones.data ?? []} label={label} onClose={() => setEditing(null)} onSaved={(z) => { setEditing(null); zones.reload(); setOpenZone(z.id); }} onDeleted={() => { setEditing(null); setOpenZone(null); zones.reload(); }} />}
      {visit && <VisitForm family={visit.family} visit={visit.edit} onClose={() => setVisit(null)} onSaved={() => { setVisit(null); zones.reload(); setVisitVersion((v) => v + 1); }} />}
    </>
  );
}

function Progress({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="stack" style={{ gap: 4 }}>
      <div className="progress"><i style={{ width: `${pct}%` }} /></div>
      <span className="small muted">{done} of {total} famil{total === 1 ? 'y' : 'ies'} visited this year</span>
    </div>
  );
}

function ZoneCard({ z, units, onOpen }: { z: ZoneView; units: ZoneView[]; onOpen: (id: string) => void }) {
  return (
    <button className="card zone-card" onClick={() => onOpen(z.id)}>
      <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
        <div className="grow" style={{ minWidth: 0 }}>
          <strong>{z.name}</strong>
          {z.area && <div className="small muted ellipsis">{z.area}</div>}
        </div>
        {!z.active && <span className="badge gray">Paused</span>}
      </div>
      <div className="row wrap small" style={{ gap: 12 }}>
        <span className="row" style={{ gap: 4 }}><Home size={13} /> {z.families} families</span>
        <span className="row" style={{ gap: 4 }}><Users size={13} /> {z.people} people</span>
        {units.length > 0 && <span>{units.length} unit{units.length === 1 ? '' : 's'}</span>}
      </div>
      <div className="small">{z.leaders.length ? `Led by ${z.leaders.map((l) => l.name).join(', ')}` : <span className="muted">No leader yet</span>}{z.meetingDay ? <span className="muted"> · {z.meetingDay}</span> : null}</div>
      <Progress done={z.visitedThisYear} total={z.families} />
    </button>
  );
}

function ZoneDrawer({ id, label, onClose, onEdit, onVisit, onEditVisit, onChanged }: { id: string; label: string; onClose: () => void; onEdit: (z: ZoneView) => void; onVisit: (f: ZoneFamily) => void; onEditVisit: (v: VisitView) => void; onChanged: () => void }) {
  const can = useCan();
  const toast = useToast();
  const { data, error, reload } = useApi(() => AdminApi.zones.get(id), [id]);
  const [adding, setAdding] = useState(false);
  const add = useAction(AdminApi.zones.addPeople);
  const remove = useAction(AdminApi.zones.removeFamily);
  const [filter, setFilter] = useState<'all' | 'due'>('all');
  const since = `${new Date().getFullYear()}-01-01`;
  const families = (data?.families ?? []).filter((f) => filter === 'all' || !f.lastVisitAt || f.lastVisitAt < since);

  return (
    <Modal side title={data?.zone.name ?? label} onClose={onClose}>
      {error ? <ErrorState error={error} onRetry={reload} /> : !data ? <Loading /> : (
        <div className="stack">
          <div className="stack" style={{ gap: 6 }}>
            {data.zone.area && <div className="small muted row" style={{ gap: 4 }}><MapPin size={13} /> {data.zone.area}</div>}
            <div className="small">{data.zone.leaders.length ? data.zone.leaders.map((l) => <span key={l.id} className="chip" style={{ marginRight: 6 }}><Link to={`/admin/people/${l.id}`}>{l.name}</Link>{l.phone ? ` · ${l.phone}` : ''}</span>) : <span className="muted">No leader yet</span>}</div>
            {data.zone.meetingDay && <div className="small muted">Meets {data.zone.meetingDay}</div>}
            {data.zone.notes && <p className="small">{data.zone.notes}</p>}
            <Progress done={data.zone.visitedThisYear} total={data.zone.families} />
          </div>
          <div className="row wrap" style={{ gap: 8 }}>
            {can('people.edit') && <button className="btn sm" onClick={() => setAdding((v) => !v)}><UserPlus size={15} /> Add families</button>}
            {can('people.edit') && <button className="btn ghost sm" onClick={() => onEdit(data.zone)}><Pencil size={15} /> Edit</button>}
            <Link className="btn ghost sm" to={`/admin/people?zone=${data.zone.id}`}><Users size={15} /> People list</Link>
          </div>
          {adding && (
            <div className="callout stack" style={{ gap: 6 }}>
              <span className="small">Find a person; their whole household joins this {label.toLowerCase()}.</span>
              <PersonSearch autoFocus onPick={async (p: PickedPerson) => { const r = await add.run(data.zone.id, [p.id]); if (r) { toast(`${p.name}’s household added (${r.people} ${r.people === 1 ? 'person' : 'people'})`); reload(); onChanged(); } }} />
              <FormError error={add.error} />
            </div>
          )}
          {data.units.length > 0 && (
            <div className="stack" style={{ gap: 6 }}>
              <h3 className="small upper">Units</h3>
              {data.units.map((u) => <div key={u.id} className="row small" style={{ gap: 8 }}><strong className="grow">{u.name}</strong><span className="muted">{u.families} families · {u.visitedThisYear} visited</span></div>)}
            </div>
          )}
          <div className="row" style={{ gap: 8 }}>
            <h3 className="small upper grow">Families</h3>
            <Segmented value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'due', label: 'Not visited' }]} />
          </div>
          {families.length === 0 ? <p className="small muted">{filter === 'due' ? 'Every family has been visited this year.' : `No families in this ${label.toLowerCase()} yet.`}</p> : families.map((f) => (
            <div key={f.key} className="list-row" style={{ alignItems: 'flex-start' }}>
              <div className="grow" style={{ minWidth: 0 }}>
                <strong>{f.name}</strong>
                <div className="small muted">{f.people.map((p) => p.name.split(' ')[0]).join(', ')}{f.address ? ` · ${f.address}` : ''}</div>
                <div className="small">{f.lastVisitAt ? `Last visit ${formatRelative(`${f.lastVisitAt}T12:00:00`)}` : <span className="danger-text">Never visited</span>}{f.nextVisitOn && <span className="muted"> · planned {day(f.nextVisitOn)}</span>}</div>
              </div>
              {can('care') && <button className="btn sm" onClick={() => onVisit(f)}><CalendarCheck size={14} /> Visit</button>}
              {can('people.edit') && <button className="btn ghost icon sm" title="Remove from this zone" aria-label={`Remove ${f.name}`} onClick={async () => { if (await remove.run(data.zone.id, f.key)) { reload(); onChanged(); } }}><X size={14} /></button>}
            </div>
          ))}
          {data.visits.length > 0 && (
            <div className="stack" style={{ gap: 6 }}>
              <h3 className="small upper">Recent visits</h3>
              {data.visits.slice(0, 15).map((v) => <VisitRow key={v.id} v={v} onEdit={onEditVisit} />)}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function VisitRow({ v, onEdit }: { v: VisitView; onEdit: (v: VisitView) => void }) {
  const can = useCan();
  return (
    <div className="list-row" style={{ alignItems: 'flex-start' }}>
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="row wrap" style={{ gap: 6 }}>
          <strong>{v.familyName}</strong>
          <span className={`badge ${v.status === 'done' ? 'ok' : v.status === 'planned' ? 'warn' : 'gray'}`}>{v.status === 'done' ? 'Visited' : v.status === 'planned' ? 'Planned' : 'Cancelled'}</span>
          {v.confidential && <span className="badge gray">Confidential</span>}
        </div>
        <div className="small muted">{VISIT_PURPOSES[v.purpose]} · {day(v.visitedOn ?? v.plannedFor)}{v.zoneName ? ` · ${v.zoneName}` : ''}{v.visitors.length ? ` · ${v.visitors.join(', ')}` : ''}</div>
        {v.notes && <div className="small" style={{ marginTop: 2 }}>{v.notes}</div>}
        {v.followUp && <div className="small muted">Follow-up: {v.followUp}</div>}
      </div>
      {can('care') && v.status !== 'cancelled' && <button className="btn ghost sm" onClick={() => onEdit(v)}>{v.status === 'planned' ? 'Log' : 'Edit'}</button>}
    </div>
  );
}

function VisitsTab({ onEdit, zones, version = 0 }: { onEdit: (v: VisitView) => void; zones: ZoneView[]; version?: number }) {
  const [zoneId, setZoneId] = useState('');
  const [mine, setMine] = useState(false);
  const planned = useApi(() => AdminApi.visits.list({ status: 'planned', zoneId: zoneId || undefined, mine: mine ? '1' : undefined }), [zoneId, mine, version]);
  const done = useApi(() => AdminApi.visits.list({ status: 'done', zoneId: zoneId || undefined, mine: mine ? '1' : undefined }), [zoneId, mine, version]);
  return (
    <div className="stack">
      <div className="row wrap" style={{ gap: 10 }}>
        <select className="select" style={{ width: 'auto' }} value={zoneId} onChange={(e) => setZoneId(e.target.value)} aria-label="Zone">
          <option value="">All areas</option>
          {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
        </select>
        <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Only my visits</label>
      </div>
      <ActionItems mine={mine} version={version} />
      <div className="card">
        <div className="card-head"><h2>Planned</h2></div>
        {planned.error ? <ErrorState error={planned.error} onRetry={planned.reload} /> : !planned.data ? <Loading /> : planned.data.length === 0 ? <p className="small muted" style={{ padding: '0 16px 16px' }}>No visits planned. Use “Not visited this year” to plan some.</p> : planned.data.map((v) => <VisitRow key={v.id} v={v} onEdit={onEdit} />)}
      </div>
      <div className="card">
        <div className="card-head"><h2>Recent visits</h2></div>
        {done.error ? <ErrorState error={done.error} onRetry={done.reload} /> : !done.data ? <Loading /> : done.data.length === 0 ? <p className="small muted" style={{ padding: '0 16px 16px' }}>No visits logged yet.</p> : done.data.slice(0, 60).map((v) => <VisitRow key={v.id} v={v} onEdit={onEdit} />)}
      </div>
    </div>
  );
}

function DueTab({ zones, label, onPlan }: { zones: ZoneView[]; label: string; onPlan: (f: ZoneFamily) => void }) {
  const can = useCan();
  const [zoneId, setZoneId] = useState('');
  const { data, error, reload } = useApi(() => AdminApi.visits.due({ zoneId: zoneId || undefined }), [zoneId]);
  return (
    <div className="stack">
      <div className="row wrap" style={{ gap: 10 }}>
        <select className="select" style={{ width: 'auto' }} value={zoneId} onChange={(e) => setZoneId(e.target.value)} aria-label={label}>
          <option value="">All {plural(label).toLowerCase()}</option>
          {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
        </select>
        {data && <span className="small muted">{data.families.length} member famil{data.families.length === 1 ? 'y' : 'ies'} with no visit since {day(data.since)}, longest first</span>}
      </div>
      {error ? <ErrorState error={error} onRetry={reload} /> : !data ? <Loading /> : data.families.length === 0 ? (
        <div className="card"><Empty icon={<Check size={28} />} title="Every family has been visited" body="Nobody is waiting for a visit this year. Well done, shepherds." /></div>
      ) : (
        <div className="card">
          {data.families.map((f) => (
            <div key={f.key} className="list-row">
              <div className="grow" style={{ minWidth: 0 }}>
                <strong>{f.name}</strong>
                <div className="small muted">{f.people.length} {f.people.length === 1 ? 'person' : 'people'}{f.address ? ` · ${f.address}` : ''}{f.phone ? ` · ${f.phone}` : ''}</div>
              </div>
              <span className="small muted hide-sm">{f.lastVisitAt ? `Last ${day(f.lastVisitAt)}` : 'Never visited'}</span>
              {f.nextVisitOn ? <span className="badge warn">Planned {day(f.nextVisitOn)}</span> : can('care') && <button className="btn sm" onClick={() => onPlan(f)}><CalendarCheck size={14} /> Plan</button>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ReportTab({ label }: { label: string }) {
  const { data, error, reload } = useApi(() => AdminApi.zones.report(), []);
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const total = data.rows.reduce((s, r) => ({ families: s.families + r.families, visited: s.visited + r.visited, done: s.done + r.visitsDone }), { families: 0, visited: 0, done: 0 });
  return (
    <div className="card table-wrap">
      <table className="table">
        <thead><tr><th>{label}</th><th className="num">Families</th><th className="num">Visited</th><th>Coverage</th><th className="num hide-sm">Visits</th><th className="num hide-sm">Planned</th></tr></thead>
        <tbody>
          {data.rows.map((r) => (
            <tr key={r.zoneId ?? 'none'}>
              <td>{r.zoneName}</td>
              <td className="num">{r.families}</td>
              <td className="num">{r.visited}</td>
              <td style={{ minWidth: 120 }}><div className="row" style={{ gap: 8 }}><div className="progress grow"><i style={{ width: `${r.percent}%` }} /></div><span className="small">{r.percent}%</span></div></td>
              <td className="num hide-sm">{r.visitsDone}</td>
              <td className="num hide-sm">{r.planned}</td>
            </tr>
          ))}
        </tbody>
        <tfoot><tr><th>Whole church</th><th className="num">{total.families}</th><th className="num">{total.visited}</th><th className="small">{total.families ? Math.round((total.visited / total.families) * 100) : 0}% since {day(data.since)}</th><th className="num hide-sm">{total.done}</th><th className="hide-sm" /></tr></tfoot>
      </table>
    </div>
  );
}

function ZoneForm({ zone, zones, label, onClose, onSaved, onDeleted }: { zone: ZoneView | null; zones: ZoneView[]; label: string; onClose: () => void; onSaved: (z: ZoneView) => void; onDeleted: () => void }) {
  const [form, setForm] = useState({ name: zone?.name ?? '', area: zone?.area ?? '', meetingDay: zone?.meetingDay ?? '', notes: zone?.notes ?? '', parentId: zone?.parentId ?? '', active: zone?.active ?? true });
  const [leaders, setLeaders] = useState<PickedPerson[]>(zone?.leaders.map((l) => ({ id: l.id, name: l.name })) ?? []);
  const [confirm, setConfirm] = useState(false);
  const save = useAction(async () => {
    const input = { ...form, parentId: form.parentId || null, area: form.area || null, meetingDay: form.meetingDay || null, notes: form.notes || null, leaderIds: leaders.map((l) => l.id) };
    return zone ? AdminApi.zones.update(zone.id, input) : AdminApi.zones.create(input);
  });
  const del = useAction(AdminApi.zones.remove);
  async function submit(e: FormEvent) {
    e.preventDefault();
    const z = await save.run();
    if (z) onSaved(z);
  }
  return (
    <Modal
      title={zone ? `Edit ${zone.name}` : `New ${label.toLowerCase()}`}
      onClose={onClose}
      footer={
        <>
          {zone && !confirm && <button className="btn ghost" style={{ marginRight: 'auto' }} onClick={() => setConfirm(true)}><Trash2 size={15} /> Delete</button>}
          {zone && confirm && <button className="btn danger" style={{ marginRight: 'auto' }} disabled={del.busy} onClick={async () => { await del.run(zone.id); if (!del.error) onDeleted(); }}>Delete; families move up</button>}
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" form="zone-form" disabled={save.busy || !form.name.trim()}>{save.busy ? 'Saving…' : 'Save'}</button>
        </>
      }
    >
      <form id="zone-form" className="stack" onSubmit={submit}>
        <Field label="Name"><input className="input" autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Kondapur" /></Field>
        <Field label="Areas and streets covered (optional)"><input className="input" value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} placeholder="Kondapur, Kothaguda, Botanical Garden" /></Field>
        <Field label="Meets (optional)"><input className="input" value={form.meetingDay} onChange={(e) => setForm({ ...form, meetingDay: e.target.value })} placeholder="Wednesday 7:30 pm, rotating homes" /></Field>
        {zones.filter((z) => z.id !== zone?.id).length > 0 && (
          <Field label="Inside a larger area (optional)">
            <select className="select" value={form.parentId} onChange={(e) => setForm({ ...form, parentId: e.target.value })}>
              <option value="">None</option>
              {zones.filter((z) => z.id !== zone?.id && z.parentId !== zone?.id).map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="Leaders">
          <div className="stack" style={{ gap: 6 }}>
            {leaders.length > 0 && <div className="row wrap" style={{ gap: 6 }}>{leaders.map((l) => <span key={l.id} className="chip">{l.name} <button type="button" className="btn ghost icon sm" aria-label={`Remove ${l.name}`} onClick={() => setLeaders(leaders.filter((x) => x.id !== l.id))}><X size={12} /></button></span>)}</div>}
            <PersonSearch exclude={leaders.map((l) => l.id)} onPick={(p) => setLeaders([...leaders, p])} placeholder="Add a leader" />
          </div>
        </Field>
        <Field label="Notes (optional)"><textarea className="input" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
        {zone && <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Active</label>}
        <FormError error={save.error ?? del.error} />
      </form>
    </Modal>
  );
}

function VisitForm({ family, visit, onClose, onSaved }: { family?: ZoneFamily; visit?: VisitView; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const session = useSession(adminSession);
  const [person, setPerson] = useState<PickedPerson | null>(family ? { id: family.people[0].id, name: family.name } : null);
  const logging = visit?.status === 'planned';
  const [form, setForm] = useState({
    status: (visit ? 'done' : 'planned') as 'planned' | 'done',
    date: visit?.visitedOn ?? (logging ? today() : visit?.plannedFor) ?? today(),
    purpose: (visit?.purpose ?? 'home') as VisitPurpose,
    notes: visit?.notes ?? '',
    prayerPoints: visit?.prayerPoints ?? '',
    followUp: visit?.followUp ?? '',
    others: visit?.visitorNames.join(', ') ?? '',
    confidential: visit?.confidential ?? false,
    voiceNote: visit?.voiceNote ?? '',
    actions: (visit?.actions ?? []) as VisitAction[],
  });
  const [speak, setSpeak] = useState('en-IN');
  const [voiceOpen, setVoiceOpen] = useState(!visit);
  const writeUp = useAction(() => AdminApi.ai.visitNotes({ transcript: form.voiceNote, familyName: visit?.familyName ?? family?.name ?? person?.name, date: form.date, language: speak.slice(0, 2) }));
  useEffect(() => {
    if (!visit && form.date > today() && form.status === 'done') setForm((f) => ({ ...f, status: 'planned' }));
  }, [form.date, form.status, visit]);
  const save = useAction(async () => {
    const visitorNames = form.others.split(',').map((s) => s.trim()).filter(Boolean);
    const body = { date: form.date, purpose: form.purpose, notes: form.notes, prayerPoints: form.prayerPoints, followUp: form.followUp, confidential: form.confidential, visitorNames, voiceNote: form.voiceNote, actions: form.actions.filter((a) => a.text.trim()) };
    if (visit) return AdminApi.visits.update(visit.id, { ...body, status: form.status });
    return AdminApi.visits.create({ ...body, personId: person!.id, status: form.status === 'done' ? 'done' : undefined });
  });
  const cancel = useAction(async () => (visit ? AdminApi.visits.update(visit.id, { status: 'cancelled' }) : undefined));
  const done = form.status === 'done';
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (await save.run()) {
      toast(done ? 'Visit logged' : 'Visit planned');
      onSaved();
    }
  }
  return (
    <Modal
      title={visit ? `${logging ? 'Log' : 'Edit'} visit: ${visit.familyName}` : family ? `Visit ${family.name}` : 'Plan or log a visit'}
      onClose={onClose}
      footer={
        <>
          {visit?.status === 'planned' && <button className="btn ghost" style={{ marginRight: 'auto' }} disabled={cancel.busy} onClick={async () => { if (await cancel.run()) onSaved(); }}>Cancel this visit</button>}
          <button className="btn ghost" onClick={onClose}>Close</button>
          <button className="btn primary" form="visit-form" disabled={save.busy || (!visit && !person)}>{save.busy ? 'Saving…' : done ? 'Save visit' : 'Plan visit'}</button>
        </>
      }
    >
      <form id="visit-form" className="stack" onSubmit={submit}>
        {!visit && !family && (
          <Field label="Family" hint="Pick anyone in the household">
            {person ? <div className="row" style={{ gap: 8 }}><span className="chip">{person.name}</span><button type="button" className="btn ghost icon sm" aria-label="Change" onClick={() => setPerson(null)}><X size={14} /></button></div> : <PersonSearch autoFocus onPick={setPerson} />}
          </Field>
        )}
        {!visit && <Segmented value={form.status} onChange={(v) => setForm({ ...form, status: v })} options={[{ value: 'planned', label: 'Plan a visit' }, { value: 'done', label: 'Log a visit that happened' }]} />}
        <div className="grid cols-2">
          <Field label={done ? 'Visited on' : 'Planned for'}><input className="input" type="date" value={form.date} max={done ? today() : undefined} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
          <Field label="Kind of visit">
            <select className="select" value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value as VisitPurpose })}>
              {(Object.keys(VISIT_PURPOSES) as VisitPurpose[]).map((k) => <option key={k} value={k}>{VISIT_PURPOSES[k]}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Who else is going (optional)" hint={`${session ? `${session.member.firstName} ${session.member.lastName}`.trim() : 'You'} are added automatically. Separate names with commas.`}><input className="input" value={form.others} onChange={(e) => setForm({ ...form, others: e.target.value })} placeholder="Elder Joseph, Cell leader Anita" /></Field>
        {done && (
          <>
            <div className="card card-pad stack voice-panel" style={{ gap: 8, background: 'var(--tint)' }}>
              <div className="row between wrap" style={{ gap: 8 }}>
                <b><Sparkles size={14} /> Say what happened</b>
                <button type="button" className="btn ghost sm" onClick={() => setVoiceOpen(!voiceOpen)}>{voiceOpen ? 'Hide' : 'Show'}</button>
              </div>
              {voiceOpen && (
                <>
                  <p className="small muted" style={{ margin: 0 }}>Talk it through on the way home, in any language. "Write it up" turns it into the diary entry, prayer points and action items below; your spoken words are kept with the visit.</p>
                  <DictateButton lang={speak} onLang={setSpeak} onText={(t) => setForm((f) => ({ ...f, voiceNote: (f.voiceNote + ' ' + t).trimStart() }))} />
                  <textarea className="input" rows={4} value={form.voiceNote} onChange={(e) => setForm({ ...form, voiceNote: e.target.value })} placeholder="Visited the Thomas family. Arun is back in hospital for his knee surgery on Friday. We prayed for the surgery. I will call the welfare committee about the fees next week…" />
                  <div className="row wrap" style={{ gap: 8, alignItems: 'center' }}>
                    <button type="button" className="btn primary sm" disabled={writeUp.busy || form.voiceNote.trim().split(/\s+/).length < 4} onClick={async () => {
                      const r = await writeUp.run();
                      if (r) setForm((f) => ({ ...f, notes: r.summary, prayerPoints: r.prayerPoints.join('\n'), followUp: r.actions.map((a) => a.text).join('; '), purpose: r.purpose, confidential: f.confidential || r.confidential, actions: r.actions.map((a) => ({ text: a.text, due: a.due, done: false })) }));
                    }}><Sparkles size={14} /> {writeUp.busy ? 'Writing…' : 'Write it up'}</button>
                    <span className="small muted">Uses one AI request.</span>
                  </div>
                  <FormError error={writeUp.error} />
                </>
              )}
            </div>
            <Field label="What happened"><textarea className="input" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Prayed together; daughter starting college; father looking for work" /></Field>
            <Field label="Prayer points (optional)"><textarea className="input" rows={2} value={form.prayerPoints} onChange={(e) => setForm({ ...form, prayerPoints: e.target.value })} /></Field>
            <Field label="Follow-up (optional)"><input className="input" value={form.followUp} onChange={(e) => setForm({ ...form, followUp: e.target.value })} placeholder="Visit again after the surgery" /></Field>
            <Field label="Action items" hint="Each one goes on the to-do list under Visits until it is ticked off.">
              <div className="stack" style={{ gap: 6 }}>
                {form.actions.map((a, i) => (
                  <div key={i} className="row" style={{ gap: 6 }}>
                    <input type="checkbox" checked={a.done} onChange={(e) => setForm({ ...form, actions: form.actions.map((x, j) => (j === i ? { ...x, done: e.target.checked } : x)) })} aria-label="Done" />
                    <input className="input grow" value={a.text} onChange={(e) => setForm({ ...form, actions: form.actions.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} />
                    <input className="input" type="date" style={{ width: 150 }} value={a.due ?? ''} onChange={(e) => setForm({ ...form, actions: form.actions.map((x, j) => (j === i ? { ...x, due: e.target.value || null } : x)) })} aria-label="Due" />
                    <button type="button" className="btn ghost icon sm" aria-label="Remove" onClick={() => setForm({ ...form, actions: form.actions.filter((_, j) => j !== i) })}><X size={14} /></button>
                  </div>
                ))}
                <button type="button" className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setForm({ ...form, actions: [...form.actions, { text: '', done: false, due: null }] })}><Plus size={14} /> Add an action</button>
              </div>
            </Field>
            <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={form.confidential} onChange={(e) => setForm({ ...form, confidential: e.target.checked })} /> Confidential: only pastors, admins and the visitors see the notes</label>
          </>
        )}
        <FormError error={save.error ?? cancel.error} />
      </form>
    </Modal>
  );
}


/** The pastor's to-do list from logged visits: tick an item and it drops off. */
function ActionItems({ mine, version }: { mine: boolean; version: number }) {
  const can = useCan();
  const { data, error, reload } = useApi(() => AdminApi.visits.actions({ mine: mine ? '1' : undefined }), [mine, version]);
  const tick = useAction((visitId: string, index: number) => AdminApi.visits.toggleAction(visitId, index, true));
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data || data.length === 0) return null;
  return (
    <div className="card">
      <div className="card-head"><h2><ListChecks size={16} /> To do from visits</h2><span className="small muted">{data.length} open</span></div>
      {data.map((a) => (
        <div key={`${a.visitId}:${a.index}`} className="list-row">
          {can('care') ? <input type="checkbox" checked={false} disabled={tick.busy} onChange={async () => { if (await tick.run(a.visitId, a.index)) reload(); }} aria-label="Done" /> : <span />}
          <div className="grow" style={{ minWidth: 0 }}>
            <span>{a.text}</span>
            <div className="small muted">{a.familyName}{a.visitedOn ? ` · visited ${day(a.visitedOn)}` : ''}{a.visitors.length ? ` · ${a.visitors.join(', ')}` : ''}</div>
          </div>
          {a.due && <span className={`badge ${a.due < today() ? 'danger' : 'warn'}`}>Due {day(a.due)}</span>}
        </div>
      ))}
    </div>
  );
}
