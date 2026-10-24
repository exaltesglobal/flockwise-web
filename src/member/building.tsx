// Church building: the members' view of a building project. Where the work has reached (stages and
// progress photos), what has come in against the budget, each contractor bill paid or due, and the
// member's own pledge, with a button to give to the building fund.
import { ChevronLeft, FileText, HeartHandshake } from 'lucide-react';
import { Link, useParams } from 'react-router';

import { memberSession } from '@/api/client';
import { MemberApi } from '@/api/endpoints';
import type { MemberBuildingProject } from '@/core/types';
import { ErrorState, Loading } from '@/components/ui';
import { useT, type StringKey } from '@/i18n';
import { formatDate, formatMoney } from '@/lib/format';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/use-api';

const STATUS: Record<MemberBuildingProject['status'], StringKey> = { planning: 'bldPlanning', building: 'bldBuilding', paused: 'bldPaused', done: 'bldDone' };
const STAGE: Record<'todo' | 'doing' | 'done', StringKey> = { todo: 'bldStageTodo', doing: 'bldStageDoing', done: 'bldStageDone' };
const day = (d: string, locale: string) => formatDate(`${d}T12:00:00`, locale);

export function MemberBuildingPage() {
  const { t } = useT();
  const { id } = useParams();
  const q = useApi(MemberApi.building);
  if (q.error) return <ErrorState error={q.error} onRetry={q.reload} />;
  if (!q.data) return <Loading />;
  const list = q.data;
  const one = id ? list.find((p) => p.id === id) : list.length === 1 ? list[0] : null;
  if (one) return <Project p={one} back={list.length > 1 || !!id} />;
  return (
    <div className="stack">
      <div>
        <h1>{t('bldTitle')}</h1>
        <p className="muted">{t('bldIntro')}</p>
      </div>
      {!list.length ? <div className="card card-pad muted">{t('bldNone')}</div> : list.map((p) => <ProjectCard key={p.id} p={p} />)}
    </div>
  );
}

function useMoney() {
  const session = useSession(memberSession);
  const { locale } = useT();
  return (n: number) => formatMoney(n, session!.church.currency, locale);
}

function Bar({ value, of, color = 'var(--primary)' }: { value: number; of: number; color?: string }) {
  const pct = of > 0 ? Math.min(100, Math.round((value / of) * 100)) : 0;
  return (
    <div style={{ height: 10, borderRadius: 5, background: 'var(--border)', overflow: 'hidden' }} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div style={{ width: `${pct}%`, height: '100%', background: color }} />
    </div>
  );
}

function ProjectCard({ p }: { p: MemberBuildingProject }) {
  const { t } = useT();
  const money = useMoney();
  return (
    <Link to={`/app/building/${p.id}`} className="card" style={{ overflow: 'hidden', color: 'inherit', textDecoration: 'none', display: 'block' }}>
      {p.coverUrl && <img src={p.coverUrl} alt="" style={{ width: '100%', aspectRatio: '16 / 8', objectFit: 'cover', display: 'block' }} />}
      <div className="card-pad stack" style={{ gap: 8 }}>
        <div className="row between wrap" style={{ gap: 6 }}><b>{p.title}</b><span className="badge">{t(STATUS[p.status])}</span></div>
        <Bar value={p.money.raised} of={p.budget} />
        <span className="small muted">{money(p.money.raised)} · {t('bldOfBudget', { pct: p.budget ? Math.round((p.money.raised / p.budget) * 100) : 0 })}</span>
      </div>
    </Link>
  );
}

function Project({ p, back }: { p: MemberBuildingProject; back: boolean }) {
  const { t, locale } = useT();
  const money = useMoney();
  const doneStages = p.stages.filter((s) => s.status === 'done').length;
  return (
    <div className="stack" style={{ gap: 16 }}>
      {back && <Link to="/app/building" className="small row" style={{ gap: 4 }}><ChevronLeft size={16} /> {t('bldBack')}</Link>}
      {p.coverUrl && <img src={p.coverUrl} alt="" style={{ width: '100%', maxWidth: '100%', aspectRatio: '16 / 8', objectFit: 'cover', borderRadius: 12 }} />}
      <div className="stack" style={{ gap: 4 }}>
        <div className="row between wrap" style={{ gap: 6 }}><h1 style={{ margin: 0 }}>{p.title}</h1><span className="badge">{t(STATUS[p.status])}</span></div>
        {p.targetDate && <span className="small muted">{t('bldTarget', { date: day(p.targetDate, locale) })}</span>}
        {p.description && <p style={{ margin: '4px 0 0' }}>{p.description}</p>}
      </div>

      <section className="card card-pad stack" style={{ gap: 10 }}>
        <div className="row between wrap" style={{ gap: 6, alignItems: 'baseline' }}>
          <span style={{ fontSize: '1.6rem', fontWeight: 700 }}>{money(p.money.raised)}</span>
          <span className="small muted">{t('bldBudget')} {money(p.budget)}</span>
        </div>
        <Bar value={p.money.raised} of={p.budget} />
        <span className="small muted">{t('bldOfBudget', { pct: p.budget ? Math.round((p.money.raised / p.budget) * 100) : 0 })} · {t('bldGivers', { n: p.money.givers })}{p.money.pledged > 0 ? ` · ${t('bldPledged', { amount: money(p.money.pledged), n: p.money.pledgers })}` : ''}</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8 }}>
          <Figure label={t('bldSpent')} value={money(p.money.spent)} />
          <Figure label={t('bldBalance')} value={money(p.money.balance)} />
          {p.money.due > 0 && <Figure label={t('bldDue')} value={money(p.money.due)} />}
        </div>
      </section>

      <section className="card card-pad stack" style={{ gap: 10 }}>
        <b><HeartHandshake size={16} style={{ verticalAlign: '-3px' }} /> {p.myPledge ? t('bldMyPledge') : t('bldGive')}</b>
        {p.myPledge && (
          <>
            <Bar value={p.myPledge.given} of={p.myPledge.amount} color="var(--accent, var(--primary))" />
            <span className="small">{t('bldPledgeOf', { given: money(p.myPledge.given), amount: money(p.myPledge.amount), date: day(p.myPledge.endDate, locale) })}</span>
          </>
        )}
        {!p.myPledge && p.myGiven > 0 && <span className="small">{t('bldYouGave', { amount: money(p.myGiven) })}</span>}
        <Link className="btn primary" to={`/app/give?fund=${encodeURIComponent(p.fundId)}`}>{t('bldGive')}</Link>
      </section>

      {p.stages.length > 0 && (
        <section className="stack" style={{ gap: 8 }}>
          <h3 style={{ margin: 0 }}>{t('bldStages')} · {doneStages}/{p.stages.length}</h3>
          <div className="card">
            {p.stages.map((s, i) => (
              <div key={s.id} className="row" style={{ gap: 10, padding: '10px 14px', borderTop: i ? '1px solid var(--border)' : 0 }}>
                <span style={{ width: 12, height: 12, borderRadius: 6, flex: 'none', background: s.status === 'done' ? 'var(--ok, green)' : s.status === 'doing' ? 'var(--warn, orange)' : 'var(--border)' }} />
                <span className="grow">{s.name}</span>
                <span className="small muted">{t(STAGE[s.status])}{s.doneAt ? ` · ${day(s.doneAt, locale)}` : ''}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {p.updates.length > 0 && (
        <section className="stack" style={{ gap: 8 }}>
          <h3 style={{ margin: 0 }}>{t('bldUpdates')}</h3>
          {p.updates.map((u) => (
            <article key={u.id} className="card card-pad stack" style={{ gap: 6 }}>
              <div className="row between wrap" style={{ gap: 6 }}><b>{u.title}</b><span className="small muted">{day(u.date, locale)}</span></div>
              {u.body && <p style={{ margin: 0 }}>{u.body}</p>}
              {u.photos.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
                  {u.photos.map((ph) => (
                    <figure key={ph.url} style={{ margin: 0 }}>
                      <img src={ph.url} alt={ph.caption} loading="lazy" style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', borderRadius: 8 }} />
                      {ph.caption && <figcaption className="small muted">{ph.caption}</figcaption>}
                    </figure>
                  ))}
                </div>
              )}
            </article>
          ))}
        </section>
      )}

      {p.bills && p.bills.length > 0 && (
        <section className="stack" style={{ gap: 8 }}>
          <h3 style={{ margin: 0 }}>{t('bldBills')}</h3>
          <div className="card">
            {p.bills.map((b, i) => (
              <div key={b.id} className="row wrap" style={{ gap: 10, padding: '10px 14px', borderTop: i ? '1px solid var(--border)' : 0 }}>
                <div className="grow" style={{ minWidth: 160 }}>
                  <b>{b.contractor}</b>
                  <div className="small muted">{b.work} · {day(b.billDate, locale)}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <b>{money(b.amount)}</b>
                  <div>{b.status === 'paid' ? <span className="badge ok">{t('bldPaid')}</span> : <span className="badge warn">{t('bldBillDue')}</span>}</div>
                </div>
                {b.billUrl && <a className="btn sm ghost" href={b.billUrl} target="_blank" rel="noreferrer"><FileText size={14} /> {t('bldBillFile')}</a>}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return <div className="card" style={{ padding: 10 }}><div className="small muted">{label}</div><b>{value}</b></div>;
}
