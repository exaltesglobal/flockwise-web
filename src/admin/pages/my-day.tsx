// Care › My day: one page each morning about the signed-in pastor or leader, not the whole church.
// Their calls, today's services and where they serve, visits with a map route, meetings and action
// items, care cases on their name, counselling follow-ups, the sermon they are preparing, and the
// queues that wait on the office.
import { BookOpen, CalendarDays, ChevronRight, ClipboardList, HeartHandshake, Inbox, MapPinned, NotebookPen, Phone, Sunrise } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';

import { AdminApi } from '@/api/endpoints';
import type { MyDay } from '@/core/types';
import { VISIT_PURPOSES } from '@/core/modules/zones';
import { ErrorState, FormError, Loading, useToast } from '@/components/ui';
import { formatDate, formatTime } from '@/lib/format';
import { useAction, useApi } from '@/lib/use-api';

import { VisitRouteModal } from '../components/visit-route';
import { PageHeader } from '../layout';

const day = (d: string) => formatDate(`${d}T12:00:00`);
const STATUS: Record<string, string> = { idea: 'Idea', drafting: 'Drafting', ready: 'Ready', preached: 'Preached' };

function Section({ icon, title, link, children }: { icon: ReactNode; title: string; link?: { to: string; label: string }; children: ReactNode }) {
  return (
    <section className="card card-pad stack md-card" style={{ gap: 8 }}>
      <div className="row between" style={{ gap: 8 }}>
        <b className="row" style={{ gap: 6 }}>{icon} {title}</b>
        {link && <Link className="small" to={link.to}>{link.label}</Link>}
      </div>
      {children}
    </section>
  );
}

export function MyDayPage() {
  const q = useApi(AdminApi.myDay);
  const [route, setRoute] = useState(false);
  const toast = useToast();
  const tick = useAction(async (a: MyDay['actions'][number]) => { await AdminApi.meetings.tick(a.meetingId, a.actionId, true); toast('Done.'); q.reload(); });
  if (q.error) return <><PageHeader title="My day" /><ErrorState error={q.error} onRetry={q.reload} /></>;
  if (!q.data) return <><PageHeader title="My day" /><Loading /></>;
  const d = q.data;
  const first = d.name.replace(/^(pastor|rev\.?|fr\.?|bro\.?|sis\.?)\s+/i, '').split(' ')[0];
  const quiet = !d.calls?.length && !d.events.length && !d.visits.length && !d.meetings.length && !d.actions.length && !d.careCases.length && !d.counselFollowUps && !d.sermon && !d.waiting.length;

  return (
    <>
      <PageHeader title="My day" subtitle={`${formatDate(`${d.date}T12:00:00`)}. What is on for you today, ${first}.`} />
      {quiet && <div className="card card-pad muted">A quiet day: nothing on your name. A good day to visit someone or prepare Sunday.</div>}
      <div className="md-grid">
        {d.calls && d.calls.length > 0 && (
          <Section icon={<Sunrise size={16} />} title="Calls worth making" link={{ to: '/admin/morning-list', label: 'All calls' }}>
            {d.calls.map((c) => (
              <div key={c.personId} className="md-row">
                <span className="grow"><b>{c.name}</b><span className="small muted" style={{ display: 'block' }}>{c.reason}</span></span>
                {c.phone && <a className="btn sm ghost icon" href={`tel:${c.phone.replace(/\s/g, '')}`} aria-label={`Call ${c.name}`}><Phone size={14} /></a>}
              </div>
            ))}
          </Section>
        )}

        {(d.events.length > 0 || d.serving.length > 0) && (
          <Section icon={<CalendarDays size={16} />} title="Today" link={{ to: '/admin/events', label: 'Calendar' }}>
            {d.events.map((e) => <div key={e.id} className="md-row"><span className="md-time">{formatTime(e.startsAt)}</span><span className="grow">{e.title}{e.location && <span className="small muted"> · {e.location}</span>}</span></div>)}
            {d.serving.map((s, i) => <div key={i} className="md-row small"><span className="md-time" /><span className="grow">You serve: <b>{s.position || s.team}</b> on {s.team}, {s.eventTitle}</span></div>)}
          </Section>
        )}

        {d.visits.length > 0 && (
          <Section icon={<MapPinned size={16} />} title={`Visits (${d.visits.length})`} link={{ to: '/admin/zones', label: 'Area visits' }}>
            {d.visits.map((v) => (
              <div key={v.visitId} className="md-row">
                <span className="grow"><b>{v.familyName}</b><span className="small muted" style={{ display: 'block' }}>{VISIT_PURPOSES[v.purpose]}{v.address ? ` · ${v.address}` : ''}</span></span>
                {v.phone && <a className="btn sm ghost icon" href={`tel:${v.phone.replace(/\s/g, '')}`} aria-label={`Call ${v.familyName}`}><Phone size={14} /></a>}
              </div>
            ))}
            <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setRoute(true)}><MapPinned size={14} /> Route on the map</button>
          </Section>
        )}

        {(d.meetings.length > 0 || d.actions.length > 0) && (
          <Section icon={<ClipboardList size={16} />} title="Meetings and actions" link={{ to: '/admin/meetings', label: 'Meetings' }}>
            {d.meetings.map((m) => <Link key={m.id} to={`/admin/meetings?open=${m.id}`} className="md-row md-link"><span className="md-time">{m.time || 'Today'}</span><span className="grow"><b>{m.title}</b>{m.place && <span className="small muted"> · {m.place}</span>}</span><ChevronRight size={15} className="muted" /></Link>)}
            <FormError error={tick.error} />
            {d.actions.map((a) => (
              <label key={a.actionId} className="mt-action">
                <input type="checkbox" checked={false} onChange={() => void tick.run(a)} disabled={tick.busy} />
                <span className="grow">{a.text}<span className="small muted" style={{ display: 'block' }}>From {a.meetingTitle}</span></span>
                {a.due && <span className={`badge ${a.overdue ? 'danger' : 'gray'}`}>{a.overdue ? 'Overdue' : 'By'} {day(a.due)}</span>}
              </label>
            ))}
          </Section>
        )}

        {d.careCases.length > 0 && (
          <Section icon={<HeartHandshake size={16} />} title="Care on your name" link={{ to: '/admin/care', label: 'Care' }}>
            {d.careCases.map((c) => (
              <Link key={c.id} to={`/admin/care?case=${c.id}`} className="md-row md-link">
                <span className="grow"><b>{c.personName}</b><span className="small muted" style={{ display: 'block' }}>{c.title}</span></span>
                {c.urgent && <span className="badge danger">Urgent</span>}
                {c.overdue && !c.urgent && <span className="badge warn">Overdue</span>}
              </Link>
            ))}
          </Section>
        )}

        {d.sermon && (
          <Section icon={<BookOpen size={16} />} title="Your next sermon" link={{ to: `/admin/sermon-prep?open=${d.sermon.id}`, label: 'Open' }}>
            <div><b>{d.sermon.title || 'Untitled'}</b><div className="small muted">{day(d.sermon.date)} · {STATUS[d.sermon.status] ?? d.sermon.status} · {d.sermon.points} point{d.sermon.points === 1 ? '' : 's'}</div></div>
            {d.sermon.comments > 0 && <Link className="small" to={`/admin/sermon-prep?open=${d.sermon.id}`}>{d.sermon.comments} new comment{d.sermon.comments === 1 ? '' : 's'} on your draft</Link>}
          </Section>
        )}

        {d.counselFollowUps > 0 && (
          <Section icon={<NotebookPen size={16} />} title="Counselling" link={{ to: '/admin/counselling', label: 'Open notes' }}>
            <span className="small">{d.counselFollowUps} follow-up{d.counselFollowUps === 1 ? ' is' : 's are'} due. Unlock your notes to see who.</span>
          </Section>
        )}

        {d.waiting.length > 0 && (
          <Section icon={<Inbox size={16} />} title="Waiting on the office">
            {d.waiting.map((w) => <Link key={w.key} to={w.link} className="md-row md-link"><span className="grow">{w.label}</span><span className="badge">{w.count}</span><ChevronRight size={15} className="muted" /></Link>)}
          </Section>
        )}
      </div>
      {route && <VisitRouteModal date={d.date} onClose={() => setRoute(false)} />}
    </>
  );
}
