import { CheckCircle2, FileText, Globe, Plus, Printer, Repeat, Target, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';

import { memberSession } from '@/api/client';
import { MemberApi } from '@/api/endpoints';
import type { GiveFrequency } from '@/api/types';
import type { RecurringStatus } from '@/core/types';
import { ErrorState, Field, FormError, Loading, Segmented } from '@/components/ui';
import { useT, type StringKey } from '@/i18n';
import { formatDate, formatMoney } from '@/lib/format';
import { printHtml, statementHtml } from '@/lib/print';
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
  const [params, setParams] = useSearchParams();
  // Other screens link here with ?fund=&amount=&monthly=1 (for example a missionary's page).
  const [fundId, setFundId] = useState(params.get('fund') ?? '');
  const [amount, setAmount] = useState(params.get('amount') ?? String(presets[1]));
  const [frequency, setFrequency] = useState<GiveFrequency>(params.get('monthly') ? 'monthly' : 'once');
  const [indian, setIndian] = useState(true);
  const [pan, setPan] = useState('');
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
  const [tick, setTick] = useState(0);

  async function onGive() {
    const intent = await give.run({ fundId, amount: minor, currency: church.currency, frequency, donorCitizenship: india && !indian ? 'OTHER' : 'IN', pan: pan || undefined });
    if (!intent) return;
    // Real backend: hosted Razorpay/Stripe checkout on the church's own account. The demo has none.
    if (intent.checkoutUrl) window.location.href = intent.checkoutUrl;
    else {
      setDone(true);
      history.reload();
      setTick((n) => n + 1);
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
      <MissionsLink />
      <Campaigns onPick={(id) => { setDone(false); setFundId(id); document.getElementById('give-form')?.scrollIntoView({ behavior: 'smooth' }); }} />

      {done ? (
        <div className="card card-pad stack" style={{ alignItems: 'center', textAlign: 'center' }}>
          <CheckCircle2 size={40} color="var(--ok)" />
          <h2>{t('thankYou')}</h2>
          <button className="btn" onClick={() => setDone(false)}>{t('giveTitle')}</button>
        </div>
      ) : (
        <div id="give-form" className="card card-pad stack lg">
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

      <MonthlyGifts tick={tick} />
      <Pledges india={india} />
      {india && <Statement />}
    </>
  );
}

/** Harvest festival, building fund and other special offerings, with progress and the family's envelope. */
function Campaigns({ onPick }: { onPick: (fundId: string) => void }) {
  const { t, locale } = useT();
  const currency = useSession(memberSession)!.church.currency;
  const q = useApi(MemberApi.giving.campaigns);
  if (!q.data?.length) return null;
  return (
    <section className="stack">
      <h2>{t('specialOfferings')}</h2>
      {q.data.map((c) => (
        <div key={c.id} className="card card-pad stack" style={{ gap: 8 }}>
          <div className="row between wrap" style={{ gap: 6 }}>
            <b>{c.name}</b>
            {c.endsOn && <span className="small muted">{t('endsOn', { date: formatDate(c.endsOn, locale) })}</span>}
          </div>
          {c.description && <p className="small muted" style={{ margin: 0 }}>{c.description}</p>}
          {c.goal ? <div className="progress"><i style={{ width: `${Math.min(100, c.percent ?? 0)}%` }} /></div> : null}
          <div className="small">
            {c.goal ? t('raisedOfGoal', { raised: formatMoney(c.raised, currency, locale), goal: formatMoney(c.goal, currency, locale) }) : t('raisedSoFar', { raised: formatMoney(c.raised, currency, locale) })} · {t('giversCount', { n: c.givers })}
          </div>
          {c.envelope && (
            <div className="small" style={{ fontWeight: 600 }}>
              {t('yourEnvelope', { n: c.envelope.number })}
              <span className="muted" style={{ fontWeight: 400 }}> · {c.envelope.amount ? `${formatMoney(c.envelope.amount, currency, locale)} ${t('envelopeGiven')}` : c.envelope.promised ? t('envelopePromised', { amount: formatMoney(c.envelope.promised, currency, locale) }) : ''}</span>
            </div>
          )}
          <div><button className="btn sm" onClick={() => onPick(c.fundId)}>{t('giveToThis')}</button></div>
        </div>
      ))}
    </section>
  );
}

const GIFT_STATUS: Record<RecurringStatus, [StringKey, string]> = {
  pending: ['giftPending', ''],
  active: ['giftActive', 'ok'],
  failing: ['giftFailing', 'warn'],
  paused: ['giftPaused', ''],
  halted: ['giftHalted', 'danger'],
  cancelled: ['giftCancelled', ''],
  completed: ['giftCompleted', 'ok'],
};

/** Monthly gifts on UPI AutoPay: the giver can pause, resume or stop them here. */
function MonthlyGifts({ tick }: { tick: number }) {
  const { t, locale } = useT();
  const q = useApi(MemberApi.giving.recurring, [tick]);
  const act = useAction(MemberApi.giving.changeRecurring);
  const live = (q.data ?? []).filter((g) => !['cancelled', 'completed'].includes(g.status) || Date.now() - new Date(g.endedAt ?? 0).getTime() < 30 * 86_400_000);
  if (!live.length) return null;
  async function run(id: string, action: 'pause' | 'resume' | 'cancel') {
    if (action === 'cancel' && !confirm(t('cancelGiftConfirm'))) return;
    if (await act.run(id, action)) q.reload();
  }
  return (
    <section className="stack">
      <h2>{t('monthlyGifts')}</h2>
      <FormError error={act.error} />
      <div className="card">
        {live.map((g) => (
          <div key={g.id} className="list-row wrap">
            <Repeat size={18} className="muted" />
            <div className="grow" style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>{g.fundName} · {formatMoney(g.amount, g.currency, locale)}</div>
              <div className="small muted">
                <span className={`badge ${GIFT_STATUS[g.status][1]}`}>{t(GIFT_STATUS[g.status][0])}</span>
                {g.nextChargeAt && (g.status === 'active' || g.status === 'failing') ? ` ${t('nextGift', { date: formatDate(g.nextChargeAt, locale) })}` : ''}
              </div>
            </div>
            <div className="row" style={{ gap: 6 }}>
              {(g.status === 'active' || g.status === 'failing') && <button className="btn ghost sm" disabled={act.busy} onClick={() => run(g.id, 'pause')}>{t('pauseGift')}</button>}
              {g.status === 'paused' && <button className="btn ghost sm" disabled={act.busy} onClick={() => run(g.id, 'resume')}>{t('resumeGift')}</button>}
              {!['cancelled', 'completed'].includes(g.status) && <button className="btn ghost sm" disabled={act.busy} onClick={() => run(g.id, 'cancel')}>{t('cancelGift')}</button>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Pledges({ india }: { india: boolean }) {
  const { t, locale } = useT();
  const session = useSession(memberSession);
  const pledges = useApi(MemberApi.giving.pledges);
  const funds = useApi(MemberApi.giving.funds);
  const [adding, setAdding] = useState(false);
  const yearEnd = `${new Date().getMonth() >= 3 ? new Date().getFullYear() + 1 : new Date().getFullYear()}-03-31`;
  const [form, setForm] = useState({ fundId: '', amount: '', endDate: yearEnd, autopay: false });
  const add = useAction(() => MemberApi.giving.pledge({ fundId: form.fundId || funds.data![0].id, amount: Math.round(Number(form.amount) * 100), endDate: form.endDate, autopay: form.autopay || undefined }));
  const months = (() => {
    const now = new Date();
    const end = new Date(`${form.endDate}T00:00:00`);
    return Math.max(1, (end.getFullYear() - now.getFullYear()) * 12 + end.getMonth() - now.getMonth() + 1);
  })();
  const monthly = Math.ceil((Number(form.amount) || 0) / months);
  return (
    <section className="stack">
      <div className="section-head">
        <h2>{t('pledges')}</h2>
        {!adding && <button className="btn sm" onClick={() => setAdding(true)}><Plus size={14} /> {t('makePledge')}</button>}
      </div>
      {adding && funds.data && (
        <div className="card card-pad stack">
          <FormError error={add.error} />
          <select className="select" value={form.fundId || funds.data[0]?.id} onChange={(e) => setForm({ ...form, fundId: e.target.value })}>
            {funds.data.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <div className="row wrap">
            <label className="stack small grow" style={{ gap: 4 }}>{t('amount')}<input className="input" type="number" min={1} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></label>
            <label className="stack small grow" style={{ gap: 4 }}>{t('completeBy')}<input className="input" type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></label>
          </div>
          {india && (
            <label className="check">
              <input type="checkbox" checked={form.autopay} onChange={(e) => setForm({ ...form, autopay: e.target.checked })} />
              <span>{t('payByAutopay')}{form.autopay && Number(form.amount) > 0 ? <span className="small muted"> · {t('autopayEach', { amount: formatMoney(monthly * 100, session!.church.currency, locale), months: String(months) })}</span> : null}</span>
            </label>
          )}
          <div className="row">
            <button className="btn primary" disabled={add.busy || !(Number(form.amount) > 0)} onClick={async () => { const r = await add.run(); if (r) { if (r.checkoutUrl) { window.location.href = r.checkoutUrl; return; } setAdding(false); setForm({ fundId: '', amount: '', endDate: yearEnd, autopay: false }); pledges.reload(); } }}>{t('save')}</button>
            <button className="btn ghost" onClick={() => setAdding(false)}>{t('cancel')}</button>
          </div>
        </div>
      )}
      {pledges.data?.map((p) => {
        const pct = Math.min(100, Math.round((p.given / Math.max(1, p.amount)) * 100));
        return (
          <div key={p.id} className="card card-pad stack" style={{ gap: 8 }}>
            <div className="row">
              <Target size={18} className="muted" />
              <strong className="grow">{p.fundName}</strong>
              <span className="small muted">{t('completeBy')} {formatDate(p.endDate, locale)}</span>
              <button className="btn ghost icon sm" title={t('remove')} onClick={async () => { if (confirm(t('remove'))) { await MemberApi.giving.removePledge(p.id); pledges.reload(); } }}><Trash2 size={14} /></button>
            </div>
            <div className="progress"><i style={{ width: `${pct}%` }} /></div>
            <span className="small muted">{t('pledgeProgress', { given: formatMoney(p.given, p.currency, locale), amount: formatMoney(p.amount, p.currency, locale) })}{p.autopay && p.autopay.status !== 'pending' ? ` · ${t('autopayOn', { amount: formatMoney(p.autopay.amount, p.currency, locale) })}` : ''}</span>
          </div>
        );
      })}
    </section>
  );
}

function financialYears() {
  const now = new Date();
  const start = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return [0, 1, 2].map((i) => `${start - i}-${String((start - i + 1) % 100).padStart(2, '0')}`);
}

function Statement() {
  const { t, locale } = useT();
  const years = financialYears();
  const [fy, setFy] = useState(years[0]);
  const { data } = useApi(() => MemberApi.giving.statement(fy), [fy]);
  return (
    <section className="stack">
      <div className="section-head">
        <h2 className="row" style={{ gap: 8 }}><FileText size={20} /> {t('statementTitle')}</h2>
        <select className="select" style={{ width: 'auto' }} value={fy} onChange={(e) => setFy(e.target.value)}>
          {years.map((y) => <option key={y} value={y}>FY {y}</option>)}
        </select>
      </div>
      {!data ? <Loading /> : (
        <div className="card card-pad stack">
          <p className="small muted">{t('statementBody', { year: data.financialYear })}</p>
          <div className="row" style={{ justifyContent: 'space-between' }}><span>{t('total')}</span><b>{formatMoney(data.total, data.currency, locale)}</b></div>
          <div className="row" style={{ justifyContent: 'space-between' }}><span>{t('eligible80g')}</span><b style={{ color: 'var(--ok)' }}>{formatMoney(data.eligible80g, data.currency, locale)}</b></div>
          <button className="btn" style={{ alignSelf: 'flex-start' }} disabled={!data.gifts.length} onClick={() => printHtml(`${t('statementTitle')} ${data.financialYear}`, statementHtml(data))}>
            <Printer size={16} /> {t('printStatement')}
          </button>
        </div>
      )}
    </section>
  );
}

/** Shown when the church lists missionaries for members. */
function MissionsLink() {
  const { t } = useT();
  const { data } = useApi(MemberApi.missions.list);
  if (!data?.length) return null;
  return (
    <Link to="/app/missions" className="card card-pad row" style={{ gap: 12 }}>
      <Globe size={22} className="muted" />
      <span className="grow" style={{ minWidth: 0 }}><b>{t('missionsTitle')}</b><span className="small muted" style={{ display: 'block' }}>{t('missionsTeaser', { count: data.length })}</span></span>
    </Link>
  );
}
