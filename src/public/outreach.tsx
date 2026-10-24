// /outreach/:token: the public sign-up for a free clinic, tuition evening or job fair the church
// runs for its neighbourhood. Name, mobile number and what help they need; a reminder comes the day
// before. No sign-in. The words come in the visitor's language, with a picker for six languages.
import { CalendarDays, CheckCircle2, MapPin } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router';

import { PublicApi } from '@/api/endpoints';
import type { PublicOutreach } from '@/core/types';
import { Field, FormError, Loading } from '@/components/ui';
import { useStrings } from '@/i18n';
import { formatDay } from '@/lib/format';
import { useAction } from '@/lib/use-api';

import { Shell } from './public';

const LANGS = [['en', 'English'], ['hi', 'हिन्दी'], ['te', 'తెలుగు'], ['ta', 'தமிழ்'], ['ml', 'മലയാളം'], ['kn', 'ಕನ್ನಡ']] as const;
const guess = () => {
  const l = (typeof navigator !== 'undefined' ? navigator.language : 'en').slice(0, 2);
  return LANGS.some(([c]) => c === l) ? l : 'en';
};

export function PublicOutreachPage() {
  const { token = '' } = useParams();
  const [lang, setLang] = useState<string>(guess);
  const { t } = useStrings(lang);
  const [data, setData] = useState<PublicOutreach | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({ name: '', phone: '', need: '', area: '', remind: true, website: '' });
  const [done, setDone] = useState<'new' | 'again' | null>(null);
  const load = () => PublicApi.outreach(token).then((o) => { setData(o); document.title = o.title; }, (e: Error) => setError(e.message));
  useEffect(() => { void load(); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps
  const send = useAction(async (e: FormEvent) => {
    e.preventDefault();
    const r = await PublicApi.outreachSignup(token, f);
    setDone(r.again ? 'again' : 'new');
  });
  const fields = (send.error as { fields?: Record<string, string> } | null)?.fields ?? {};
  if (error) return <Shell><div className="card card-pad pub-form muted">{error}</div></Shell>;
  if (!data) return <Shell><Loading /></Shell>;
  return (
    <Shell churchName={data.church}>
      <article className="card card-pad stack lg pub-form" style={{ alignItems: 'stretch' }}>
        <div className="row wrap" style={{ gap: 6, justifyContent: 'flex-end' }}>
          {LANGS.map(([c, label]) => <button key={c} type="button" className={`btn sm ${lang === c ? 'primary' : 'ghost'}`} onClick={() => setLang(c)} lang={c}>{label}</button>)}
        </div>
        <div className="stack" style={{ gap: 6 }}>
          <span className="eyebrow">{t('outFree')}</span>
          <h1 style={{ margin: 0, textWrap: 'balance' }}>{data.title}</h1>
          <span className="row" style={{ gap: 6 }}><CalendarDays size={16} /> {formatDay(`${data.date}T12:00:00`)}{data.startTime && `, ${data.startTime}${data.endTime ? `–${data.endTime}` : ''}`}</span>
          {data.place && <span className="row" style={{ gap: 6 }}><MapPin size={16} /> {data.place}</span>}
          {data.about && <p className="pub-prose" style={{ margin: 0 }}>{data.about}</p>}
          <span className="small muted">{t('outBy', { church: data.church })}</span>
        </div>
        {done ? (
          <div className="row" style={{ gap: 10 }}><CheckCircle2 size={28} style={{ color: 'var(--primary)', flex: 'none' }} /><b>{t(done === 'again' ? 'outAgain' : 'outDone')}</b></div>
        ) : !data.open ? <div className="card card-pad muted">{t('outClosed')}</div> : data.full ? <div className="card card-pad muted">{t('outFull')}</div> : (
          <form className="stack" onSubmit={(e) => void send.run(e)}>
            <h2 style={{ margin: 0 }}>{t('outRegister')}</h2>
            <Field label={t('outName')} error={fields.name}><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={80} autoComplete="name" required /></Field>
            <Field label={t('outPhone')} error={fields.phone}><input className="input" type="tel" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} maxLength={20} autoComplete="tel" required /></Field>
            <Field label={t('outNeed')}><input className="input" value={f.need} onChange={(e) => setF({ ...f, need: e.target.value })} maxLength={200} /></Field>
            <Field label={t('outArea')}><input className="input" value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })} maxLength={80} /></Field>
            <input tabIndex={-1} aria-hidden="true" autoComplete="off" style={{ position: 'absolute', left: '-9999px' }} value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} />
            <label className="row small" style={{ gap: 8 }}><input type="checkbox" checked={f.remind} onChange={(e) => setF({ ...f, remind: e.target.checked })} /> {t('outRemind')}</label>
            <FormError error={send.error} />
            <div><button className="btn primary lg" disabled={send.busy}>{t('outRegister')}</button></div>
          </form>
        )}
      </article>
    </Shell>
  );
}
