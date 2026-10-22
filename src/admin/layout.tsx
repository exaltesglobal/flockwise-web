import { BarChart3, BookOpen, Cake, CalendarDays, CalendarRange, ClipboardList, FileText, Filter, GitBranch, Gift, HandHeart, HeartHandshake, LayoutDashboard, LogOut, Megaphone, Menu, MessageSquare, ScanLine, Settings, Sparkles, Upload, Users, UsersRound, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation } from 'react-router';

import { adminSession } from '@/api/client';
import { AdminApi } from '@/api/endpoints';
import { OtpSignIn } from '@/components/otp-sign-in';
import { DemoBanner } from '@/components/server-settings';
import { Avatar, Logo } from '@/components/ui';
import { ROLE_LABELS, useCan } from '@/lib/perms';
import { useSession } from '@/lib/session';
import type { Permission } from '@/api/admin-types';
import { LegalFooter } from '@/legal/legal';

import { useAi } from './ai';
import { missingPlan, PlanBanner, PlanGate, PlanLock, usePlan } from './plan';
import { ChurchLine } from '@/platform/church';
import './admin.css';

const NAV: { to: string; label: string; icon: typeof Users; end?: boolean; perm?: Permission[]; ai?: boolean }[] = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/assistant', label: 'Assistant', icon: Sparkles, ai: true },
  { to: '/admin/people', label: 'People', icon: Users, perm: ['people.view'] },
  { to: '/admin/lists', label: 'Smart lists', icon: Filter, perm: ['people.view'] },
  { to: '/admin/workflows', label: 'Follow-up workflows', icon: GitBranch, perm: ['people.view', 'care'] },
  { to: '/admin/celebrations', label: 'Celebrations', icon: Cake, perm: ['people.view'] },
  { to: '/admin/events', label: 'Services & events', icon: CalendarDays, perm: ['events'] },
  { to: '/admin/calendar', label: 'Calendar & rooms', icon: CalendarRange },
  { to: '/admin/forms', label: 'Forms & registrations', icon: FileText, perm: ['events', 'people.edit'] },
  { to: '/admin/checkin', label: 'Check-in', icon: ScanLine, perm: ['checkin'] },
  { to: '/admin/volunteers', label: 'Volunteers', icon: HandHeart, perm: ['volunteers'] },
  { to: '/admin/services', label: 'Service planning', icon: ClipboardList, perm: ['services'] },
  { to: '/admin/sermons', label: 'Sermons', icon: BookOpen, perm: ['comms', 'services'] },
  { to: '/admin/groups', label: 'Groups', icon: UsersRound, perm: ['groups'] },
  { to: '/admin/giving', label: 'Giving', icon: Gift, perm: ['giving.view'] },
  { to: '/admin/messages', label: 'Messages', icon: MessageSquare, perm: ['comms'] },
  { to: '/admin/announcements', label: 'Announcements', icon: Megaphone, perm: ['comms'] },
  { to: '/admin/care', label: 'Care & prayer', icon: HeartHandshake, perm: ['care'] },
  { to: '/admin/insights', label: 'Insights', icon: BarChart3, perm: ['insights'] },
  { to: '/admin/import', label: 'Import', icon: Upload, perm: ['people.edit'] },
  { to: '/admin/settings', label: 'Settings', icon: Settings, perm: ['settings', 'staff'] },
];

export function AdminLayout() {
  const session = useSession(adminSession);
  const can = useCan();
  const ai = useAi();
  const plan = usePlan();
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
      <DemoBanner text="Demo mode: sample data kept in this browser. Connect a real API in Settings → Server." href="/admin/settings#server" />
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
            {NAV.filter((n) => (!n.perm || can(...n.perm)) && (!n.ai || ai)).map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end}>
                <Icon size={18} /> {label}
                {missingPlan(plan, to) && <PlanLock />}
              </NavLink>
            ))}
          </nav>
          <div className="admin-user">
            <Avatar name={name} />
            <div className="grow">
              <div className="ellipsis">{name}</div>
              <small>{ROLE_LABELS[session.staff.role]}</small>
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
          <PlanBanner />
          {(() => {
            const need = missingPlan(plan, location.pathname);
            return need ? <PlanGate need={need} /> : <Outlet />;
          })()}
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
      <DemoBanner text="Demo mode: any email works, and the code is 123456." />
      <div className="auth-center">
        <div className="card auth-card">
          <Logo height={30} />
          <div>
            <h1>Church office sign in</h1>
            <p className="muted">Use the email address your church admin invited you with. We will email you a one-time code.</p>
          </div>
          <ChurchLine />
          <OtpSignIn
            auth={AdminApi.auth}
            store={adminSession}
            validate={(s) => (s.staff ? null : 'This account is not on the church staff list. Ask your church admin to invite you.')}
            labels={{
              identifier: 'Email address',
              sendCode: 'Send code',
              enterCode: 'Enter the 6-digit code',
              codeSentTo: (t) => `We sent a code to ${t}.`,
              verify: 'Sign in',
              changeNumber: 'Use a different email',
              demoHint: 'Demo mode: any email works, and the code is 123456.',
            }}
          />
        </div>
        <Link to="/app" className="small">
          Looking for the member portal?
        </Link>
        <Link to="/start" className="small">
          New to Flockwise? Start your church free
        </Link>
      </div>
      <LegalFooter />
    </div>
  );
}
