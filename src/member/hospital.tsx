// Hospital help: the meal and visit rota for someone from church who is in hospital. Members in
// the same zone, a shared group, the prayer chain and the family see it and pick a slot.
import { BedDouble, Check, Soup, UserRound } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';

import { memberSession } from '@/api/client';
import { MemberApi } from '@/api/endpoints';
import type { MemberHospitalStay } from '@/core/types';
import { ErrorState, FormError, Loading } from '@/components/ui';
import { useT } from '@/i18n';
import { formatDay } from '@/lib/format';
import { useSession } from '@/lib/session';
import { useAction, useApi } from '@/lib/use-api';

type Slot = MemberHospitalStay['slots'][number];

export function MemberHospitalPage() {
  const { t } = useT();
  const q = useApi(MemberApi.hospital.list);
  return (
    <div className="stack">
      <div>
        <h1>{t('hospTitle')}</h1>
        <p className="muted">{t('hospIntro')}</p>
      </div>
      {q.error ? <ErrorState error={q.error} onRetry={q.reload} /> : !q.data ? <Loading /> : !q.data.length ? (
        <div className="card card-pad muted">{t('hospNone')}</div>
      ) : q.data.map((s) => <StayCard key={s.id} s={s} onChange={(n) => q.setData(q.data!.map((x) => (x.id === n.id ? n : x)))} />)}
    </div>
  );
}

function StayCard({ s, onChange }: { s: MemberHospitalStay; onChange: (s: MemberHospitalStay) => void }) {
  const { t, locale } = useT();
  const dates = [...new Set(s.slots.map((x) => x.date))].sort();
  return (
    <article className="card card-pad stack" style={{ gap: 10 }}>
      <div className="row" style={{ gap: 10 }}>
        <BedDouble size={22} />
        <div className="grow">
          <h3 style={{ margin: 0 }}>{s.name}</h3>
          <div className="small muted">{s.hospital}{s.ward ? `, ${s.ward}` : ''} · {t('hospSince', { date: formatDay(`${s.admittedOn}T12:00:00`, locale) })}</div>
          {s.family && <div className="small muted">{t('hospFamily')}</div>}
        </div>
      </div>
      {dates.map((d) => (
        <div key={d} className="stack" style={{ gap: 6 }}>
          <b className="small">{formatDay(`${d}T12:00:00`, locale)}</b>
          {s.slots.filter((x) => x.date === d).map((x) => <SlotRow key={x.id} stayId={s.id} x={x} onChange={onChange} />)}
        </div>
      ))}
    </article>
  );
}

function SlotRow({ stayId, x, onChange }: { stayId: string; x: Slot; onChange: (s: MemberHospitalStay) => void }) {
  const { t } = useT();
  const [note, setNote] = useState('');
  const [asking, setAsking] = useState(false);
  const act = useAction(async (take: boolean) => { onChange(await MemberApi.hospital.slot(stayId, x.id, take, take ? note.trim() || undefined : undefined)); setAsking(false); setNote(''); });
  const Icon = x.kind === 'meal' ? Soup : UserRound;
  return (
    <div className={`hsm-slot ${x.takenName ? 'taken' : ''}`}>
      <div className="row" style={{ gap: 8 }}>
        <Icon size={16} />
        <span className="grow">{x.kind === 'meal' ? t('hospMeal') : t('hospVisit')}{x.takenName && <span className="small muted"> · {x.mine ? t('hospYou') : x.takenName}{x.note ? ` · ${x.note}` : ''}</span>}</span>
        {x.mine ? <button className="btn sm ghost" disabled={act.busy} onClick={() => void act.run(false)}>{t('hospCancel')}</button>
          : !x.takenName && !asking && <button className="btn sm primary" onClick={() => (x.kind === 'meal' ? setAsking(true) : void act.run(true))}>{x.kind === 'meal' ? t('hospTakeMeal') : t('hospTakeVisit')}</button>}
        {x.takenName && !x.mine && <Check size={16} className="muted" />}
      </div>
      {asking && (
        <form className="row" style={{ gap: 6, marginTop: 6 }} onSubmit={(e) => { e.preventDefault(); void act.run(true); }}>
          <input className="input grow" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('hospNotePh')} maxLength={140} autoFocus />
          <button className="btn sm primary" disabled={act.busy}>{t('hospTakeMeal')}</button>
        </form>
      )}
      <FormError error={act.error} />
    </div>
  );
}

/** On Home while someone the member can help is in hospital. */
export function HospitalCard() {
  const session = useSession(memberSession);
  const { t } = useT();
  const q = useApi(() => MemberApi.hospital.list().catch(() => [] as MemberHospitalStay[]), [session?.member.id]);
  const s = q.data?.find((x) => x.slots.some((y) => !y.takenName)) ?? q.data?.[0];
  if (!s) return null;
  return (
    <Link to="/app/hospital" className="card card-pad row hsm-home" style={{ gap: 10 }}>
      <BedDouble size={20} />
      <span className="grow"><b style={{ display: 'block' }}>{t('hospCard', { name: s.name.split(' ')[0] })}</b><span className="small muted">{t('hospHelp')}</span></span>
    </Link>
  );
}
