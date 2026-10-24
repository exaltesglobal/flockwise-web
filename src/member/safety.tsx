// Safety alert: one discreet button for a member or pastor facing threats, violence, a mob or the
// police. Press and hold for two seconds (so a pocket cannot set it off); the chosen leaders and
// legal help are told at once and the location is shared for the time the church set. While the
// page is open the location keeps updating. Leaders chosen to respond see live alerts here too.
import { MapPin, Phone, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router';

import { MemberApi } from '@/api/endpoints';
import type { MySafety, SafetyAlertKind, SafetyAlertView } from '@/core/types';
import { ErrorState, FormError, Loading } from '@/components/ui';
import { useT, type StringKey } from '@/i18n';
import { formatTime } from '@/lib/format';
import { useAction, useApi } from '@/lib/use-api';

const KINDS: [SafetyAlertKind, StringKey][] = [['threat', 'safThreat'], ['violence', 'safViolence'], ['police', 'safPolice'], ['mob', 'safMob'], ['medical', 'safMedical'], ['other', 'safOther']];
const HOLD_MS = 2000;
const mapUrl = (l: { lat: number; lng: number }) => `https://maps.google.com/?q=${l.lat},${l.lng}`;

/** One reading of where the phone is, or null after a few seconds. */
function here(): Promise<{ lat: number; lng: number; accuracy: number } | null> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition((p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }), () => resolve(null), { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 });
  });
}

export function MemberSafetyPage() {
  const { t } = useT();
  const { id } = useParams();
  const q = useApi(MemberApi.safety.get);
  const [noLocation, setNoLocation] = useState(false);
  const data = q.data;
  const active = data?.alert ?? null;

  // While an alert is running and sharing, send the location every minute the page is open.
  useEffect(() => {
    if (!active?.sharing || !('geolocation' in navigator)) return;
    let last = 0;
    const w = navigator.geolocation.watchPosition(
      (p) => {
        if (Date.now() - last < 60_000) return;
        last = Date.now();
        void MemberApi.safety.location({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }).then(q.setData).catch(() => undefined);
      },
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 30000 },
    );
    const poll = setInterval(() => void q.reload(), 30_000);
    return () => { navigator.geolocation.clearWatch(w); clearInterval(poll); };
  }, [active?.id, active?.sharing]); // eslint-disable-line react-hooks/exhaustive-deps

  if (q.error) return <ErrorState error={q.error} onRetry={q.reload} />;
  if (!data) return <Loading />;
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div>
        <h1>{t('safTitle')}</h1>
        {!active && <p className="muted">{t('safIntro', { mins: data.shareMinutes })}</p>}
      </div>
      {active ? <Active a={active} noLocation={noLocation} onChange={q.setData} /> : !data.ready ? <div className="card card-pad">{t('safNotReady')}</div> : <Raise onRaised={(d, located) => { setNoLocation(!located); q.setData(d); }} />}
      <a className="btn" href="tel:112"><Phone size={16} /> {t('safCall')}</a>
      {data.responding.length > 0 && (
        <section className="stack" style={{ gap: 10 }}>
          <h3 style={{ margin: 0 }}>{t('safRespondTitle')}</h3>
          {data.responding.map((a) => <Respond key={a.id} a={a} focus={a.id === id} onChange={q.setData} />)}
        </section>
      )}
      <p className="small muted">{t('safPrivate')}</p>
    </div>
  );
}

function Raise({ onRaised }: { onRaised: (d: MySafety, located: boolean) => void }) {
  const { t } = useT();
  const [kind, setKind] = useState<SafetyAlertKind>('threat');
  const [note, setNote] = useState('');
  const [progress, setProgress] = useState(0);
  const timer = useRef<number | null>(null);
  const started = useRef(0);
  const send = useAction(async () => {
    const loc = await here();
    onRaised(await MemberApi.safety.alert({ kind, note: note.trim() || undefined, ...(loc ?? {}) }), !!loc);
  });
  const stop = () => {
    if (timer.current) cancelAnimationFrame(timer.current);
    timer.current = null;
    setProgress(0);
  };
  const tick = () => {
    const p = Math.min(1, (Date.now() - started.current) / HOLD_MS);
    setProgress(p);
    if (p >= 1) { stop(); void send.run(); return; }
    timer.current = requestAnimationFrame(tick);
  };
  const start = () => {
    if (send.busy) return;
    started.current = Date.now();
    timer.current = requestAnimationFrame(tick);
  };
  useEffect(() => stop, []);
  return (
    <div className="card card-pad stack" style={{ gap: 12 }}>
      <b>{t('safWhat')}</b>
      <div className="row wrap" style={{ gap: 6 }}>
        {KINDS.map(([k, key]) => <button key={k} type="button" className={`btn sm${kind === k ? ' primary' : ''}`} onClick={() => setKind(k)}>{t(key)}</button>)}
      </div>
      <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('safNote')} maxLength={300} />
      <FormError error={send.error} />
      <button
        type="button"
        className="btn danger"
        style={{ position: 'relative', overflow: 'hidden', padding: '18px 16px', fontSize: '1.05rem', touchAction: 'none', userSelect: 'none' }}
        disabled={send.busy}
        onPointerDown={start}
        onPointerUp={stop}
        onPointerLeave={stop}
        onPointerCancel={stop}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !timer.current) start(); }}
        onKeyUp={stop}
      >
        <span style={{ position: 'absolute', inset: 0, width: `${progress * 100}%`, background: 'rgba(0,0,0,.25)' }} />
        <span style={{ position: 'relative' }}><ShieldAlert size={18} style={{ verticalAlign: '-3px' }} /> {progress > 0 ? t('safHolding') : t('safHold')}</span>
      </button>
    </div>
  );
}

function Active({ a, noLocation, onChange }: { a: SafetyAlertView; noLocation: boolean; onChange: (d: MySafety) => void }) {
  const { t, locale } = useT();
  const safe = useAction(async () => onChange(await MemberApi.safety.safe()));
  return (
    <div className="card card-pad stack" style={{ gap: 10, borderLeft: '4px solid var(--danger)' }}>
      <b style={{ fontSize: '1.1rem' }}><ShieldAlert size={18} color="var(--danger)" style={{ verticalAlign: '-3px' }} /> {t('safSent')}</b>
      <span>{a.sharing ? t('safSharing', { time: formatTime(a.shareUntil, locale) }) : t('safNotSharing')}</span>
      {noLocation && <span className="small muted">{t('safLocationOff')}</span>}
      {a.note && <span className="small muted">{t('safSaid', { note: a.note })}</span>}
      {a.acks.length > 0 && (
        <div className="stack" style={{ gap: 4 }}>
          <span className="badge ok" style={{ alignSelf: 'flex-start' }}>{t('safResponding', { n: a.acks.length })}</span>
          {a.acks.map((x) => <span key={x.personId} className="small"><b>{x.name}</b>{x.note ? `: ${x.note}` : ''} · {formatTime(x.at, locale)}</span>)}
        </div>
      )}
      <FormError error={safe.error} />
      <button className="btn primary" disabled={safe.busy} onClick={() => safe.run()}><ShieldCheck size={16} /> {t('safSafe')}</button>
    </div>
  );
}

function Respond({ a, focus, onChange }: { a: SafetyAlertView; focus: boolean; onChange: (d: MySafety) => void }) {
  const { t, locale } = useT();
  const [note, setNote] = useState('');
  const respond = useAction(async () => { onChange(await MemberApi.safety.respond(a.id, note.trim())); setNote(''); });
  const kind = KINDS.find(([k]) => k === a.kind)?.[1] ?? 'safOther';
  const ended = a.status !== 'active';
  return (
    <div className="card card-pad stack" style={{ gap: 8, borderLeft: `4px solid ${ended ? 'var(--border)' : 'var(--danger)'}`, outline: focus ? '2px solid var(--primary)' : undefined }}>
      <div className="row between wrap" style={{ gap: 6 }}>
        <b>{a.name}</b>
        {ended ? <span className="badge gray">{a.status === 'safe' ? t('safSafeNow') : t('safEnded')}</span> : <span className="badge danger">{t(kind)}</span>}
      </div>
      {a.note && <span>“{a.note}”</span>}
      <span className="small muted">{formatTime(a.startedAt, locale)}</span>
      {!ended && (
        <>
          <div className="row wrap" style={{ gap: 6 }}>
            {a.phone && <a className="btn sm" href={`tel:${a.phone}`}><Phone size={14} /> {a.phone}</a>}
            {a.location ? <a className="btn sm" href={mapUrl(a.location)} target="_blank" rel="noreferrer"><MapPin size={14} /> {t('safOpenMap')}</a> : <span className="small muted">{t('safNoLocation')}</span>}
          </div>
          {a.location && <span className="small muted">{t('safLastSeen', { time: formatTime(a.location.at, locale) })}{a.location.accuracy ? ` · ±${a.location.accuracy} m` : ''}</span>}
        </>
      )}
      {a.acks.length > 0 && <span className="small">{a.acks.map((x) => `${x.name}${x.note ? `: ${x.note}` : ''}`).join(' · ')}</span>}
      {!ended && (
        <div className="row wrap" style={{ gap: 6 }}>
          <input className="input grow" style={{ minWidth: 160 }} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('safRespondNote')} />
          <button className="btn primary sm" disabled={respond.busy} onClick={() => respond.run()}>{t('safRespond')}</button>
        </div>
      )}
      <FormError error={respond.error} />
    </div>
  );
}
