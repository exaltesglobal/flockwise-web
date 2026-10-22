import { CalendarDays, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import type { AdminEvent, EventInput } from '@/api/admin-types';
import { AdminApi } from '@/api/endpoints';
import { Empty, ErrorState, Field, FormError, Loading, Modal, Segmented, useToast } from '@/components/ui';
import { formatDay, formatTime, toLocalInput } from '@/lib/format';
import { useAction, useApi } from '@/lib/use-api';

import { PageHeader } from '../layout';

export function EventsPage() {
  const [when, setWhen] = useState<'upcoming' | 'past'>('upcoming');
  const { data, error, reload } = useApi(() => AdminApi.events.list(when), [when]);
  const [editing, setEditing] = useState<AdminEvent | 'new' | null>(null);
  const [counting, setCounting] = useState<AdminEvent | null>(null);
  const toast = useToast();

  return (
    <>
      <PageHeader
        title="Services & events"
        subtitle="Published items appear in the member app and portal, where people can RSVP."
        actions={<button className="btn primary" onClick={() => setEditing('new')}><Plus size={16} /> New event</button>}
      />
      <div className="card">
        <div className="toolbar">
          <Segmented value={when} onChange={setWhen} options={[{ value: 'upcoming', label: 'Upcoming' }, { value: 'past', label: 'Past' }]} />
        </div>
        {error ? <ErrorState error={error} onRetry={reload} /> : !data ? <Loading /> : data.data.length === 0 ? (
          <Empty icon={<CalendarDays size={32} />} title={when === 'upcoming' ? 'Nothing scheduled' : 'No past events yet'} action={when === 'upcoming' && <button className="btn primary" onClick={() => setEditing('new')}>Schedule something</button>} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Title</th>
                  <th>Location</th>
                  <th className="num">RSVPs</th>
                  {when === 'past' && <th className="num">Attendance</th>}
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.data.map((ev) => (
                  <tr key={ev.id}>
                    <td className="small" style={{ whiteSpace: 'nowrap' }}>
                      <div style={{ fontWeight: 600 }}>{formatDay(ev.startsAt)}</div>
                      <div className="muted">{formatTime(ev.startsAt)} – {formatTime(ev.endsAt)}</div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{ev.title}</div>
                      <span className={`badge ${ev.kind === 'service' ? '' : 'gray'}`}>{ev.kind === 'service' ? 'Service' : 'Event'}</span>
                    </td>
                    <td className="small">{ev.location || '—'}</td>
                    <td className="num">{ev.goingCount}{ev.capacity ? <span className="muted"> / {ev.capacity}</span> : ''}</td>
                    {when === 'past' && (
                      <td className="num">
                        <button className="btn sm" onClick={() => setCounting(ev)}>{ev.attendance ?? 'Add count'}</button>
                      </td>
                    )}
                    <td>{ev.published ? <span className="badge ok">Published</span> : <span className="badge gray">Draft</span>}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button className="btn ghost icon sm" title="Edit" onClick={() => setEditing(ev)}><Pencil size={15} /></button>
                      <button className="btn ghost icon sm danger" title="Delete" onClick={async () => {
                        if (!confirm(`Delete “${ev.title}”? RSVPs will be lost.`)) return;
                        await AdminApi.events.remove(ev.id);
                        toast('Deleted');
                        reload();
                      }}><Trash2 size={15} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && <EventForm event={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); toast('Saved'); }} />}
      {counting && <AttendanceForm event={counting} onClose={() => setCounting(null)} onSaved={() => { setCounting(null); reload(); toast('Attendance saved'); }} />}
    </>
  );
}

function defaultTimes() {
  const s = new Date(Date.now() + 7 * 86400000);
  s.setHours(18, 0, 0, 0);
  return { startsAt: s.toISOString(), endsAt: new Date(s.getTime() + 2 * 3600000).toISOString() };
}

function EventForm({ event, onClose, onSaved }: { event: AdminEvent | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<EventInput>(() => ({
    kind: event?.kind ?? 'event',
    title: event?.title ?? '',
    description: event?.description ?? '',
    location: event?.location ?? '',
    capacity: event?.capacity ?? null,
    imageUrl: event?.imageUrl ?? null,
    published: event?.published ?? true,
    ...(event ? { startsAt: event.startsAt, endsAt: event.endsAt } : defaultTimes()),
  }));
  const save = useAction((input: EventInput) => (event ? AdminApi.events.update(event.id, input) : AdminApi.events.create(input)));
  const set = <K extends keyof EventInput>(k: K, v: EventInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const fe = save.error?.fields ?? {};
  const badRange = new Date(form.endsAt) <= new Date(form.startsAt);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (badRange) return;
    if (await save.run(form)) onSaved();
  }

  return (
    <Modal title={event ? 'Edit event' : 'New event'} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" form="event-form" disabled={save.busy || badRange}>{save.busy ? 'Saving…' : 'Save'}</button></>}
    >
      <form id="event-form" className="stack" onSubmit={onSubmit}>
        <FormError error={save.error?.fields ? null : save.error} />
        <Field label="Type">
          <div><Segmented value={form.kind} onChange={(v) => set('kind', v)} options={[{ value: 'service', label: 'Service' }, { value: 'event', label: 'Event' }]} /></div>
        </Field>
        <Field label="Title" error={fe.title}><input className="input" autoFocus value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Sunday Worship (English)" /></Field>
        <div className="grid cols-2">
          <Field label="Starts"><input className="input" type="datetime-local" value={toLocalInput(form.startsAt)} onChange={(e) => e.target.value && set('startsAt', new Date(e.target.value).toISOString())} /></Field>
          <Field label="Ends" error={badRange ? 'Must be after the start' : undefined}><input className="input" type="datetime-local" value={toLocalInput(form.endsAt)} onChange={(e) => e.target.value && set('endsAt', new Date(e.target.value).toISOString())} /></Field>
          <Field label="Location"><input className="input" value={form.location} onChange={(e) => set('location', e.target.value)} placeholder="Main Sanctuary" /></Field>
          <Field label="Capacity" hint="Leave empty for no limit"><input className="input" type="number" min={1} value={form.capacity ?? ''} onChange={(e) => set('capacity', e.target.value ? Number(e.target.value) : null)} /></Field>
        </div>
        <Field label="Description"><textarea className="textarea" value={form.description} onChange={(e) => set('description', e.target.value)} /></Field>
        <label className="check">
          <input type="checkbox" checked={form.published} onChange={(e) => set('published', e.target.checked)} />
          <span>Published <span className="small muted">(visible to members in the app)</span></span>
        </label>
      </form>
    </Modal>
  );
}

function AttendanceForm({ event, onClose, onSaved }: { event: AdminEvent; onClose: () => void; onSaved: () => void }) {
  const [count, setCount] = useState(String(event.attendance ?? ''));
  const save = useAction(AdminApi.events.setAttendance);
  return (
    <Modal title="Headcount" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={save.busy || !count} onClick={async () => { if (await save.run(event.id, Number(count)) !== undefined) onSaved(); }}>Save</button></>}
    >
      <div className="stack">
        <p className="muted">{event.title} · {formatDay(event.startsAt)}</p>
        <Field label="How many people attended?" hint={`${event.goingCount} RSVPed in the app`}>
          <input className="input" type="number" min={0} autoFocus value={count} onChange={(e) => setCount(e.target.value)} />
        </Field>
        <FormError error={save.error} />
      </div>
    </Modal>
  );
}
