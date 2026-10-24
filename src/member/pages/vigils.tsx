// Prayer vigils from the member's side: take an hour in a prayer chain or a day in a fasting chain,
// see how much of it is covered, and give a slot up if plans change.
import { Check, Hourglass, HandHeart } from 'lucide-react';
import { useState } from 'react';

import { MemberApi } from '@/api/endpoints';
import type { MyVigil } from '@/core/types';
import { ErrorState, FormError, Loading, useToast } from '@/components/ui';
import { useT } from '@/i18n';
import { formatDay, formatTime } from '@/lib/format';
import { useAction, useApi } from '@/lib/use-api';

export function MemberVigilsPage() {
  const { t } = useT();
  const { data, error, reload, setData } = useApi(MemberApi.vigils.get);
  return (
    <>
      <div>
        <h1>{t('vigilTitle')}</h1>
        <p className="muted">{t('vigilBody')}</p>
      </div>
      {error ? <ErrorState error={error} onRetry={reload} /> : !data ? <Loading /> : data.vigils.length === 0 ? (
        <div className="card card-pad stack" style={{ alignItems: 'center', textAlign: 'center' }}><Hourglass size={28} /><p className="muted" style={{ margin: 0 }}>{t('vigilNone')}</p></div>
      ) : (
        <div className="stack">{data.vigils.map((v) => <VigilCard key={v.id} v={v} onData={setData} />)}</div>
      )}
    </>
  );
}

function VigilCard({ v, onData }: { v: MyVigil; onData: (d: { vigils: MyVigil[] }) => void }) {
  const { t, locale } = useT();
  const toast = useToast();
  const [openOnly, setOpenOnly] = useState(false);
  const take = useAction(async (start: string) => { onData(await MemberApi.vigils.take(v.id, start)); toast(t('vigilThanks')); });
  const leave = useAction(async (start: string) => onData(await MemberApi.vigils.leave(v.id, start)));
  const day = v.slotMinutes >= 1440;
  const label = (s: { start: string; end: string }) => (day ? formatDay(s.start, locale) : `${formatTime(s.start, locale)}–${formatTime(s.end, locale)}`);
  const now = new Date().toISOString();
  const upcoming = v.slots.filter((s) => s.end > now);
  const mine = upcoming.filter((s) => s.mine);
  const groups = new Map<string, typeof upcoming>();
  for (const s of upcoming) {
    if (openOnly && (s.count > 0 || s.mine)) continue;
    const k = day ? '' : formatDay(s.start, locale);
    groups.set(k, [...(groups.get(k) ?? []), s]);
  }
  const pct = v.slots.length ? Math.round((100 * v.covered) / v.slots.length) : 0;
  return (
    <div className="card card-pad stack">
      <div className="row wrap" style={{ gap: 8, alignItems: 'baseline', justifyContent: 'space-between' }}>
        <b style={{ fontSize: 18 }}>{v.name}</b>
        <span className={`badge ${v.kind === 'fasting' ? 'warn' : 'ok'}`}>{v.kind === 'fasting' ? t('vigilFasting') : t('vigilPrayer')}</span>
      </div>
      {v.purpose && <p className="muted small" style={{ margin: 0 }}>{v.purpose}</p>}
      <div className="small muted">{formatDay(v.startsAt, locale)}, {formatTime(v.startsAt, locale)} – {formatDay(v.endsAt, locale)}, {formatTime(v.endsAt, locale)}{v.location ? ` · ${v.location}` : ''}</div>
      <div style={{ height: 8, borderRadius: 99, background: 'var(--tint)', overflow: 'hidden' }}><div style={{ width: `${pct}%`, height: '100%', background: 'var(--primary)' }} /></div>
      <span className="small">{t('vigilCovered', { covered: v.covered, total: v.slots.length })}</span>
      {mine.length > 0 && (
        <div className="stack" style={{ gap: 6, padding: '10px 12px', borderRadius: 12, background: 'color-mix(in srgb, var(--primary) 8%, transparent)' }}>
          <span className="small muted">{t('vigilMine')}</span>
          {mine.map((s) => (
            <div key={s.start} className="row" style={{ justifyContent: 'space-between' }}>
              <b>{day ? label(s) : `${formatDay(s.start, locale)}, ${label(s)}`}</b>
              <button className="btn ghost sm" disabled={leave.busy} onClick={() => void leave.run(s.start)}>{t('vigilLeave')}</button>
            </div>
          ))}
        </div>
      )}
      <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} /> {t('vigilOpenOnly')}</label>
      <FormError error={take.error ?? leave.error} />
      {[...groups].map(([g, slots]) => (
        <div key={g} className="stack" style={{ gap: 6 }}>
          {g && <span className="small muted">{g}</span>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 6 }}>
            {slots.map((s) => (
              <button
                key={s.start}
                className={`btn sm ${s.mine ? 'primary' : ''}`}
                style={{ justifyContent: 'space-between', opacity: s.full && !s.mine ? 0.55 : 1, borderStyle: s.count || s.mine ? 'solid' : 'dashed' }}
                disabled={take.busy || (s.full && !s.mine)}
                onClick={() => void (s.mine ? leave.run(s.start) : take.run(s.start))}
              >
                <span>{label(s)}</span>
                <span className="small">{s.mine ? <Check size={14} /> : s.full ? t('vigilFull') : s.count ? <><HandHeart size={14} className="inline-icon" /> {s.count}</> : t('vigilTake')}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
