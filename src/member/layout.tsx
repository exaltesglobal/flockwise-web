import { CalendarDays, Gift, Home, UserRound, UsersRound } from 'lucide-react';
import { Navigate, NavLink, Outlet, useLocation } from 'react-router';

import { memberSession } from '@/api/client';
import { MemberApi } from '@/api/endpoints';
import { OtpSignIn } from '@/components/otp-sign-in';
import { DemoBanner } from '@/components/server-settings';
import { Logo, Mark } from '@/components/ui';
import { useT } from '@/i18n';
import { useSession } from '@/lib/session';

import './member.css';

export function MemberLayout() {
  const session = useSession(memberSession);
  const location = useLocation();
  const { t } = useT();
  if (!session) return <Navigate to="/app/sign-in" replace state={{ from: location.pathname }} />;

  const tabs = [
    { to: '/app', label: t('tabHome'), icon: Home, end: true },
    { to: '/app/events', label: t('tabEvents'), icon: CalendarDays },
    { to: '/app/give', label: t('tabGive'), icon: Gift },
    { to: '/app/groups', label: t('tabGroups'), icon: UsersRound },
    { to: '/app/me', label: t('tabMe'), icon: UserRound },
  ];

  return (
    <div className="member">
      <DemoBanner text={t('demoBanner')} />
      <header className="member-top">
        <div className="member-top-inner">
          <div className="row" style={{ gap: 10 }}>
            <Mark size={30} />
            <div>
              <div className="member-church">{session.church.name}</div>
              <div className="small muted">{session.church.city}</div>
            </div>
          </div>
          <nav className="member-nav">
            {tabs.map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end}>
                <Icon size={17} /> {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="member-main">
        <Outlet />
      </main>
      <nav className="member-tabs">
        {tabs.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end}>
            <Icon size={21} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export function MemberSignIn() {
  const session = useSession(memberSession);
  const location = useLocation();
  const { t } = useT();
  if (session) return <Navigate to={(location.state as { from?: string } | null)?.from ?? '/app'} replace />;
  return (
    <div className="auth-page member-auth">
      <DemoBanner text={t('demoHint')} />
      <div className="auth-center">
        <div className="card auth-card">
          <Logo height={30} />
          <div>
            <h1>{t('signInTitle')}</h1>
            <p className="muted">{t('signInBody')}</p>
          </div>
          <OtpSignIn
            auth={MemberApi.auth}
            store={memberSession}
            labels={{
              identifier: t('phoneOrEmail'),
              sendCode: t('sendCode'),
              enterCode: t('enterCode'),
              codeSentTo: (target) => t('codeSentTo', { target }),
              verify: t('verify'),
              changeNumber: t('changeNumber'),
              demoHint: t('demoHint'),
            }}
          />
          <p className="small muted">{t('signInHelp')}</p>
        </div>
        <a href="/admin" className="small">{t('officeAdmin')}</a>
      </div>
    </div>
  );
}
