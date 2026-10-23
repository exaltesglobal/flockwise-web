// Camps & retreats from the member's side: sign the family up with medical and emergency details,
// and see each person's room and bus once the office has filled them.
import { Tent } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import { MemberApi } from '@/api/endpoints';
import type { MyCamp } from '@/core/types';
import { ErrorState, FormError, Loading, useToast } from '@/components/ui';
import { useT } from '@/i18n';
import { formatDay } from '@/lib/format';
import { useAction, useApi } from '@/lib/use-api';

export function MemberCampsPage() {
  const { t } = useT();
  const { data, error, reload, setData } = useApi(MemberApi.camps.get);
  return (
    <>
      <div>
        <h1>{t('campTitle')}</h1>
        <p className="muted">{t('campBody')}</p>
      </div>
      {error ? <ErrorState error={error} onRetry={reload} /> : !data ? <Loading /> : !data.camps.length ? (
        <div className="card card-pad stack" style={{ alignItems: 'center', textAlign: 'center' }}><Tent size={28} /><p className="muted" style={{ margin: 0 }}>{t('campNone')}</p></div>
      ) : (
        <div className="stack">{data.camps.map((c) => <CampCard key={c.id} c={c} onData={setData} />)}</div>
      )}
    </>
  );
}

function CampCard({ c, onData }: { c: MyCamp; onData: (d: { camps: MyCamp[] }) => void }) {
  const { t, locale } = useT();
  const toast = useToast();
  const signed = c.family.filter((f) => f.signupId);
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState<string[]>(c.family.filter((f) => !f.signupId).map((f) => f.personId));
  const [medical, setMedical] = useState<Record<string, string>>({});
  const [ename, setEname] = useState('');
  const [ephone, setEphone] = useState('');
  const [bus, setBus] = useState(true);
  const send = useAction(async (e: FormEvent) => { e.preventDefault(); onData(await MemberApi.camps.signUp(c.id, { personIds: pick, emergencyName: ename, emergencyPhone: ephone, needsBus: bus, medical })); setOpen(false); toast(t('campDone')); });
  const cancel = useAction(async (personId: string) => onData(await MemberApi.camps.cancel(c.id, personId)));
  const d = (x: string) => formatDay(`${x}T12:00:00`, locale);
  const free = c.family.filter((f) => !f.signupId);
  return (
    <div className="card card-pad stack" style={{ gap: 10 }}>
      <div>
        <b style={{ fontSize: 18 }}>{c.name}</b>
        <div className="small muted">{c.startsOn === c.endsOn ? d(c.startsOn) : `${d(c.startsOn)} – ${d(c.endsOn)}`}{c.place ? ` · ${c.place}` : ''}{c.fee ? ` · ₹${c.fee.toLocaleString('en-IN')} ${t('campEach')}` : ''}</div>
      </div>
      {c.note && <p className="small" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{c.note}</p>}
      {signed.length > 0 && (
        <div className="stack" style={{ gap: 6 }}>
          <span className="small muted">{t('campGoing')}</span>
          {signed.map((f) => (
            <div key={f.personId} className="row wrap" style={{ justifyContent: 'space-between', gap: 8 }}>
              <span><b>{f.name}</b><span className="small muted">{f.room ? ` · ${t('campRoom', { room: f.room })}` : ''}{f.bus ? ` · ${f.bus}` : ''}</span></span>
              {f.paid >= c.fee && c.fee > 0 ? <span className="badge ok">{t('campPaid')}</span> : f.paid === 0 && <button className="btn sm ghost" disabled={cancel.busy} onClick={() => void cancel.run(f.personId)}>{t('campCancel')}</button>}
            </div>
          ))}
          <FormError error={cancel.error} />
        </div>
      )}
      {free.length > 0 && !c.full && (open ? (
        <form className="stack" style={{ gap: 10 }} onSubmit={send.run}>
          <span className="small muted">{t('campWho')}</span>
          {free.map((f) => (
            <div key={f.personId} className="stack" style={{ gap: 4 }}>
              <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={pick.includes(f.personId)} onChange={(e) => setPick((x) => (e.target.checked ? [...x, f.personId] : x.filter((y) => y !== f.personId)))} /> {f.name}</label>
              {pick.includes(f.personId) && <input className="input" value={medical[f.personId] ?? ''} onChange={(e) => setMedical((m) => ({ ...m, [f.personId]: e.target.value }))} maxLength={300} placeholder={t('campMedical')} />}
            </div>
          ))}
          <input className="input" value={ename} onChange={(e) => setEname(e.target.value)} maxLength={100} placeholder={t('campEmergencyName')} />
          <input className="input" value={ephone} onChange={(e) => setEphone(e.target.value)} maxLength={20} inputMode="tel" placeholder={t('campEmergencyPhone')} required />
          <label className="row small" style={{ gap: 8 }}><input type="checkbox" checked={bus} onChange={(e) => setBus(e.target.checked)} /> {t('campBus')}</label>
          <FormError error={send.error} />
          <div className="row" style={{ gap: 8 }}>
            <button className="btn primary" disabled={send.busy || !pick.length}>{t('campSend', { n: String(pick.length) })}</button>
            <button type="button" className="btn ghost" onClick={() => setOpen(false)}>{t('occBack')}</button>
          </div>
        </form>
      ) : <div><button className="btn primary" onClick={() => setOpen(true)}>{signed.length ? t('campAddMore') : t('campSignUp')}</button></div>)}
      {c.full && free.length > 0 && <span className="badge gray">{t('campFull')}</span>}
    </div>
  );
}
