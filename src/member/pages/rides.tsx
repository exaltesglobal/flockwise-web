// Sunday lift, from the member's side: ask for a ride to the service for the household, or offer
// the seats spare in the car, and see who is driving once the office has matched.
import { Car, Phone, Users } from 'lucide-react';
import { useState } from 'react';

import { MemberApi } from '@/api/endpoints';
import { ErrorState, Field, FormError, Loading, useToast } from '@/components/ui';
import { useT } from '@/i18n';
import { formatDay } from '@/lib/format';
import { useAction, useApi } from '@/lib/use-api';

const day = (d: string, locale: string) => formatDay(`${d}T12:00:00`, locale);

export function MemberRidesPage() {
  const { t, locale } = useT();
  const toast = useToast();
  const [sunday, setSunday] = useState('');
  const { data, error, reload } = useApi(() => MemberApi.rides.get(sunday || undefined), [sunday]);
  const [mode, setMode] = useState<'need' | 'drive' | null>(null);
  const [n, setN] = useState('2');
  const [weekly, setWeekly] = useState(false);
  const [note, setNote] = useState('');
  const ask = useAction(() => MemberApi.rides.request({ sunday: data!.sunday, people: Number(n), weekly, note }));
  const offer = useAction(() => MemberApi.rides.offer({ sunday: data!.sunday, seats: Number(n), weekly, note }));
  const cancelAsk = useAction(() => MemberApi.rides.cancelRequest(data!.sunday));
  const cancelOffer = useAction(() => MemberApi.rides.cancelOffer(data!.sunday));
  return (
    <>
      <div>
        <h1>{t('ridesTitle')}</h1>
        <p className="muted">{t('ridesBody')}</p>
      </div>
      {error ? <ErrorState error={error} onRetry={reload} /> : !data ? <Loading /> : (
        <div className="stack">
          <div className="row wrap" style={{ gap: 10, alignItems: 'center' }}>
            <select className="select" style={{ width: 'auto' }} value={data.sunday} onChange={(e) => { setSunday(e.target.value); setMode(null); }} aria-label={t('ridesSunday')}>
              {data.sundays.map((s) => <option key={s} value={s}>{day(s, locale)}</option>)}
            </select>
            {data.serviceTime && <span className="small muted">{t('ridesServiceAt', { time: data.serviceTime })}</span>}
          </div>

          {data.request && (
            <div className="card card-pad stack" style={{ gap: 8 }}>
              <div className="row" style={{ gap: 8 }}><Users size={18} /><b>{t('ridesRequested', { n: data.request.people })}</b>{data.request.weekly && <span className="badge gray">{t('ridesWeekly')}</span>}</div>
              {data.request.driver ? (
                <>
                  <p style={{ margin: 0 }}>{t('ridesPickup', { name: data.request.driver.name })}</p>
                  {data.request.driver.phone && <a className="btn sm" href={`tel:${data.request.driver.phone.replace(/\s/g, '')}`} style={{ alignSelf: 'flex-start' }}><Phone size={14} /> {t('ridesCall')} {data.request.driver.phone}</a>}
                </>
              ) : <p className="muted small" style={{ margin: 0 }}>{t('ridesWaiting')}</p>}
              <button className="btn ghost sm" style={{ alignSelf: 'flex-start' }} disabled={cancelAsk.busy} onClick={async () => { if (await cancelAsk.run()) { toast(t('ridesCancelled')); reload(); } }}>{t('ridesNotThisSunday')}</button>
            </div>
          )}

          {data.offer && (
            <div className="card card-pad stack" style={{ gap: 8 }}>
              <div className="row" style={{ gap: 8 }}><Car size={18} /><b>{t('ridesOffered', { n: data.offer.seats })}</b>{data.offer.weekly && <span className="badge gray">{t('ridesWeekly')}</span>}</div>
              {data.offer.riders.length ? (
                <div className="stack" style={{ gap: 6 }}>
                  <span className="small muted">{t('ridesRiders')}</span>
                  {data.offer.riders.map((r) => (
                    <div key={r.id} className="small"><b>{r.familyName}</b> ({r.people}){r.address ? ` · ${r.address}` : ''}{r.phone ? <> · <a href={`tel:${r.phone.replace(/\s/g, '')}`}>{r.phone}</a></> : null}{r.note ? <div className="muted">{r.note}</div> : null}</div>
                  ))}
                </div>
              ) : <p className="muted small" style={{ margin: 0 }}>{t('ridesNoRiders')}</p>}
              <button className="btn ghost sm" style={{ alignSelf: 'flex-start' }} disabled={cancelOffer.busy} onClick={async () => { if (await cancelOffer.run()) { toast(t('ridesCancelled')); reload(); } }}>{t('ridesNotThisSunday')}</button>
            </div>
          )}

          {!data.request && !data.offer && !mode && (
            <div className="grid cols-2">
              <button className="card card-pad stack" style={{ alignItems: 'center', cursor: 'pointer' }} onClick={() => { setMode('need'); setN('2'); }}><Users size={28} /><b>{t('ridesNeed')}</b></button>
              <button className="card card-pad stack" style={{ alignItems: 'center', cursor: 'pointer' }} onClick={() => { setMode('drive'); setN('3'); }}><Car size={28} /><b>{t('ridesDrive')}</b></button>
            </div>
          )}

          {!data.request && !data.offer && mode && (
            <div className="card card-pad stack">
              <b>{mode === 'need' ? t('ridesNeed') : t('ridesDrive')}</b>
              <Field label={mode === 'need' ? t('ridesPeople') : t('ridesSeats')}><input className="input" type="number" min={1} max={mode === 'need' ? 12 : 20} value={n} onChange={(e) => setN(e.target.value)} style={{ width: 120 }} /></Field>
              <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={weekly} onChange={(e) => setWeekly(e.target.checked)} /> {t('ridesWeekly')}</label>
              <Field label={t('ridesNote')}><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
              <FormError error={ask.error ?? offer.error} />
              <div className="row wrap" style={{ gap: 8 }}>
                <button className="btn primary" disabled={ask.busy || offer.busy || !Number(n)} onClick={async () => { if (await (mode === 'need' ? ask : offer).run()) { setMode(null); toast(t('ridesSaved')); reload(); } }}>{mode === 'need' ? t('ridesAsk') : t('ridesOffer')}</button>
                <button className="btn ghost" onClick={() => setMode(null)}>{t('cancel')}</button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
