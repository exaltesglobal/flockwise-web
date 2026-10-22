// Livestream: schedule the YouTube live service, see who is watching now, and how many attended online.
// The online count goes to the linked service's headcount when the stream ends.
import { ArrowLeft, Copy, ExternalLink, Plus, Radio, Square, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';

import type { LiveSettings, LiveStreamDetail, LiveStreamView } from '@/api/admin-types';
import { AdminApi } from '@/api/endpoints';
import { BarChart, Empty, ErrorState, Field, FormError, Loading, Modal, useToast } from '@/components/ui';
import { churchUrl } from '@/lib/church';
import { formatDay, formatTime, toLocalInput } from '@/lib/format';
import { useCan } from '@/lib/perms';
import { useAction, useApi } from '@/lib/use-api';

import { PageHeader } from '../layout';

const when = (iso: string) => `${formatDay(iso)} · ${formatTime(iso)}`;

function StatusBadge({ s }: { s: Pick<LiveStreamView, 'status'> }) {
  if (s.status === 'live') return <span className="badge danger live-badge"><i /> Live</span>;
  return <span className={`badge ${s.status === 'ended' ? 'gray' : ''}`}>{s.status === 'ended' ? 'Ended' : 'Scheduled'}</span>;
}

export function LivestreamPage() {
  const { id } = useParams();
  return id ? <StreamPage id={id} /> : <StreamList />;
}

function StreamList() {
  const can = useCan();
  const edit = can('services') || can('events');
  const { data, error, reload } = useApi(AdminApi.livestream.overview);
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();
  // While a stream is live, keep the viewer count fresh.
  useEffect(() => {
    if (!data?.live) return;
    const t = setInterval(() => void reload(), 30_000);
    return () => clearInterval(t);
  }, [data?.live, reload]);

  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const add = edit && <button className="btn primary" onClick={() => setCreating(true)}><Plus size={16} /> Schedule a stream</button>;
  const last = data.past[0];
  return (
    <>
      <PageHeader title="Livestream" subtitle="Your YouTube live service on the church page and in the member app, with online attendance counted." actions={add} />
      {data.live && (
        <div className="card card-pad live-now">
          <div className="row wrap" style={{ gap: 12 }}>
            <StatusBadge s={data.live} />
            <div className="grow" style={{ minWidth: 0 }}>
              <b>{data.live.title}</b>
              <div className="small muted">Started {formatTime(data.live.startedAt ?? data.live.startsAt)}{data.live.eventTitle ? ` · ${data.live.eventTitle}` : ''}</div>
            </div>
            <div className="live-count"><b>{data.live.watching}</b><span className="small muted">watching now</span></div>
            <Link className="btn" to={`/admin/livestream/${data.live.id}`}>Open</Link>
            {edit && <button className="btn danger" onClick={async () => { if (!confirm('End the stream? The online count goes to the service headcount.')) return; await AdminApi.livestream.end(data.live!.id); toast('Stream ended'); reload(); }}><Square size={14} /> End</button>}
          </div>
        </div>
      )}
      {last && (
        <div className="grid cols-4" style={{ marginBottom: 16 }}>
          <div className="card kpi"><span className="label">Last stream</span><span className="value" style={{ fontSize: 18 }}>{formatDay(last.startsAt)}</span><span className="small muted">{last.title}</span></div>
          <div className="card kpi"><span className="label">Attended online</span><span className="value">{last.attended}</span><span className="small muted">{last.viewers} opened it</span></div>
          <div className="card kpi"><span className="label">Members watching</span><span className="value">{last.members}</span></div>
          <div className="card kpi"><span className="label">Average watch</span><span className="value">{last.avgMinutes} min</span><span className="small muted">Peak {last.peak} at once</span></div>
        </div>
      )}
      <div className="split">
        <SettingsCard settings={data.settings} edit={edit} onSaved={reload} />
        <div className="stack">
          <div className="card">
            <div className="card-head"><h3>Coming up</h3></div>
            {data.upcoming.length === 0 ? <Empty icon={<Radio size={26} />} title="Nothing scheduled" body="Schedule each Sunday's stream once you have its YouTube link. It shows on the church page and in the app from a week before." action={add} /> : data.upcoming.map((s) => (
              <button key={s.id} type="button" className="list-row live-row" onClick={() => navigate(`/admin/livestream/${s.id}`)}>
                <span className="grow" style={{ minWidth: 0 }}><b>{s.title}</b><span className="small muted" style={{ display: 'block' }}>{when(s.startsAt)}{s.eventTitle ? ` · ${s.eventTitle}` : ''}</span></span>
                <StatusBadge s={s} />
              </button>
            ))}
          </div>
          <div className="card">
            <div className="card-head"><h3>Past streams</h3></div>
            {data.past.length === 0 ? <Empty icon={<Radio size={26} />} title="No streams yet" /> : (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Stream</th><th>Opened</th><th>Attended</th><th>Members</th><th>Avg</th></tr></thead>
                  <tbody>
                    {data.past.map((s) => (
                      <tr key={s.id} className="clickable" onClick={() => navigate(`/admin/livestream/${s.id}`)}>
                        <td><b>{s.title}</b><div className="small muted">{when(s.startsAt)}</div></td>
                        <td>{s.viewers}</td>
                        <td><b>{s.attended}</b></td>
                        <td>{s.members}</td>
                        <td className="small">{s.avgMinutes} min</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
      {creating && <StreamModal onClose={() => setCreating(false)} onSaved={(s) => { setCreating(false); navigate(`/admin/livestream/${s.id}`); }} />}
    </>
  );
}

function SettingsCard({ settings, edit, onSaved }: { settings: LiveSettings; edit: boolean; onSaved: () => void }) {
  const [f, setF] = useState(settings);
  const save = useAction(AdminApi.livestream.settings);
  const toast = useToast();
  const copy = (url: string) => navigator.clipboard?.writeText(url).then(() => toast('Link copied'), () => toast(url));
  const dirty = JSON.stringify(f) !== JSON.stringify(settings);
  return (
    <div className="card card-pad stack">
      <h3>Settings</h3>
      <Field label="YouTube channel id" hint="Starts with UC. Shown when no stream is scheduled. YouTube Studio → Settings → Channel → Advanced settings.">
        <input className="input mono" disabled={!edit} value={f.channelId} placeholder="UC…" onChange={(e) => setF({ ...f, channelId: e.target.value })} />
      </Field>
      <Field label="Count as attending after" hint="Minutes watched before someone counts in the online attendance.">
        <select className="select" disabled={!edit} value={f.countAfterMinutes} onChange={(e) => setF({ ...f, countAfterMinutes: Number(e.target.value) })}>
          {[1, 2, 5, 10, 15, 20, 30].map((n) => <option key={n} value={n}>{n} minute{n === 1 ? '' : 's'}</option>)}
        </select>
      </Field>
      <label className="row" style={{ gap: 8 }}>
        <input type="checkbox" disabled={!edit} checked={f.publicWatch} onChange={(e) => setF({ ...f, publicWatch: e.target.checked })} />
        <span>Anyone can watch on the church page (not only signed-in members)</span>
      </label>
      <FormError error={save.error} />
      {edit && <button className="btn primary" style={{ alignSelf: 'flex-start' }} disabled={!dirty || save.busy} onClick={async () => { const r = await save.run(f); if (r) { setF(r); toast('Saved'); onSaved(); } }}>Save</button>}
      <div className="live-divider" />
      <div className="stack" style={{ gap: 6 }}>
        <span className="small muted">Share these links in WhatsApp groups before the service:</span>
        <div className="row" style={{ gap: 6 }}><code className="grow small live-link">{churchUrl('/live')}</code><button className="btn sm ghost icon" title="Copy" onClick={() => copy(churchUrl('/live'))}><Copy size={14} /></button></div>
        <div className="row" style={{ gap: 6 }}><code className="grow small live-link">{churchUrl('/app/live')}</code><button className="btn sm ghost icon" title="Copy" onClick={() => copy(churchUrl('/app/live'))}><Copy size={14} /></button></div>
      </div>
    </div>
  );
}

function StreamModal({ stream, onClose, onSaved }: { stream?: LiveStreamDetail; onClose: () => void; onSaved: (s: LiveStreamView) => void }) {
  const events = useApi(() => AdminApi.events.list('upcoming'));
  const [url, setUrl] = useState(stream ? `https://youtu.be/${stream.youtubeId}` : '');
  const [eventId, setEventId] = useState(stream?.eventId ?? '');
  const [title, setTitle] = useState(stream?.title ?? '');
  const [startsAt, setStartsAt] = useState(stream?.startsAt ?? '');
  const save = useAction((input: { url: string; title: string; eventId: string | null; startsAt?: string }) => (stream ? AdminApi.livestream.update(stream.id, input) : AdminApi.livestream.create(input)));
  const services = (events.data?.data ?? []).filter((e) => e.kind === 'service' || stream?.eventId === e.id);
  const others = (events.data?.data ?? []).filter((e) => !services.includes(e));
  return (
    <Modal title={stream ? 'Edit stream' : 'Schedule a stream'} onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!url.trim() || save.busy} onClick={async () => { const r = await save.run({ url, title, eventId: eventId || null, startsAt: startsAt || undefined }); if (r) onSaved(r); }}>{stream ? 'Save' : 'Schedule'}</button></>}
    >
      <div className="stack">
        <Field label="YouTube link" hint="In YouTube Studio, create the live stream (Go live → Schedule stream) and copy its link.">
          <input className="input" autoFocus value={url} placeholder="https://youtube.com/live/…" onChange={(e) => setUrl(e.target.value)} />
        </Field>
        <Field label="Service" hint="Online viewers are added to this service's headcount when the stream ends.">
          <select className="select" value={eventId} onChange={(e) => { setEventId(e.target.value); const ev = events.data?.data.find((x) => x.id === e.target.value); if (ev && !startsAt) setStartsAt(ev.startsAt); }}>
            <option value="">Not linked to a service</option>
            {services.length > 0 && <optgroup label="Services">{services.map((e) => <option key={e.id} value={e.id}>{when(e.startsAt)} · {e.title}</option>)}</optgroup>}
            {others.length > 0 && <optgroup label="Events">{others.map((e) => <option key={e.id} value={e.id}>{when(e.startsAt)} · {e.title}</option>)}</optgroup>}
          </select>
        </Field>
        <div className="grid cols-2">
          <Field label="Title"><input className="input" value={title} placeholder="The service's name" onChange={(e) => setTitle(e.target.value)} /></Field>
          <Field label="Starts"><input className="input" type="datetime-local" value={startsAt ? toLocalInput(startsAt) : ''} onChange={(e) => setStartsAt(e.target.value ? new Date(e.target.value).toISOString() : '')} /></Field>
        </div>
        <FormError error={save.error} />
      </div>
    </Modal>
  );
}

function StreamPage({ id }: { id: string }) {
  const can = useCan();
  const edit = can('services') || can('events');
  const { data, error, reload, setData } = useApi(() => AdminApi.livestream.get(id), [id]);
  const [editing, setEditing] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();
  useEffect(() => {
    if (data?.status !== 'live') return;
    const t = setInterval(() => void reload(), 30_000);
    return () => clearInterval(t);
  }, [data?.status, reload]);
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <Loading />;

  // Viewers in 5-minute steps from the start.
  const buckets: { label: string; value: number }[] = [];
  for (let i = 0; i < data.timeline.length; i += 5) buckets.push({ label: `${i}`, value: Math.max(...data.timeline.slice(i, i + 5).map((x) => x.count)) });

  return (
    <>
      <Link to="/admin/livestream" className="btn ghost sm" style={{ alignSelf: 'flex-start' }}><ArrowLeft size={14} /> Livestream</Link>
      <PageHeader
        title={data.title}
        subtitle={`${when(data.startedAt ?? data.startsAt)}${data.eventTitle ? ` · ${data.eventTitle}` : ''}`}
        actions={<>
          <StatusBadge s={data} />
          <a className="btn" href={`https://www.youtube.com/watch?v=${data.youtubeId}`} target="_blank" rel="noreferrer"><ExternalLink size={15} /> YouTube</a>
          {edit && data.status === 'scheduled' && <button className="btn primary" onClick={async () => { setData(await AdminApi.livestream.start(id)); toast('You are live'); }}><Radio size={15} /> Go live</button>}
          {edit && data.status === 'live' && <button className="btn danger" onClick={async () => { if (!confirm('End the stream? The online count goes to the service headcount.')) return; setData(await AdminApi.livestream.end(id)); toast('Stream ended'); }}><Square size={14} /> End stream</button>}
          {edit && data.status !== 'ended' && <button className="btn ghost" onClick={() => setEditing(true)}>Edit</button>}
          {edit && <button className="btn ghost icon" title="Delete" onClick={async () => { if (!confirm(data.viewers ? `Delete this stream and its ${data.viewers} viewers? A headcount already recorded stays.` : 'Delete this stream?')) return; await AdminApi.livestream.remove(id); navigate('/admin/livestream'); }}><Trash2 size={15} /></button>}
        </>}
      />
      {data.status === 'scheduled' && <div className="alert info">It goes live on the church page and in the app at {formatTime(data.startsAt)}, or when you press Go live. Viewers are counted from then.</div>}
      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        {data.status === 'live' && <div className="card kpi"><span className="label">Watching now</span><span className="value">{data.watching}</span></div>}
        <div className="card kpi"><span className="label">Attended online</span><span className="value">{data.attended}</span><span className="small muted">{data.status === 'ended' && data.recorded !== null && data.eventId ? 'Added to the service headcount' : `${data.viewers} opened it`}</span></div>
        <div className="card kpi"><span className="label">Members attended</span><span className="value">{data.members}</span><span className="small muted">{data.guests} guests opened it</span></div>
        <div className="card kpi"><span className="label">Average watch</span><span className="value">{data.avgMinutes} min</span></div>
        {data.status !== 'live' && <div className="card kpi"><span className="label">Peak at once</span><span className="value">{data.peak}</span></div>}
      </div>
      <div className="split">
        <div className="card card-pad stack">
          <h3>Viewers through the service</h3>
          {buckets.length ? <BarChart data={buckets} format={(v) => `${v}`} /> : <p className="muted small">No viewers yet.</p>}
          <span className="small muted">Most watching at once, every 5 minutes from the start.</span>
        </div>
        <div className="card">
          <div className="card-head"><h3>Members who watched</h3><span className="small muted">{data.people.length}</span></div>
          {data.people.length === 0 ? <Empty icon={<Radio size={26} />} title="No signed-in members yet" body="Members who watch in the Flockwise app or signed in on the church page appear here." /> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Name</th><th>Minutes</th><th>Joined</th></tr></thead>
                <tbody>
                  {data.people.map((p) => (
                    <tr key={p.personId}>
                      <td><Link to={`/admin/people/${p.personId}`}><b>{p.name}</b></Link><div className="small muted">{p.householdName ?? ''}</div></td>
                      <td>{p.minutes}</td>
                      <td className="small muted">{formatTime(p.firstAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      {editing && <StreamModal stream={data} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); void reload(); }} />}
    </>
  );
}
