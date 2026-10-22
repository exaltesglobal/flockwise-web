import { AlertTriangle, Cake, CalendarDays, Gift, HandHeart, HeartHandshake, IndianRupee, Sparkles, UserPlus, Users, UsersRound } from 'lucide-react';
import { Link } from 'react-router';

import { adminSession } from '@/api/client';
import { AdminApi } from '@/api/endpoints';
import { Avatar, BarChart, ErrorState, Loading } from '@/components/ui';
import { formatDay, formatMoney, formatMoneyShort, formatNumber, formatRelative, formatTime, greetingKey } from '@/lib/format';
import { useCan } from '@/lib/perms';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/use-api';

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
              <Avatar name={b.name} />
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
