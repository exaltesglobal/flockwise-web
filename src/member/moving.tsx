// Moving away: a member who is moving to another city tells the church, sees churches there that
// their church knows, and can ask to be introduced. Nothing is shared without their tick.
import { Check, MapPinned } from 'lucide-react';
import { useState } from 'react';

import { MemberApi } from '@/api/endpoints';
import type { MyMove, PartnerChurch } from '@/core/types';
import { ErrorState, FormError, Loading } from '@/components/ui';
import { useT } from '@/i18n';
import { formatDay } from '@/lib/format';
import { useAction, useApi } from '@/lib/use-api';

export function MemberMovingPage() {
  const { t } = useT();
  const q = useApi(() => MemberApi.move.get());
  return (
    <div className="stack">
      <div>
        <h1>{t('moveTitle')}</h1>
        <p className="muted">{t('moveIntro')}</p>
      </div>
      {q.error ? <ErrorState error={q.error} onRetry={q.reload} /> : !q.data ? <Loading /> : <MoveForm data={q.data} onSaved={q.setData} />}
    </div>
  );
}

function MoveForm({ data, onSaved }: { data: MyMove; onSaved: (d: MyMove) => void }) {
  const { t, locale } = useT();
  const m = data.move;
  const [city, setCity] = useState(m?.toCity ?? '');
  const [on, setOn] = useState(m?.movingOn ?? '');
  const [note, setNote] = useState(m?.note ?? '');
  const [suggestions, setSuggestions] = useState<PartnerChurch[]>(data.suggestions);
  const [pick, setPick] = useState('');
  const [consent, setConsent] = useState(false);
  const [looked, setLooked] = useState('');
  const look = useAction(async () => { const r = await MemberApi.move.get(city.trim()); setSuggestions(r.suggestions); setLooked(city.trim()); });
  const save = useAction(async () => {
    const r = await MemberApi.move.save({ toCity: city.trim(), movingOn: on || undefined, note: note.trim() || undefined, partnerRef: pick || undefined, consent: pick ? consent : undefined });
    onSaved(r); setSuggestions(r.suggestions); setPick(''); setConsent(false);
  });
  const introduced = m && m.status !== 'planning';

  if (introduced) {
    return (
      <div className="card card-pad stack" style={{ gap: 8 }}>
        <div className="row" style={{ gap: 10 }}><Check size={22} /><b>{m.partner ? t(m.introText ? 'movePending' : 'moveIntroduced', { church: m.partner.name }) : t('moveSaved')}</b></div>
        <p className="small muted" style={{ margin: 0 }}>{m.toCity}{m.movingOn ? ` · ${formatDay(m.movingOn, locale)}` : ''}</p>
        {m.partner?.contact && <p className="small" style={{ margin: 0 }}>{t('moveContact')}: <span style={{ userSelect: 'all' }}>{m.partner.contact}</span></p>}
        {m.partner?.url && <a className="small" href={m.partner.url} target="_blank" rel="noreferrer">{m.partner.url}</a>}
      </div>
    );
  }

  return (
    <form className="stack" onSubmit={(e) => { e.preventDefault(); if (city.trim()) save.run(); }}>
      {m && <div className="card card-pad small row" style={{ gap: 8 }}><Check size={16} /> {t('moveSaved')}</div>}
      <div className="card card-pad stack" style={{ gap: 10 }}>
        <label className="stack" style={{ gap: 4 }}>
          <span className="small muted">{t('moveCity')}</span>
          <div className="row" style={{ gap: 8 }}>
            <input className="input grow" value={city} onChange={(e) => setCity(e.target.value)} placeholder={t('moveCityPh')} required />
            <button type="button" className="btn" disabled={!city.trim() || look.busy} onClick={() => look.run()}>{t('moveFind')}</button>
          </div>
        </label>
        <label className="stack" style={{ gap: 4 }}>
          <span className="small muted">{t('moveWhen')}</span>
          <input className="input" type="date" value={on} onChange={(e) => setOn(e.target.value)} />
        </label>
        <label className="stack" style={{ gap: 4 }}>
          <span className="small muted">{t('moveNote')}</span>
          <textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>

      {suggestions.length > 0 && (
        <div className="card card-pad stack" style={{ gap: 8 }}>
          <b className="row" style={{ gap: 8 }}><MapPinned size={18} /> {t('moveChurches', { city: city.trim() || m?.toCity || '' })}</b>
          {suggestions.map((c) => (
            <label key={c.ref} className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
              <input type="radio" name="partner" checked={pick === c.ref} onChange={() => setPick(c.ref)} />
              <span className="grow" style={{ minWidth: 0 }}>
                <b>{c.name}</b>
                <span className="small muted" style={{ display: 'block' }}>{c.city}{c.onFlockwise ? ' · Flockwise' : ''}</span>
              </span>
            </label>
          ))}
          {pick && (
            <label className="row small" style={{ gap: 8, alignItems: 'flex-start' }}>
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>{t('moveConsent')}</span>
            </label>
          )}
        </div>
      )}
      {suggestions.length === 0 && looked && looked === city.trim() && <p className="card card-pad small muted" style={{ margin: 0 }}>{t('moveNone', { city: looked })}</p>}
      {look.error && <FormError error={look.error} />}
      <FormError error={save.error} />
      <button className="btn primary" disabled={!city.trim() || save.busy || (!!pick && !consent)}>{pick ? t('moveIntroduce') : t('moveSave')}</button>
    </form>
  );
}
