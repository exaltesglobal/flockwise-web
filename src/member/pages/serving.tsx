import { CalendarOff, Check, ChevronDown, ChevronUp, HandHeart, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';

import { MemberApi } from '@/api/endpoints';
import type { MyServing } from '@/api/admin-types';
import { ErrorState, FormError, Loading, useToast } from '@/components/ui';
import { useT } from '@/i18n';
import { formatDay, formatTime } from '@/lib/format';
import { useAction, useApi } from '@/lib/use-api';

type Item = MyServing['assignments'][number];

export function MemberServingPage() {
  const { t } = useT();
  const { data, error, reload } = useApi(MemberApi.serving.get);
  return (
    <>
      <div>
        <h1>{t('tabServing')}</h1>
        <p className="muted">{t('servingBody')}</p>
      </div>
      {error ? <ErrorState error={error} onRetry={reload} /> : !data ? <Loading /> : (
        <>
          <section className="stack">
            {data.assignments.length === 0 ? (
              <div className="card card-pad row muted"><HandHeart size={20} /> {t('noServing')}</div>
            ) : data.assignments.map((a) => <AssignmentCard key={a.id} a={a} onChanged={reload} />)}
          </section>
          {data.teams.length > 0 && (
            <section className="stack">
              <h2>{t('myTeams')}</h2>
              <div className="card">
                {data.teams.map((team) => (
                  <div key={team.id} className="list-row">
                    <div className="grow"><h3>{team.name}</h3><span className="small muted">{team.positions.join(', ')}</span></div>
                  </div>
                ))}
              </div>
            </section>
          )}
          <Blockouts items={data.blockouts} onChanged={reload} />
        </>
      )}
    </>
  );
}

function AssignmentCard({ a, onChanged }: { a: Item; onChanged: () => void }) {
  const { t, locale } = useT();
  const [open, setOpen] = useState(false);
  const toast = useToast();
  const respond = useAction((status: 'accepted' | 'declined') => MemberApi.serving.respond(a.id, status));
  const answer = async (status: 'accepted' | 'declined') => {
    if (await respond.run(status)) { toast(status === 'accepted' ? t('accepted') : t('declined')); onChanged(); }
  };
  return (
    <div className="card card-pad stack" style={{ gap: 10 }}>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div className="grow">
          <h3>{a.teamName} · {a.positionName}</h3>
          <div className="small muted">{a.event.title} · {formatDay(a.event.startsAt, locale)}, {formatTime(a.event.startsAt, locale)}</div>
        </div>
        {a.status === 'accepted' ? <span className="badge ok">{t('accepted')}</span>
          : a.status === 'declined' ? <span className="badge gray">{t('declined')}</span>
          : <span className="badge warn">{t('awaitingReply')}</span>}
      </div>
      <FormError error={respond.error} />
      <div className="row wrap">
        {a.status !== 'accepted' && <button className="btn primary" disabled={respond.busy} onClick={() => answer('accepted')}><Check size={16} /> {t('accept')}</button>}
        {a.status !== 'declined' && <button className="btn" disabled={respond.busy} onClick={() => answer('declined')}><X size={16} /> {t('decline')}</button>}
        {a.plan.length > 0 && (
          <button className="btn ghost" onClick={() => setOpen(!open)}>{t('orderOfService')} {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</button>
        )}
      </div>
      {open && (
        <ol className="plan-list">
          {a.plan.map((p) => (
            <li key={p.id}>
              <span className="grow">{p.title}{p.key && <span className="muted"> · {p.key}</span>}{p.person && <span className="muted"> · {p.person}</span>}</span>
              <span className="small muted">{p.minutes} min</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function Blockouts({ items, onChanged }: { items: MyServing['blockouts']; onChanged: () => void }) {
  const { t, locale } = useT();
  const [adding, setAdding] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ from: today, to: today, reason: '' });
  const add = useAction(() => MemberApi.serving.addBlockout({ from: form.from, to: form.to, reason: form.reason.trim() || undefined }));
  return (
    <section className="stack">
      <div className="section-head">
        <h2>{t('blockouts')}</h2>
        {!adding && <button className="btn sm" onClick={() => setAdding(true)}><Plus size={14} /> {t('addBlockout')}</button>}
      </div>
      <p className="small muted">{t('blockoutsBody')}</p>
      {adding && (
        <div className="card card-pad stack">
          <FormError error={add.error} />
          <div className="row wrap">
            <label className="stack small" style={{ gap: 4 }}>{t('from')}<input className="input" type="date" min={today} value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value, to: e.target.value > form.to ? e.target.value : form.to })} /></label>
            <label className="stack small" style={{ gap: 4 }}>{t('to')}<input className="input" type="date" min={form.from} value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} /></label>
          </div>
          <input className="input" placeholder={t('reasonOptional')} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          <div className="row">
            <button className="btn primary" disabled={add.busy} onClick={async () => { if (await add.run()) { setAdding(false); setForm({ from: today, to: today, reason: '' }); onChanged(); } }}>{t('save')}</button>
            <button className="btn ghost" onClick={() => setAdding(false)}>{t('cancel')}</button>
          </div>
        </div>
      )}
      {items.length > 0 && (
        <div className="card">
          {items.map((b) => (
            <div key={b.id} className="list-row">
              <CalendarOff size={17} className="muted" />
              <div className="grow">
                <strong>{formatDay(b.from, locale)}{b.to !== b.from && ` – ${formatDay(b.to, locale)}`}</strong>
                {b.reason && <div className="small muted">{b.reason}</div>}
              </div>
              <button className="btn ghost icon sm" title={t('remove')} onClick={async () => { await MemberApi.serving.removeBlockout(b.id); onChanged(); }}><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
