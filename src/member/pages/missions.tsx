// The missionaries the church supports: their work, prayer points and news, and the member's own
// monthly commitment, with a link to give to that missionary's fund.
import { Globe } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';

import type { MemberMission } from '@/api/admin-types';
import { memberSession } from '@/api/client';
import { MemberApi } from '@/api/endpoints';
import { Empty, ErrorState, Field, Loading, Modal, useToast } from '@/components/ui';
import { useT } from '@/i18n';
import { formatDate, formatMoney } from '@/lib/format';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/use-api';

export function MemberMissionsPage() {
  const { t } = useT();
  const { data, error, reload, setData } = useApi(MemberApi.missions.list);
  const [committing, setCommitting] = useState<MemberMission | null>(null);
  const replace = (m: MemberMission) => setData((cur) => (cur ?? []).map((x) => (x.id === m.id ? m : x)));
  return (
    <>
      <div>
        <h1>{t('missionsTitle')}</h1>
        <p className="muted">{t('missionsBody')}</p>
      </div>
      {error ? <ErrorState error={error} onRetry={reload} /> : !data ? <Loading /> : data.length === 0 ? (
        <div className="card"><Empty icon={<Globe size={28} />} title={t('missionsNone')} /></div>
      ) : data.map((m) => <MissionCard key={m.id} m={m} onCommit={() => setCommitting(m)} onChange={replace} />)}
      {committing && <CommitModal m={committing} onClose={() => setCommitting(null)} onSaved={(m) => { replace(m); setCommitting(null); }} />}
    </>
  );
}

function MissionCard({ m, onCommit, onChange }: { m: MemberMission; onCommit: () => void; onChange: (m: MemberMission) => void }) {
  const { t, locale } = useT();
  const toast = useToast();
  const currency = useSession(memberSession)?.church.currency ?? 'INR';
  const [open, setOpen] = useState(false);
  const pct = m.monthlyNeed ? Math.min(100, Math.round((m.committed * 100) / m.monthlyNeed)) : null;
  const giveUrl = `/app/give?fund=${m.fundId}${m.mine ? `&amount=${m.mine.amount / 100}&monthly=1` : ''}`;
  return (
    <article className="card card-pad stack" style={{ gap: 10 }}>
      <div className="row" style={{ gap: 12, minWidth: 0 }}>
        <span className="ms-avatar">{m.photoUrl ? <img src={m.photoUrl} alt="" /> : m.name.replace(/^(Rev\.|Dr\.|Mr\.|Mrs\.)\s*/, '').slice(0, 1)}</span>
        <div className="grow" style={{ minWidth: 0 }}>
          <h2 style={{ fontSize: 18 }}>{m.name}</h2>
          <div className="small muted">{m.field}{m.organisation ? ` · ${m.organisation}` : ''}</div>
        </div>
      </div>
      {m.work && <p style={{ margin: 0 }}>{m.work}</p>}
      {pct !== null && (
        <div className="stack" style={{ gap: 4 }}>
          <div className="progress"><i style={{ width: `${pct}%` }} /></div>
          <span className="small muted">{t('missionCovered', { pct })}</span>
        </div>
      )}
      {m.prayerPoints && <div className="ss-lesson small"><b>{t('pleasePray')}</b><span style={{ whiteSpace: 'pre-wrap' }}>{m.prayerPoints}</span></div>}
      {m.reports.length > 0 && (
        <div className="stack" style={{ gap: 6 }}>
          <button type="button" className="btn ghost sm" style={{ alignSelf: 'flex-start' }} onClick={() => setOpen(!open)}>{t('missionNews')} · {m.reports[0].title} ({formatDate(`${m.reports[0].date}T00:00:00Z`, locale)})</button>
          {open && m.reports.map((r) => (
            <div key={r.id} className="stack" style={{ gap: 4, paddingLeft: 12, borderLeft: '3px solid var(--border)' }}>
              <b>{r.title}</b>
              <span className="small muted">{formatDate(`${r.date}T00:00:00Z`, locale)}</span>
              <p className="small" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{r.body}</p>
              {r.prayerPoints && <p className="small" style={{ margin: 0, whiteSpace: 'pre-wrap' }}><b>{t('pleasePray')}</b> {r.prayerPoints}</p>}
            </div>
          ))}
        </div>
      )}
      {m.mine && <div className="small"><span className="badge ok">✓ {t('missionMine', { amount: formatMoney(m.mine.amount, currency, locale) })}</span></div>}
      <div className="row wrap" style={{ gap: 8 }}>
        <Link className="btn accent" to={giveUrl}>{t('giveTitle')}</Link>
        <button className="btn" onClick={onCommit}>{m.mine ? t('missionChange') : t('missionCommit')}</button>
        {m.mine && <button className="btn ghost" onClick={async () => { if (!confirm(t('missionStopConfirm'))) return; onChange(await MemberApi.missions.stop(m.id)); toast(t('missionStopped')); }}>{t('missionStop')}</button>}
      </div>
    </article>
  );
}

function CommitModal({ m, onClose, onSaved }: { m: MemberMission; onClose: () => void; onSaved: (m: MemberMission) => void }) {
  const { t, locale } = useT();
  const toast = useToast();
  const currency = useSession(memberSession)?.church.currency ?? 'INR';
  const [amount, setAmount] = useState(m.mine ? String(m.mine.amount / 100) : '500');
  const [busy, setBusy] = useState(false);
  const minor = Math.round(Number(amount) * 100);
  return (
    <Modal
      title={m.name}
      onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>{t('cancel')}</button><button className="btn primary" disabled={minor < 100 || busy} onClick={async () => { setBusy(true); try { const x = await MemberApi.missions.support(m.id, minor); toast(t('missionThanks')); onSaved(x); } finally { setBusy(false); } }}>{t('missionCommitNow', { amount: minor >= 100 ? formatMoney(minor, currency, locale) : '' })}</button></>}
    >
      <div className="stack">
        <p className="muted" style={{ margin: 0 }}>{t('missionCommitHelp')}</p>
        <div className="amount-grid">
          {[300, 500, 1000, 2000].map((p) => <button type="button" key={p} className={Number(amount) === p ? 'on' : ''} onClick={() => setAmount(String(p))}>{formatMoney(p * 100, currency, locale)}</button>)}
        </div>
        <Field label={`${t('amount')} (${currency}) / ${t('monthly').toLowerCase()}`}><input className="input" type="number" min={1} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
