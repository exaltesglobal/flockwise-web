import { BookUser, HandHeart, QrCode, Sparkles } from 'lucide-react';
import { Link } from 'react-router';

import { memberSession } from '@/api/client';
import { MemberApi } from '@/api/endpoints';
import { ErrorState, Loading } from '@/components/ui';
import { useT } from '@/i18n';
import { formatDay, formatRelative, formatTime, greetingKey } from '@/lib/format';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/use-api';

import { EventCard } from './shared';

export function MemberHomePage() {
  const { t, locale } = useT();
  const session = useSession(memberSession);
  const { data, error, reload } = useApi(MemberApi.home);

  return (
    <>
      <div>
        <p className="muted">{t(greetingKey())},</p>
        <h1>{session?.member.firstName}</h1>
      </div>
      <nav className="quick-links" aria-label={t('quickLinks')}>
        <Link to="/app/serving" className="card"><HandHeart size={22} />{t('tabServing')}</Link>
        <Link to="/app/prayer" className="card"><Sparkles size={22} />{t('tabPrayer')}</Link>
        <Link to="/app/directory" className="card"><BookUser size={22} />{t('tabDirectory')}</Link>
        <Link to="/app/me#qr" className="card"><QrCode size={22} />{t('myQr').split(' ').slice(0, 2).join(' ')}</Link>
      </nav>
      {error ? <ErrorState error={error} onRetry={reload} /> : !data ? <Loading /> : (
        <>
          {data.nextService && (
            <div className="hero-card">
              <span className="eyebrow">{t('nextService')}</span>
              <h2>{data.nextService.title}</h2>
              <span className="meta">
                {formatDay(data.nextService.startsAt, locale)} · {formatTime(data.nextService.startsAt, locale)} · {data.nextService.location}
              </span>
              <Link to={`/app/events/${data.nextService.id}`} className="btn accent">
                {data.nextService.myRsvp === 'going' ? `✓ ${t('going')}` : t('imGoing')}
              </Link>
            </div>
          )}

          {data.announcements.length > 0 && (
            <section className="stack">
              <h2>{t('announcements')}</h2>
              {data.announcements.map((a) => (
                <div key={a.id} className="card card-pad stack" style={{ gap: 6 }}>
                  <h3>{a.title}</h3>
                  <p className="muted">{a.body}</p>
                  <span className="small muted">{formatRelative(a.publishedAt, locale)}</span>
                </div>
              ))}
            </section>
          )}

          <section className="stack">
            <div className="section-head">
              <h2>{t('upcoming')}</h2>
              <Link to="/app/events" className="small">{t('seeAll')}</Link>
            </div>
            {data.upcomingEvents.length === 0 ? <p className="muted">{t('noUpcoming')}</p> : data.upcomingEvents.map((e) => <EventCard key={e.id} event={e} />)}
          </section>
        </>
      )}
    </>
  );
}
