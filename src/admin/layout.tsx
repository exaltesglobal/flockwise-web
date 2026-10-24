import { Armchair, BarChart3, BookMarked, Clapperboard, Video, BookOpen, BookOpenCheck, CookingPot, Cake, Car, ChevronDown, Search, ShieldCheck, GraduationCap, Hourglass, Footprints, Library, Church, Handshake, Tent, UserPlus, CalendarDays, CalendarRange, ClipboardList, FileSpreadsheet, FileText, Filter, GitBranch, Gift, Globe, HandCoins, HandHeart, HeartHandshake, Images, KeyRound, Landmark, LayoutDashboard, LogOut, MapPin, Megaphone, Menu, MessageSquare, MicVocal, MessagesSquare, Music2, Newspaper, PhoneMissed, Radio, Scale, ScanLine, School, Settings, Sparkles, Upload, Users, UsersRound, Vote, Wheat, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation } from 'react-router';

import { adminSession } from '@/api/client';
import { AdminApi } from '@/api/endpoints';
import { OtpSignIn } from '@/components/otp-sign-in';
import { DemoBanner } from '@/components/server-settings';
import { ChurchLogo } from '@/components/brand';
import { Avatar, Logo } from '@/components/ui';
import { ThemeButton } from '@/components/theme-picker';
import { ROLE_LABELS, useCan } from '@/lib/perms';
import { loadFaces } from '@/lib/faces';
import { useSession } from '@/lib/session';
import type { Permission } from '@/api/admin-types';
import { LegalFooter } from '@/legal/legal';

import { useAi } from './ai';
import { useFeatures } from './features';
import { useOfficeT } from './i18n';
import { LanguageButton } from './language-button';
import { NewMenu } from './new-menu';
import { useTableCards } from './table-cards';
import { SearchButton, SearchPalette, useSearchShortcut } from './search';
import { missingPlan, PlanBanner, PlanGate, PlanLock, usePlan } from './plan';
import { ChurchLine } from '@/platform/church';
import './admin.css';

type NavItem = { to: string; label: string; icon: typeof Users; end?: boolean; perm?: Permission[]; ai?: boolean; feature?: string };
/** One menu entry. With more than one page it opens the first and shows the rest as tabs above the page. */
type NavHub = { label: string; icon: typeof Users; pages: NavItem[] };

const one = (item: NavItem): NavHub => ({ label: item.label, icon: item.icon, pages: [item] });

// The office menu, grouped the way a church week runs. Related pages share one entry with tabs, and
// pages for features the church has switched off (Settings › Features) are hidden.
// New page? Add it to the hub it belongs with and give it a `feature` key from core/features.ts.
const NAV: { title: string | null; hubs: NavHub[] }[] = [
  {
    title: null,
    hubs: [
      one({ to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true }),
      one({ to: '/admin/assistant', label: 'Assistant', icon: Sparkles, ai: true }),
    ],
  },
  {
    title: 'People',
    hubs: [
      { label: 'People', icon: Users, pages: [
        { to: '/admin/people', label: 'People', icon: Users, perm: ['people.view'], feature: 'people' },
        { to: '/admin/lists', label: 'Saved lists', icon: Filter, perm: ['people.view'], feature: 'lists' },
        { to: '/admin/zones', label: 'Area visits', icon: MapPin, perm: ['people.view'], feature: 'zones' },
        { to: '/admin/registrations', label: 'Registrations', icon: UserPlus, perm: ['people.view'], feature: 'registration' },
        { to: '/admin/import', label: 'Import', icon: Upload, perm: ['people.edit'], feature: 'import' },
      ] },
      one({ to: '/admin/groups', label: 'Groups', icon: UsersRound, perm: ['groups'], feature: 'groups' }),
      { label: 'Care', icon: HeartHandshake, pages: [
        { to: '/admin/care', label: 'Care & prayer', icon: HeartHandshake, perm: ['care'], feature: 'care' },
        { to: '/admin/workflows', label: 'Follow-ups', icon: GitBranch, perm: ['people.view', 'care'], feature: 'workflows' },
        { to: '/admin/vigils', label: 'Prayer vigils', icon: Hourglass, perm: ['care'], feature: 'vigils' },
        { to: '/admin/benevolence', label: 'Benevolence', icon: HandCoins, perm: ['care'], feature: 'benevolence' },
        { to: '/admin/occasions', label: 'Weddings & funerals', icon: Church, perm: ['care', 'people.view'], feature: 'occasions' },
      ] },
      { label: 'Grow', icon: GraduationCap, pages: [
        { to: '/admin/discipleship', label: 'Discipleship', icon: Footprints, perm: ['care', 'people.view'], feature: 'discipleship' },
        { to: '/admin/courses', label: 'Classes & courses', icon: GraduationCap, perm: ['people.view'], feature: 'courses' },
        { to: '/admin/library', label: 'Library', icon: Library, perm: ['people.view'], feature: 'library' },
        { to: '/admin/skills', label: 'Skills & board', icon: Handshake, perm: ['people.view', 'volunteers'], feature: 'skills' },
      ] },
      { label: 'Celebrations', icon: Cake, pages: [
        { to: '/admin/celebrations', label: 'Celebrations', icon: Cake, perm: ['people.view'], feature: 'celebrations' },
        { to: '/admin/video-greetings', label: 'Video greetings', icon: Video, perm: ['comms'], feature: 'video-greetings' },
        { to: '/admin/carols', label: 'Carol rounds', icon: Music2, perm: ['care', 'services'], feature: 'carols' },
      ] },
      { label: 'Records', icon: BookMarked, pages: [
        { to: '/admin/registers', label: 'Registers', icon: BookMarked, perm: ['people.view'], feature: 'registers' },
        { to: '/admin/safeguarding', label: 'Safeguarding', icon: ShieldCheck, perm: ['people.view', 'volunteers'], feature: 'safeguarding' },
        { to: '/admin/elections', label: 'Elections & AGM', icon: Vote, perm: ['settings', 'people.edit'], feature: 'elections' },
      ] },
    ],
  },
  {
    title: 'Sundays & events',
    hubs: [
      { label: 'Calendar', icon: CalendarDays, pages: [
        { to: '/admin/events', label: 'Services & events', icon: CalendarDays, perm: ['events'], feature: 'events' },
        { to: '/admin/calendar', label: 'Calendar & rooms', icon: CalendarRange, feature: 'calendar' },
        { to: '/admin/forms', label: 'Forms & sign-ups', icon: FileText, perm: ['events', 'people.edit'], feature: 'forms' },
        { to: '/admin/camps', label: 'Camps & retreats', icon: Tent, perm: ['events', 'people.view'], feature: 'camps' },
        { to: '/admin/feasts', label: 'Love feasts & kitchen', icon: CookingPot, perm: ['events', 'volunteers'], feature: 'feasts' },
        { to: '/admin/rentals', label: 'Hall hire', icon: KeyRound, perm: ['events', 'settings'], feature: 'rentals' },
      ] },
      { label: 'Sunday', icon: ClipboardList, pages: [
        { to: '/admin/services', label: 'Service planning', icon: ClipboardList, perm: ['services'], feature: 'services' },
        { to: '/admin/practice', label: 'Choir practice', icon: MicVocal, perm: ['services', 'volunteers'], feature: 'practice' },
        { to: '/admin/sermons', label: 'Sermons', icon: BookOpen, perm: ['comms', 'services'], feature: 'sermons' },
        { to: '/admin/livestream', label: 'Livestream', icon: Radio, perm: ['services', 'events', 'comms'], feature: 'livestream' },
        { to: '/admin/recap', label: 'Sunday in 60 seconds', icon: Clapperboard, perm: ['comms'], feature: 'recap' },
        { to: '/admin/reading', label: 'Bible reading plan', icon: BookOpenCheck, feature: 'reading' },
      ] },
      one({ to: '/admin/volunteers', label: 'Volunteers', icon: HandHeart, perm: ['volunteers'], feature: 'volunteers' }),
      { label: 'Check-in', icon: ScanLine, pages: [
        { to: '/admin/checkin', label: 'Check-in', icon: ScanLine, perm: ['checkin'], feature: 'checkin' },
        { to: '/admin/sunday-school', label: 'Sunday school', icon: School, perm: ['checkin'], feature: 'sunday-school' },
        { to: '/admin/rides', label: 'Sunday lifts', icon: Car, perm: ['care', 'people.view'], feature: 'rides' },
        { to: '/admin/missed-call', label: 'Missed-call line', icon: PhoneMissed, perm: ['checkin', 'care', 'settings'], feature: 'missed-call' },
      ] },
    ],
  },
  {
    title: 'Giving & finance',
    hubs: [
      { label: 'Giving', icon: Gift, pages: [
        { to: '/admin/giving', label: 'Giving', icon: Gift, perm: ['giving.view'], feature: 'giving' },
        { to: '/admin/offerings', label: 'Special offerings', icon: Wheat, perm: ['giving.view'], feature: 'offerings' },
        { to: '/admin/missions', label: 'Missions', icon: Globe, perm: ['giving.view'], feature: 'missions' },
      ] },
      { label: 'Accounts', icon: Landmark, pages: [
        { to: '/admin/accounts', label: 'Accounts & expenses', icon: Landmark, feature: 'accounts' },
        { to: '/admin/bank', label: 'Bank reconciliation', icon: Scale, perm: ['giving.view'], feature: 'bank' },
        { to: '/admin/assets', label: 'Assets', icon: Armchair, feature: 'assets' },
        { to: '/admin/annual-return', label: 'Annual return', icon: FileSpreadsheet, perm: ['settings', 'insights'], feature: 'annual-return' },
      ] },
    ],
  },
  {
    title: 'Communication',
    hubs: [
      { label: 'Messages', icon: MessageSquare, pages: [
        { to: '/admin/messages', label: 'Messages', icon: MessageSquare, perm: ['comms'], feature: 'messages' },
        { to: '/admin/announcements', label: 'Announcements', icon: Megaphone, perm: ['comms'], feature: 'announcements' },
        { to: '/admin/bulletin', label: 'Bulletin', icon: Newspaper, perm: ['comms'], feature: 'bulletin' },
      ] },
      one({ to: '/admin/team-hub', label: 'Staff chat', icon: MessagesSquare, feature: 'team-hub' }),
      one({ to: '/admin/media', label: 'Media library', icon: Images, perm: ['comms'], feature: 'media' }),
    ],
  },
  {
    title: 'Office',
    hubs: [
      one({ to: '/admin/insights', label: 'Reports', icon: BarChart3, perm: ['insights'], feature: 'insights' }),
      one({ to: '/admin/settings', label: 'Settings', icon: Settings, perm: ['settings', 'staff'] }),
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

/** The menu this person sees: their permissions, the church's features and the AI switch applied. */
function useVisibleNav() {
  const can = useCan();
  const ai = useAi();
  const features = useFeatures();
  const show = (n: NavItem) => (!n.perm || can(...n.perm)) && (!n.ai || ai) && features.on(n.feature);
  return NAV.map((g) => ({ ...g, hubs: g.hubs.map((h) => ({ ...h, pages: h.pages.filter(show) })).filter((h) => h.pages.length) })).filter((g) => g.hubs.length);
}

/** Tabs for the other pages that share this page's menu entry. */
function HubTabs({ path }: { path: string }) {
  const nav = useVisibleNav();
  const { tr } = useOfficeT();
  const hub = nav.flatMap((g) => g.hubs).find((h) => h.pages.length > 1 && h.pages.some((p) => isActive(p, path)));
  if (!hub) return null;
  return (
    <nav className="hub-tabs" aria-label={tr(hub.label)}>
      {hub.pages.map(({ to, label, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end}><Icon size={15} /> {tr(label)}</NavLink>
      ))}
    </nav>
  );
}

/** On a phone: the five places people go most, always at the bottom of the screen. */
function PhoneTabs({ path, onMenu }: { path: string; onMenu: () => void }) {
  const nav = useVisibleNav();
  const { tr } = useOfficeT();
  const pages = nav.flatMap((g) => g.hubs.flatMap((h) => h.pages));
  const pick = (...tos: string[]) => pages.find((p) => tos.includes(p.to));
  const tabs = [
    { label: 'Today', page: pick('/admin') },
    { label: 'People', page: pick('/admin/people') },
    { label: 'Sunday', page: pick('/admin/services') ?? pick('/admin/events', '/admin/checkin') },
    { label: 'Giving', page: pick('/admin/giving') ?? pick('/admin/care') },
  ]
    .filter((t) => t.page)
    .map((t) => ({ ...t, label: t.page!.to === '/admin/events' || t.page!.to === '/admin/checkin' || t.page!.to === '/admin/care' ? t.page!.label : t.label }));
  return (
    <nav className="admin-tabbar" aria-label={tr('Main places')}>
      {tabs.map(({ label, page }) => {
        const Icon = page!.icon;
        const hub = nav.flatMap((g) => g.hubs).find((h) => h.pages.includes(page!));
        const active = hub?.pages.some((p) => isActive(p, path)) ?? isActive(page!, path);
        return (
          <NavLink key={label} to={page!.to} end={page!.end} className={() => (active ? 'active' : '')}>
            <Icon size={20} /><span>{tr(label)}</span>
          </NavLink>
        );
      })}
      <button onClick={onMenu}><Menu size={20} /><span>{tr('More')}</span></button>
    </nav>
  );
}

function AdminNav({ path, onSearch }: { path: string; onSearch: () => void }) {
  const plan = usePlan();
  const nav = useVisibleNav();
  const { tr } = useOfficeT();
  const [folded, setFolded] = useState<string[]>(readFolded);

  function toggle(title: string) {
    const next = folded.includes(title) ? folded.filter((t) => t !== title) : [...folded, title];
    setFolded(next);
    try {
      localStorage.setItem(FOLD_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  return (
    <nav className="admin-nav" aria-label={tr('Office menu')}>
      <NewMenu />
      <SearchButton onOpen={onSearch} />
      {nav.map((g) => {
        const here = g.hubs.some((h) => h.pages.some((n) => isActive(n, path)));
        const open = !g.title || here || !folded.includes(g.title);
        return (
          <div key={g.title ?? 'top'} className="nav-group">
            {g.title && (
              <button className="nav-group-head" onClick={() => toggle(g.title!)} aria-expanded={open}>
                <span>{tr(g.title)}</span>
                <ChevronDown size={14} className={open ? '' : 'folded'} />
              </button>
            )}
            {open &&
              g.hubs.map((h) => {
                const first = h.pages[0];
                const active = h.pages.some((p) => isActive(p, path));
                const Icon = h.pages.length > 1 ? h.icon : first.icon;
                const label = h.pages.length > 1 ? h.label : first.label;
                return (
                  <NavLink key={h.label} to={first.to} end={first.end} className={() => (active ? 'active' : '')}>
                    <Icon size={18} /> <span className="grow ellipsis">{tr(label)}</span>
                    {h.pages.length > 1 && <span className="nav-count">{h.pages.length}</span>}
                    {h.pages.length === 1 && missingPlan(plan, first.to) && <PlanLock />}
                  </NavLink>
                );
              })}
          </div>
        );
      })}
    </nav>
  );
}

export function AdminLayout() {
  const session = useSession(adminSession);
  const plan = usePlan();
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const openSearch = useCallback(() => setSearching(true), []);
  useSearchShortcut(openSearch);
  useTableCards();
  const nav = useVisibleNav();
  const { tr, lang } = useOfficeT();
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => { void loadFaces(); }, []);

  if (!session?.staff) return <Navigate to="/admin/sign-in" replace state={{ from: location.pathname }} />;
  const name = `${session.member.firstName} ${session.member.lastName}`;

  async function signOut() {
    const s = adminSession.get();
    if (s) await AdminApi.auth.signOut(s.refreshToken).catch(() => {});
    adminSession.set(null);
  }

  return (
    <div className="admin" lang={lang}>
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
          <AdminNav path={location.pathname} onSearch={openSearch} />
          <div className="admin-user">
            <Avatar name={name} person={session.member} />
            <div className="grow">
              <div className="ellipsis">{name}</div>
              <small>{ROLE_LABELS[session.staff.role]}</small>
            </div>
            <LanguageButton />
            <ThemeButton />
            <button className="btn ghost icon sm" onClick={signOut} title={tr('Sign out')} aria-label={tr('Sign out')}>
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
            <div className="grow" />
            <button className="btn ghost icon" onClick={openSearch} aria-label={tr('Search')}>
              <Search size={20} />
            </button>
          </div>
          <PlanBanner />
          <HubTabs path={location.pathname} />
          {(() => {
            const need = missingPlan(plan, location.pathname);
            return need ? <PlanGate need={need} /> : <Outlet />;
          })()}
        </main>
      </div>
      <PhoneTabs path={location.pathname} onMenu={() => setOpen(true)} />
      {searching && (
        <SearchPalette
          pages={nav.flatMap((g) => g.hubs.flatMap((h) => h.pages.map((p) => ({ to: p.to, label: p.label, icon: p.icon, hub: h.pages.length > 1 ? h.label : undefined }))))}
          onClose={() => setSearching(false)}
        />
      )}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  // Long explanations stay to one line until asked for, so every page starts with its work.
  const [more, setMore] = useState(false);
  const { tr } = useOfficeT();
  const long = !!subtitle && subtitle.length > 110;
  return (
    <div className="page-head">
      <div style={{ minWidth: 0 }}>
        <h1>{title}</h1>
        {subtitle && (
          <p className={`muted page-sub ${long && !more ? 'clamped' : ''}`}>
            <span className="page-sub-text">{subtitle}</span>
            {long && <button className="page-sub-more" onClick={() => setMore(!more)}>{more ? tr('Less') : tr('How this works')}</button>}
          </p>
        )}
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
