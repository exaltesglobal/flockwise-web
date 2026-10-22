import { ArrowLeft, CalendarDays, MapPin, Users } from 'lucide-react';
import { Link, useParams } from 'react-router';

import type { RsvpStatus } from '@/api/types';
import { MemberApi } from '@/api/endpoints';
import { ErrorState, FormError, Loading } from '@/components/ui';
import { useT } from '@/i18n';
import { formatDay, formatTime } from '@/lib/format';
import { useAction, useApi } from '@/lib/use-api';

import { EventCard } from './shared';

export function MemberEventsPage() {
  const { t } = useT();
  const { data, error, reload } = useApi(() => MemberApi.events.list());
  return (
    <>
      <h1>{t('tabEvents')}</h1>
      {error ? <ErrorState error={error} onRetry={reload} /> : !data ? <Loading /> : data.data.length === 0 ? (
        <p className="muted">{t('noUpcoming')}</p>
      ) : (
        <div className="stack">{data.data.map((e) => <EventCard key={e.id} event={e} />)}</div>
      )}
    </>
  );
}

export function MemberEventPage() {
  const { id = '' } = useParams();
  const { t, locale } = useT();
  const { data: ev, error, reload, setData } = useApi(() => MemberApi.events.get(id), [id]);
  const rsvp = useAction(async (status: RsvpStatus) => setData(await MemberApi.events.rsvp(id, status)));

  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!ev) return <Loading />;
  const full = !!ev.capacity && ev.goingCount >= ev.capacity && ev.myRsvp !== 'going';

  return (
    <>
      <Link to="/app/events" className="small row" style={{ gap: 4 }}><ArrowLeft size={15} /> {t('backToEvents')}</Link>
      <div className="card card-pad stack lg">
        <div className="stack" style={{ gap: 8 }}>
          <span className={`badge ${ev.kind === 'service' ? '' : 'gray'}`} style={{ alignSelf: 'flex-start' }}>{ev.kind === 'service' ? t('nextService') : t('tabEvents')}</span>
          <h1>{ev.title}</h1>
        </div>
        <div className="stack" style={{ gap: 8 }}>
          <span className="row" style={{ gap: 8 }}><CalendarDays size={17} className="muted" /> {formatDay(ev.startsAt, locale)}, {formatTime(ev.startsAt, locale)} – {formatTime(ev.endsAt, locale)}</span>
          {ev.location && <span className="row" style={{ gap: 8 }}><MapPin size={17} className="muted" /> {ev.location}</span>}
          <span className="row" style={{ gap: 8 }}>
            <Users size={17} className="muted" /> {t('peopleGoing', { count: ev.goingCount })}
            {ev.capacity ? <span className="muted">· {full ? t('full') : t('spotsLeft', { count: ev.capacity - ev.goingCount })}</span> : null}
          </span>
        </div>
        {ev.description && <p style={{ whiteSpace: 'pre-wrap' }}>{ev.description}</p>}
        <FormError error={rsvp.error} />
        <div className="row wrap">
          <button className={`btn lg ${ev.myRsvp === 'going' ? 'primary' : ''}`} disabled={rsvp.busy || full} onClick={() => rsvp.run('going')}>
            {ev.myRsvp === 'going' ? `✓ ${t('going')}` : t('imGoing')}
          </button>
          <button className={`btn lg ${ev.myRsvp === 'not_going' ? 'primary' : ''}`} disabled={rsvp.busy} onClick={() => rsvp.run('not_going')}>
            {t('notGoing')}
          </button>
        </div>
      </div>
    </>
  );
}
