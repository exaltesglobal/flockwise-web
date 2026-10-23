// Discipleship from the member's side: the people I walk with (with "We met" to log a meeting) and
// the person walking with me.
import { Check, Footprints, Phone } from 'lucide-react';
import { useState } from 'react';

import { MemberApi } from '@/api/endpoints';
import type { MyMentoring } from '@/core/types';
import { ErrorState, FormError, Loading, useToast } from '@/components/ui';
import { useT } from '@/i18n';
import { formatDay } from '@/lib/format';
import { useAction, useApi } from '@/lib/use-api';

const day = (d: string, locale: string) => formatDay(`${d}T12:00:00`, locale);

export function MemberMentoringPage() {
  const { t, locale } = useT();
  const { data, error, reload, setData } = useApi(MemberApi.mentoring.get);
  return (
    <>
      <div>
        <h1>{t('mentorTitle')}</h1>
        <p className="muted">{t('mentorBody')}</p>
      </div>
      {error ? <ErrorState error={error} onRetry={reload} /> : !data ? <Loading /> : !data.mentees.length && !data.mentors.length ? (
        <div className="card card-pad stack" style={{ alignItems: 'center', textAlign: 'center' }}><Footprints size={28} /><p className="muted" style={{ margin: 0 }}>{t('mentorNone')}</p></div>
      ) : (
        <div className="stack">
          {data.mentors.length > 0 && (
            <div className="card card-pad stack" style={{ gap: 8 }}>
              <span className="small muted">{t('mentorMentors')}</span>
              {data.mentors.map((m) => (
                <div key={m.id} className="row" style={{ justifyContent: 'space-between' }}>
                  <div><b>{m.name}</b><div className="small muted">{m.lastMet ? t('mentorLast', { date: day(m.lastMet, locale) }) : t('mentorNever')}</div></div>
                  {m.phone && <a className="btn ghost sm" href={`tel:${m.phone.replace(/\s/g, '')}`}><Phone size={14} /> {t('mentorCall')}</a>}
                </div>
              ))}
            </div>
          )}
          {data.mentees.length > 0 && <span className="small muted">{t('mentorMentees')}</span>}
          {data.mentees.map((m) => <Mentee key={m.id} m={m} onData={setData} />)}
        </div>
      )}
    </>
  );
}

function Mentee({ m, onData }: { m: MyMentoring['mentees'][number]; onData: (d: MyMentoring) => void }) {
  const { t, locale } = useT();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState('');
  const save = useAction(async () => { onData(await MemberApi.mentoring.met(m.id, { date: new Date().toISOString().slice(0, 10), topic })); setOpen(false); setTopic(''); toast(t('mentorSaved')); });
  return (
    <div className="card card-pad stack" style={{ gap: 8 }}>
      <div className="row wrap" style={{ justifyContent: 'space-between', gap: 8 }}>
        <b style={{ fontSize: 18 }}>{m.name}</b>
        {m.overdue ? <span className="badge warn">{t('mentorOverdue')}</span> : <span className="small muted">{t('mentorDue', { date: day(m.dueOn, locale) })}</span>}
      </div>
      {m.goal && <p className="small" style={{ margin: 0 }}>{m.goal}</p>}
      <span className="small muted">{m.lastMet ? t('mentorLast', { date: day(m.lastMet, locale) }) : t('mentorNever')}{m.recent[0]?.topic ? ` · ${m.recent[0].topic}` : ''}</span>
      {open ? (
        <div className="stack" style={{ gap: 8 }}>
          <input className="input" value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={120} placeholder={t('mentorTopic')} autoFocus />
          <FormError error={save.error} />
          <div><button className="btn primary" disabled={save.busy} onClick={() => void save.run()}><Check size={15} /> {t('mentorSave')}</button></div>
        </div>
      ) : (
        <div className="row wrap" style={{ gap: 8 }}>
          <button className={`btn ${m.overdue ? 'primary' : ''}`} onClick={() => setOpen(true)}><Check size={15} /> {t('mentorMet')}</button>
          {m.phone && <a className="btn ghost" href={`tel:${m.phone.replace(/\s/g, '')}`}><Phone size={15} /> {t('mentorCall')}</a>}
        </div>
      )}
    </div>
  );
}
