import { ArrowLeft, CalendarDays, CheckCircle2, ClipboardList, MapPin, ScanLine, Share2, Ticket, Users } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';

import { memberSession } from '@/api/client';
import type { RsvpStatus } from '@/api/types';
import { MemberApi } from '@/api/endpoints';
import { InvitationModal } from '@/components/invitation';
import { ErrorState, FormError, Loading } from '@/components/ui';
import { useT } from '@/i18n';
import { churchUrl } from '@/lib/church';
import { formatDay, formatMoney, formatTime } from '@/lib/format';
import { useSession } from '@/lib/session';
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
        <div className="tiles">{data.data.map((e) => <EventCard key={e.id} event={e} />)}</div>
      )}
    </>
  );
}

export function MemberEventPage() {
  const { id = '' } = useParams();
  const { t, locale } = useT();
  const { data: ev, error, reload, setData } = useApi(() => MemberApi.events.get(id), [id]);
  const rsvp = useAction(async (status: RsvpStatus) => setData(await MemberApi.events.rsvp(id, status)));
  const session = useSession(memberSession);
  const [paid, setPaid] = useState(false);
  const [inviting, setInviting] = useState(false);
  const ticket = useAction(async () => {
    const intent = await MemberApi.events.buyTicket(id);
    // Real backend: Razorpay hosted checkout. The demo settles instantly.
    if (intent.checkoutUrl) window.location.href = intent.checkoutUrl;
    else { setPaid(true); setData(await MemberApi.events.get(id)); }
  });
  const checkIn = useAction(async () => setData(await MemberApi.events.checkIn(id)));

  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!ev) return <Loading />;
  const full = !!ev.capacity && ev.goingCount >= ev.capacity && ev.myRsvp !== 'going';
  const priced = !ev.registrationFormId && !!ev.price && ev.price > 0;
  const hasTicket = priced && (paid || ev.myRsvp === 'going');
  const now = Date.now();
  const checkInOpen = now >= new Date(ev.startsAt).getTime() - 3600_000 && now <= new Date(ev.endsAt).getTime();

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
        <FormError error={rsvp.error ?? ticket.error ?? checkIn.error} />
        {priced ? (
          hasTicket ? (
            <div className="row" style={{ gap: 8, color: 'var(--ok)', fontWeight: 600 }}><Ticket size={18} /> {t('ticketPaid')}</div>
          ) : (
            <div className="stack" style={{ gap: 6 }}>
              <button className="btn lg primary" style={{ alignSelf: 'flex-start' }} disabled={ticket.busy || full} onClick={() => ticket.run()}>
                <Ticket size={17} /> {t('getTicket', { price: formatMoney(ev.price!, session?.church.currency ?? 'INR', locale) })}
              </button>
              <span className="small muted">{t('ticketNote')}</span>
            </div>
          )
        ) : null}
        {checkInOpen && (ev.checkedIn ? (
          <div className="row" style={{ gap: 8, color: 'var(--ok)', fontWeight: 600 }}><CheckCircle2 size={18} /> {t('checkedIn')}</div>
        ) : (!priced || hasTicket) && (
          <button className="btn lg accent" style={{ alignSelf: 'flex-start' }} disabled={checkIn.busy} onClick={() => checkIn.run()}><ScanLine size={17} /> {t('checkIn')}</button>
        ))}
        {ev.registrationFormId ? (
          <Link to={`/app/forms/${ev.registrationFormId}`} className="btn lg primary" style={{ alignSelf: 'flex-start' }}><ClipboardList size={17} /> {t('register')}</Link>
        ) : !priced && <div className="row wrap">
          <button className={`btn lg ${ev.myRsvp === 'going' ? 'primary' : ''}`} disabled={rsvp.busy || full} onClick={() => rsvp.run('going')}>
            {ev.myRsvp === 'going' ? `✓ ${t('going')}` : t('imGoing')}
          </button>
          <button className={`btn lg ${ev.myRsvp === 'not_going' ? 'primary' : ''}`} disabled={rsvp.busy} onClick={() => rsvp.run('not_going')}>
            {t('notGoing')}
          </button>
        </div>}
        <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => setInviting(true)}><Share2 size={16} /> {t('invite')}</button>
      </div>
      {inviting && session && (
        <InvitationModal
          event={ev}
          church={session.church}
          locale={locale}
          link={churchUrl(`/app/events/${ev.id}`)}
          shareText={t('inviteText', { title: ev.title, date: `${formatDay(ev.startsAt, locale)}, ${formatTime(ev.startsAt, locale)}`, link: churchUrl(`/app/events/${ev.id}`) })}
          onClose={() => setInviting(false)}
        />
      )}
    </>
  );
}
