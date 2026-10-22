// Settings › Plan and billing, and the church's own Razorpay keys for online giving.
import { Check, CreditCard, ExternalLink } from 'lucide-react';
import { useState } from 'react';

import { AdminApi, type BillingView, type RazorpayKeysInput } from '@/api/endpoints';
import { ErrorState, Field, FormError, Loading, Modal, Segmented, useToast } from '@/components/ui';
import type { BillingInterval, PlanId } from '@/core/plans';
import { getApiUrl } from '@/lib/config';
import { useAction, useApi } from '@/lib/use-api';

import { refreshPlan } from '../plan';

const money = (amount: number, currency: string) =>
  amount === 0 ? 'Free' : new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount / 100);
const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

function Meter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const unlimited = limit >= 1_000_000;
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / Math.max(1, limit)) * 100));
  return (
    <div className="usage">
      <div className="row">
        <span className="grow small">{label}</span>
        <span className="small mono">{used.toLocaleString('en-IN')}{unlimited ? '' : ` / ${limit.toLocaleString('en-IN')}`}</span>
      </div>
      {!unlimited && <div className="usage-bar"><span className={pct >= 90 ? 'warn' : ''} style={{ width: `${pct}%` }} /></div>}
    </div>
  );
}

export function PlanBilling() {
  const q = useApi(AdminApi.billing.get);
  const [interval, setInterval] = useState<BillingInterval>('yearly');
  const [confirm, setConfirm] = useState<PlanId | null>(null);
  const checkout = useAction(AdminApi.billing.checkout);
  const cancel = useAction(AdminApi.billing.cancel);
  const toast = useToast();

  if (q.error) return <ErrorState error={q.error} onRetry={q.reload} />;
  if (!q.data) return <Loading />;
  const b: BillingView = q.data;
  const s = b.subscription;
  const current = b.plan;

  async function choose(plan: PlanId) {
    const r = await checkout.run(plan, interval);
    if (!r) return;
    setConfirm(null);
    if (r.checkoutUrl) {
      window.location.href = r.checkoutUrl;
      return;
    }
    if (r.billing) {
      q.setData(r.billing);
      refreshPlan(r.billing);
    }
    toast(plan === 'seed' ? 'Moved to the free Seed plan' : 'Plan changed');
  }

  const status = s.founding
    ? 'Founding church: every feature, no limits.'
    : s.status === 'trial' && b.trialDaysLeft
      ? `Free trial of every feature until ${date(s.trialEndsAt)} (${b.trialDaysLeft} days left).`
      : s.status === 'trial'
        ? 'Your trial has ended. The church is on the free Seed plan.'
        : s.status === 'active' && current !== 'seed'
          ? `Renews ${s.interval === 'yearly' ? 'yearly' : 'monthly'}${s.currentPeriodEnd ? ` on ${date(s.currentPeriodEnd)}` : ''}.`
          : s.status === 'past_due'
            ? 'The last payment did not go through. Razorpay will try again; you can also start the plan again below.'
            : s.status === 'cancelled' && current !== 'seed'
              ? `Cancelled. Your features stay on until ${date(s.currentPeriodEnd)}.`
              : 'Free forever, up to 100 people.';

  return (
    <div className="stack">
      <div className="card">
        <div className="card-head"><h2>Your plan</h2><CreditCard size={18} className="muted" /></div>
        <div className="card-body billing-now">
          <div className="stack-sm">
            <div className="billing-plan">{b.plans.find((p) => p.id === current)?.name}{s.status === 'trial' && b.trialDaysLeft ? <span className="badge">Trial</span> : null}</div>
            <p className="small muted">{status}</p>
            {!s.founding && s.status === 'active' && current !== 'seed' && (
              <button className="btn ghost sm left" disabled={cancel.busy} onClick={async () => { const r = await cancel.run(); if (r) { q.setData(r); refreshPlan(r); toast('Plan cancelled'); } }}>Cancel plan</button>
            )}
            <FormError error={cancel.error} />
          </div>
          <div className="stack-sm">
            <Meter label="People" used={b.usage.people} limit={b.limits.people} />
            <Meter label="Office logins" used={b.usage.staff} limit={b.limits.staff} />
            <Meter label="Campuses" used={b.usage.campuses} limit={b.limits.campuses} />
            <Meter label="AI credits this month" used={b.usage.aiCredits} limit={b.limits.aiCredits} />
          </div>
        </div>
      </div>

      {!s.founding && (
        <>
          <div className="row wrap">
            <h2 className="grow">Plans</h2>
            <Segmented value={interval} options={[{ value: 'monthly', label: 'Monthly' }, { value: 'yearly', label: 'Yearly (2 months free)' }]} onChange={setInterval} />
          </div>
          <div className="plan-grid">
            {b.plans.map((p) => {
              const isCurrent = p.id === current && (s.status === 'active' || p.id === 'seed') && (p.id === 'seed' || s.interval === interval);
              const price = interval === 'yearly' ? p.prices.yearly : p.prices.monthly;
              return (
                <div key={p.id} className={`plan-card ${p.id === 'thrive' ? 'featured' : ''}`}>
                  <div>
                    <h3>{p.name}</h3>
                    <p className="small muted">{p.tagline}</p>
                  </div>
                  <div className="plan-price">
                    {money(price, b.currency)}
                    {price > 0 && <span className="small muted"> / {interval === 'yearly' ? 'year' : 'month'}</span>}
                  </div>
                  <p className="small">Up to {p.limits.people.toLocaleString('en-IN')} people · {p.limits.staff >= 1_000_000 ? 'unlimited' : p.limits.staff} office logins</p>
                  <ul>
                    {p.highlights.map((h) => <li key={h}><Check size={14} /> {h}</li>)}
                  </ul>
                  <button className={`btn block ${p.id === 'thrive' ? 'primary' : ''}`} disabled={isCurrent || checkout.busy} onClick={() => setConfirm(p.id)}>
                    {isCurrent ? 'Current plan' : p.id === 'seed' ? 'Move to Seed' : `Choose ${p.name}`}
                  </button>
                </div>
              );
            })}
          </div>
          <p className="small muted">Plans are billed by Agape Labs (Exaltes Global Private Limited) through Razorpay. Gifts to your church never pass through Flockwise and carry no platform fee.</p>
        </>
      )}

      {confirm && (
        <Modal title={confirm === 'seed' ? 'Move to the free Seed plan?' : `Choose ${b.plans.find((p) => p.id === confirm)?.name}`} onClose={() => setConfirm(null)}
          footer={<><button className="btn ghost" onClick={() => setConfirm(null)}>Not now</button><button className="btn primary" disabled={checkout.busy} onClick={() => choose(confirm)}>{checkout.busy ? '…' : confirm === 'seed' ? 'Move to Seed' : b.online ? 'Continue to payment' : 'Start plan'}</button></>}>
          <div className="stack">
            {confirm === 'seed' ? (
              <p>Seed is free for up to 100 people and 2 office logins. Features from higher plans will be locked, but nothing is deleted.</p>
            ) : (
              <p>
                {money(interval === 'yearly' ? b.plans.find((p) => p.id === confirm)!.prices.yearly : b.plans.find((p) => p.id === confirm)!.prices.monthly, b.currency)} a {interval === 'yearly' ? 'year' : 'month'}.
                {b.online ? ' You will approve the payment on Razorpay with UPI AutoPay, a card or netbanking, and come back here.' : ''}
              </p>
            )}
            <FormError error={checkout.error} />
          </div>
        </Modal>
      )}
    </div>
  );
}

const empty = { keyId: '', keySecret: '', webhookSecret: '' };

/** The church's own Razorpay account: gifts go straight to the church. */
export function RazorpayCard({ india }: { india: boolean }) {
  const q = useApi(AdminApi.payments.status);
  const [editing, setEditing] = useState(false);
  const [main, setMain] = useState(empty);
  const [fcra, setFcra] = useState(empty);
  const [withFcra, setWithFcra] = useState(false);
  const connect = useAction(AdminApi.payments.connect);
  const disconnect = useAction(AdminApi.payments.disconnect);
  const toast = useToast();
  const st = q.data;
  const webhookUrl = st ? `${getApiUrl().replace(/\/v1$/, '')}${st.webhookPath}` : '';

  async function save() {
    const input: RazorpayKeysInput = { ...main, fcra: withFcra ? fcra : null };
    const r = await connect.run(input);
    if (!r) return;
    q.setData(r);
    setEditing(false);
    setMain(empty);
    setFcra(empty);
    toast('Razorpay connected');
  }

  const keyFields = (v: typeof empty, set: (v: typeof empty) => void, fields?: Record<string, string>) => (
    <div className="grid cols-3">
      <Field label="Key ID" error={fields?.keyId}><input className="input mono" value={v.keyId} onChange={(e) => set({ ...v, keyId: e.target.value.trim() })} placeholder="rzp_live_…" autoComplete="off" /></Field>
      <Field label="Key Secret" error={fields?.keySecret}><input className="input mono" type="password" value={v.keySecret} onChange={(e) => set({ ...v, keySecret: e.target.value.trim() })} autoComplete="new-password" /></Field>
      <Field label="Webhook secret" error={fields?.webhookSecret}><input className="input mono" type="password" value={v.webhookSecret} onChange={(e) => set({ ...v, webhookSecret: e.target.value.trim() })} autoComplete="new-password" /></Field>
    </div>
  );

  return (
    <div className="card">
      <div className="card-head"><h2>Online giving</h2><CreditCard size={18} className="muted" /></div>
      <div className="card-body stack">
        {!st ? (
          q.error ? <FormError error={q.error} /> : <Loading />
        ) : (
          <>
            <div className="row wrap">
              <div className="grow">
                <h3>Razorpay {st.connected ? <span className="badge ok">Connected{st.mode === 'test' ? ' (test mode)' : ''}</span> : <span className="badge warn">Not connected</span>}</h3>
                <p className="small muted">
                  Gifts are paid straight into the church’s own Razorpay account{st.keyId ? <> (<span className="mono">{st.keyId}</span>)</> : ''}. Flockwise never holds the money and takes no fee.
                  {st.serverKeys ? ' This church uses the keys set on the server.' : ''}
                  {!st.connected ? ' Until you connect, givers see a test checkout and no money moves.' : ''}
                </p>
              </div>
              {!editing && <button className="btn" onClick={() => setEditing(true)}>{st.keyId ? 'Change keys' : 'Connect Razorpay'}</button>}
              {!editing && st.keyId && <button className="btn ghost" disabled={disconnect.busy} onClick={async () => { const r = await disconnect.run(); if (r) { q.setData(r); toast('Razorpay disconnected'); } }}>Disconnect</button>}
            </div>
            {editing && (
              <div className="stack razorpay-form">
                <ol className="small muted steps">
                  <li>In the Razorpay Dashboard, open <b>Account &amp; Settings › API Keys</b> and generate a key. <a href="https://dashboard.razorpay.com/app/website-app-settings/api-keys" target="_blank" rel="noreferrer">Open Razorpay <ExternalLink size={12} /></a></li>
                  <li>In <b>Webhooks</b>, add this URL with the events <span className="mono">payment_link.paid</span>, <span className="mono">payment_link.cancelled</span>, <span className="mono">payment_link.expired</span>, <span className="mono">subscription.charged</span>, <span className="mono">subscription.halted</span>, <span className="mono">subscription.cancelled</span>, and choose a secret:<br /><span className="mono copyable">{webhookUrl}</span></li>
                  <li>Paste the Key ID, Key Secret and webhook secret here. They are stored encrypted.</li>
                </ol>
                {keyFields(main, setMain, connect.error?.fields)}
                {india && (
                  <label className="check"><input type="checkbox" checked={withFcra} onChange={(e) => setWithFcra(e.target.checked)} /><span>Also connect the FCRA account (a separate Razorpay account for the SBI FCRA account), for gifts from foreign citizens and OCI holders</span></label>
                )}
                {withFcra && keyFields(fcra, setFcra)}
                <FormError error={connect.error?.fields ? null : connect.error} />
                <div className="row">
                  <button className="btn primary" disabled={connect.busy || !main.keyId || !main.keySecret || !main.webhookSecret} onClick={save}>{connect.busy ? 'Checking with Razorpay…' : 'Save and connect'}</button>
                  <button className="btn ghost" onClick={() => { setEditing(false); connect.setError(null); }}>Cancel</button>
                </div>
              </div>
            )}
            {st.connected && !editing && st.keyId && (
              <p className="small muted">Webhook URL for Razorpay: <span className="mono copyable">{webhookUrl}</span></p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
