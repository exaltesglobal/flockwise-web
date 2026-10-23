import { CalendarDays, Mail, Pencil, Plus, ScanLine, Trash2, Users, Video, VideoOff } from 'lucide-react';
import { Link } from 'react-router';
import { useState, type FormEvent } from 'react';

import type { AdminEvent, EventInput } from '@/api/admin-types';
import { adminSession } from '@/api/client';
import { AdminApi } from '@/api/endpoints';
import { InvitationModal } from '@/components/invitation';
import { Empty, ErrorState, Field, FormError, Loading, Modal, Segmented, useToast } from '@/components/ui';
import { downloadCsv, formatDay, formatMoney, formatTime, toLocalInput } from '@/lib/format';
import { churchUrl } from '@/lib/church';
import { useSession } from '@/lib/session';
import { useNewParam } from '@/lib/use-new-param';
import { useAction, useApi } from '@/lib/use-api';

import { PageHeader } from '../layout';

export function EventsPage() {
  const [when, setWhen] = useState<'upcoming' | 'past'>('upcoming');
  const { data, error, reload } = useApi(() => AdminApi.events.list(when), [when]);
  const [editing, setEditing] = useState<AdminEvent | 'new' | null>(null);
  useNewParam(() => setEditing('new'));
  const [counting, setCounting] = useState<AdminEvent | null>(null);
  const [viewing, setViewing] = useState<AdminEvent | null>(null);
  const [inviting, setInviting] = useState<AdminEvent | null>(null);
  const session = useSession(adminSession);
  const toast = useToast();
  // Which outside services are connected (Zoom for meetings, Canva for the invitation). Errors are ignored: the page works without them.
  const connections = useApi(() => AdminApi.integrations.get().catch(() => null), []);

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
                      <div className="row" style={{ gap: 6, marginTop: 2 }}>
                        <span className={`badge ${ev.kind === 'service' ? '' : 'gray'}`}>{ev.kind === 'service' ? 'Service' : 'Event'}</span>
                        {!!ev.price && <span className="badge accent">{formatMoney(ev.price, 'INR')}</span>}
                        {ev.checkinEnabled && <span className="badge gray"><ScanLine size={11} /> Check-in</span>}
                        {ev.campusName && <span className="small muted">{ev.campusName}</span>}
                      </div>
                    </td>
                    <td className="small">{ev.location || '—'}</td>
                    <td className="num">
                      <button className="link-btn" onClick={() => setViewing(ev)}>{ev.goingCount}{ev.capacity ? <span className="muted"> / {ev.capacity}</span> : ''}</button>
                      {ev.checkinCount > 0 && <div className="small muted">{ev.checkinCount} checked in</div>}
                    </td>
                    {when === 'past' && (
                      <td className="num">
                        <button className="btn sm" onClick={() => setCounting(ev)}>{ev.attendance ?? 'Add count'}</button>
                      </td>
                    )}
                    <td>{ev.published ? <span className="badge ok">Published</span> : <span className="badge gray">Draft</span>}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button className="btn ghost icon sm" title="People" onClick={() => setViewing(ev)}><Users size={15} /></button>
                      {ev.published && <button className="btn ghost icon sm" title="Invitation card" onClick={() => setInviting(ev)}><Mail size={15} /></button>}
                      {ev.checkinEnabled && when === 'upcoming' && <Link className="btn ghost icon sm" title="Open check-in" to={`/admin/checkin?event=${ev.id}`}><ScanLine size={15} /></Link>}
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

      {editing && <EventForm event={editing === 'new' ? null : editing} zoom={!!connections.data?.zoom.connected} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); toast('Saved'); }} />}
      {viewing && <AttendeesDrawer event={viewing} onClose={() => setViewing(null)} />}
      {inviting && session && (
        <InvitationModal
          event={inviting}
          church={session.church}
          link={churchUrl(`/app/events/${inviting.id}`)}
          shareText={`You are invited to ${inviting.title} on ${formatDay(inviting.startsAt)}, ${formatTime(inviting.startsAt)}${inviting.location ? ` at ${inviting.location}` : ''}. RSVP: ${churchUrl(`/app/events/${inviting.id}`)}`}
          onCanva={connections.data?.canva.connected ? async (imageDataUrl, title) => (await AdminApi.canva.open({ kind: 'invitation', title, imageDataUrl })).editUrl : undefined}
          onClose={() => setInviting(null)}
        />
      )}
      {counting && <AttendanceForm event={counting} onClose={() => setCounting(null)} onSaved={() => { setCounting(null); reload(); toast('Attendance saved'); }} />}
    </>
  );
}

function defaultTimes() {
  const s = new Date(Date.now() + 7 * 86400000);
  s.setHours(18, 0, 0, 0);
  return { startsAt: s.toISOString(), endsAt: new Date(s.getTime() + 2 * 3600000).toISOString() };
}

function EventForm({ event, zoom, onClose, onSaved }: { event: AdminEvent | null; zoom: boolean; onClose: () => void; onSaved: () => void }) {
  const campuses = useApi(AdminApi.campuses.list);
  const [repeatWeeks, setRepeatWeeks] = useState(0);
  const [meeting, setMeeting] = useState(event?.zoom ?? null);
  const toast = useToast();
  const [form, setForm] = useState<EventInput>(() => ({
    kind: event?.kind ?? 'event',
    campusId: event?.campusId ?? null,
    checkinEnabled: event?.checkinEnabled ?? event?.kind === 'service',
    price: event?.price ?? null,
    title: event?.title ?? '',
    description: event?.description ?? '',
    location: event?.location ?? '',
    meetingUrl: event?.meetingUrl ?? null,
    capacity: event?.capacity ?? null,
    imageUrl: event?.imageUrl ?? null,
    published: event?.published ?? true,
    ...(event ? { startsAt: event.startsAt, endsAt: event.endsAt } : defaultTimes()),
  }));
  const save = useAction((input: EventInput) => (event ? AdminApi.events.update(event.id, input) : AdminApi.events.create({ ...input, repeatWeeks })));
  const set = <K extends keyof EventInput>(k: K, v: EventInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const fe = save.error?.fields ?? {};
  const badRange = new Date(form.endsAt) <= new Date(form.startsAt);
  // A Zoom meeting is made on the saved event straight away (its times and title are what Zoom gets).
  const zoomMeeting = useAction(async (on: boolean) => {
    if (!event) return null;
    const saved = on ? await AdminApi.events.createZoom(event.id) : await AdminApi.events.removeZoom(event.id);
    setMeeting(saved.zoom ?? null);
    set('meetingUrl', saved.meetingUrl ?? null);
    toast(on ? 'Zoom meeting created' : 'Zoom meeting removed');
    return saved;
  });

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
          <div><Segmented value={form.kind} onChange={(v) => setForm((f) => ({ ...f, kind: v, checkinEnabled: event ? f.checkinEnabled : v === 'service' }))} options={[{ value: 'service', label: 'Service' }, { value: 'event', label: 'Event' }]} /></div>
        </Field>
        <Field label="Title" error={fe.title}><input className="input" autoFocus value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Sunday Worship (English)" /></Field>
        <div className="grid cols-2">
          <Field label="Starts"><input className="input" type="datetime-local" value={toLocalInput(form.startsAt)} onChange={(e) => e.target.value && set('startsAt', new Date(e.target.value).toISOString())} /></Field>
          <Field label="Ends" error={badRange ? 'Must be after the start' : undefined}><input className="input" type="datetime-local" value={toLocalInput(form.endsAt)} onChange={(e) => e.target.value && set('endsAt', new Date(e.target.value).toISOString())} /></Field>
          <Field label="Location"><input className="input" value={form.location} onChange={(e) => set('location', e.target.value)} placeholder="Main Sanctuary" /></Field>
          <Field label="Capacity" hint="Leave empty for no limit"><input className="input" type="number" min={1} value={form.capacity ?? ''} onChange={(e) => set('capacity', e.target.value ? Number(e.target.value) : null)} /></Field>
          {(campuses.data?.length ?? 0) > 0 && (
            <Field label="Campus">
              <select className="select" value={form.campusId ?? ''} onChange={(e) => set('campusId', e.target.value || null)}>
                <option value="">All campuses</option>
                {campuses.data!.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
          )}
          <Field label="Ticket price (₹)" hint="Leave empty for a free event" error={fe.price}>
            <input className="input" type="number" min={0} step="1" value={form.price ? form.price / 100 : ''} onChange={(e) => set('price', e.target.value ? Math.round(Number(e.target.value) * 100) : null)} placeholder="Free" />
          </Field>
          {!event && (
            <Field label="Repeat weekly" hint="Creates copies for the following weeks">
              <select className="select" value={repeatWeeks} onChange={(e) => setRepeatWeeks(Number(e.target.value))}>
                <option value={0}>Does not repeat</option>
                {[3, 7, 11, 25, 51].map((n) => <option key={n} value={n}>For {n + 1} weeks</option>)}
              </select>
            </Field>
          )}
        </div>
        <Field label="Online meeting link" hint={event && zoom ? 'Paste a link, or let Flockwise make a Zoom meeting for this event.' : 'Zoom, Google Meet or YouTube link. Members see a "Join online" button.'} error={fe.meetingUrl}>
          <div className="row wrap" style={{ gap: 8 }}>
            <input className="input" style={{ flex: 1, minWidth: 200 }} type="url" value={form.meetingUrl ?? ''} onChange={(e) => set('meetingUrl', e.target.value || null)} placeholder="https://" disabled={!!meeting} />
            {event && zoom && (meeting
              ? <button type="button" className="btn" disabled={zoomMeeting.busy} onClick={() => void zoomMeeting.run(false)}><VideoOff size={15} /> Remove Zoom meeting</button>
              : <button type="button" className="btn" disabled={zoomMeeting.busy} onClick={() => void zoomMeeting.run(true)}><Video size={15} /> Create Zoom meeting</button>)}
          </div>
          {meeting && <div className="small muted" style={{ marginTop: 6 }}>Zoom meeting {meeting.meetingId}{meeting.passcode ? ` · passcode ${meeting.passcode}` : ''} · <a href={meeting.startUrl} target="_blank" rel="noreferrer">Start as host</a></div>}
          {event && !zoom && <div className="small muted" style={{ marginTop: 6 }}>Connect Zoom in <Link to="/admin/settings#integrations">Settings › Integrations</Link> to make meetings from here.</div>}
          <FormError error={zoomMeeting.error} />
        </Field>
        <Field label="Description"><textarea className="textarea" value={form.description} onChange={(e) => set('description', e.target.value)} /></Field>
        <label className="check">
          <input type="checkbox" checked={form.checkinEnabled} onChange={(e) => set('checkinEnabled', e.target.checked)} />
          <span>Check-in <span className="small muted">(kids' rooms with security labels, QR codes and self check-in)</span></span>
        </label>
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

function AttendeesDrawer({ event, onClose }: { event: AdminEvent; onClose: () => void }) {
  const { data, error, reload } = useApi(() => AdminApi.events.attendees(event.id), [event.id]);
  return (
    <Modal side title={event.title} onClose={onClose}
      footer={data && data.length > 0 && <button className="btn" onClick={() => downloadCsv(`${event.title}.csv`, [['Name', 'Phone', 'RSVP', 'Checked in', 'Paid'], ...data.map((a) => [a.name, a.phone, a.rsvp ? 'yes' : '', a.checkedIn ? 'yes' : '', a.paid === null ? '' : a.paid ? 'yes' : 'no'])])}>Download CSV</button>}
    >
      <p className="muted small" style={{ marginBottom: 12 }}>{formatDay(event.startsAt)} · {event.goingCount} going{event.checkinCount ? ` · ${event.checkinCount} checked in` : ''}</p>
      {error ? <ErrorState error={error} onRetry={reload} /> : !data ? <Loading /> : data.length === 0 ? <Empty icon={<Users size={28} />} title="No one yet" body="RSVPs from the app and check-ins appear here." /> : (
        <div className="card">
          {data.map((a) => (
            <div key={a.personId} className="list-row">
              <div className="grow">
                <Link to={`/admin/people/${a.personId}`} style={{ fontWeight: 600 }}>{a.name}</Link>
                <div className="small muted">{a.phone ?? ''}</div>
              </div>
              {a.rsvp && <span className="badge">RSVP</span>}
              {a.checkedIn && <span className="badge ok">Checked in</span>}
              {a.paid !== null && <span className={`badge ${a.paid ? 'ok' : 'warn'}`}>{a.paid ? 'Paid' : 'Unpaid'}</span>}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
