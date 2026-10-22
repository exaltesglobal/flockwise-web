import { BookOpen, BookUser, Cake, ClipboardList, HandHeart, Heart, QrCode, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';

import { memberSession } from '@/api/client';
import { MemberApi } from '@/api/endpoints';
import { ErrorState, Loading } from '@/components/ui';
import { useT } from '@/i18n';
import { formatDay, formatRelative, formatTime, greetingKey } from '@/lib/format';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/use-api';

import type { MemberCelebration } from '@/api/admin-types';
import { useToast } from '@/components/ui';

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
        <Link to="/app/forms" className="card"><ClipboardList size={22} />{t('tabForms')}</Link>
        <Link to="/app/sermons" className="card"><BookOpen size={22} />{t('tabSermons')}</Link>
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

          <Celebrations />

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

/** Birthdays and anniversaries this week among the member's groups, household and the directory. */
function Celebrations() {
  const { t, locale } = useT();
  const toast = useToast();
  const { data, reload } = useApi(MemberApi.celebrations.list);
  const [writing, setWriting] = useState<MemberCelebration | null>(null);
  const [text, setText] = useState('');
  if (!data || (data.upcoming.length === 0 && data.myWishes.length === 0)) return null;
  const mine = data.upcoming.find((c) => c.isMe && c.daysAway === 0);
  const others = data.upcoming.filter((c) => !c.isMe);

  async function send(c: MemberCelebration) {
    try {
      await MemberApi.celebrations.wish(c.personId, c.kind, text.trim() || undefined);
      setWriting(null);
      setText('');
      toast(t('wished'));
      reload();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  return (
    <section className="stack">
      {mine && (
        <div className="hero-card">
          <h2>{mine.kind === 'birthday' ? t('happyBirthdayYou') : t('happyAnniversaryYou')}</h2>
          {data.myWishes.length > 0 && <span className="meta">{t('wishesCount', { count: data.myWishes.length })}</span>}
        </div>
      )}
      {data.myWishes.length > 0 && (
        <div className="card card-pad stack" style={{ gap: 8 }}>
          <strong>{t('wishesForYou')}</strong>
          {data.myWishes.map((w, i) => (
            <div key={i} className="small"><strong>{w.fromName}</strong> <span className="muted">· {w.message}</span></div>
          ))}
        </div>
      )}
      {others.length > 0 && (
        <>
          <h2>{t('celebrationsWeek')}</h2>
          <div className="card">
            {others.map((c) => (
              <div key={`${c.personId}-${c.kind}`} className="stack" style={{ gap: 8, padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                <div className="row" style={{ gap: 10 }}>
                  {c.kind === 'birthday' ? <Cake size={18} className="muted" /> : <Heart size={18} className="muted" />}
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{t(c.kind === 'birthday' ? 'birthdayOf' : 'anniversaryOf', { name: c.name })}</div>
                    <div className="small muted">{c.daysAway === 0 ? t('today') : c.daysAway === 1 ? t('tomorrow') : formatDay(`${c.date}T12:00:00`, locale)}</div>
                  </div>
                  {c.wishedByMe ? <span className="badge ok">✓ {t('wished')}</span>
                    : <button className="btn sm" onClick={() => { setWriting(c); setText(''); }}>{t('sendWish')}</button>}
                </div>
                {writing === c && (
                  <form className="row" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); void send(c); }}>
                    <input className="input grow" autoFocus maxLength={280} placeholder={t('wishPlaceholder')} value={text} onChange={(e) => setText(e.target.value)} />
                    <button className="btn primary sm">{t('sendWish')}</button>
                  </form>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
