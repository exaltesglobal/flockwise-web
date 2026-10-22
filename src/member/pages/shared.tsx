import { CalendarDays, MapPin } from 'lucide-react';
import { Link } from 'react-router';

import type { ChurchEvent } from '@/api/types';
import { useT } from '@/i18n';
import { formatDay, formatTime } from '@/lib/format';

export function EventCard({ event }: { event: ChurchEvent }) {
  const { t, locale } = useT();
  const d = new Date(event.startsAt);
  const left = event.capacity ? event.capacity - event.goingCount : null;
  return (
    <Link to={`/app/events/${event.id}`} className="card event-card">
      <div className="date-chip">
        <b>{d.getDate()}</b>
        <small>{d.toLocaleDateString(locale, { month: 'short' })}</small>
      </div>
      <div className="grow">
        <div style={{ fontWeight: 600 }} className="ellipsis">{event.title}</div>
        <div className="small muted row" style={{ gap: 4 }}><CalendarDays size={13} /> {formatDay(event.startsAt, locale)}, {formatTime(event.startsAt, locale)}</div>
        {event.location && <div className="small muted row ellipsis" style={{ gap: 4 }}><MapPin size={13} /> {event.location}</div>}
      </div>
      {event.myRsvp === 'going' ? (
        <span className="badge ok">{t('going')}</span>
      ) : left !== null && left <= 0 ? (
        <span className="badge gray">{t('full')}</span>
      ) : left !== null && left < 20 ? (
        <span className="badge warn">{t('spotsLeft', { count: left })}</span>
      ) : null}
    </Link>
  );
}
