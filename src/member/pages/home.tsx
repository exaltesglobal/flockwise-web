import { ChevronUp, Gift, LayoutGrid, BookOpen, BookOpenCheck, BookUser, Library, Church, Handshake, Tent, GraduationCap, Hourglass, Footprints, Cake, Car, Clapperboard, ClipboardList, PlayCircle, HandCoins, HandHeart, Heart, Music2, Newspaper, QrCode, Radio, ScanLine, Sparkles, MicVocal, Star, Vote } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';

import { memberSession } from '@/api/client';
import { MemberApi, PublicApi } from '@/api/endpoints';
import { ErrorState, Loading } from '@/components/ui';
import { featureOn } from '@/core/features';
import { useT, type StringKey } from '@/i18n';
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
      <QuickLinks />
      {error ? <ErrorState error={error} onRetry={reload} /> : !data ? <Loading /> : (
        <div className="home-grid">
          <div>
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

          <FamilyCheckinCard />

          <LiveCard />

          <BulletinCard />

          <SundaySchool />

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

          </div>
          <div>
          <section className="stack">
            <div className="section-head">
              <h2>{t('upcoming')}</h2>
              <Link to="/app/events" className="small">{t('seeAll')}</Link>
            </div>
            {data.upcomingEvents.length === 0 ? <p className="muted">{t('noUpcoming')}</p> : data.upcomingEvents.map((e) => <EventCard key={e.id} event={e} />)}
          </section>

          <Celebrations />
          </div>
        </div>
      )}
    </>
  );
}

// The four things members do most, then everything else the church uses behind "More".
const MAIN_LINKS = [
  { to: '/app/give', key: 'tabGive', icon: Gift },
  { to: '/app/prayer', key: 'tabPrayer', icon: Sparkles, feature: 'care' },
  { to: '/app/serving', key: 'tabServing', icon: HandHeart, feature: 'volunteers' },
  { to: '/app/me#qr', key: 'myQr', icon: QrCode },
] as const;
const MORE_LINKS = [
  { to: '/app/sermons', key: 'tabSermons', icon: BookOpen, feature: 'sermons' },
  { to: '/app/forms', key: 'tabForms', icon: ClipboardList, feature: 'forms' },
  { to: '/app/directory', key: 'tabDirectory', icon: BookUser },
  { to: '/app/reading', key: 'readTitle', icon: BookOpenCheck, feature: 'reading' },
  { to: '/app/courses', key: 'courseTitle', icon: GraduationCap, feature: 'courses' },
  { to: '/app/vigils', key: 'vigilTitle', icon: Hourglass, feature: 'vigils' },
  { to: '/app/mentoring', key: 'mentorTitle', icon: Footprints, feature: 'discipleship' },
  { to: '/app/library', key: 'libraryTitle', icon: Library, feature: 'library' },
  { to: '/app/occasions', key: 'occTitle', icon: Church, feature: 'occasions' },
  { to: '/app/skills', key: 'skillTitle', icon: Handshake, feature: 'skills' },
  { to: '/app/camps', key: 'campTitle', icon: Tent, feature: 'camps' },
  { to: '/app/practice', key: 'practiceTitle', icon: MicVocal, feature: 'practice' },
  { to: '/app/verses', key: 'verseTitle', icon: Star, feature: 'sunday-school' },
  { to: '/app/vote', key: 'voteTitle', icon: Vote, feature: 'elections' },
  { to: '/app/recap', key: 'recapTitle', icon: Clapperboard, feature: 'recap' },
  { to: '/app/carols', key: 'carolsTitle', icon: Music2, feature: 'carols' },
  { to: '/app/rides', key: 'ridesTitle', icon: Car, feature: 'rides' },
  { to: '/app/aid', key: 'aidTitle', icon: HandCoins, feature: 'benevolence' },
] as const;

function QuickLinks() {
  const { t } = useT();
  const session = useSession(memberSession);
  const [more, setMore] = useState(() => {
    try {
      return localStorage.getItem('fw.home.more') === '1';
    } catch {
      return false;
    }
  });
  const on = (f?: string) => !f || featureOn(session?.church.features, f);
  const label = (key: StringKey) => (key === 'myQr' ? t('myQr').split(' ').slice(0, 2).join(' ') : t(key));
  const extra = MORE_LINKS.filter((l) => on('feature' in l ? l.feature : undefined));
  function toggle() {
    setMore(!more);
    try {
      localStorage.setItem('fw.home.more', more ? '0' : '1');
    } catch {
      /* ignore */
    }
  }
  return (
    <nav className="quick-links" aria-label={t('quickLinks')}>
      {MAIN_LINKS.filter((l) => on('feature' in l ? l.feature : undefined)).map(({ to, key, icon: Icon }) => (
        <Link key={to} to={to} className="card main"><Icon size={22} />{label(key)}</Link>
      ))}
      {more && extra.map(({ to, key, icon: Icon }) => (
        <Link key={to} to={to} className="card"><Icon size={22} />{label(key)}</Link>
      ))}
      {extra.length > 0 && (
        <button className="card quick-more" onClick={toggle} aria-expanded={more}>
          {more ? <ChevronUp size={22} /> : <LayoutGrid size={22} />}{more ? t('homeLess') : t('homeMore')}
        </button>
      )}
    </nav>
  );
}

/** When phone check-in is open and someone in the family is not in yet. */
function FamilyCheckinCard() {
  const { t } = useT();
  const { data } = useApi(() => MemberApi.family.checkinEvents().catch(() => []));
  const ev = data?.find((e) => e.open && e.members.some((m) => m.isChild && !m.checkedIn));
  if (!ev) return null;
  return (
    <Link to="/app/family" className="card card-pad row fam-checkin" style={{ gap: 12 }}>
      <ScanLine size={22} />
      <div className="grow" style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600 }}>{t('familyHomeCard')}</div>
        <div className="small muted">{ev.title}</div>
      </div>
      <span className="small">{t('familyCheckinTitle')} →</span>
    </Link>
  );
}

/** The live service: "Live now" while streaming, the start time when it is within a day. */
function LiveCard() {
  const { t, locale } = useT();
  const { data } = useApi(PublicApi.live);
  const s = data?.stream;
  if (!s || (s.status !== 'live' && new Date(s.startsAt).getTime() - Date.now() > 86_400_000)) return null;
  return (
    <Link to="/app/live" className={`card card-pad row live-card ${s.status === 'live' ? 'on' : ''}`} style={{ gap: 12 }}>
      {s.status === 'live' ? <span className="live-pill"><i /> {t('liveBadge')}</span> : <Radio size={22} className="muted" />}
      <div className="grow" style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600 }}>{s.title}</div>
        <div className="small muted">{s.status === 'live' ? t('liveWatching', { n: Math.max(1, s.watching) }) : t('liveStarts', { when: `${formatDay(s.startsAt, locale)} · ${formatTime(s.startsAt, locale)}` })}</div>
      </div>
      <span className="small">{s.status === 'live' ? t('liveNowWatch') : t('liveTitle')}</span>
    </Link>
  );
}

/** This Sunday's bulletin, once the office has published it. */
function BulletinCard() {
  const { t } = useT();
  const { data } = useApi(MemberApi.bulletins.latest);
  if (!data) return null;
  return (
    <Link to="/app/bulletin" className="card card-pad row" style={{ gap: 12 }}>
      <Newspaper size={22} className="muted" />
      <div className="grow" style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600 }}>{t('bulletinThisSunday')}</div>
        <div className="small muted">{data.verse || data.title}</div>
      </div>
      <span className="small">{t('bulletinRead')}</span>
    </Link>
  );
}

/** For parents: each child's class, attendance, this week's memory verse and recent results. */
function SundaySchool() {
  const { t } = useT();
  const { data } = useApi(MemberApi.sundaySchool);
  if (!data?.children.length) return null;
  return (
    <section className="stack">
      <h2>{t('sundaySchool')}</h2>
      {data.children.map((c) => (
        <div key={c.id} className="card card-pad stack" style={{ gap: 8 }}>
          <div className="row between wrap" style={{ gap: 6 }}>
            <strong>{c.name}</strong>
            <span className="badge gray">{c.className}</span>
          </div>
          <div className="small muted">
            {c.teachers.length > 0 && <>{c.teachers.join(', ')} · </>}
            {t('ssAttendance', { present: c.attendance.present, of: c.attendance.of })} · {t('ssVerses', { count: c.verses })}
          </div>
          {c.lesson && (
            <div className="ss-lesson small">
              <span><b>{t('ssLesson')}:</b> {c.lesson.title} · {c.lesson.scripture}</span>
              {c.lesson.memoryVerse && <span className="muted">{t('ssMemoryVerse')}: {c.lesson.memoryVerse}</span>}
            </div>
          )}
          {c.results.map((r) => (
            <div key={r.exam} className="row between small">
              <span>{r.exam}</span>
              <span>{r.marks === null ? t('ssAbsent') : <><b>{r.marks}/{r.maxMarks}</b> · {r.grade}{r.rank && r.rank <= 3 ? ` · ${t('ssRank', { rank: r.rank })}` : ''}</>}</span>
            </div>
          ))}
        </div>
      ))}
    </section>
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
      {data.videoGreetings.map((g) => (
        <a key={g.token} href={`/g/${g.token}`} className="card card-pad row" style={{ gap: 12, textDecoration: 'none', color: 'inherit' }}>
          <PlayCircle size={28} style={{ color: 'var(--primary)', flexShrink: 0 }} />
          <div className="grow" style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600 }}>{t(g.kind === 'anniversary' ? 'greetingAnniversaryForYou' : g.forMe ? 'greetingForYou' : 'greetingForChild', { from: g.fromName, name: g.firstName })}</div>
            <div className="small muted">{t('greetingWatch')}</div>
          </div>
        </a>
      ))}
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
