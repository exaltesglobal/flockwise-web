// The church's Flockwise plan in the office: the trial banner, locked menu items and the
// "part of a higher plan" screen shown in place of a page the plan does not include.
import { Lock, Sparkles } from 'lucide-react';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router';

import { adminSession } from '@/api/client';
import { AdminApi, type BillingView } from '@/api/endpoints';
import { atLeast, PLANS, planNeeded, type PlanId } from '@/core/plans';

// One request per sign-in; screens that change the plan call refreshPlan().
let cached: Promise<BillingView | null> | null = null;
let current: BillingView | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function load() {
  if (!adminSession.get()) return;
  cached ??= AdminApi.billing
    .get()
    .then((b) => {
      current = b;
      notify();
      return b;
    })
    .catch(() => {
      cached = null;
      return null;
    });
}

export function refreshPlan(next?: BillingView) {
  cached = null;
  if (next) {
    current = next;
    cached = Promise.resolve(next);
    notify();
  } else load();
}

adminSession.subscribe(() => {
  cached = null;
  current = null;
  notify();
  load();
});

/** The church's plan and usage, or null while loading. */
export function usePlan() {
  const b = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
    () => current,
  );
  useEffect(load, []);
  return b;
}

/** The plan a church-office path needs, when the church's plan does not include it. */
export function missingPlan(b: BillingView | null, path: string): PlanId | null {
  if (!b) return null;
  const need = planNeeded(path.replace(/\/$/, ''), 'GET', null);
  return need && !atLeast(b.plan, need) ? need : null;
}

export function PlanLock() {
  return <Lock size={13} className="nav-lock" aria-label="Upgrade to use" />;
}

export function PlanGate({ need }: { need: PlanId }) {
  const p = PLANS[need];
  return (
    <div className="plan-gate card">
      <Sparkles size={28} />
      <h2>{p.name} plan feature</h2>
      <p className="muted">This part of Flockwise is included from the {p.name} plan ({p.tagline.toLowerCase()}).</p>
      <ul>
        {p.highlights.slice(0, 5).map((h) => (
          <li key={h}>{h}</li>
        ))}
      </ul>
      <Link className="btn primary" to="/admin/settings#billing">See plans</Link>
    </div>
  );
}

/** A slim banner during the trial, or when a renewal payment failed. */
export function PlanBanner() {
  const b = usePlan();
  const [hidden, setHidden] = useState(false);
  if (!b || hidden || b.subscription.founding) return null;
  const s = b.subscription;
  let text: string | null = null;
  let tone = 'info';
  if (s.status === 'trial' && b.trialDaysLeft !== null && b.trialDaysLeft > 0) {
    text = `Free trial: ${b.trialDaysLeft} day${b.trialDaysLeft === 1 ? '' : 's'} left with every feature.`;
    if (b.trialDaysLeft <= 7) tone = 'warn';
  } else if (s.status === 'trial') {
    text = 'Your trial has ended, so the church is on the free Seed plan.';
    tone = 'warn';
  } else if (s.status === 'past_due') {
    text = 'The last plan payment did not go through. Update your payment to keep your features.';
    tone = 'warn';
  } else if (s.status === 'cancelled' && b.plan !== 'seed') {
    text = `Your ${PLANS[s.plan].name} plan is cancelled and ends on ${new Date(s.currentPeriodEnd ?? '').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}.`;
  }
  if (!text) return null;
  return (
    <div className={`plan-banner ${tone}`}>
      <span className="grow">{text}</span>
      <Link to="/admin/settings#billing" className="btn sm">Choose a plan</Link>
      <button className="btn ghost sm" onClick={() => setHidden(true)} aria-label="Hide">×</button>
    </div>
  );
}
