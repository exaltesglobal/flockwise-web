import { AlertTriangle, Cake, CheckCircle2, ChevronRight, Circle, Rocket, CalendarDays, Gift, HandHeart, HeartHandshake, IndianRupee, Sparkles, UserPlus, Users, UsersRound } from 'lucide-react';
import { Link } from 'react-router';

import { adminSession } from '@/api/client';
import { AdminApi } from '@/api/endpoints';
import type { Dashboard } from '@/core/types';
import { Avatar, BarChart, ErrorState, Loading } from '@/components/ui';
import { formatDay, formatMoney, formatMoneyShort, formatNumber, formatRelative, formatTime, greetingKey } from '@/lib/format';
import { useCan } from '@/lib/perms';
import { useSession } from '@/lib/session';
import { useAction, useApi } from '@/lib/use-api';

import { PageHeader } from '../layout';

const GREETING = { goodMorning: 'Good morning', goodAfternoon: 'Good afternoon', goodEvening: 'Good evening' };

export function DashboardPage() {
  const session = useSession(adminSession);
  const { data, error, reload } = useApi(AdminApi.dashboard);
  const can = useCan();

  const header = <PageHeader title={`${GREETING[greetingKey()]}, ${session?.member.firstName ?? ''}`} subtitle="Here is how your church is doing this week." />;
  if (error) return (<>{header}<ErrorState error={error} onRetry={reload} /></>);
  if (!data) return (<>{header}<Loading /></>);

  const c = data.currency;
  const att = data.attendance.trend;
  const prevSunday = att.at(-2)?.count ?? 0;
  const attDelta = prevSunday ? Math.round(((data.attendance.lastSunday - prevSunday) / prevSunday) * 100) : 0;
  const givingDelta = data.giving.lastMonth ? Math.round(((data.giving.thisMonth - data.giving.lastMonth) / data.giving.lastMonth) * 100) : 0;
  const dayOfMonth = new Date().getDate();

  return (
    <>
      {header}
      <TodayPanel data={data} />
      <GettingStartedCard />

      <div className="grid cols-4">
        <div className="card kpi">
          <span className="label"><Users size={15} /> People</span>
          <span className="value">{formatNumber(data.people.total)}</span>
          <span className="delta muted">{formatNumber(data.people.members)} members · <span className="delta up">+{data.people.newThisMonth} new</span></span>
        </div>
        <div className="card kpi">
          <span className="label"><CalendarDays size={15} /> Last Sunday</span>
          <span className="value">{formatNumber(data.attendance.lastSunday)}</span>
          <span className={`delta ${attDelta >= 0 ? 'up' : 'down'}`}>{attDelta >= 0 ? '▲' : '▼'} {Math.abs(attDelta)}% on the week before</span>
        </div>
        {can('giving.view') ? <div className="card kpi">
          <span className="label"><IndianRupee size={15} /> Giving this month</span>
          <span className="value">{formatMoneyShort(data.giving.thisMonth, c)}</span>
          <span className="delta muted">
            {dayOfMonth} days in · last month {formatMoneyShort(data.giving.lastMonth, c)}
            {dayOfMonth > 25 && <span className={`delta ${givingDelta >= 0 ? 'up' : 'down'}`}> ({givingDelta >= 0 ? '+' : ''}{givingDelta}%)</span>}
          </span>
        </div> : (
          <Link to="/admin/volunteers" className="card kpi" style={{ color: 'inherit', textDecoration: 'none' }}>
            <span className="label"><HandHeart size={15} /> Serving</span>
            <span className="value">{data.serving.openSlots}</span>
            <span className="delta muted">open slots · {data.serving.pending} awaiting reply</span>
          </Link>
        )}
        <Link to="/admin/groups" className="card kpi" style={{ color: 'inherit', textDecoration: 'none' }}>
          <span className="label"><UsersRound size={15} /> Join requests</span>
          <span className="value">{data.pendingJoinRequests}</span>
          <span className="delta muted">{data.pendingJoinRequests ? 'Waiting for a leader to approve →' : 'All caught up'}</span>
        </Link>
      </div>

      <div className="stat-row">
        {can('care') && (
          <>
            <Link to="/admin/care" className="card mini-stat" style={{ color: 'inherit', textDecoration: 'none' }}>
              <b>{data.care.open}</b><span><HeartHandshake size={13} /> Open care cases{data.care.overdue ? <span className="badge danger" style={{ marginLeft: 6 }}>{data.care.overdue} overdue</span> : null}</span>
            </Link>
            <Link to="/admin/care?tab=at-risk" className="card mini-stat" style={{ color: 'inherit', textDecoration: 'none' }}>
              <b>{data.care.atRisk}</b><span><AlertTriangle size={13} /> Haven't been seen in 3+ weeks</span>
            </Link>
            <Link to="/admin/care?tab=prayer" className="card mini-stat" style={{ color: 'inherit', textDecoration: 'none' }}>
              <b>{data.care.prayer}</b><span><Sparkles size={13} /> Open prayer requests</span>
            </Link>
          </>
        )}
        {can('volunteers') && (
          <Link to="/admin/volunteers" className="card mini-stat" style={{ color: 'inherit', textDecoration: 'none' }}>
            <b>{data.serving.openSlots}</b><span><HandHeart size={13} /> Open serving slots{data.serving.nextEventTitle ? ` · ${data.serving.nextEventTitle}` : ''}</span>
          </Link>
        )}
      </div>

      <div className={`grid ${can('giving.view') ? 'cols-2' : ''}`}>
        <div className="card">
          <div className="card-head">
            <h2>Sunday attendance</h2>
            <span className="small muted">Last 12 weeks</span>
          </div>
          <div className="card-body">
            <BarChart
              data={att.map((a) => ({ label: new Date(a.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), value: a.count }))}
              format={(v) => `${formatNumber(v)} people`}
            />
          </div>
        </div>
        {can('giving.view') && <div className="card">
          <div className="card-head">
            <h2>Giving</h2>
            <Link to="/admin/giving" className="small">View all</Link>
          </div>
          <div className="card-body">
            <BarChart
              data={data.giving.trend.map((g) => ({ label: new Date(`${g.month}-01`).toLocaleDateString('en-IN', { month: 'short' }), value: g.amount }))}
              format={(v) => formatMoney(v, c)}
            />
          </div>
        </div>}
      </div>

      <div className={`grid ${can('giving.view') ? 'cols-3' : 'cols-2'}`}>
        <div className="card">
          <div className="card-head">
            <h2>Coming up</h2>
            <Link to="/admin/events" className="small">Manage</Link>
          </div>
          {data.upcomingEvents.map((ev) => (
            <div key={ev.id} className="list-row">
              <div className="date-chip">
                <b>{new Date(ev.startsAt).getDate()}</b>
                <small>{new Date(ev.startsAt).toLocaleDateString('en-IN', { month: 'short' })}</small>
              </div>
              <div className="grow">
                <div className="ellipsis" style={{ fontWeight: 600 }}>{ev.title}</div>
                <div className="small muted">{formatDay(ev.startsAt)} · {formatTime(ev.startsAt)}</div>
              </div>
              <span className="badge gray">{ev.goingCount}{ev.capacity ? `/${ev.capacity}` : ''} going</span>
            </div>
          ))}
        </div>

        {can('giving.view') && <div className="card">
          <div className="card-head">
            <h2>Recent gifts</h2>
            <Gift size={16} className="muted" />
          </div>
          {data.recentDonations.map((d) => (
            <div key={d.id} className="list-row">
              <Avatar name={d.donorName} />
              <div className="grow">
                <div className="ellipsis" style={{ fontWeight: 600 }}>{d.donorName}</div>
                <div className="small muted ellipsis">{d.fundName} · {formatRelative(d.createdAt)}</div>
              </div>
              <b className="small">{formatMoney(d.amount, d.currency)}</b>
            </div>
          ))}
        </div>}

        <div className="card">
          <div className="card-head">
            <h2>Birthdays this week</h2>
            <Link to="/admin/celebrations" className="small row" style={{ gap: 4 }}><Cake size={15} /> All celebrations</Link>
          </div>
          {data.birthdaysThisWeek.length === 0 && <p className="card-body muted small">No birthdays in the next 7 days.</p>}
          {data.birthdaysThisWeek.map((b) => (
            <Link key={b.id} to={`/admin/people/${b.id}`} className="list-row" style={{ color: 'inherit', textDecoration: 'none' }}>
              <Avatar name={b.name} id={b.id} />
              <div className="grow ellipsis" style={{ fontWeight: 600 }}>{b.name}</div>
              <span className="small muted">{formatDay(b.date)}</span>
            </Link>
          ))}
          <div className="list-row">
            <UserPlus size={16} className="muted" />
            <Link to="/admin/people?new=1" className="small">Add a new person</Link>
          </div>
        </div>
      </div>
    </>
  );
}

/** The new-church checklist, worked out from the records. Hidden once everything is done or the office hides it. */
/** What needs doing now, worked out from the dashboard numbers; each line opens the place to act. */
function TodayPanel({ data }: { data: Dashboard }) {
  const can = useCan();
  const items: { text: string; to: string; icon: typeof Users; tone?: 'warn' }[] = [];
  if (can('care') && data.care.overdue) items.push({ text: `${data.care.overdue} care ${data.care.overdue === 1 ? 'case is' : 'cases are'} overdue`, to: '/admin/care', icon: AlertTriangle, tone: 'warn' });
  if (can('care') && data.care.atRisk) items.push({ text: `Call ${data.care.atRisk} ${data.care.atRisk === 1 ? 'person' : 'people'} not seen for 3+ weeks`, to: '/admin/care?tab=at-risk', icon: HeartHandshake });
  if (can('groups') && data.pendingJoinRequests) items.push({ text: `${data.pendingJoinRequests} ${data.pendingJoinRequests === 1 ? 'person wants' : 'people want'} to join a group`, to: '/admin/groups', icon: UsersRound });
  if (can('volunteers') && data.serving.openSlots) items.push({ text: `${data.serving.openSlots} serving ${data.serving.openSlots === 1 ? 'slot needs' : 'slots need'} someone${data.serving.nextEventTitle ? ` for ${data.serving.nextEventTitle}` : ''}`, to: '/admin/volunteers', icon: HandHeart });
  if (can('volunteers') && data.serving.pending) items.push({ text: `${data.serving.pending} volunteer ${data.serving.pending === 1 ? 'reply' : 'replies'} still awaited`, to: '/admin/volunteers', icon: HandHeart });
  if (can('care') && data.care.prayer) items.push({ text: `${data.care.prayer} prayer ${data.care.prayer === 1 ? 'request' : 'requests'} to pray over`, to: '/admin/care?tab=prayer', icon: Sparkles });
  if (data.birthdaysThisWeek.length) items.push({ text: `${data.birthdaysThisWeek.length} ${data.birthdaysThisWeek.length === 1 ? 'birthday' : 'birthdays'} this week: send a greeting`, to: '/admin/celebrations', icon: Cake });
  return (
    <div className="card today-panel">
      <div className="today-head"><b>Today</b><span className="small muted">{items.length ? `${items.length} ${items.length === 1 ? 'thing' : 'things'} to do` : 'Nothing waiting'}</span></div>
      {items.length === 0 ? (
        <p className="today-done"><CheckCircle2 size={18} /> All caught up. Nobody is waiting on you right now.</p>
      ) : (
        <div className="today-list">
          {items.map((i) => (
            <Link key={i.text} to={i.to} className={`today-item ${i.tone ?? ''}`}><i.icon size={16} /> <span className="grow">{i.text}</span> <ChevronRight size={16} className="muted" /></Link>
          ))}
        </div>
      )}
    </div>
  );
}

function GettingStartedCard() {
  const can = useCan();
  const gs = useApi(() => AdminApi.gettingStarted.get(), []);
  const dismiss = useAction(async (undo: boolean) => { const r = await AdminApi.gettingStarted.dismiss(undo); gs.setData(r); return r; });
  const d = gs.data;
  if (!d || d.done === d.total) return null;
  if (d.dismissed) return null;
  const pct = Math.round((d.done / d.total) * 100);
  return (
    <section className="card card-pad gs">
      <div className="row between wrap" style={{ gap: 8, alignItems: 'flex-start' }}>
        <div className="row" style={{ gap: 12 }}>
          <div className="int-logo api"><Rocket size={20} /></div>
          <div>
            <h2 style={{ margin: 0 }}>Getting started</h2>
            <p className="small muted" style={{ margin: '2px 0 0' }}>
              {d.done} of {d.total} done.{d.trialDaysLeft !== null ? ` ${d.trialDaysLeft} days left of your free trial of everything.` : ''} Each step ticks itself when the records show it is done.
            </p>
          </div>
        </div>
        <button className="btn ghost sm" onClick={() => void dismiss.run(false)}>Hide this</button>
      </div>
      <div className="gs-bar"><i style={{ width: `${pct}%` }} /></div>
      <ol className="gs-steps">
        {d.steps.map((s) => (
          <li key={s.id} className={s.done ? 'done' : ''}>
            {s.done ? <CheckCircle2 size={18} color="var(--ok)" /> : <Circle size={18} className="muted" />}
            <div className="grow" style={{ minWidth: 0 }}>
              <b>{s.title}</b>
              {!s.done && <p className="small muted" style={{ margin: '2px 0 0' }}>{s.body}</p>}
            </div>
            {!s.done && can(s.perm) && <Link to={s.link} className="btn sm">Do it</Link>}
          </li>
        ))}
      </ol>
    </section>
  );
}
