// Christmas carol rounds, from the household's side: ask for the singers to come, pick the nights
// that suit, and see which night the team is coming once the office has planned the routes.
import { Check, Music2, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { MemberApi } from '@/api/endpoints';
import type { MyCarols } from '@/api/admin-types';
import { ErrorState, FormError, Loading, useToast } from '@/components/ui';
import { useT } from '@/i18n';
import { formatDay } from '@/lib/format';
import { useAction, useApi } from '@/lib/use-api';

const day = (d: string, locale: string) => formatDay(`${d}T12:00:00`, locale);

export function MemberCarolsPage() {
  const { t } = useT();
  const { data, error, reload } = useApi(MemberApi.carols.get);
  return (
    <>
      <div>
        <h1>{t('carolsTitle')}</h1>
        <p className="muted">{t('carolsBody')}</p>
      </div>
      {error ? <ErrorState error={error} onRetry={reload} /> : !data ? <Loading /> : !data.season ? (
        <div className="card card-pad row muted"><Music2 size={20} /> {t('carolsNone')}</div>
      ) : (
        <Season data={data} onChanged={reload} />
      )}
    </>
  );
}

function Season({ data, onChanged }: { data: MyCarols; onChanged: () => void }) {
  const { t, locale } = useT();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [dates, setDates] = useState<string[]>(data.request?.preferredDates ?? []);
  const [note, setNote] = useState(data.request?.note ?? '');
  const send = useAction(() => MemberApi.carols.request({ preferredDates: dates, note: note.trim() || undefined }));
  const cancel = useAction(() => MemberApi.carols.cancel());
  const season = data.season!;
  const toggle = (d: string) => setDates(dates.includes(d) ? dates.filter((x) => x !== d) : dates.length >= 3 ? dates : [...dates, d]);
  const form = !data.request || editing;

  return (
    <>
      {data.visit && (
        <div className="hero-card">
          <span className="eyebrow">{t('carolsHome')}</span>
          {data.visit.status === 'visited' ? (
            <h2>{t('carolsVisited')}</h2>
          ) : (
            <>
              <h2>{t('carolsVisit', { team: data.visit.teamName, date: day(data.visit.date, locale) })}</h2>
              <span className="meta">{t('carolsVisitTime', { time: data.visit.eta })}</span>
            </>
          )}
        </div>
      )}
      {season.message && <p className="muted">{season.message}</p>}
      {!data.visit && data.request && !editing && (
        <div className="card card-pad stack" style={{ gap: 10 }}>
          <div className="row"><Check size={18} style={{ color: "var(--ok)" }} /><b>{t('carolsAsked')}</b></div>
          <div className="small muted">{data.request.preferredDates.length ? data.request.preferredDates.map((d) => day(d, locale)).join(' · ') : t('carolsAnyNight')}{data.request.note ? ` · ${data.request.note}` : ''}</div>
          <FormError error={cancel.error} />
          <div className="row wrap">
            <button className="btn" onClick={() => setEditing(true)}><Pencil size={15} /> {t('carolsChange')}</button>
            <button className="btn ghost" disabled={cancel.busy} onClick={async () => { if (await cancel.run()) { toast(t('carolsCancel')); onChanged(); } }}><Trash2 size={15} /> {t('carolsCancel')}</button>
          </div>
        </div>
      )}
      {!data.visit && form && (
        <div className="card card-pad stack">
          <h2>{t('carolsAsk')}</h2>
          <p className="small muted">{t('carolsPickNights')}</p>
          <div className="carol-dates">
            {data.dates.map((d) => (
              <button key={d} type="button" className={`chip-toggle ${dates.includes(d) ? 'on' : ''}`} aria-pressed={dates.includes(d)} onClick={() => toggle(d)}>{day(d, locale)}</button>
            ))}
          </div>
          <textarea className="textarea" rows={2} placeholder={t('carolsNote')} value={note} onChange={(e) => setNote(e.target.value)} />
          <FormError error={send.error} />
          <div className="row wrap">
            <button className="btn primary" disabled={send.busy} onClick={async () => { if (await send.run()) { toast(t('carolsAsked')); setEditing(false); onChanged(); } }}><Music2 size={16} /> {t('carolsSend')}</button>
            {editing && <button className="btn ghost" onClick={() => setEditing(false)}>{t('cancel')}</button>}
          </div>
        </div>
      )}
    </>
  );
}
