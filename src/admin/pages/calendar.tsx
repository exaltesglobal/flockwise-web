import { AlertTriangle, Building2, CalendarRange, Check, ChevronLeft, ChevronRight, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import type { BookingConflict, BookingView, CalendarItem, Resource, ResourceKind } from '@/api/admin-types';
import { AdminApi } from '@/api/endpoints';
import { Empty, ErrorState, Field, FormError, Loading, Modal, useToast } from '@/components/ui';
import { formatDay, formatTime, toLocalInput } from '@/lib/format';
import { useCan } from '@/lib/perms';
import { useAction, useApi } from '@/lib/use-api';

import { PageHeader } from '../layout';

const DAY = 86_400_000;
const startOfWeek = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
};
const KIND_LABEL: Record<ResourceKind, string> = { room: 'Room', equipment: 'Equipment', vehicle: 'Vehicle', other: 'Other' };

export function CalendarPage() {
  const [tab, setTab] = useState<'calendar' | 'requests' | 'resources'>('calendar');
  const pending = useApi(() => AdminApi.calendar.bookings({ status: 'pending' }));
  const [booking, setBooking] = useState<{ start?: Date } | null>(null);
  const [version, setVersion] = useState(0);
  const toast = useToast();
  const refresh = () => { setVersion((v) => v + 1); pending.reload(); };

  return (
    <>
      <PageHeader
        title="Calendar & rooms"
        subtitle="Everything happening at church, with room and equipment bookings. Clashes are flagged before they happen."
        actions={<button className="btn primary" onClick={() => setBooking({})}><Plus size={16} /> Book a room</button>}
      />
      <div className="tabs">
        <button className={tab === 'calendar' ? 'on' : ''} onClick={() => setTab('calendar')}>Calendar</button>
        <button className={tab === 'requests' ? 'on' : ''} onClick={() => setTab('requests')}>Requests {!!pending.data?.length && <span className="count">{pending.data.length}</span>}</button>
        <button className={tab === 'resources' ? 'on' : ''} onClick={() => setTab('resources')}>Rooms & equipment</button>
      </div>
      {tab === 'calendar' && <Week key={version} onBook={(start) => setBooking({ start })} />}
      {tab === 'requests' && <Requests key={version} onChanged={refresh} />}
      {tab === 'resources' && <Resources />}
      {booking && <BookingForm start={booking.start} onClose={() => setBooking(null)} onSaved={(b) => { setBooking(null); refresh(); toast(b.status === 'pending' ? 'Request sent for approval' : 'Booked'); }} />}
    </>
  );
}

function Week({ onBook }: { onBook: (start: Date) => void }) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const to = new Date(weekStart.getTime() + 7 * DAY);
  const { data, error, reload } = useApi(() => AdminApi.calendar.items(weekStart.toISOString(), to.toISOString()), [weekStart.getTime()]);
  const days = Array.from({ length: 7 }, (_, i) => new Date(weekStart.getTime() + i * DAY));
  const byDay = useMemo(() => {
    const m = new Map<string, CalendarItem[]>();
    for (const it of data ?? []) {
      const key = new Date(it.startsAt).toDateString();
      m.set(key, [...(m.get(key) ?? []), it]);
    }
    return m;
  }, [data]);
  const today = new Date().toDateString();

  return (
    <div className="card">
      <div className="toolbar">
        <button className="btn sm icon" onClick={() => setWeekStart(new Date(weekStart.getTime() - 7 * DAY))} aria-label="Previous week"><ChevronLeft size={16} /></button>
        <button className="btn sm" onClick={() => setWeekStart(startOfWeek(new Date()))}>This week</button>
        <button className="btn sm icon" onClick={() => setWeekStart(new Date(weekStart.getTime() + 7 * DAY))} aria-label="Next week"><ChevronRight size={16} /></button>
        <b>{weekStart.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – {new Date(to.getTime() - DAY).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</b>
      </div>
      {error ? <ErrorState error={error} onRetry={reload} /> : !data ? <Loading /> : (
        <div className="week">
          {days.map((d) => {
            const items = byDay.get(d.toDateString()) ?? [];
            return (
              <div key={d.toISOString()} className={`week-day ${d.toDateString() === today ? 'today' : ''}`}>
                <div className="week-head">
                  <span>{d.toLocaleDateString('en-IN', { weekday: 'short' })}</span>
                  <b>{d.getDate()}</b>
                  <button className="btn ghost icon sm" title="Book this day" onClick={() => { const s = new Date(d); s.setHours(18, 0, 0, 0); onBook(s); }}><Plus size={14} /></button>
                </div>
                {items.length === 0 ? <div className="small muted week-empty">Free</div> : items.map((it) => (
                  <div key={it.id} className="week-item" style={{ borderLeftColor: it.color }}>
                    <div className="small muted">{formatTime(it.startsAt)} – {formatTime(it.endsAt)}</div>
                    <div style={{ fontWeight: 600 }}>{it.title}</div>
                    {it.resources.length > 0 && <div className="small muted">{it.resources.join(', ')}</div>}
                    {it.status === 'pending' && <span className="badge warn">Awaiting approval</span>}
                    {it.status === 'draft' && <span className="badge gray">Draft</span>}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
      <div className="row wrap small muted" style={{ gap: 14, padding: '10px 16px' }}>
        <span className="row" style={{ gap: 6 }}><i className="dot" style={{ background: '#1F5C4D' }} /> Services</span>
        <span className="row" style={{ gap: 6 }}><i className="dot" style={{ background: '#6941C6' }} /> Events</span>
        <span className="row" style={{ gap: 6 }}><i className="dot" style={{ background: '#475467' }} /> Bookings</span>
        <span className="row" style={{ gap: 6 }}><i className="dot" style={{ background: '#B54708' }} /> Awaiting approval</span>
      </div>
    </div>
  );
}

function Requests({ onChanged }: { onChanged: () => void }) {
  const { data, error, reload } = useApi(() => AdminApi.calendar.bookings());
  const toast = useToast();
  const act = async (b: BookingView, decision: 'approve' | 'decline' | 'cancel') => {
    const note = decision === 'decline' ? prompt('Reason (optional, sent to the requester)') ?? undefined : undefined;
    try {
      await AdminApi.calendar.decide(b.id, decision, note);
    } catch (e) {
      if (decision === 'approve' && confirm(`${(e as Error).message}\n\nApprove anyway?`)) await AdminApi.calendar.decide(b.id, decision, undefined, true);
      else return toast((e as Error).message, 'error');
    }
    toast(decision === 'approve' ? 'Approved' : decision === 'decline' ? 'Declined' : 'Cancelled');
    reload();
    onChanged();
  };
  const pending = (data ?? []).filter((b) => b.status === 'pending');
  const rest = (data ?? []).filter((b) => b.status !== 'pending');
  const row = (b: BookingView) => (
    <div key={b.id} className="list-row" style={{ alignItems: 'flex-start' }}>
      <div className="grow stack" style={{ gap: 3 }}>
        <div className="row wrap" style={{ gap: 8 }}>
          <b>{b.title}</b>
          <span className={`badge ${b.status === 'approved' ? 'ok' : b.status === 'pending' ? 'warn' : 'gray'}`}>{b.status[0].toUpperCase() + b.status.slice(1)}</span>
        </div>
        <span className="small">{formatDay(b.startsAt)}, {formatTime(b.startsAt)} – {formatTime(b.endsAt)} · {b.resources.map((r) => r.name).join(', ')}{b.setupMinutes ? ` · ${b.setupMinutes} min setup` : ''}</span>
        <span className="small muted">Requested by {b.requestedByName}{b.notes ? ` · “${b.notes}”` : ''}</span>
        {b.conflicts.length > 0 && <span className="small" style={{ color: 'var(--danger)' }}><AlertTriangle size={13} /> Clashes with {b.conflicts.map((c) => `${c.title} (${c.resourceName})`).join(', ')}</span>}
      </div>
      {b.status === 'pending' && b.canDecide && <>
        <button className="btn sm primary" onClick={() => act(b, 'approve')}><Check size={14} /> Approve</button>
        <button className="btn sm" onClick={() => act(b, 'decline')}><X size={14} /> Decline</button>
      </>}
      {(b.status === 'approved' || b.status === 'pending') && <button className="btn sm ghost danger" title="Cancel booking" onClick={() => confirm(`Cancel “${b.title}”?`) && act(b, 'cancel')}><Trash2 size={14} /></button>}
    </div>
  );
  return (
    <div className="card">
      {error ? <ErrorState error={error} onRetry={reload} /> : !data ? <Loading /> : data.length === 0 ? <Empty icon={<CalendarRange size={32} />} title="No upcoming bookings" /> : <>
        {pending.length > 0 && <><div className="card-head"><h3>Waiting for approval</h3></div>{pending.map(row)}</>}
        <div className="card-head"><h3>Upcoming bookings</h3></div>
        {rest.length ? rest.map(row) : <p className="small muted card-pad">None yet.</p>}
      </>}
    </div>
  );
}

function BookingForm({ start, onClose, onSaved }: { start?: Date; onClose: () => void; onSaved: (b: BookingView) => void }) {
  const resources = useApi(AdminApi.calendar.resources);
  const s0 = start ?? (() => { const d = new Date(Date.now() + DAY); d.setHours(18, 0, 0, 0); return d; })();
  const [f, setF] = useState({ title: '', resourceIds: [] as string[], startsAt: s0.toISOString(), endsAt: new Date(s0.getTime() + 2 * 3600_000).toISOString(), setupMinutes: 0, repeatWeeks: 1, notes: '' });
  const [conflicts, setConflicts] = useState<BookingConflict[]>([]);
  const save = useAction((force: boolean) => AdminApi.calendar.book({ ...f, force }));

  useEffect(() => {
    if (!f.resourceIds.length) return setConflicts([]);
    const t = setTimeout(() => { AdminApi.calendar.check(f).then(setConflicts).catch(() => undefined); }, 250);
    return () => clearTimeout(t);
  }, [f.resourceIds.join(), f.startsAt, f.endsAt, f.setupMinutes]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id: string) => setF((x) => ({ ...x, resourceIds: x.resourceIds.includes(id) ? x.resourceIds.filter((r) => r !== id) : [...x.resourceIds, id] }));
  const blocking = conflicts.filter((c) => c.status === 'approved');
  const needsApproval = (resources.data ?? []).some((r) => f.resourceIds.includes(r.id) && r.needsApproval);

  return (
    <Modal title="Book a room or equipment" onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>Cancel</button>
        {blocking.length > 0 && <button className="btn" disabled={save.busy} onClick={async () => { const b = await save.run(true); if (b) onSaved(b); }}>Book anyway</button>}
        <button className="btn primary" disabled={save.busy || !f.title.trim() || !f.resourceIds.length || blocking.length > 0} onClick={async () => { const b = await save.run(false); if (b) onSaved(b); }}>{needsApproval ? 'Request booking' : 'Book'}</button>
      </>}
    >
      <div className="stack">
        <FormError error={save.error} />
        <Field label="What is it for?"><input className="input" autoFocus value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Choir practice" /></Field>
        <Field label="Rooms and equipment">
          {resources.data ? (
            <div className="row wrap" style={{ gap: 6 }}>
              {resources.data.map((r) => <button key={r.id} type="button" className={`chip ${f.resourceIds.includes(r.id) ? 'on' : ''}`} onClick={() => toggle(r.id)}>{r.name}{r.needsApproval ? ' *' : ''}</button>)}
              {resources.data.length === 0 && <span className="small muted">Add rooms in the “Rooms & equipment” tab first.</span>}
            </div>
          ) : <Loading />}
        </Field>
        <div className="grid cols-2">
          <Field label="Starts"><input type="datetime-local" className="input" value={toLocalInput(f.startsAt)} onChange={(e) => { const s = new Date(e.target.value); const len = new Date(f.endsAt).getTime() - new Date(f.startsAt).getTime(); setF({ ...f, startsAt: s.toISOString(), endsAt: new Date(s.getTime() + Math.max(len, 1800_000)).toISOString() }); }} /></Field>
          <Field label="Ends"><input type="datetime-local" className="input" value={toLocalInput(f.endsAt)} onChange={(e) => setF({ ...f, endsAt: new Date(e.target.value).toISOString() })} /></Field>
          <Field label="Setup time before (minutes)"><input type="number" min={0} step={15} className="input" value={f.setupMinutes} onChange={(e) => setF({ ...f, setupMinutes: Number(e.target.value) })} /></Field>
          <Field label="Repeat weekly"><select className="input" value={f.repeatWeeks} onChange={(e) => setF({ ...f, repeatWeeks: Number(e.target.value) })}>{[1, 2, 4, 8, 12, 26, 52].map((n) => <option key={n} value={n}>{n === 1 ? 'Just once' : `For ${n} weeks`}</option>)}</select></Field>
        </div>
        <Field label="Notes"><textarea className="textarea" rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Layout, number of chairs, AV needs..." /></Field>
        {conflicts.length > 0 && (
          <div className="alert error" role="alert">
            <AlertTriangle size={16} />
            <span>{conflicts.map((c) => `${c.resourceName} is ${c.status === 'pending' ? 'requested' : 'booked'} for “${c.title}” ${formatTime(c.startsAt)}–${formatTime(c.endsAt)}`).join('. ')}.</span>
          </div>
        )}
        {needsApproval && <p className="small muted">* Needs approval. The approvers get an email and you'll hear back once they decide.</p>}
      </div>
    </Modal>
  );
}

function Resources() {
  const { data, error, reload } = useApi(AdminApi.calendar.resources);
  const staff = useApi(AdminApi.staff.list);
  const can = useCan();
  const [editing, setEditing] = useState<Resource | 'new' | null>(null);
  const toast = useToast();
  return (
    <div className="card">
      <div className="card-head">
        <h3>Rooms, equipment and vehicles</h3>
        {can('settings') && <button className="btn sm primary" onClick={() => setEditing('new')}><Plus size={14} /> Add</button>}
      </div>
      {error ? <ErrorState error={error} onRetry={reload} /> : !data ? <Loading /> : data.length === 0 ? <Empty icon={<Building2 size={28} />} title="Nothing bookable yet" body="Add your halls, classrooms, projectors and the church van." /> : data.map((r) => (
        <div key={r.id} className="list-row">
          <div className="grow">
            <div style={{ fontWeight: 600 }}>{r.name} <span className="badge gray">{KIND_LABEL[r.kind]}</span> {r.needsApproval && <span className="badge warn">Needs approval</span>}</div>
            <div className="small muted">{[r.capacity ? `Holds ${r.capacity}` : '', r.description, r.needsApproval && r.approverIds.length ? `Approved by ${r.approverIds.map((id) => staff.data?.find((s) => s.id === id)?.name ?? '').filter(Boolean).join(', ')}` : ''].filter(Boolean).join(' · ')}</div>
          </div>
          {can('settings') && <>
            <button className="btn ghost icon sm" onClick={() => setEditing(r)}><Pencil size={15} /></button>
            <button className="btn ghost icon sm danger" onClick={async () => { if (!confirm(`Remove ${r.name}?`)) return; try { await AdminApi.calendar.removeResource(r.id); reload(); } catch (e) { toast((e as Error).message, 'error'); } }}><Trash2 size={15} /></button>
          </>}
        </div>
      ))}
      {editing && <ResourceForm item={editing === 'new' ? null : editing} staff={staff.data ?? []} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); toast('Saved'); }} />}
    </div>
  );
}

function ResourceForm({ item, staff, onClose, onSaved }: { item: Resource | null; staff: { id: string; name: string }[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Omit<Resource, 'id'>>({ name: item?.name ?? '', kind: item?.kind ?? 'room', capacity: item?.capacity ?? null, description: item?.description ?? '', needsApproval: item?.needsApproval ?? false, approverIds: item?.approverIds ?? [] });
  const save = useAction(() => (item ? AdminApi.calendar.updateResource(item.id, f) : AdminApi.calendar.createResource(f)));
  return (
    <Modal title={item ? `Edit ${item.name}` : 'Add a room or resource'} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={save.busy || !f.name.trim()} onClick={async () => { if (await save.run()) onSaved(); }}>Save</button></>}>
      <div className="stack">
        <FormError error={save.error} />
        <div className="grid cols-2">
          <Field label="Name"><input className="input" autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Type"><select className="input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as ResourceKind })}>{Object.entries(KIND_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          <Field label="Capacity (people)"><input type="number" className="input" value={f.capacity ?? ''} onChange={(e) => setF({ ...f, capacity: e.target.value ? Number(e.target.value) : null })} /></Field>
        </div>
        <Field label="Description"><input className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <label className="check"><input type="checkbox" checked={f.needsApproval} onChange={(e) => setF({ ...f, needsApproval: e.target.checked })} /> Bookings need approval</label>
        {f.needsApproval && (
          <Field label="Approvers" hint="Owners and admins can always approve.">
            <div className="row wrap" style={{ gap: 6 }}>
              {staff.map((s) => <button key={s.id} type="button" className={`chip ${f.approverIds.includes(s.id) ? 'on' : ''}`} onClick={() => setF({ ...f, approverIds: f.approverIds.includes(s.id) ? f.approverIds.filter((x) => x !== s.id) : [...f.approverIds, s.id] })}>{s.name}</button>)}
            </div>
          </Field>
        )}
      </div>
    </Modal>
  );
}
