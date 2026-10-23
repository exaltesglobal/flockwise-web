// Ask for help: a quiet request to the church's benevolence fund. Only the pastors see it.
import { HandCoins, Lock } from 'lucide-react';
import { useState } from 'react';

import type { AidKind, AidStatus } from '@/api/admin-types';
import { MemberApi } from '@/api/endpoints';
import { ErrorState, Field, FormError, Loading, useToast } from '@/components/ui';
import { useT, type StringKey } from '@/i18n';
import { formatDate, formatMoney } from '@/lib/format';
import { useAction, useApi } from '@/lib/use-api';

const KIND_KEY: Record<AidKind, StringKey> = { medical: 'aidKindMedical', education: 'aidKindEducation', rent: 'aidKindRent', food: 'aidKindFood', funeral: 'aidKindFuneral', other: 'aidKindOther' };
const STATUS_KEY: Record<AidStatus, StringKey> = { requested: 'aidStatusRequested', reviewing: 'aidStatusReviewing', approved: 'aidStatusApproved', paid: 'aidStatusPaid', declined: 'aidStatusDeclined', withdrawn: 'aidStatusWithdrawn' };
const BADGE: Record<AidStatus, string> = { requested: 'warn', reviewing: 'accent', approved: 'ok', paid: 'ok', declined: 'gray', withdrawn: 'gray' };

export function MemberAidPage() {
  const { t, locale } = useT();
  const toast = useToast();
  const { data, error, reload } = useApi(MemberApi.aid.get);
  const [kind, setKind] = useState<AidKind>('medical');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const send = useAction(() => MemberApi.aid.request({ kind, amount: Math.round(Number(amount) * 100), reason }));
  const withdraw = useAction((id: string) => MemberApi.aid.withdraw(id));
  const open = data?.requests.find((a) => a.status === 'requested' || a.status === 'reviewing') ?? null;
  return (
    <>
      <div>
        <h1>{t('aidTitle')}</h1>
        <p className="muted">{t('aidBody')}</p>
      </div>
      {error ? <ErrorState error={error} onRetry={reload} /> : !data ? <Loading /> : (
        <div className="stack">
          <div className="small muted row" style={{ gap: 6 }}><Lock size={14} /> {t('aidPrivate')}</div>
          {open ? (
            <div className="card card-pad stack" style={{ gap: 8 }}>
              <div className="row" style={{ gap: 8 }}><HandCoins size={18} /><b>{t(KIND_KEY[open.kind])} · {formatMoney(open.amount, open.currency, locale)}</b><span className={`badge ${BADGE[open.status]}`}>{t(STATUS_KEY[open.status])}</span></div>
              <p className="muted small" style={{ margin: 0 }}>{t('aidOpen')}</p>
              <button className="btn ghost sm" style={{ alignSelf: 'flex-start' }} disabled={withdraw.busy} onClick={async () => { if (await withdraw.run(open.id)) { toast(t('aidWithdrawn')); reload(); } }}>{t('aidWithdraw')}</button>
            </div>
          ) : (
            <div className="card card-pad stack">
              <Field label={t('aidKind')}>
                <select className="select" value={kind} onChange={(e) => setKind(e.target.value as AidKind)}>{data.kinds.map((k) => <option key={k} value={k}>{t(KIND_KEY[k])}</option>)}</select>
              </Field>
              <Field label={t('aidAmount')}><input className="input" type="number" min={1} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ width: 160 }} /></Field>
              <Field label={t('aidReason')}><textarea className="input" rows={4} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
              <FormError error={send.error} />
              <button className="btn primary" style={{ alignSelf: 'flex-start' }} disabled={send.busy || !Number(amount) || !reason.trim()} onClick={async () => { if (await send.run()) { setAmount(''); setReason(''); toast(t('aidSent')); reload(); } }}>{t('aidSend')}</button>
            </div>
          )}
          {data.requests.length > 0 && (
            <section className="stack">
              <h2>{t('aidHistory')}</h2>
              <div className="card">
                {data.requests.map((a) => (
                  <div key={a.id} className="list-row" style={{ alignItems: 'flex-start' }}>
                    <div className="grow">
                      <div style={{ fontWeight: 600 }}>{t(KIND_KEY[a.kind])} · {formatMoney(a.amount, a.currency, locale)}</div>
                      <div className="small muted">{formatDate(a.requestedAt, locale)}{a.approved !== null && a.status !== 'declined' ? ` · ${t('aidApprovedFor', { amount: formatMoney(a.approved, a.currency, locale) })}` : ''}{a.paidAt ? ` · ${t('aidPaidOn', { date: formatDate(a.paidAt, locale) })}` : ''}</div>
                      {a.decisionNote && a.status !== 'withdrawn' && <div className="small" style={{ marginTop: 4 }}>{a.decisionNote}</div>}
                    </div>
                    <span className={`badge ${BADGE[a.status]}`}>{t(STATUS_KEY[a.status])}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </>
  );
}
