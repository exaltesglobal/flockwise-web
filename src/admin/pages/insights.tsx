import { Download } from 'lucide-react';

import type { Insights } from '@/api/admin-types';
import { AdminApi } from '@/api/endpoints';
import { BarChart, ErrorState, Loading } from '@/components/ui';
import { downloadCsv, formatMoney, formatMoneyShort, formatNumber } from '@/lib/format';
import { useCan } from '@/lib/perms';
import { useApi } from '@/lib/use-api';

import { PageHeader } from '../layout';

const STATUS_LABEL: Record<string, string> = { visitor: 'Visitors', regular: 'Regulars', member: 'Members', inactive: 'Inactive' };
const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const shortMonth = (ym: string) => new Date(`${ym}-01`).toLocaleDateString('en-IN', { month: 'short' });
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

export function InsightsPage() {
  const { data, error, reload } = useApi(AdminApi.insights);
  const can = useCan();
  const header = (
    <PageHeader title="Reports" subtitle="How people are moving from first visit to belonging, serving and giving."
      actions={data && <button className="btn" onClick={() => exportCsv(data)}><Download size={16} /> Export CSV</button>} />
  );
  if (error) return <>{header}<ErrorState error={error} onRetry={reload} /></>;
  if (!data) return <>{header}<Loading /></>;

  const c = data.currency;
  const order = ['visitor', 'regular', 'member', 'inactive'];
  const funnel = [...data.funnel].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));
  const e = data.engagement;
  const givers = data.givers;
  const giverTotal = givers.recurring + givers.regular + givers.occasional + givers.lapsed;
  const maxCheckin = Math.max(1, ...data.checkins.map((x) => x.adults + x.children));
  const fundTotal = data.givingByFund.reduce((s, f) => s + f.amount, 0);

  return (
    <>
      {header}
      <div className="grid cols-4">
        <Kpi label="In a small group" value={`${pct(e.inGroup, e.total)}%`} sub={`${formatNumber(e.inGroup)} of ${formatNumber(e.total)} people`} />
        <Kpi label="Serving" value={`${pct(e.serving, e.total)}%`} sub={`${formatNumber(e.serving)} on a team`} />
        {can('giving.view') && <Kpi label="Giving" value={`${pct(e.giving, e.total)}%`} sub={`${formatNumber(e.giving)} gave in the last 90 days`} />}
        <Kpi label="Visitors who stayed" value={`${pct(data.retention.becameRegular, data.retention.visitorsLast90)}%`} sub={`${data.retention.becameRegular} of ${data.retention.visitorsLast90} visitors in 90 days`} />
      </div>

      <div className="grid cols-2">
        <Card title="Discipleship pathway" sub="Where everyone is today">
          <div className="stack" style={{ gap: 10 }}>
            {funnel.map((f) => <HBar key={f.status} label={STATUS_LABEL[f.status] ?? f.status} value={f.count} max={Math.max(...funnel.map((x) => x.count), 1)} text={formatNumber(f.count)} />)}
          </div>
        </Card>
        <Card title="New people" sub="Added each month">
          <BarChart data={data.newPeople.map((n) => ({ label: shortMonth(n.month), value: n.count }))} format={(v) => `${v} new`} />
        </Card>
        <Card title="Sunday attendance" sub="Last 12 weeks">
          <BarChart data={data.attendance.map((a) => ({ label: shortDate(a.date), value: a.count }))} format={(v) => `${formatNumber(v)} people`} />
        </Card>
        <Card title="Check-ins" sub="Adults and children per service">
          {data.checkins.length === 0 ? <p className="small muted">No check-ins recorded yet.</p> : (
            <>
              <div className="bars">
                {data.checkins.map((x, i) => (
                  <div key={i} className="bar stacked" title={`${x.adults} adults, ${x.children} children`}>
                    <div className="stack-col" style={{ height: `${Math.max(3, ((x.adults + x.children) / maxCheckin) * 100)}%` }}>
                      <i className="kids" style={{ flex: x.children }} />
                      <i style={{ flex: x.adults }} />
                    </div>
                    <span>{shortDate(x.date)}</span>
                  </div>
                ))}
              </div>
              <div className="row small muted" style={{ gap: 14, marginTop: 8 }}>
                <span className="row" style={{ gap: 6 }}><span className="dot" style={{ background: 'var(--primary)' }} /> Adults</span>
                <span className="row" style={{ gap: 6 }}><span className="dot" style={{ background: 'var(--accent)' }} /> Children</span>
              </div>
            </>
          )}
        </Card>
        {can('giving.view') && (
          <Card title="Giving by fund" sub="This financial year">
            <div className="stack" style={{ gap: 10 }}>
              {data.givingByFund.length === 0 && <p className="small muted">No gifts yet.</p>}
              {data.givingByFund.map((f) => <HBar key={f.fund} label={f.fund} value={f.amount} max={Math.max(...data.givingByFund.map((x) => x.amount), 1)} text={`${formatMoneyShort(f.amount, c)} · ${pct(f.amount, fundTotal)}%`} />)}
            </div>
          </Card>
        )}
        {can('giving.view') && (
          <Card title="Givers" sub="Based on the last 12 months">
            <div className="stack" style={{ gap: 10 }}>
              <HBar label="Recurring (monthly autopay)" value={givers.recurring} max={giverTotal} text={String(givers.recurring)} />
              <HBar label="Regular (6+ months)" value={givers.regular} max={giverTotal} text={String(givers.regular)} />
              <HBar label="Occasional" value={givers.occasional} max={giverTotal} text={String(givers.occasional)} />
              <HBar label="Lapsed (none in 90 days)" value={givers.lapsed} max={giverTotal} text={String(givers.lapsed)} tone="warn" />
            </div>
          </Card>
        )}
        <Card title="Pastoral care" sub="Cases and follow-up">
          <div className="stat-row">
            <div className="mini-stat"><b>{data.care.open}</b><span>Open cases</span></div>
            <div className="mini-stat"><b>{data.care.closedLast30}</b><span>Closed in 30 days</span></div>
            <div className="mini-stat"><b>{data.care.avgDaysToClose ?? '—'}</b><span>Average days to close</span></div>
          </div>
        </Card>
      </div>
    </>
  );

  function exportCsv(d: Insights) {
    const rows: (string | number)[][] = [['Section', 'Label', 'Value']];
    d.funnel.forEach((f) => rows.push(['Pathway', f.status, f.count]));
    d.newPeople.forEach((n) => rows.push(['New people', n.month, n.count]));
    d.attendance.forEach((a) => rows.push(['Attendance', a.date.slice(0, 10), a.count]));
    d.checkins.forEach((x) => rows.push(['Check-ins (adults)', x.date.slice(0, 10), x.adults], ['Check-ins (children)', x.date.slice(0, 10), x.children]));
    if (can('giving.view')) d.givingByFund.forEach((f) => rows.push(['Giving by fund', f.fund, formatMoney(f.amount, d.currency)]));
    Object.entries(d.engagement).forEach(([k, v]) => rows.push(['Engagement', k, v]));
    downloadCsv('flockwise-insights.csv', rows);
  }
}

function Kpi({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="card kpi">
      <span className="label">{label}</span>
      <span className="value">{value}</span>
      <span className="delta muted">{sub}</span>
    </div>
  );
}

function Card({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <div className="card-head"><h2>{title}</h2><span className="small muted">{sub}</span></div>
      <div className="card-body">{children}</div>
    </div>
  );
}

function HBar({ label, value, max, text, tone }: { label: string; value: number; max: number; text: string; tone?: 'warn' }) {
  return (
    <div className="hbar">
      <div className="row small" style={{ justifyContent: 'space-between' }}><span>{label}</span><strong>{text}</strong></div>
      <div className="hbar-track"><i className={tone} style={{ width: `${Math.max(2, pct(value, max))}%` }} /></div>
    </div>
  );
}
