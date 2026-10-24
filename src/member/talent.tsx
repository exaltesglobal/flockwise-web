// Help our neighbourhood: the skills a member would give free to people around the church (free
// clinics, tuition, job help), and the days the church has asked them to help at, to say yes or no.
import { CalendarDays, Check, MapPin } from 'lucide-react';
import { useState } from 'react';

import { MemberApi } from '@/api/endpoints';
import type { MySkills } from '@/core/types';
import { ErrorState, FormError, Loading, useToast } from '@/components/ui';
import { useT } from '@/i18n';
import { formatDay } from '@/lib/format';
import { useAction, useApi } from '@/lib/use-api';

/** Skills that help most at clinics, tuition evenings, job fairs and legal help days, shown first. */
const GIVE = ['Doctor', 'Nurse', 'Pharmacist', 'Dentist', 'Counsellor', 'First aid', 'Lawyer', 'Chartered accountant', 'Accountant', 'Teacher', 'Maths tutor', 'English tutor', 'Computer and IT', 'Job referrals', 'CV writing', 'Interview practice', 'Electrician', 'Plumber', 'Tailor'];

export function MemberTalentPage() {
  const { t } = useT();
  const skills = useApi(MemberApi.skills.get);
  const invites = useApi(MemberApi.outreach.get);
  const answer = useAction(async (id: string, a: 'yes' | 'no') => invites.setData(await MemberApi.outreach.answer(id, a)));
  return (
    <div className="stack">
      <div>
        <h1>{t('talTitle')}</h1>
        <p className="muted">{t('talIntro')}</p>
      </div>
      {invites.data && invites.data.length > 0 && (
        <section className="stack" style={{ gap: 10 }}>
          <h3 style={{ margin: 0 }}>{t('talAsked')}</h3>
          {invites.data.map((o) => (
            <div key={o.id} className="card card-pad stack" style={{ gap: 6 }}>
              <b>{o.title}</b>
              <span className="row small" style={{ gap: 6 }}><CalendarDays size={14} /> {formatDay(`${o.date}T12:00:00`)}{o.startTime && `, ${o.startTime}${o.endTime ? `–${o.endTime}` : ''}`}</span>
              {o.place && <span className="row small" style={{ gap: 6 }}><MapPin size={14} /> {o.place}</span>}
              {o.about && <span className="small muted">{o.about}</span>}
              {o.answer === 'asked' ? (
                <div className="row wrap" style={{ gap: 8 }}>
                  <button className="btn primary" disabled={answer.busy} onClick={() => void answer.run(o.id, 'yes')}><Check size={15} /> {t('talYes')}</button>
                  <button className="btn" disabled={answer.busy} onClick={() => void answer.run(o.id, 'no')}>{t('talNo')}</button>
                </div>
              ) : (
                <div className="row wrap" style={{ gap: 8 }}>
                  <span className={`badge ${o.answer === 'yes' ? 'green' : 'gray'}`}>{t(o.answer === 'yes' ? 'talSaidYes' : 'talSaidNo')}</span>
                  <button className="btn sm ghost" disabled={answer.busy} onClick={() => void answer.run(o.id, o.answer === 'yes' ? 'no' : 'yes')}>{t('talChange')}</button>
                </div>
              )}
            </div>
          ))}
          <FormError error={answer.error} />
        </section>
      )}
      {skills.error ? <ErrorState error={skills.error} onRetry={skills.reload} /> : !skills.data ? <Loading /> : <Give data={skills.data} onData={skills.setData} />}
      {invites.data && !invites.data.length && <p className="small muted">{t('talNone')}</p>}
    </div>
  );
}

function Give({ data, onData }: { data: MySkills; onData: (d: MySkills) => void }) {
  const { t } = useT();
  const toast = useToast();
  const [skills, setSkills] = useState<string[]>(data.mine?.skills ?? []);
  const [community, setCommunity] = useState(data.mine?.community ?? true);
  const [custom, setCustom] = useState('');
  const toggle = (x: string) => setSkills((s) => (s.includes(x) ? s.filter((y) => y !== x) : [...s, x].slice(0, 20)));
  const save = useAction(async () => { onData(await MemberApi.skills.save({ skills, community })); toast(t('talSaved')); });
  const list = [...GIVE, ...skills.filter((x) => !GIVE.includes(x))];
  return (
    <section className="card card-pad stack" style={{ gap: 12 }}>
      <b>{t('talPick')}</b>
      <div className="row wrap" style={{ gap: 6 }}>
        {list.map((x) => <button key={x} type="button" className={`sk-tag ${skills.includes(x) ? 'on' : ''}`} aria-pressed={skills.includes(x)} onClick={() => toggle(x)}>{x}</button>)}
      </div>
      <form className="row" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); const v = custom.trim(); if (v && !skills.includes(v)) setSkills((s) => [...s, v].slice(0, 20)); setCustom(''); }}>
        <input className="input grow" value={custom} onChange={(e) => setCustom(e.target.value)} maxLength={40} placeholder={t('skillOther')} />
        <button className="btn sm">{t('skillAdd')}</button>
      </form>
      <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={community} onChange={(e) => setCommunity(e.target.checked)} /> {t('talGive')}</label>
      <FormError error={save.error} />
      <div><button className="btn primary" disabled={save.busy} onClick={() => void save.run()}>{t('talSave')}</button></div>
    </section>
  );
}
