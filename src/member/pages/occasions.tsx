// Ask the church for a wedding, funeral, baby dedication or house blessing, and follow the request
// until the office confirms the date and pastor.
import { Church } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import { MemberApi } from '@/api/endpoints';
import type { OccasionKind } from '@/core/types';
import { ErrorState, FormError, Loading, useToast } from '@/components/ui';
import { useT, type StringKey } from '@/i18n';
import { formatDay } from '@/lib/format';
import { useAction, useApi } from '@/lib/use-api';

const KINDS: OccasionKind[] = ['wedding', 'funeral', 'dedication', 'house_blessing', 'baptism', 'other'];
const KIND_KEY: Record<OccasionKind, StringKey> = { wedding: 'occWedding', funeral: 'occFuneral', dedication: 'occDedication', house_blessing: 'occHouse', baptism: 'occBaptism', other: 'occOther' };
const today = () => new Date().toISOString().slice(0, 10);

export function MemberOccasionsPage() {
  const { t, locale } = useT();
  const toast = useToast();
  const { data, error, reload, setData } = useApi(MemberApi.occasions.get);
  const [kind, setKind] = useState<OccasionKind | null>(null);
  const [date, setDate] = useState('');
  const [place, setPlace] = useState('');
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const send = useAction(async (e: FormEvent) => {
    e.preventDefault();
    if (!kind) return;
    setData(await MemberApi.occasions.request({ kind, date: date || undefined, place, title: kind === 'funeral' ? title : undefined, note }));
    setKind(null); setDate(''); setPlace(''); setTitle(''); setNote('');
    toast(t('occSent'));
  });
  const withdraw = useAction(async (id: string) => setData(await MemberApi.occasions.withdraw(id)));
  return (
    <>
      <div>
        <h1>{t('occTitle')}</h1>
        <p className="muted">{t('occBody')}</p>
      </div>
      {error ? <ErrorState error={error} onRetry={reload} /> : !data ? <Loading /> : (
        <div className="stack">
          {data.occasions.map((o) => (
            <div key={o.id} className="card card-pad stack" style={{ gap: 6 }}>
              <div className="row wrap" style={{ justifyContent: 'space-between', gap: 8 }}>
                <b>{o.title}</b>
                <span className={`badge ${o.status === 'scheduled' ? 'ok' : o.status === 'done' ? 'gray' : 'warn'}`}>{t(o.status === 'scheduled' ? 'occConfirmed' : o.status === 'done' ? 'occDone' : 'occWaiting')}</span>
              </div>
              <span className="small muted">
                {o.date ? formatDay(`${o.date}T12:00:00`, locale) : t('occNoDate')}{o.time ? `, ${o.time}` : ''}{o.place ? ` · ${o.place}` : ''}
                {o.pastorName && <> · {t('occPastor', { name: o.pastorName })}</>}
              </span>
              {o.status === 'requested' && <div><button className="btn sm ghost" disabled={withdraw.busy} onClick={() => void withdraw.run(o.id)}>{t('occWithdraw')}</button></div>}
            </div>
          ))}
          <FormError error={withdraw.error} />

          {!kind ? (
            <div className="card card-pad stack" style={{ gap: 10 }}>
              <b>{t('occAsk')}</b>
              <div className="oc-kinds">
                {KINDS.map((k) => <button key={k} className="btn" onClick={() => setKind(k)}>{t(KIND_KEY[k])}</button>)}
              </div>
            </div>
          ) : (
            <form className="card card-pad stack" style={{ gap: 10 }} onSubmit={send.run}>
              <b className="row" style={{ gap: 8 }}><Church size={18} /> {t(KIND_KEY[kind])}</b>
              {kind === 'funeral' && <p className="small muted" style={{ margin: 0 }}>{t('occFuneralNote')}</p>}
              {kind === 'funeral' && <label className="stack small" style={{ gap: 4 }}>{t('occWho')}<input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} required /></label>}
              <label className="stack small" style={{ gap: 4 }}>{t('occDate')}<input className="input" type="date" min={today()} value={date} onChange={(e) => setDate(e.target.value)} /></label>
              <label className="stack small" style={{ gap: 4 }}>{t('occPlace')}<input className="input" value={place} onChange={(e) => setPlace(e.target.value)} maxLength={200} /></label>
              <label className="stack small" style={{ gap: 4 }}>{t('occNote')}<textarea className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} /></label>
              <FormError error={send.error} />
              <div className="row" style={{ gap: 8 }}>
                <button className="btn primary" disabled={send.busy}>{t('occSend')}</button>
                <button type="button" className="btn ghost" onClick={() => setKind(null)}>{t('occBack')}</button>
              </div>
            </form>
          )}
        </div>
      )}
    </>
  );
}
