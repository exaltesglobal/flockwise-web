// Prayer walk: the church's neighbourhood on a map, street by street. Green streets were prayed for
// this cycle, orange ones are still waiting. Walk a street, tap it on the map (or pick it from the
// streets near you) and mark it walked. Prayer points from the church are shown while walking.
import { Footprints, LocateFixed, Undo2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { MemberApi } from '@/api/endpoints';
import type { PrayerWalkView, WalkStreetView } from '@/core/types';
import { ErrorState, FormError, Loading, useToast } from '@/components/ui';
import { distance, WalkLegend, WalkMap, type LatLng } from '@/components/walk-map';
import { useT } from '@/i18n';
import { formatDate } from '@/lib/format';
import { useAction, useApi } from '@/lib/use-api';

const away = (here: LatLng, s: WalkStreetView) => Math.min(...s.path.map((p) => distance(here, p)));

export function MemberPrayerWalkPage() {
  const { t } = useT();
  const q = useApi(MemberApi.prayerWalk.get);
  if (q.error) return <ErrorState error={q.error} onRetry={q.reload} />;
  if (!q.data) return <Loading />;
  const d = q.data;
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div>
        <h1>{t('waTitle')}</h1>
        <p className="muted">{t('waIntro')}</p>
      </div>
      {!d.area.center || !d.streets.length ? <div className="card card-pad">{t('waNotSet')}</div> : <Walk d={d} onChange={q.setData} />}
    </div>
  );
}

function Walk({ d, onChange }: { d: PrayerWalkView; onChange: (v: PrayerWalkView) => void }) {
  const { t, locale } = useT();
  const toast = useToast();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [note, setNote] = useState('');
  const [here, setHere] = useState<LatLng | null>(null);
  const [locating, setLocating] = useState(false);
  const [locOff, setLocOff] = useState(false);

  // While the walker has asked to see where they are, follow them.
  useEffect(() => {
    if (!locating || !('geolocation' in navigator)) return;
    const w = navigator.geolocation.watchPosition(
      (p) => { setHere({ lat: p.coords.latitude, lng: p.coords.longitude }); setLocOff(false); },
      () => { setLocOff(true); setLocating(false); },
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 15000 },
    );
    return () => navigator.geolocation.clearWatch(w);
  }, [locating]);

  const near = useMemo(() => (here ? d.streets.filter((s) => !s.covered).map((s) => ({ s, m: away(here, s) })).filter((x) => x.m < 1500).sort((a, b) => a.m - b.m).slice(0, 5) : []), [here, d.streets]);
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const done = useAction(async () => {
    const n = picked.size;
    onChange(await MemberApi.prayerWalk.walked([...picked], note.trim() || undefined));
    setPicked(new Set());
    setNote('');
    toast(t('waThanks', { n }));
  });
  const undo = useAction(async (id: string) => onChange(await MemberApi.prayerWalk.undo(id)));
  const s = d.stats;
  const chosen = d.streets.filter((x) => picked.has(x.id));
  const last = chosen.length === 1 ? chosen[0] : null;

  return (
    <>
      <section className="card card-pad stack" style={{ gap: 8 }}>
        <b>{t('waProgress', { percent: s.percent, area: d.area.name || t('waTheArea'), days: d.area.cycleDays })}</b>
        <div style={{ height: 10, borderRadius: 6, background: 'var(--border)', overflow: 'hidden' }}>
          <div style={{ width: `${s.percent}%`, height: '100%', background: 'var(--ok)' }} />
        </div>
        <span className="small muted">{t('waLeft', { n: s.streets - s.covered })}{d.myStreets ? ` · ${t('waMine', { n: d.myStreets })}` : ''}</span>
      </section>

      <section className="stack" style={{ gap: 8 }}>
        <WalkMap center={d.area.center!} radius={d.area.radius} streets={d.streets} selected={picked} here={here} height={400} onStreet={toggle} />
        <div className="row between wrap" style={{ gap: 8 }}>
          <WalkLegend covered={t('waCovered')} uncovered={t('waUncovered')} picked={t('waChosen')} />
          {!locating && <button className="btn sm" onClick={() => setLocating(true)}><LocateFixed size={14} /> {t('waShowMe')}</button>}
        </div>
        {locOff && <span className="small muted">{t('waLocOff')}</span>}
      </section>

      {near.length > 0 && (
        <section className="card card-pad stack" style={{ gap: 6 }}>
          <b>{t('waNear')}</b>
          {near.map(({ s: x, m }) => (
            <label key={x.id} className="check"><input type="checkbox" checked={picked.has(x.id)} onChange={() => toggle(x.id)} /><span>{x.name} <span className="small muted">· {t('waAway', { m: Math.round(m / 10) * 10 })}</span></span></label>
          ))}
        </section>
      )}

      <section className="card card-pad stack" style={{ gap: 10 }}>
        {chosen.length === 0 ? <span className="muted">{t('waTap')}</span> : (
          <>
            <div className="row wrap" style={{ gap: 6 }}>
              {chosen.map((x) => <button key={x.id} className="badge" style={{ border: 'none', cursor: 'pointer' }} onClick={() => toggle(x.id)}>{x.name} ×</button>)}
              <button className="btn ghost sm" onClick={() => setPicked(new Set())}>{t('waClear')}</button>
            </div>
            {last && <span className="small muted">{last.lastWalkedAt ? t('waLastWalked', { date: formatDate(last.lastWalkedAt, locale) }) : t('waNever')}</span>}
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('waNote')} maxLength={300} />
            <FormError error={done.error ?? undo.error} />
            <div className="row wrap" style={{ gap: 8 }}>
              <button className="btn primary" disabled={done.busy} onClick={() => done.run()}><Footprints size={16} /> {t('waDone', { n: chosen.length })}</button>
              {last?.mine && last.covered && <button className="btn" disabled={undo.busy} onClick={() => undo.run(last.id)}><Undo2 size={15} /> {t('waUndo')}</button>}
            </div>
          </>
        )}
      </section>

      {d.area.prompts.length > 0 && (
        <section className="card card-pad stack" style={{ gap: 6 }}>
          <b>{t('waPray')}</b>
          <ul style={{ margin: 0, paddingLeft: 20 }} className="stack">
            {d.area.prompts.map((p) => <li key={p}>{p}</li>)}
          </ul>
        </section>
      )}

      {d.recent.length > 0 && (
        <section className="stack" style={{ gap: 6 }}>
          <h3 style={{ margin: 0 }}>{t('waRecent')}</h3>
          {d.recent.slice(0, 6).map((r, i) => <span key={i} className="small"><b>{r.name}</b> · {r.streetName} · <span className="muted">{formatDate(r.at, locale)}</span></span>)}
        </section>
      )}
    </>
  );
}
