// Voting from the member's phone: open AGM resolutions and committee elections, a secret ballot
// with a receipt kept on this phone, and published results. Eligibility and counting are the
// server's; the page never learns anyone else's vote.
import { Check, Lock, ShieldCheck, Vote } from 'lucide-react';
import { useState } from 'react';

import type { MemberElection, VoteReceipt } from '@/api/admin-types';
import { MemberApi } from '@/api/endpoints';
import { ErrorState, FormError, Loading } from '@/components/ui';
import { useT } from '@/i18n';
import { formatDate, formatTime } from '@/lib/format';
import { useAction, useApi } from '@/lib/use-api';

type T = ReturnType<typeof useT>['t'];
const key = (id: string) => `fw:ballot:${id}`;
const savedReceipt = (id: string) => { try { return localStorage.getItem(key(id)); } catch { return null; } };
const saveReceipt = (id: string, code: string) => { try { localStorage.setItem(key(id), code); } catch { /* private mode */ } };

export function MemberVotePage() {
  const { t, locale } = useT();
  const { data, error, reload } = useApi(MemberApi.elections.list);
  return (
    <>
      <div>
        <h1>{t('voteTitle')}</h1>
        <p className="muted">{t('voteBody')}</p>
      </div>
      {error ? <ErrorState error={error} onRetry={reload} /> : !data ? <Loading /> : data.length === 0 ? (
        <div className="card card-pad stack" style={{ alignItems: 'center', textAlign: 'center' }}><Vote size={28} /><p className="muted" style={{ margin: 0 }}>{t('voteNone')}</p></div>
      ) : (
        <div className="stack">{data.map((e) => <Poll key={e.id} e={e} t={t} locale={locale} onChange={reload} />)}</div>
      )}
    </>
  );
}

function Poll({ e, t, locale, onChange }: { e: MemberElection; t: T; locale: string; onChange: () => void }) {
  const when = (iso: string) => `${formatDate(iso, locale)}, ${formatTime(iso, locale)}`;
  return (
    <div className="card card-pad stack" style={{ gap: 10 }}>
      <div className="row wrap" style={{ gap: 6 }}>
        <span className={`badge ${e.status === 'open' ? 'ok' : 'gray'}`}>{e.status === 'open' ? (e.closesAt ? t('voteOpenUntil', { time: when(e.closesAt) }) : t('voteTitle')) : t('voteClosed')}</span>
        <span className="badge gray">{e.kind === 'resolution' ? t('voteResolution') : `${t('voteElection')} · ${t('voteSeats', { n: e.seats })}`}</span>
      </div>
      <h2 style={{ fontSize: 18, margin: 0 }}>{e.title}</h2>
      {e.description && <p className="small" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{e.description}</p>}
      {e.meetingAt && <span className="small muted">{t('voteMeeting', { time: when(e.meetingAt), venue: e.venue })}</span>}
      {e.results ? <Results e={e} t={t} /> : e.status === 'open' ? (!e.eligible ? <p className="small muted" style={{ margin: 0 }}><Lock size={13} /> {e.reason ?? t('voteNotEligible')}</p> : e.voted ? <Voted e={e} t={t} /> : <Ballot e={e} t={t} onDone={onChange} />) : null}
      {e.turnout && e.status === 'open' && <span className="small muted">{t('voteTurnout', { voted: e.turnout.voted, eligible: e.turnout.eligible, percent: e.turnout.percent })}</span>}
    </div>
  );
}

function Ballot({ e, t, onDone }: { e: MemberElection; t: T; onDone: () => void }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [receipt, setReceipt] = useState<VoteReceipt | null>(null);
  const vote = useAction(() => MemberApi.elections.vote(e.id, picked));
  const one = e.kind === 'resolution' || e.seats === 1;
  const toggle = (id: string) => setPicked(one ? [id] : picked.includes(id) ? picked.filter((x) => x !== id) : picked.length < e.seats ? [...picked, id] : picked);
  if (receipt) {
    return (
      <div className="stack" style={{ gap: 8 }}>
        <p className="verse-msg ok" style={{ margin: 0 }}><Check size={14} /> {t('voteDone')} {receipt.choices.join(', ')}</p>
        <ReceiptCard code={receipt.receipt} t={t} />
      </div>
    );
  }
  return (
    <div className="stack" style={{ gap: 10 }}>
      <span className="small muted">{one ? t('voteChooseOne') : t('voteChooseUpTo', { n: e.seats })}</span>
      <div className="stack" style={{ gap: 6 }}>
        {e.candidates.map((c) => {
          const on = picked.includes(c.id);
          const full = !one && !on && picked.length >= e.seats;
          return (
            <button key={c.id} type="button" className={`ballot-option ${on ? 'on' : ''}`} disabled={confirming || full} onClick={() => toggle(c.id)} aria-pressed={on}>
              <span className="box">{on && <Check size={14} />}</span>
              <span className="grow"><b>{c.name}</b>{c.note && <span className="small muted"> · {c.note}</span>}</span>
            </button>
          );
        })}
      </div>
      {!one && <span className="small muted">{t('voteChosen', { n: picked.length, max: e.seats })}</span>}
      <FormError error={vote.error} />
      {!confirming ? (
        <button className="btn primary lg" disabled={!picked.length} onClick={() => setConfirming(true)}><Vote size={16} /> {t('voteCast')}</button>
      ) : (
        <div className="card card-pad stack" style={{ gap: 8, background: 'var(--tint)' }}>
          <b>{t('voteConfirm')}</b>
          <span className="small">{e.candidates.filter((c) => picked.includes(c.id)).map((c) => c.name).join(', ')}</span>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn primary" disabled={vote.busy} onClick={async () => { const r = await vote.run(); if (r) { saveReceipt(e.id, r.receipt); setReceipt(r); onDone(); } }}>{t('voteYes')}</button>
            <button className="btn" onClick={() => setConfirming(false)}>{t('voteBack')}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Voted({ e, t }: { e: MemberElection; t: T }) {
  const code = savedReceipt(e.id);
  return (
    <div className="stack" style={{ gap: 8 }}>
      <p className="verse-msg ok" style={{ margin: 0 }}><Check size={14} /> {t('voteDone')}</p>
      {code && <ReceiptCard code={code} t={t} electionId={e.id} canCheck={false} />}
    </div>
  );
}

function ReceiptCard({ code, t, electionId, canCheck = false }: { code: string; t: T; electionId?: string; canCheck?: boolean }) {
  const check = useAction(() => MemberApi.elections.receipt(electionId!, code));
  const [res, setRes] = useState<{ counted: boolean; choices: string[] } | null>(null);
  return (
    <div className="card card-pad stack" style={{ gap: 6, background: 'var(--tint)' }}>
      <span className="row" style={{ gap: 6 }}><ShieldCheck size={16} /> <b style={{ letterSpacing: '0.12em', fontFamily: 'ui-monospace, monospace' }}>{code}</b></span>
      <span className="small muted">{t('voteReceiptHint')}</span>
      {canCheck && electionId && (
        <div className="row wrap" style={{ gap: 8, alignItems: 'center' }}>
          <button className="btn sm" disabled={check.busy} onClick={async () => { const r = await check.run(); if (r) setRes(r); }}>{t('voteCheck')}</button>
          {res && <span className="small">{res.counted ? t('voteCounted', { choices: res.choices.join(', ') }) : t('voteNotFound')}</span>}
        </div>
      )}
    </div>
  );
}

function Results({ e, t }: { e: MemberElection; t: T }) {
  const res = e.results!;
  const max = Math.max(1, ...res.rows.map((r) => r.votes));
  const code = savedReceipt(e.id);
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row between wrap" style={{ gap: 8 }}>
        <b>{t('voteResult')}{e.kind === 'resolution' ? `: ${res.tie ? t('voteTie') : res.passed ? t('voteCarried') : t('voteNotCarried')}` : ''}</b>
        <span className="small muted">{t('voteBallots', { n: res.ballots })}{e.turnout ? ` · ${t('voteTurnout', { voted: e.turnout.voted, eligible: e.turnout.eligible, percent: e.turnout.percent })}` : ''}</span>
      </div>
      {res.rows.map((r) => (
        <div key={r.candidateId} className={`result-row ${r.elected ? 'elected' : ''}`}>
          <span className="result-name">{r.name}{r.elected && e.kind === 'election' && <span className="badge ok" style={{ marginLeft: 6 }}>{t('voteElected')}</span>}</span>
          <span className="small"><b>{r.votes}</b> <span className="muted">({r.percent}%)</span></span>
          <div className="result-bar"><i style={{ width: `${(r.votes * 100) / max}%` }} /></div>
        </div>
      ))}
      {code && <ReceiptCard code={code} t={t} electionId={e.id} canCheck />}
    </div>
  );
}
