// The annual report for the general body meeting, in one tap. The figures for the financial year
// come straight from the records: membership growth, Sunday attendance, baptisms and other rites,
// giving by fund and expenses by head (for staff who can see money), and what each ministry did.
// The office adds the pastor's letter (AI can draft it from the figures), highlights, thanks and
// photos. The web app prints it as a PDF and shows it as a deck in the church's own colours.
import type { Ctx, Router } from '../engine.js';
import { ApiError } from '../errors.js';
import type { AnnualReport, AnnualReportDraft, AnnualReportSection } from '../types.js';
import { featureOn } from '../features.js';
import { fiscalYearRange, giftDate, localDate, settings } from '../util.js';
import { churchContext, run, textOf } from './ai.js';

const SECTIONS: AnnualReportSection[] = ['letter', 'membership', 'attendance', 'rites', 'giving', 'expenses', 'ministries', 'highlights', 'photos', 'thanks'];
const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : 0);
const PERM = ['insights', 'settings'] as ('insights' | 'settings')[];

/** The twelve months of the financial year, as YYYY-MM. */
function months(from: Date) {
  return Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + i, 1)).toISOString().slice(0, 7));
}

function guard(ctx: Ctx) {
  if (!featureOn(settings(ctx).features, 'annual-report')) throw new ApiError(404, 'not_found', 'The annual report is switched off for this church.');
}

function draftFor(ctx: Ctx, label: string): AnnualReportDraft {
  return ctx.db.get('annualReports', label) ?? { id: label, letter: '', highlights: [], thanks: '', photos: [], hide: [], baptismNames: true, by: '', updatedAt: '' };
}

function pickYear(ctx: Ctx, q: unknown) {
  const now = fiscalYearRange(ctx);
  // Until the year is half done, the report most people want is last year's.
  const today = ctx.now.getTime();
  const defaultStart = today - now.from.getTime() < 183 * 86_400_000 ? now.start - 1 : now.start;
  const want = typeof q === 'string' && /^\d{4}/.test(q) ? Number(q.slice(0, 4)) : defaultStart;
  return fiscalYearRange(ctx, String(Math.min(want, now.start)));
}

export function annualReport(ctx: Ctx, fyQuery?: unknown): AnnualReport {
  const fy = pickYear(ctx, fyQuery);
  const prev = fiscalYearRange(ctx, String(fy.start - 1));
  const from = fy.from.toISOString().slice(0, 10);
  const to = new Date(fy.to.getTime() - 86_400_000).toISOString().slice(0, 10);
  const day = (iso: string | null | undefined) => (iso ? localDate(ctx, new Date(iso)) : '');
  const inYear = (d: string) => !!d && d >= from && d <= to;
  const inPrev = (d: string) => !!d && d >= prev.from.toISOString().slice(0, 10) && d < from;
  const ms = months(fy.from);
  const nowIso = ctx.now.toISOString();
  const s = settings(ctx);

  // People
  const people = ctx.db.all('people');
  const active = people.filter((p) => p.status !== 'inactive');
  const joined = people.filter((p) => inYear(day(p.joinedAt)));
  const joinedMembers = joined.filter((p) => p.status === 'member').length;
  const members = people.filter((p) => p.status === 'member').length;
  const families = new Set(active.map((p) => p.householdName ?? `solo:${p.id}`)).size;

  // Sunday services
  const services = ctx.db.all('events').filter((e) => e.kind === 'service' && e.endsAt <= nowIso);
  const checkins = ctx.db.all('checkins');
  const countOf = (id: string, attendance: number | null | undefined) => Math.max(attendance ?? 0, checkins.filter((c) => c.eventId === id).length);
  const counted = (pred: (d: string) => boolean) => services.map((e) => ({ date: day(e.startsAt), count: countOf(e.id, e.attendance) })).filter((x) => pred(x.date) && x.count > 0);
  const thisYear = counted(inYear);
  const highest = thisYear.reduce<{ date: string; count: number } | null>((best, x) => (!best || x.count > best.count ? x : best), null);

  // Registers
  const regs = ctx.db.all('registers').filter((r) => r.status !== 'void' && inYear(r.date));
  const baptisms = regs.filter((r) => r.kind === 'baptism');
  const plans = ctx.db.all('plans');
  const dedications = services.filter((e) => inYear(day(e.startsAt))).reduce((n, e) => n + (plans.find((p) => p.eventId === e.id)?.items.filter((i) => /dedicat/i.test(i.title)).length ?? 0), 0);
  const draft = draftFor(ctx, fy.label);

  // Money, for those who may see it
  let giving: AnnualReport['giving'] = null;
  let expenses: AnnualReport['expenses'] = null;
  if (ctx.can('giving.view')) {
    const ok = ctx.db.all('donations').filter((d) => d.status === 'succeeded');
    const gifts = ok.filter((d) => inYear(day(giftDate(d))));
    const funds = new Map<string, number>();
    for (const d of gifts) funds.set(d.fundName, (funds.get(d.fundName) ?? 0) + d.amount);
    giving = {
      total: gifts.reduce((n, d) => n + d.amount, 0),
      previous: ok.filter((d) => inPrev(day(giftDate(d)))).reduce((n, d) => n + d.amount, 0),
      givers: new Set(gifts.map((d) => d.donorId ?? d.donorName)).size,
      byFund: [...funds].map(([fund, amount]) => ({ fund, amount })).sort((a, b) => b.amount - a.amount),
      byMonth: ms.map((m) => ({ month: m, amount: gifts.filter((d) => day(giftDate(d)).startsWith(m)).reduce((n, d) => n + d.amount, 0) })),
    };
    const paid = ctx.db.all('expenses').filter((e) => e.status === 'paid');
    const paidDay = (e: (typeof paid)[number]) => day(e.paidAt ?? `${e.date}T12:00:00.000Z`);
    const spent = paid.filter((e) => inYear(paidDay(e)));
    const heads = new Map<string, number>();
    for (const e of spent) {
      const name = ctx.db.get('accountHeads', e.headId)?.name ?? 'Other';
      heads.set(name, (heads.get(name) ?? 0) + e.amount);
    }
    expenses = {
      total: spent.reduce((n, e) => n + e.amount, 0),
      previous: paid.filter((e) => inPrev(paidDay(e))).reduce((n, e) => n + e.amount, 0),
      byHead: [...heads].map(([head, amount]) => ({ head, amount })).sort((a, b) => b.amount - a.amount),
    };
  }

  const ssClasses = ctx.db.all('ssClasses');
  const outreach = ctx.db.all('outreaches').filter((o) => o.status === 'done' && inYear(o.date));
  return {
    year: { label: fy.label, from, to, previousLabel: prev.label, complete: fy.to.getTime() <= ctx.now.getTime() },
    church: { name: s.name, city: s.city, logoUrl: s.logoUrl ?? null, logoDarkUrl: s.brand?.logoDarkUrl ?? null, tagline: s.brand?.tagline ?? '', brand: s.brand ?? null },
    currency: s.currency,
    membership: {
      total: active.length, members, families, joinedMembers, newVisitors: joined.filter((p) => p.status === 'visitor').length,
      startMembers: Math.max(0, members - joinedMembers),
      byMonth: ms.map((m) => ({ month: m, joined: joined.filter((p) => day(p.joinedAt).startsWith(m)).length })),
    },
    attendance: {
      average: avg(thisYear.map((x) => x.count)), previousAverage: avg(counted(inPrev).map((x) => x.count)), highest,
      byMonth: ms.map((m) => ({ month: m, average: avg(thisYear.filter((x) => x.date.startsWith(m)).map((x) => x.count)) })),
    },
    rites: {
      baptisms: baptisms.length, marriages: regs.filter((r) => r.kind === 'marriage').length, burials: regs.filter((r) => r.kind === 'burial').length, dedications,
      baptismNames: draft.baptismNames ? baptisms.map((r) => r.name).filter(Boolean).slice(0, 80) : [],
    },
    giving,
    expenses,
    ministries: {
      groups: ctx.db.all('groups').length,
      groupMeetings: ctx.db.all('groupMeetings').filter((m) => inYear(m.date)).length,
      sundaySchoolClasses: ssClasses.length,
      sundaySchoolChildren: new Set(ssClasses.flatMap((c) => c.studentIds)).size,
      volunteers: new Set(ctx.db.all('assignments').filter((a) => a.status === 'accepted' && inYear(day(ctx.db.get('events', a.eventId)?.startsAt))).map((a) => a.personId)).size,
      coursesCompleted: ctx.db.all('courseEnrollments').filter((e) => e.status === 'completed' && inYear(day(e.completedAt))).length,
      outreachDays: outreach.length,
      outreachHelped: outreach.reduce((n, o) => n + (o.served ?? 0), 0),
      events: ctx.db.all('events').filter((e) => e.kind !== 'service' && e.published && inYear(day(e.startsAt))).length,
      sermons: ctx.db.all('sermons').filter((x) => inYear(x.date.slice(0, 10))).length,
      prayers: ctx.db.all('prayer').filter((p) => inYear(day(p.createdAt))).length,
      visits: ctx.db.all('visits').filter((v) => v.status === 'done' && inYear(v.visitedOn ?? '')).length,
    },
    draft,
    preparedAt: nowIso,
  };
}

function save(ctx: Ctx, label: string, b: Record<string, unknown>): AnnualReportDraft {
  const prev = draftFor(ctx, label);
  const photos = Array.isArray(b.photos)
    ? (b.photos as Record<string, unknown>[]).map((p) => ({ url: clean(p?.url, 1000), caption: clean(p?.caption, 140) })).filter((p) => /^https:\/\//.test(p.url) || p.url.startsWith('/')).slice(0, 12)
    : prev.photos;
  return ctx.db.put('annualReports', {
    id: label,
    letter: b.letter !== undefined ? clean(b.letter, 6000) : prev.letter,
    highlights: Array.isArray(b.highlights) ? (b.highlights as unknown[]).map((h) => clean(h, 240)).filter(Boolean).slice(0, 12) : prev.highlights,
    thanks: b.thanks !== undefined ? clean(b.thanks, 2000) : prev.thanks,
    photos,
    hide: Array.isArray(b.hide) ? (b.hide as unknown[]).filter((x): x is AnnualReportSection => SECTIONS.includes(x as AnnualReportSection)) : prev.hide,
    baptismNames: b.baptismNames !== undefined ? !!b.baptismNames : prev.baptismNames,
    by: ctx.staff?.name ?? 'Church office',
    updatedAt: ctx.now.toISOString(),
  });
}

/** The pastor's letter, drafted from the year's figures. Numbers come in as facts; the model only writes. */
async function draftLetter(ctx: Ctx, r: AnnualReport, language: string): Promise<string> {
  const money = (n: number) => `₹${Math.round(n / 100).toLocaleString('en-IN')}`;
  const facts = {
    year: r.year.label,
    members: r.membership.members, newMembers: r.membership.joinedMembers, newVisitors: r.membership.newVisitors, families: r.membership.families,
    averageSunday: r.attendance.average, previousAverageSunday: r.attendance.previousAverage,
    baptisms: r.rites.baptisms, marriages: r.rites.marriages, funerals: r.rites.burials,
    giving: r.giving ? { total: money(r.giving.total), previousYear: money(r.giving.previous) } : null,
    ministries: r.ministries, highlights: r.draft.highlights,
  };
  const res = await run(ctx, {
    system: `${churchContext(ctx)}\n\nYou draft the pastor's letter that opens the church's annual report to the general body. Warm, humble, thankful to God and to the people, about 220 words, in ${language === 'en' ? 'English' : `the language with code ${language}, in its own script`}. Use only the facts given; never invent numbers, names or events. One Bible verse that fits is welcome. Plain text, short paragraphs, no headings, signed "Your pastor".`,
    messages: [{ role: 'user', content: `Facts (JSON):\n${JSON.stringify(facts)}` }],
    maxTokens: 1500,
    effort: 'low',
  });
  const text = textOf(res.content).trim();
  if (!text) throw new ApiError(502, 'ai_error', 'The letter came back empty. Try again.');
  return text.slice(0, 6000);
}

export function registerAnnualReport(r: Router) {
  r.get('/admin/annual-report', { perm: PERM }, (ctx): AnnualReport => { guard(ctx); return annualReport(ctx, ctx.query.year); });

  r.put('/admin/annual-report/:year', { perm: PERM }, (ctx): AnnualReport => {
    guard(ctx);
    const fy = pickYear(ctx, ctx.params[0]);
    save(ctx, fy.label, ctx.body);
    ctx.audit('updated', 'annualReports', fy.label, `Updated the annual report for ${fy.label}`);
    return annualReport(ctx, fy.label);
  });

  r.post('/admin/annual-report/:year/letter', { perm: PERM }, async (ctx) => {
    guard(ctx);
    const report = annualReport(ctx, ctx.params[0]);
    return { letter: await draftLetter(ctx, report, clean(ctx.body.language, 5) || 'en') };
  });
}
