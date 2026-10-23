// Settings › Plan and billing, and the church's own Razorpay keys for online giving.
import { Check, CreditCard, ExternalLink, Landmark, MessageCircle, Minus, Sparkles } from 'lucide-react';
import { Fragment, useState } from 'react';
import { Link } from 'react-router';

import { AdminApi, type BillingView, type RazorpayKeysInput } from '@/api/endpoints';
import { ErrorState, Field, FormError, Loading, Modal, Segmented, useToast } from '@/components/ui';
import { atLeast, FEATURES, PLAN_ORDER, type BillingInterval, type PlanId } from '@/core/plans';
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
  const [aiConfirm, setAiConfirm] = useState(false);
  const [withChitthi, setWithChitthi] = useState<boolean | null>(null);
  const [waModal, setWaModal] = useState(false);
  const [waPhone, setWaPhone] = useState('');
  const [waName, setWaName] = useState('');
  const chitthi = useAction(AdminApi.billing.chitthi);
  const checkout = useAction(AdminApi.billing.checkout);
  const cancel = useAction(AdminApi.billing.cancel);
  const aiPack = useAction(AdminApi.billing.buyAiPack);
  const toast = useToast();

  if (q.error) return <ErrorState error={q.error} onRetry={q.reload} />;
  if (!q.data) return <Loading />;
  const b: BillingView = q.data;
  const s = b.subscription;
  const current = b.plan;
  const currentPlan = b.plans.find((p) => p.id === current)!;

  async function choose(plan: PlanId) {
    const r = await checkout.run(plan, interval, withChitthi ?? !!s.chitthi);
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
  async function setChitthi(on: boolean) {
    const r = await chitthi.run(on ? { on, phone: waPhone, businessName: waName } : { on });
    if (!r) return;
    setWaModal(false);
    if (r.checkoutUrl) { window.location.href = r.checkoutUrl; return; }
    if (r.billing) { q.setData(r.billing); refreshPlan(r.billing); }
    toast(on ? 'Asked our team to set up WhatsApp' : 'WhatsApp by Chitthi removed');
  }
  async function buyAi() {
    const r = await aiPack.run();
    if (!r) return;
    setAiConfirm(false);
    if (r.checkoutUrl) { window.location.href = r.checkoutUrl; return; }
    if (r.billing) { q.setData(r.billing); refreshPlan(r.billing); }
    toast(`${b.addons.ai.credits} AI credits added for this month`);
  }

  const status = s.founding
    ? 'Founding church: every feature, no limits, nothing to pay.'
    : s.status === 'trial' && b.trialDaysLeft
      ? `Free trial of every feature until ${date(s.trialEndsAt)} (${b.trialDaysLeft} days left). Pick a plan below before it ends.`
      : s.status === 'trial'
        ? 'Your trial has ended. The church is on the free Seed plan.'
        : s.status === 'active' && current !== 'seed'
          ? `Renews ${s.interval === 'yearly' ? 'yearly' : 'monthly'}${s.currentPeriodEnd ? ` on ${date(s.currentPeriodEnd)}` : ''}.`
          : s.status === 'past_due'
            ? 'The last payment did not go through. Razorpay will try again; you can also start the plan again below.'
            : s.status === 'cancelled' && current !== 'seed'
              ? `Cancelled. Your features stay on until ${date(s.currentPeriodEnd)}.`
              : `Free forever, up to ${currentPlan.limits.people} people.`;
  const rank = (p: PlanId) => PLAN_ORDER.indexOf(p);
  const wa = b.addons.chitthi;
  const waLabel = wa.connected ? 'Connected: WhatsApp goes out through your own Chitthi workspace.' : wa.setup?.status === 'ready' ? 'Ready: our team has connected your workspace.' : wa.setup?.status === 'in_progress' ? `Our team is setting up ${wa.setup.phone}.${wa.setup.teamNote ? ` ${wa.setup.teamNote}` : ''}` : wa.setup?.status === 'requested' ? `Requested for ${wa.setup.phone}. We message within one working day.${wa.setup.teamNote ? ` ${wa.setup.teamNote}` : ''}` : null;
  const setupStatus = b.addons.razorpaySetup.status;
  const setupLabel = setupStatus === 'done' ? 'Done: your Razorpay account is live' : setupStatus === 'in_progress' ? 'In progress: our team is on it' : setupStatus === 'paid' ? 'Paid: send us your papers' : setupStatus === 'pending_payment' ? 'Payment pending' : null;

  return (
    <div className="stack">
      <div className="card">
        <div className="card-head"><h2>Your plan</h2><CreditCard size={18} className="muted" /></div>
        <div className="card-body billing-now">
          <div className="stack-sm">
            <div className="billing-plan">{currentPlan.name}{s.status === 'trial' && b.trialDaysLeft ? <span className="badge">Trial</span> : s.founding ? <span className="badge">Founding</span> : null}</div>
            <p className="small muted">{status}</p>
            {!s.founding && s.status === 'active' && current !== 'seed' && (
              <button className="btn ghost sm left" disabled={cancel.busy} onClick={async () => { const r = await cancel.run(); if (r) { q.setData(r); refreshPlan(r); toast('Plan cancelled'); } }}>Cancel plan</button>
            )}
            <FormError error={cancel.error} />
          </div>
          <div className="stack-sm">
            <Meter label="People" used={b.usage.people} limit={b.limits.people} />
            <Meter label="Office logins" used={b.usage.staff} limit={b.limits.staff} />
            <Meter label="Team app logins" used={b.usage.teamLogins} limit={b.limits.teamLogins} />
            <Meter label="Campuses" used={b.usage.campuses} limit={b.limits.campuses} />
            <Meter label="AI credits this month" used={b.usage.aiCredits} limit={b.limits.aiCredits + b.addons.ai.extraThisMonth} />
          </div>
        </div>
      </div>

      <div className="row wrap">
        <h2 className="grow">Plans</h2>
        <Segmented value={interval} options={[{ value: 'monthly', label: 'Monthly' }, { value: 'yearly', label: 'Yearly (2 months free)' }]} onChange={setInterval} />
      </div>
      <div className="plan-grid">
        {b.plans.map((p) => {
          const isCurrent = p.id === current && (s.founding || s.status === 'active' || s.status === 'trial' || p.id === 'seed');
          const price = interval === 'yearly' ? p.prices.yearly : p.prices.monthly;
          const direction = rank(p.id) > rank(current) ? 'up' : rank(p.id) < rank(current) ? 'down' : null;
          return (
            <div key={p.id} className={`plan-card ${p.id === current ? 'current' : p.id === 'thrive' ? 'featured' : ''}`}>
              <div className="row between">
                <h3 style={{ margin: 0 }}>{p.name}</h3>
                {p.id === current && <span className="badge ok">Current</span>}
              </div>
              <p className="small muted" style={{ margin: 0 }}>{p.tagline}</p>
              <div className="plan-price">
                {money(price, b.currency)}
                {price > 0 && <span className="small muted"> / {interval === 'yearly' ? 'year' : 'month'}</span>}
              </div>
              <p className="small" style={{ margin: 0 }}>Up to {p.limits.people >= 1_000_000 ? 'unlimited' : p.limits.people.toLocaleString('en-IN')} people · {p.limits.staff >= 1_000_000 ? 'unlimited' : p.limits.staff} office logins · {p.limits.teamLogins >= 1_000_000 ? 'unlimited' : p.limits.teamLogins} Team app logins · {p.limits.campuses >= 1_000_000 ? 'unlimited' : p.limits.campuses} {p.limits.campuses === 1 ? 'campus' : 'campuses'} · {p.limits.aiCredits.toLocaleString('en-IN')} AI credits a month</p>
              <ul>
                {p.highlights.map((h) => <li key={h}><Check size={14} /> {h}</li>)}
              </ul>
              {s.founding ? (
                <span className="small muted" style={{ textAlign: 'center' }}>{p.id === current ? 'Your founding plan' : 'Included in your founding plan'}</span>
              ) : (
                <button className={`btn block ${direction === 'up' ? 'primary' : ''}`} disabled={isCurrent || checkout.busy} onClick={() => setConfirm(p.id)}>
                  {isCurrent ? 'Current plan' : direction === 'down' ? `Move down to ${p.name}` : `Upgrade to ${p.name}`}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="card">
        <div className="card-head"><h2>Everything in each plan</h2><span className="small muted">Your plan is highlighted</span></div>
        <div className="table-wrap">
          <table className="table feature-table">
            <thead>
              <tr>
                <th>Feature</th>
                {b.plans.map((p) => <th key={p.id} className={p.id === current ? 'current' : ''}>{p.name}</th>)}
              </tr>
            </thead>
            <tbody>
              <tr className="limits"><td>People</td>{b.plans.map((p) => <td key={p.id} className={p.id === current ? 'current' : ''}>{p.limits.people >= 1_000_000 ? 'Unlimited' : p.limits.people.toLocaleString('en-IN')}</td>)}</tr>
              <tr className="limits"><td>Office logins</td>{b.plans.map((p) => <td key={p.id} className={p.id === current ? 'current' : ''}>{p.limits.staff >= 1_000_000 ? 'Unlimited' : p.limits.staff}</td>)}</tr>
              <tr className="limits"><td>Team app logins</td>{b.plans.map((p) => <td key={p.id} className={p.id === current ? 'current' : ''}>{p.limits.teamLogins >= 1_000_000 ? 'Unlimited' : p.limits.teamLogins}</td>)}</tr>
              <tr className="limits"><td>Campuses</td>{b.plans.map((p) => <td key={p.id} className={p.id === current ? 'current' : ''}>{p.limits.campuses >= 1_000_000 ? 'Unlimited' : p.limits.campuses}</td>)}</tr>
              <tr className="limits"><td>AI credits a month</td>{b.plans.map((p) => <td key={p.id} className={p.id === current ? 'current' : ''}>{p.limits.aiCredits.toLocaleString('en-IN')}</td>)}</tr>
              {FEATURES.map((g) => (
                <Fragment key={g.group}>
                  <tr className="group"><td colSpan={1 + b.plans.length}>{g.group}</td></tr>
                  {g.items.map((f) => (
                    <tr key={f.label}>
                      <td>{f.label}</td>
                      {b.plans.map((p) => <td key={p.id} className={p.id === current ? 'current' : ''}>{atLeast(p.id, f.from) ? <Check size={16} className="yes" /> : <Minus size={14} className="no" />}</td>)}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <h2>Add-ons</h2>
      <div className="plan-grid">
        <div className="plan-card">
          <div className="row" style={{ gap: 8 }}><Sparkles size={18} /><h3 style={{ margin: 0 }}>Extra AI credits</h3></div>
          <p className="small muted" style={{ margin: 0 }}>{b.addons.ai.credits} more requests for the assistant, writer, translator and sermon help, on top of your plan’s {b.limits.aiCredits.toLocaleString('en-IN')} a month. Valid for the current month.</p>
          <div className="plan-price">{money(b.addons.ai.price, b.currency)}<span className="small muted"> / pack</span></div>
          <p className="small" style={{ margin: 0 }}>This month: {b.usage.aiCredits.toLocaleString('en-IN')} used of {(b.limits.aiCredits + b.addons.ai.extraThisMonth).toLocaleString('en-IN')}{b.addons.ai.packsThisMonth ? ` (${b.addons.ai.packsThisMonth} pack${b.addons.ai.packsThisMonth === 1 ? '' : 's'} bought)` : ''}.</p>
          <button className="btn block" disabled={aiPack.busy} onClick={() => setAiConfirm(true)}>Buy {b.addons.ai.credits} credits</button>
        </div>
        <div className={`plan-card ${wa.on ? 'current' : ''}`}>
          <div className="row" style={{ gap: 8 }}><MessageCircle size={18} /><h3 style={{ margin: 0 }}>WhatsApp by Chitthi</h3>{wa.on && <span className="badge ok">On</span>}</div>
          <p className="small muted" style={{ margin: 0 }}>Your own WhatsApp Business workspace on the same invoice. Our team registers the number with Meta, gets the first templates approved (service reminder, birthday, giving receipt, prayer chain) and connects it, so reminders, receipts and the WhatsApp assistant work on day one. Nothing to set up yourself.</p>
          <div className="plan-price">{wa.included ? 'Included' : money(wa.price, b.currency)}<span className="small muted">{wa.included ? ` in ${b.plans.find((p) => p.id === current)?.name}` : ' / month'}</span></div>
          {!wa.included && <p className="small muted" style={{ margin: 0 }}>Included in {b.plans.find((p) => p.id === wa.includedFrom)?.name}. Chitthi's own plan starts at about the same price, so the bundle costs the church nothing extra over using Chitthi alone.</p>}
          {waLabel && <p className="small" style={{ margin: 0 }}>{waLabel}</p>}
          {wa.on && wa.setup?.status !== 'cancelled' && wa.setup ? (
            <div className="row wrap" style={{ gap: 8 }}>
              {!wa.included && !s.founding && <button className="btn block" disabled={chitthi.busy} onClick={() => { if (window.confirm('Remove WhatsApp by Chitthi from your plan? The workspace stays connected until you disconnect it in Settings › Integrations.')) void setChitthi(false); }}>Remove from plan</button>}
            </div>
          ) : (
            <button className="btn block primary" disabled={chitthi.busy || (current === 'seed' && !s.founding)} onClick={() => setWaModal(true)}>{wa.on ? 'Ask us to set it up' : 'Add to plan'}</button>
          )}
          {current === 'seed' && !s.founding && <p className="small muted" style={{ margin: 0 }}>Comes with Grow and above.</p>}
          <FormError error={chitthi.error} />
        </div>
        {b.addons.razorpaySetup.available && (
          <div className="plan-card">
            <div className="row" style={{ gap: 8 }}><Landmark size={18} /><h3 style={{ margin: 0 }}>Razorpay account opening with KYC</h3></div>
            <p className="small muted" style={{ margin: 0 }}>Our team opens the church’s own Razorpay account, prepares the KYC papers with you and follows up until gifts can come in by UPI, cards and netbanking. One-time, India only.</p>
            <div className="plan-price">{money(b.addons.razorpaySetup.price, 'INR')}<span className="small muted"> once</span></div>
            {setupLabel && <p className="small" style={{ margin: 0 }}>{setupLabel}</p>}
            <Link className={`btn block ${setupStatus ? '' : 'primary'}`} to="/admin/razorpay-setup">{setupStatus ? 'Open setup' : 'Start setup'}</Link>
          </div>
        )}
      </div>
      <p className="small muted">Plans and add-ons are billed by Agape Labs (Exaltes Global Private Limited) through Razorpay. Gifts to your church never pass through Flockwise and carry no platform fee.</p>

      {confirm && (
        <Modal title={confirm === 'seed' ? 'Move to the free Seed plan?' : `${rank(confirm) < rank(current) ? 'Move down to' : 'Upgrade to'} ${b.plans.find((p) => p.id === confirm)?.name}`} onClose={() => setConfirm(null)}
          footer={<><button className="btn ghost" onClick={() => setConfirm(null)}>Not now</button><button className="btn primary" disabled={checkout.busy} onClick={() => choose(confirm)}>{checkout.busy ? '…' : confirm === 'seed' ? 'Move to Seed' : b.online ? 'Continue to payment' : 'Start plan'}</button></>}>
          <div className="stack">
            {confirm === 'seed' ? (
              <p>Seed is free for up to {b.plans[0].limits.people} people and {b.plans[0].limits.staff} office logins. Features from higher plans will be locked, but nothing is deleted.</p>
            ) : (
              <p>
                {money(interval === 'yearly' ? b.plans.find((p) => p.id === confirm)!.prices.yearly : b.plans.find((p) => p.id === confirm)!.prices.monthly, b.currency)} a {interval === 'yearly' ? 'year' : 'month'}.
                {rank(confirm) < rank(current) ? ' Features above this plan will be locked at once; nothing is deleted, and they come back if you move up again.' : ''}
                {b.online ? ' You will approve the payment on Razorpay with UPI AutoPay, a card or netbanking, and come back here.' : ''}
              </p>
            )}
            {confirm !== 'seed' && confirm !== wa.includedFrom && PLAN_ORDER.indexOf(confirm) < PLAN_ORDER.indexOf(wa.includedFrom) && (
              <label className="row small" style={{ gap: 8 }}><input type="checkbox" checked={withChitthi ?? !!s.chitthi} onChange={(e) => setWithChitthi(e.target.checked)} /> Add WhatsApp by Chitthi for {money(interval === 'yearly' ? wa.price * 10 : wa.price, b.currency)} a {interval === 'yearly' ? 'year' : 'month'} on the same invoice</label>
            )}
            <FormError error={checkout.error} />
          </div>
        </Modal>
      )}
      {waModal && (
        <Modal title="WhatsApp by Chitthi" onClose={() => setWaModal(false)}
          footer={<><button className="btn ghost" onClick={() => setWaModal(false)}>Not now</button><button className="btn primary" disabled={chitthi.busy || !waPhone.trim() || !waName.trim()} onClick={() => void setChitthi(true)}>{chitthi.busy ? '…' : wa.included || s.founding ? 'Ask us to set it up' : b.online ? 'Continue to payment' : 'Add to plan'}</button></>}>
          <div className="stack">
            <p className="small muted">{wa.included || s.founding ? 'Included in your plan.' : `${money(wa.price, b.currency)} a month on your ${b.plans.find((p) => p.id === current)?.name} invoice${b.online ? '; you will approve the new amount on Razorpay' : ''}.`} Our team opens the Chitthi workspace, registers the number with Meta and connects it here. Use a number that is not already on WhatsApp, or one you are ready to move.</p>
            <Field label="WhatsApp number, with country code" hint="A number the church owns, e.g. the office SIM."><input className="input" value={waPhone} onChange={(e) => setWaPhone(e.target.value)} placeholder="+91 98765 43210" /></Field>
            <Field label="Name people see on WhatsApp"><input className="input" value={waName} onChange={(e) => setWaName(e.target.value)} placeholder="Grace Community Church" /></Field>
            <FormError error={chitthi.error} />
          </div>
        </Modal>
      )}
      {aiConfirm && (
        <Modal title={`Buy ${b.addons.ai.credits} AI credits?`} onClose={() => setAiConfirm(false)}
          footer={<><button className="btn ghost" onClick={() => setAiConfirm(false)}>Not now</button><button className="btn primary" disabled={aiPack.busy} onClick={() => void buyAi()}>{aiPack.busy ? '…' : b.addons.ai.online && b.online ? 'Continue to payment' : 'Add credits'}</button></>}>
          <div className="stack">
            <p>{money(b.addons.ai.price, b.currency)} for {b.addons.ai.credits} extra AI requests this month. Unused credits do not carry over.</p>
            <FormError error={aiPack.error} />
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
            {!st.keyId && !editing && india && (
              <div className="callout row wrap" style={{ gap: 10 }}>
                <span className="grow small"><strong>No Razorpay account yet?</strong> Our team can open it and do the church’s KYC for you, for a one-time ₹1,999.</span>
                <Link to="/admin/razorpay-setup" className="btn sm">Get assisted setup</Link>
              </div>
            )}
            {editing && (
              <div className="stack razorpay-form">
                <ol className="small muted steps">
                  <li>In the Razorpay Dashboard, open <b>Account &amp; Settings › API Keys</b> and generate a key. <a href="https://dashboard.razorpay.com/app/website-app-settings/api-keys" target="_blank" rel="noreferrer">Open Razorpay <ExternalLink size={12} /></a></li>
                  <li>In <b>Webhooks</b>, add this URL with the events <span className="mono">payment_link.paid</span>, <span className="mono">payment_link.cancelled</span>, <span className="mono">payment_link.expired</span>, <span className="mono">subscription.activated</span>, <span className="mono">subscription.charged</span>, <span className="mono">subscription.pending</span>, <span className="mono">subscription.halted</span>, <span className="mono">subscription.paused</span>, <span className="mono">subscription.resumed</span>, <span className="mono">subscription.cancelled</span>, <span className="mono">subscription.completed</span>, <span className="mono">qr_code.credited</span>, and choose a secret:<br /><span className="mono copyable">{webhookUrl}</span></li>
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
