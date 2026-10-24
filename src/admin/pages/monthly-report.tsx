// Office › Monthly report: one page for the church board, the elders or the denomination, made from
// the records. Pick the month, check it, print it or save it as a PDF from the print dialog.
import { Printer } from 'lucide-react';
import { useState } from 'react';

import { AdminApi } from '@/api/endpoints';
import type { Currency } from '@/core/types';
import { ErrorState, Loading } from '@/components/ui';
import { formatDate, formatMoney, formatNumber } from '@/lib/format';
import { useApi } from '@/lib/use-api';

import { PageHeader } from '../layout';

const lastMonth = () => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7); };
const monthName = (m: string) => new Date(`${m}-15T12:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
const day = (d: string) => formatDate(`${d}T12:00:00`);
const change = (now: number, before: number) => (before ? Math.round(((now - before) / before) * 100) : null);

function Delta({ now, before, label }: { now: number; before: number; label: string }) {
  const c = change(now, before);
  if (c === null) return null;
  return <span className={`small ${c >= 0 ? 'mr-up' : 'mr-down'}`}>{c >= 0 ? '▲' : '▼'} {Math.abs(c)}% {label}</span>;
}

export function MonthlyReportPage() {
  const [month, setMonth] = useState(lastMonth());
  const q = useApi(() => AdminApi.monthlyReport(month), [month]);
  const r = q.data;
  const money = (n: number) => formatMoney(n, (r?.currency ?? 'INR') as Currency);

  return (
    <>
      <div className="no-print">
        <PageHeader
          title="Monthly report"
          subtitle="One page for the board, the elders or the denomination, made from your records. Print it, or choose Save as PDF in the print window."
          actions={<>
            <input type="month" value={month} max={new Date().toISOString().slice(0, 7)} onChange={(e) => e.target.value && setMonth(e.target.value)} aria-label="Month" className="input" style={{ width: 'auto' }} />
            <button className="btn primary" onClick={() => window.print()} disabled={!r}><Printer size={16} /> Print or PDF</button>
          </>}
        />
      </div>
      {q.error ? <ErrorState error={q.error} onRetry={q.reload} /> : !r ? <Loading /> : (
        <article className="card mr-sheet">
          <header className="mr-head">
            {r.church.logoUrl && <img src={r.church.logoUrl} alt="" className="mr-logo" />}
            <div>
              <div className="small muted">{r.church.name}{r.church.city ? `, ${r.church.city}` : ''}</div>
              <h2>Report for {monthName(r.month)}</h2>
            </div>
          </header>

          <div className="mr-kpis">
            <div><span className="small muted">Average Sunday</span>{r.attendance.services.length ? <><b>{formatNumber(r.attendance.average)}</b><Delta now={r.attendance.average} before={r.attendance.previousAverage} label="on last month" /></> : <><b>-</b><span className="small muted">No headcount recorded</span></>}</div>
            <div><span className="small muted">People</span><b>{formatNumber(r.people.total)}</b><span className="small muted">{formatNumber(r.people.members)} members</span></div>
            <div><span className="small muted">New this month</span><b>{r.people.joined + r.people.newVisitors}</b><span className="small muted">{r.people.joined} member{r.people.joined === 1 ? "" : "s"}, {r.people.newVisitors} visitor{r.people.newVisitors === 1 ? "" : "s"}</span></div>
            {r.giving && <div><span className="small muted">Giving</span><b>{money(r.giving.total)}</b><Delta now={r.giving.total} before={r.giving.previous} label="on last month" /></div>}
          </div>

          <section>
            <h3>Worship</h3>
            {r.attendance.services.length ? (
              <table className="table mr-table">
                <thead><tr><th>Date</th><th>Service</th><th className="num">Present</th><th className="num">Children</th></tr></thead>
                <tbody>{r.attendance.services.map((s, i) => <tr key={i}><td>{day(s.date)}</td><td>{s.title}</td><td className="num">{s.count || '-'}</td><td className="num">{s.children || '-'}</td></tr>)}</tbody>
              </table>
            ) : <p className="small muted">No services with a headcount this month. Record the count on each Sunday's service plan and it shows here.</p>}
            {(r.attendance.highest > 0 || r.otherEvents > 0) && <p className="small">{r.attendance.highest > 0 && <>Highest attendance {formatNumber(r.attendance.highest)}. </>}{r.otherEvents} other event{r.otherEvents === 1 ? '' : 's'}.</p>}
          </section>

          <section className="mr-two">
            <div>
              <h3>Rites</h3>
              <dl className="mr-dl">
                <dt>Baptisms</dt><dd>{r.rites.baptisms}</dd>
                <dt>Marriages</dt><dd>{r.rites.marriages}</dd>
                <dt>Funerals</dt><dd>{r.rites.burials}</dd>
                <dt>Child dedications</dt><dd>{r.rites.dedications}</dd>
              </dl>
            </div>
            <div>
              <h3>Care</h3>
              <dl className="mr-dl">
                <dt>Care cases opened</dt><dd>{r.care.opened}</dd>
                <dt>Closed</dt><dd>{r.care.closed}</dd>
                <dt>Still open</dt><dd>{r.care.open}</dd>
                <dt>Hospital</dt><dd>{r.care.hospital}</dd>
                <dt>Home visits</dt><dd>{r.care.visits}</dd>
                <dt>Prayer requests</dt><dd>{r.care.prayer}</dd>
              </dl>
            </div>
            <div>
              <h3>Growing</h3>
              <dl className="mr-dl">
                <dt>Cell group meetings</dt><dd>{r.groups.meetings}</dd>
                <dt>Average present</dt><dd>{r.groups.averagePresent}</dd>
                <dt>Mentoring meetings</dt><dd>{r.growth.mentorMeetings}</dd>
                <dt>Leaders in training</dt><dd>{r.growth.inTraining}</dd>
              </dl>
            </div>
          </section>

          {r.giving && (
            <section>
              <h3>Giving and spending</h3>
              <table className="table mr-table">
                <tbody>
                  {r.giving.byFund.map((f) => <tr key={f.fund}><td>{f.fund}</td><td className="num">{money(f.amount)}</td></tr>)}
                  <tr className="mr-total"><td>Total from {r.giving.givers} giver{r.giving.givers === 1 ? '' : 's'} ({r.giving.gifts} gifts)</td><td className="num">{money(r.giving.total)}</td></tr>
                  {r.expenses && <tr><td>Expenses paid</td><td className="num">{money(r.expenses.total)}</td></tr>}
                </tbody>
              </table>
            </section>
          )}

          {r.people.joinedNames.length > 0 && (
            <section>
              <h3>Welcome</h3>
              <p className="small">{r.people.joinedNames.join(', ')}{r.people.joined + r.people.newVisitors > r.people.joinedNames.length ? ' and others' : ''}.</p>
            </section>
          )}

          {r.sermons.length > 0 && (
            <section>
              <h3>Sermons</h3>
              <ul className="mr-list">{r.sermons.map((s, i) => <li key={i}>{day(s.date)}: <b>{s.title}</b>{s.scripture && ` (${s.scripture})`}{s.speaker && `, ${s.speaker}`}</li>)}</ul>
            </section>
          )}

          {r.meetings.length > 0 && (
            <section>
              <h3>Decisions</h3>
              {r.meetings.map((m, i) => <div key={i} className="mr-decisions"><b className="small">{m.title}, {day(m.date)}</b><ul className="mr-list">{m.decisions.map((x, j) => <li key={j}>{x}</li>)}</ul></div>)}
            </section>
          )}

          <footer className="small muted">Prepared from Flockwise records on {formatDate(r.preparedAt)}.</footer>
        </article>
      )}
    </>
  );
}
