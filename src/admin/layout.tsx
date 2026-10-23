import { BarChart3, BookMarked, BookOpen, Cake, Car, ChevronDown, Search, CalendarDays, CalendarRange, ClipboardList, FileText, Filter, GitBranch, Gift, Globe, HandHeart, HeartHandshake, Images, Landmark, LayoutDashboard, LogOut, MapPin, Megaphone, Menu, MessageSquare, MessagesSquare, Music2, Newspaper, Radio, ScanLine, School, Settings, Sparkles, Upload, Users, UsersRound, Wheat, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation } from 'react-router';

import { adminSession } from '@/api/client';
import { AdminApi } from '@/api/endpoints';
import { OtpSignIn } from '@/components/otp-sign-in';
import { DemoBanner } from '@/components/server-settings';
import { ChurchLogo } from '@/components/brand';
import { Avatar, Logo } from '@/components/ui';
import { ThemeButton } from '@/components/theme-picker';
import { ROLE_LABELS, useCan } from '@/lib/perms';
import { useSession } from '@/lib/session';
import type { Permission } from '@/api/admin-types';
import { LegalFooter } from '@/legal/legal';

import { useAi } from './ai';
import { missingPlan, PlanBanner, PlanGate, PlanLock, usePlan } from './plan';
import { ChurchLine } from '@/platform/church';
import './admin.css';

type NavItem = { to: string; label: string; icon: typeof Users; end?: boolean; perm?: Permission[]; ai?: boolean };

// The office menu, grouped the way a church week runs. Groups fold away; the one you're in stays open.
const NAV: { title: string | null; items: NavItem[] }[] = [
  {
    title: null,
    items: [
      { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/admin/assistant', label: 'Assistant', icon: Sparkles, ai: true },
    ],
  },
  {
    title: 'People',
    items: [
      { to: '/admin/people', label: 'People', icon: Users, perm: ['people.view'] },
      { to: '/admin/groups', label: 'Groups', icon: UsersRound, perm: ['groups'] },
      { to: '/admin/care', label: 'Care & prayer', icon: HeartHandshake, perm: ['care'] },
      { to: '/admin/workflows', label: 'Follow-ups', icon: GitBranch, perm: ['people.view', 'care'] },
      { to: '/admin/lists', label: 'Smart lists', icon: Filter, perm: ['people.view'] },
      { to: '/admin/zones', label: 'Zones & visits', icon: MapPin, perm: ['people.view'] },
      { to: '/admin/celebrations', label: 'Celebrations', icon: Cake, perm: ['people.view'] },
      { to: '/admin/carols', label: 'Carol rounds', icon: Music2, perm: ['care', 'services'] },
      { to: '/admin/registers', label: 'Registers', icon: BookMarked, perm: ['people.view'] },
    ],
  },
  {
    title: 'Sundays & events',
    items: [
      { to: '/admin/events', label: 'Services & events', icon: CalendarDays, perm: ['events'] },
      { to: '/admin/rides', label: 'Sunday lifts', icon: Car, perm: ['care', 'people.view'] },
      { to: '/admin/services', label: 'Service planning', icon: ClipboardList, perm: ['services'] },
      { to: '/admin/volunteers', label: 'Volunteers', icon: HandHeart, perm: ['volunteers'] },
      { to: '/admin/checkin', label: 'Check-in', icon: ScanLine, perm: ['checkin'] },
      { to: '/admin/sunday-school', label: 'Sunday school', icon: School, perm: ['checkin'] },
      { to: '/admin/calendar', label: 'Calendar & rooms', icon: CalendarRange },
      { to: '/admin/forms', label: 'Forms & sign-ups', icon: FileText, perm: ['events', 'people.edit'] },
      { to: '/admin/sermons', label: 'Sermons', icon: BookOpen, perm: ['comms', 'services'] },
      { to: '/admin/livestream', label: 'Livestream', icon: Radio, perm: ['services', 'events', 'comms'] },
    ],
  },
  {
    title: 'Giving & finance',
    items: [
      { to: '/admin/giving', label: 'Giving', icon: Gift, perm: ['giving.view'] },
      { to: '/admin/offerings', label: 'Special offerings', icon: Wheat, perm: ['giving.view'] },
      { to: '/admin/missions', label: 'Missions', icon: Globe, perm: ['giving.view'] },
      { to: '/admin/accounts', label: 'Accounts & expenses', icon: Landmark },
    ],
  },
  {
    title: 'Communication',
    items: [
      { to: '/admin/team-hub', label: 'Team hub', icon: MessagesSquare },
      { to: '/admin/messages', label: 'Messages', icon: MessageSquare, perm: ['comms'] },
      { to: '/admin/announcements', label: 'Announcements', icon: Megaphone, perm: ['comms'] },
      { to: '/admin/bulletin', label: 'Bulletin', icon: Newspaper, perm: ['comms'] },
      { to: '/admin/media', label: 'Media library', icon: Images, perm: ['comms'] },
    ],
  },
  {
    title: 'Office',
    items: [
      { to: '/admin/insights', label: 'Insights', icon: BarChart3, perm: ['insights'] },
      { to: '/admin/import', label: 'Import', icon: Upload, perm: ['people.edit'] },
      { to: '/admin/settings', label: 'Settings', icon: Settings, perm: ['settings', 'staff'] },
    ],
  },
];

const FOLD_KEY = 'fw.nav.folded';
function readFolded(): string[] {
  try {
    return JSON.parse(localStorage.getItem(FOLD_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

function isActive(item: NavItem, path: string) {
  return item.end ? path === item.to : path === item.to || path.startsWith(item.to + '/');
}

function AdminNav({ path }: { path: string }) {
  const can = useCan();
  const ai = useAi();
  const plan = usePlan();
  const [folded, setFolded] = useState<string[]>(readFolded);
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();

  function toggle(title: string) {
    const next = folded.includes(title) ? folded.filter((t) => t !== title) : [...folded, title];
    setFolded(next);
    try {
      localStorage.setItem(FOLD_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  const groups = NAV.map((g) => ({
    ...g,
    items: g.items.filter((n) => (!n.perm || can(...n.perm)) && (!n.ai || ai) && (!q || n.label.toLowerCase().includes(q) || (g.title ?? '').toLowerCase().includes(q))),
  })).filter((g) => g.items.length);

  return (
    <nav className="admin-nav" aria-label="Office menu">
      <label className="nav-find">
        <Search size={15} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a page" aria-label="Find a page" />
      </label>
      {groups.map((g) => {
        const here = g.items.some((n) => isActive(n, path));
        const open = !g.title || !!q || here || !folded.includes(g.title);
        return (
          <div key={g.title ?? 'top'} className="nav-group">
            {g.title && (
              <button className="nav-group-head" onClick={() => toggle(g.title!)} aria-expanded={open}>
                <span>{g.title}</span>
                <ChevronDown size={14} className={open ? '' : 'folded'} />
              </button>
            )}
            {open &&
              g.items.map(({ to, label, icon: Icon, end }) => (
                <NavLink key={to} to={to} end={end}>
                  <Icon size={18} /> <span className="grow ellipsis">{label}</span>
                  {missingPlan(plan, to) && <PlanLock />}
                </NavLink>
              ))}
          </div>
        );
      })}
      {!groups.length && <p className="nav-none">No page called “{query}”.</p>}
    </nav>
  );
}

export function AdminLayout() {
  const session = useSession(adminSession);
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
            <Link to="/admin" className="side-logo" aria-label="Flockwise dashboard">
              <span className="on-dark"><Logo reverse height={26} /></span>
              <span className="on-light"><Logo height={26} /></span>
            </Link>
            <button className="btn ghost icon sm admin-close" onClick={() => setOpen(false)} aria-label="Close menu">
              <X size={18} />
            </button>
          </div>
          <div className="admin-church">
            <ChurchLogo church={session.church} size={34} dark fallback={false} />
            <div style={{ minWidth: 0 }}>
              <div className="ellipsis">{session.church.name}</div>
              <small>{session.church.city}</small>
            </div>
          </div>
          <AdminNav path={location.pathname} />
          <div className="admin-user">
            <Avatar name={name} />
            <div className="grow">
              <div className="ellipsis">{name}</div>
              <small>{ROLE_LABELS[session.staff.role]}</small>
            </div>
            <ThemeButton />
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
