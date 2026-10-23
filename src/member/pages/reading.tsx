// Bible reading plan, from the member's side: today's passage in their own language, a tick for
// "I read it", a streak, and the church-wide bar that shows everyone reading together.
import { BookOpenCheck, Check, ExternalLink, Flame, Users } from 'lucide-react';
import { useState } from 'react';

import type { MyReadingPlan } from '@/api/admin-types';
import { MemberApi } from '@/api/endpoints';
import { ErrorState, Loading, useToast } from '@/components/ui';
import { useT } from '@/i18n';
import { formatDay } from '@/lib/format';
import { useAction, useApi } from '@/lib/use-api';

const day = (d: string, locale: string) => formatDay(`${d}T12:00:00`, locale);
const bibleLink = (ref: string) => `https://www.bible.com/search/bible?query=${encodeURIComponent(ref)}`;

export function MemberReadingPage() {
  const { t } = useT();
  const { data, error, reload, setData } = useApi(MemberApi.reading.get);
  return (
    <>
      <div>
        <h1>{t('readTitle')}</h1>
        <p className="muted">{t('readBody')}</p>
      </div>
      {error ? <ErrorState error={error} onRetry={reload} /> : !data ? <Loading /> : data.plans.length === 0 ? (
        <div className="card card-pad stack" style={{ alignItems: 'center', textAlign: 'center' }}><BookOpenCheck size={28} /><p className="muted" style={{ margin: 0 }}>{t('readNone')}</p></div>
      ) : (
        <div className="stack">{data.plans.map((p) => <Plan key={p.id} p={p} onData={(d) => setData(d)} />)}</div>
      )}
    </>
  );
}

function Plan({ p, onData }: { p: MyReadingPlan; onData: (d: { plans: MyReadingPlan[] }) => void }) {
  const { t, locale } = useT();
  const toast = useToast();
  const [showEarlier, setShowEarlier] = useState(false);
  const join = useAction(() => MemberApi.reading.join(p.id));
  const leave = useAction(() => MemberApi.reading.leave(p.id));
  const tick = useAction((d: number, done: boolean) => MemberApi.reading.done(p.id, d, done));
  const today = p.today ? p.readings[p.today - 1] : null;
  const ended = !p.today && p.readings.length && Date.parse(`${p.endsOn}T23:59:59`) < Date.now();
  const earlier = p.today ? p.readings.slice(Math.max(0, p.today - 8), p.today - 1) : [];
  const bar = p.church.participants ? Math.round((100 * p.church.readToday) / p.church.participants) : 0;
  return (
    <div className="card card-pad stack">
      <div className="row wrap" style={{ gap: 8, alignItems: 'baseline', justifyContent: 'space-between' }}>
        <b style={{ fontSize: 18 }}>{p.name}</b>
        <span className="small muted">{p.today ? `${t('readDay', { day: p.today, total: p.totalDays })} · ${day(today!.on, locale)}` : ended ? t('readEnded') : t('readStarts', { date: day(p.startsOn, locale) })}</span>
      </div>
      {p.description && <p className="muted small" style={{ margin: 0 }}>{p.description}</p>}

      {p.joined && today && (
        <div className="stack" style={{ gap: 8, padding: '12px 14px', borderRadius: 12, background: 'color-mix(in srgb, var(--primary) 8%, transparent)' }}>
          <span className="small muted">{t('readToday')}</span>
          <b style={{ fontSize: 22, lineHeight: 1.25 }}>{today.local}</b>
          {today.local !== today.ref && <span className="small muted">{today.ref}</span>}
          <div className="row wrap" style={{ gap: 8 }}>
            <button className={`btn ${p.todayDone ? '' : 'primary'}`} disabled={tick.busy} onClick={async () => { const d = await tick.run(p.today!, !p.todayDone); if (d) onData(d); }}>
              <Check size={16} /> {p.todayDone ? t('readUndo') : t('readDone')}
            </button>
            <a className="btn ghost" href={bibleLink(today.ref)} target="_blank" rel="noreferrer"><ExternalLink size={15} /> {t('readOpen')}</a>
          </div>
        </div>
      )}

      {p.joined && (
        <div className="row wrap small" style={{ gap: 14 }}>
          {p.streak > 0 && <span className="badge accent"><Flame size={13} /> {t('readStreak', { n: p.streak })}</span>}
          <span className="muted">{t('readProgress', { done: p.doneCount, total: p.totalDays })}</span>
        </div>
      )}

      <div className="stack" style={{ gap: 6 }}>
        <div className="row small" style={{ gap: 6, alignItems: 'center' }}><Users size={14} /> <span>{p.today ? t('readTogether', { n: p.church.readToday, total: p.church.participants }) : t('readReaders', { n: p.church.participants })}</span></div>
        <div className="meter" role="progressbar" aria-valuenow={bar} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${bar}%` }} /></div>
        {p.today && p.church.participants > 0 && <span className="small muted">{t('readTogetherPct', { pct: p.church.percent })}</span>}
      </div>

      {p.joined && earlier.length > 0 && (
        <div className="stack" style={{ gap: 6 }}>
          <button type="button" className="link-btn small" style={{ alignSelf: 'flex-start' }} onClick={() => setShowEarlier(!showEarlier)}>{t('readCatchUp')} {showEarlier ? '▴' : '▾'}</button>
          {showEarlier && earlier.map((r) => (
            <label key={r.day} className="row small" style={{ gap: 8, alignItems: 'center' }}>
              <input type="checkbox" checked={p.done.includes(r.day)} disabled={tick.busy} onChange={async (e) => { const d = await tick.run(r.day, e.target.checked); if (d) onData(d); }} />
              <span className="muted" style={{ minWidth: 52 }}>{t('readDay', { day: r.day, total: p.totalDays }).split(' ').slice(0, 2).join(' ')}</span>
              <span>{r.local}</span>
            </label>
          ))}
        </div>
      )}

      {!p.joined ? (
        <button className="btn primary" style={{ alignSelf: 'flex-start' }} disabled={join.busy || !!ended} onClick={async () => { const d = await join.run(); if (d) { onData(d); toast(t('readJoined', { day: p.today ?? 1 })); } }}>{t('readJoin')}</button>
      ) : (
        <button className="btn ghost sm" style={{ alignSelf: 'flex-start' }} disabled={leave.busy} onClick={async () => { const d = await leave.run(); if (d) { onData(d); toast(t('readLeft')); } }}>{t('readLeave')}</button>
      )}
    </div>
  );
}
