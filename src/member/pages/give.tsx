import { CheckCircle2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';

import { memberSession } from '@/api/client';
import { MemberApi } from '@/api/endpoints';
import type { GiveFrequency } from '@/api/types';
import { ErrorState, Field, FormError, Loading, Segmented } from '@/components/ui';
import { useT } from '@/i18n';
import { formatDate, formatMoney } from '@/lib/format';
import { useSession } from '@/lib/session';
import { useAction, useApi } from '@/lib/use-api';

const PRESETS: Record<string, number[]> = { INR: [500, 1000, 2500, 5000], USD: [10, 25, 50, 100] };
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

export function MemberGivePage() {
  const { t, locale } = useT();
  const session = useSession(memberSession);
  const church = session!.church;
  const india = church.country === 'IN';
  const presets = PRESETS[church.currency] ?? PRESETS.USD;

  const funds = useApi(MemberApi.giving.funds);
  const history = useApi(() => MemberApi.giving.history());
  const [fundId, setFundId] = useState('');
  const [amount, setAmount] = useState(String(presets[1]));
  const [frequency, setFrequency] = useState<GiveFrequency>('once');
  const [indian, setIndian] = useState(true);
  const [pan, setPan] = useState('');
  const [params, setParams] = useSearchParams();
  // Razorpay/Stripe send the donor back here with ?payment=success|cancelled
  const [done, setDone] = useState(params.get('payment') === 'success');
  const [cancelled] = useState(params.get('payment') === 'cancelled');
  useEffect(() => {
    if (params.has('payment')) setParams({}, { replace: true });
  }, [params, setParams]);

  useEffect(() => {
    if (funds.data?.length && !fundId) setFundId(funds.data[0].id);
  }, [funds.data, fundId]);

  const minor = Math.round(Number(amount) * 100);
  const panBad = pan.length > 0 && !PAN_RE.test(pan);
  const give = useAction(MemberApi.giving.createIntent);

  async function onGive() {
    const intent = await give.run({ fundId, amount: minor, currency: church.currency, frequency, donorCitizenship: india && !indian ? 'OTHER' : 'IN', pan: pan || undefined });
    if (!intent) return;
    // Real backend: hosted Razorpay/Stripe checkout on the church's own account. The demo has none.
    if (intent.checkoutUrl) window.location.href = intent.checkoutUrl;
    else {
      setDone(true);
      history.reload();
    }
  }

  if (funds.error) return <ErrorState error={funds.error} onRetry={funds.reload} />;
  if (!funds.data) return <Loading />;
  const fund = funds.data.find((f) => f.id === fundId);

  return (
    <>
      <div>
        <h1>{t('giveTitle')}</h1>
        <p className="muted">{t('giveBody', { church: church.name })}</p>
      </div>

      {done ? (
        <div className="card card-pad stack" style={{ alignItems: 'center', textAlign: 'center' }}>
          <CheckCircle2 size={40} color="var(--ok)" />
          <h2>{t('thankYou')}</h2>
          <button className="btn" onClick={() => setDone(false)}>{t('giveTitle')}</button>
        </div>
      ) : (
        <div className="card card-pad stack lg">
          <Field label={t('fund')}>
            <div className="stack" style={{ gap: 8 }}>
              {funds.data.map((f) => (
                <label key={f.id} className={`fund-option ${f.id === fundId ? 'on' : ''}`}>
                  <input type="radio" name="fund" checked={f.id === fundId} onChange={() => setFundId(f.id)} />
                  <div className="grow">
                    <div style={{ fontWeight: 600 }}>{f.name} {f.taxDeductible && india && <span className="badge" style={{ marginLeft: 4 }}>{t('taxDeductible')}</span>}</div>
                    <div className="small muted">{f.description}</div>
                  </div>
                </label>
              ))}
            </div>
          </Field>

          <Field label={`${t('amount')} (${church.currency})`}>
            <div className="stack" style={{ gap: 8 }}>
              <div className="amount-grid">
                {presets.map((p) => (
                  <button type="button" key={p} className={Number(amount) === p ? 'on' : ''} onClick={() => setAmount(String(p))}>
                    {formatMoney(p * 100, church.currency, locale)}
                  </button>
                ))}
              </div>
              <input className="input" type="number" min={1} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ fontSize: 18, height: 46 }} />
            </div>
          </Field>

          <div className="stack" style={{ gap: 6 }}>
            <Segmented value={frequency} onChange={setFrequency} options={[{ value: 'once', label: t('once') }, { value: 'monthly', label: t('monthly') }]} />
            {frequency === 'monthly' && <span className="small muted">{t('monthlyNote')}</span>}
          </div>

          {india && (
            <>
              <label className="check">
                <input type="checkbox" checked={indian} onChange={(e) => setIndian(e.target.checked)} />
                <span>{t('citizenship')}<br /><span className="small muted">{t('citizenshipHelp')}</span></span>
              </label>
              {fund?.taxDeductible && indian && (
                <Field label={t('pan')} error={panBad ? 'ABCDE1234F' : undefined}>
                  <input className={`input mono ${panBad ? 'invalid' : ''}`} maxLength={10} value={pan} onChange={(e) => setPan(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} placeholder="ABCDE1234F" />
                </Field>
              )}
            </>
          )}

          {cancelled && <div className="alert warn">{t('paymentNotCompleted')}</div>}
          <FormError error={give.error} />
          <button className="btn accent lg block" disabled={give.busy || !fundId || minor < 100 || panBad} onClick={onGive}>
            {t('giveNow', { amount: minor >= 100 ? formatMoney(minor, church.currency, locale) : '' })}
          </button>
          <p className="small muted" style={{ textAlign: 'center' }}>{t('checkoutNote')}</p>
        </div>
      )}

      <section className="stack">
        <h2>{t('givingHistory')}</h2>
        {history.data?.data.length ? (
          <div className="card">
            {history.data.data.map((d) => (
              <div key={d.id} className="list-row">
                <div className="grow">
                  <div style={{ fontWeight: 600 }}>{d.fundName}</div>
                  <div className="small muted">{formatDate(d.createdAt, locale)}{d.frequency === 'monthly' ? ` · ${t('monthly')}` : ''}</div>
                </div>
                <b>{formatMoney(d.amount, d.currency, locale)}</b>
              </div>
            ))}
          </div>
        ) : history.data ? <p className="muted small">—</p> : <Loading />}
      </section>
    </>
  );
}
