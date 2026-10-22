import { CalendarDays, Gift, LayoutDashboard, LogOut, Megaphone, Menu, Settings, Upload, Users, UsersRound, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Navigate, NavLink, Outlet, useLocation } from 'react-router';

import { adminSession } from '@/api/client';
import { AdminApi } from '@/api/endpoints';
import { OtpSignIn } from '@/components/otp-sign-in';
import { DemoBanner } from '@/components/server-settings';
import { Avatar, Logo } from '@/components/ui';
import { useSession } from '@/lib/session';

import './admin.css';

const NAV = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/people', label: 'People', icon: Users },
  { to: '/admin/events', label: 'Services & events', icon: CalendarDays },
  { to: '/admin/groups', label: 'Groups', icon: UsersRound },
  { to: '/admin/giving', label: 'Giving', icon: Gift },
  { to: '/admin/announcements', label: 'Announcements', icon: Megaphone },
  { to: '/admin/import', label: 'Import', icon: Upload },
  { to: '/admin/settings', label: 'Settings', icon: Settings },
];

const ROLE_LABEL = { owner: 'Owner', admin: 'Admin', pastor: 'Pastor', finance: 'Finance', leader: 'Group leader' } as const;

export function AdminLayout() {
  const session = useSession(adminSession);
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);

  if (!session?.staff) return <Navigate to="/admin/sign-in" replace state={{ from: location.pathname }} />;
  const name = `${session.member.firstName} ${session.member.lastName}`;

  async function signOut() {
    const s = adminSession.get();
    if (s) await AdminApi.auth.signOut(s.refreshToken).catch(() => {});
    adminSession.set(null);
  }

  return (
    <div className="admin">
      <DemoBanner text="Demo mode: sample data for Grace Community Church. Connect a real API in Settings → Server." href="/admin/settings#server" />
      <div className="admin-shell">
        <aside className={`admin-side ${open ? 'open' : ''}`}>
          <div className="admin-brand">
            <Logo reverse height={26} />
            <button className="btn ghost icon sm admin-close" onClick={() => setOpen(false)} aria-label="Close menu">
              <X size={18} />
            </button>
          </div>
          <div className="admin-church">
            <div className="ellipsis">{session.church.name}</div>
            <small>{session.church.city}</small>
          </div>
          <nav className="admin-nav">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end}>
                <Icon size={18} /> {label}
              </NavLink>
            ))}
          </nav>
          <div className="admin-user">
            <Avatar name={name} />
            <div className="grow">
              <div className="ellipsis">{name}</div>
              <small>{ROLE_LABEL[session.staff.role]}</small>
            </div>
            <button className="btn ghost icon sm" onClick={signOut} title="Sign out" aria-label="Sign out">
              <LogOut size={17} />
            </button>
          </div>
        </aside>
        {open && <div className="admin-scrim" onClick={() => setOpen(false)} />}
        <main className="admin-main">
          <div className="admin-mobilebar">
            <button className="btn ghost icon" onClick={() => setOpen(true)} aria-label="Open menu">
              <Menu size={20} />
            </button>
            <Logo height={22} />
          </div>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="row wrap">{actions}</div>}
    </div>
  );
}

export function AdminSignIn() {
  const session = useSession(adminSession);
  const location = useLocation();
  if (session?.staff) return <Navigate to={(location.state as { from?: string } | null)?.from ?? '/admin'} replace />;
  return (
    <div className="auth-page">
      <DemoBanner text="Demo mode: any email or number works, and the code is 123456." />
      <div className="auth-center">
        <div className="card auth-card">
          <Logo height={30} />
          <div>
            <h1>Church office sign in</h1>
            <p className="muted">Use the email or mobile number your church admin added you with. We will send a one-time code.</p>
          </div>
          <OtpSignIn
            auth={AdminApi.auth}
            store={adminSession}
            validate={(s) => (s.staff ? null : 'This account is not on the church staff list. Ask your church admin to invite you.')}
            labels={{
              identifier: 'Email or mobile number',
              sendCode: 'Send code',
              enterCode: 'Enter the 6-digit code',
              codeSentTo: (t) => `We sent a code to ${t}.`,
              verify: 'Sign in',
              changeNumber: 'Use a different email or number',
              demoHint: 'Demo mode: any email or number works, and the code is 123456.',
            }}
          />
        </div>
        <a href="/app" className="small">
          Looking for the member portal?
        </a>
      </div>
    </div>
  );
}
