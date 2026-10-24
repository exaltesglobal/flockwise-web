// The monthly report for the church board, the elders or the denomination: one page with Sunday
// attendance, people who joined, baptisms and other rites, giving by fund (for staff who can see
// giving), care and visits, cell groups, discipleship, sermons preached and decisions taken. The
// figures come straight from the records; the office prints it or saves it as a PDF.
import type { Ctx, Router } from '../engine.js';
import type { MonthlyReport } from '../types.js';
import { church, giftDate, localDate, settings } from '../util.js';

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const shift = (month: string, by: number) => {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return d.toISOString().slice(0, 7);
};
const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : 0);

function sundays(ctx: Ctx, month: string) {
  const now = ctx.now.toISOString();
  return ctx.db.all('events')
    .filter((e) => e.kind === 'service' && localDate(ctx, new Date(e.startsAt)).startsWith(month) && e.endsAt <= now)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .map((e) => {
      const ci = ctx.db.all('checkins').filter((c) => c.eventId === e.id);
      return { date: localDate(ctx, new Date(e.startsAt)), title: e.title, count: Math.max(e.attendance ?? 0, ci.length), children: ci.filter((c) => c.isChild).length };
    });
}

export function monthlyReport(ctx: Ctx, month: string): MonthlyReport {
  const inMonth = (iso: string | null | undefined) => !!iso && localDate(ctx, new Date(iso)).startsWith(month);
  const inMonthDay = (d: string | null | undefined) => !!d && d.startsWith(month);
  const prev = shift(month, -1);
  const services = sundays(ctx, month);
  const counted = services.filter((s) => s.count > 0);
  const people = ctx.db.all('people');
  const joined = people.filter((p) => inMonth(p.joinedAt) && (p.status === 'member' || p.status === 'visitor'));
  const regs = ctx.db.all('registers').filter((r) => r.status !== 'void' && inMonthDay(r.date));
  const plans = ctx.db.all('plans');
  const dedications = ctx.db.all('events').filter((e) => e.kind === 'service' && inMonth(e.startsAt))
    .reduce((n, e) => n + (plans.find((p) => p.eventId === e.id)?.items.filter((i) => /dedicat/i.test(i.title)).length ?? 0), 0);

  let giving: MonthlyReport['giving'] = null;
  let expenses: MonthlyReport['expenses'] = null;
  if (ctx.can('giving.view')) {
    const ok = ctx.db.all('donations').filter((d) => d.status === 'succeeded');
    const gifts = ok.filter((d) => inMonth(giftDate(d)));
    const before = ok.filter((d) => localDate(ctx, new Date(giftDate(d))).startsWith(prev));
    const funds = new Map<string, number>();
    for (const d of gifts) funds.set(d.fundName, (funds.get(d.fundName) ?? 0) + d.amount);
    giving = {
      total: gifts.reduce((s, d) => s + d.amount, 0), previous: before.reduce((s, d) => s + d.amount, 0), gifts: gifts.length,
      givers: new Set(gifts.map((d) => d.donorId ?? d.donorName)).size,
      byFund: [...funds].map(([fund, amount]) => ({ fund, amount })).sort((a, b) => b.amount - a.amount),
    };
    expenses = { total: ctx.db.all('expenses').filter((e) => e.status === 'paid' && inMonth(e.paidAt ?? `${e.date}T12:00:00.000Z`)).reduce((s, e) => s + e.amount, 0) };
  }

  const care = ctx.db.all('care');
  const groupMeetings = ctx.db.all('groupMeetings').filter((m) => inMonthDay(m.date));
  const tracks = ctx.db.all('leaderTracks');
  const c = church(ctx);
  return {
    month,
    church: { name: c.name, city: c.city, logoUrl: c.logoUrl ?? null },
    currency: settings(ctx).currency,
    attendance: { services, average: avg(counted.map((s) => s.count)), highest: Math.max(0, ...counted.map((s) => s.count)), previousAverage: avg(sundays(ctx, prev).filter((s) => s.count > 0).map((s) => s.count)) },
    people: {
      total: people.filter((p) => p.status !== 'inactive').length, members: people.filter((p) => p.status === 'member').length,
      joined: joined.filter((p) => p.status === 'member').length, newVisitors: joined.filter((p) => p.status === 'visitor').length,
      joinedNames: joined.slice(0, 30).map((p) => `${p.firstName} ${p.lastName}`.trim()),
    },
    rites: { baptisms: regs.filter((r) => r.kind === 'baptism').length, marriages: regs.filter((r) => r.kind === 'marriage').length, burials: regs.filter((r) => r.kind === 'burial').length, dedications },
    giving, expenses,
    care: {
      opened: care.filter((x) => inMonth(x.createdAt)).length, closed: care.filter((x) => inMonth(x.closedAt)).length, open: care.filter((x) => x.status !== 'closed').length,
      hospital: care.filter((x) => x.type === 'hospital' && inMonth(x.createdAt)).length,
      visits: ctx.db.all('visits').filter((v) => v.status === 'done' && inMonthDay(v.visitedOn)).length,
      prayer: ctx.db.all('prayer').filter((p) => inMonth(p.createdAt)).length,
    },
    groups: { meetings: groupMeetings.length, averagePresent: avg(groupMeetings.map((m) => m.presentIds.length + m.guests)) },
    growth: { mentorMeetings: ctx.db.all('mentorMeetings').filter((m) => inMonthDay(m.date)).length, leaders: tracks.filter((t) => t.stage === 'leading').length, inTraining: tracks.filter((t) => t.stage !== 'leading').length },
    sermons: ctx.db.all('sermons').filter((s) => inMonthDay(s.date.slice(0, 10))).sort((a, b) => a.date.localeCompare(b.date)).map((s) => ({ date: s.date.slice(0, 10), title: s.title, speaker: s.speaker, scripture: s.scripture })),
    meetings: ctx.can('care') ? ctx.db.all('meetings').filter((m) => inMonthDay(m.date) && m.decisions.length).sort((a, b) => a.date.localeCompare(b.date)).map((m) => ({ date: m.date, title: m.title, decisions: m.decisions })) : [],
    otherEvents: ctx.db.all('events').filter((e) => e.kind !== 'service' && e.published && inMonth(e.startsAt) && e.endsAt <= ctx.now.toISOString()).length,
    preparedAt: ctx.now.toISOString(),
  };
}

export function registerMonthlyReport(r: Router) {
  r.get('/admin/monthly-report', { perm: 'insights' }, (ctx) => {
    const q = String(ctx.query.month ?? '');
    const month = MONTH_RE.test(q) ? q : shift(localDate(ctx, ctx.now).slice(0, 7), -1);
    return monthlyReport(ctx, month);
  });
}
