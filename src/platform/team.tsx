// The Flockwise team panel (/platform): every church, revenue, plans, trials and support access.
// Separate from any church office; team members sign in with their Flockwise email.
import { Activity, ArrowLeft, Building2, IndianRupee, LayoutDashboard, LogOut, Search, ShieldCheck, Users } from 'lucide-react';
import { useEffect, useState, useSyncExternalStore, type FormEvent } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router';

import { adminSession, memberSession, platformSession, type PlatformSession } from '@/api/client';
import { TeamApi, type TeamChurch, type TeamChurchDetail, type TeamOverview } from '@/api/endpoints';
import type { OtpRequest } from '@/api/types';
import { DemoBanner } from '@/components/server-settings';
import { BarChart, Empty, ErrorState, Field, FormError, Loading, Logo, Modal, useToast } from '@/components/ui';
import { PLAN_ORDER, PLANS, type PlanId } from '@/core/plans';
import { setChurch } from '@/lib/church';
import { isUsingMocks } from '@/lib/config';
import { formatRelative } from '@/lib/format';
import { useAction, useApi } from '@/lib/use-api';

const usePlatform = () => useSyncExternalStore((cb) => platformSession.subscribe(cb), () => platformSession.get());
const inr = (paise: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(paise / 100);
const usd = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(cents / 100);
const day = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

function subLabel(c: TeamChurch) {
  const s = c.subscription;
  if (c.status === 'suspended') return { text: 'Paused', tone: 'danger' };
  if (s.founding) return { text: 'Founding', tone: 'ok' };
  if (s.status === 'trial') return c.plan === 'seed' ? { text: 'Trial ended', tone: 'warn' } : { text: `Trial to ${day(s.trialEndsAt)}`, tone: '' };
  if (s.status === 'past_due') return { text: 'Payment failed', tone: 'danger' };
  if (s.status === 'cancelled') return { text: 'Cancelled', tone: 'warn' };
  return c.mrr > 0 ? { text: 'Paying', tone: 'ok' } : { text: 'Free', tone: '' };
}

export function TeamPanel() {
  const session = usePlatform();
  if (!session) return <TeamSignIn />;
  return <TeamShell session={session} />;
}

function TeamSignIn() {
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState<OtpRequest | null>(null);
  const [code, setCode] = useState('');
  const request = useAction(TeamApi.request);
  const verify = useAction(TeamApi.verify);

  async function onRequest(e: FormEvent) {
    e.preventDefault();
    const r = await request.run(email.trim());
    if (r) setOtp(r);
  }
  async function onVerify(e: FormEvent) {
    e.preventDefault();
    if (!otp) return;
    const s = await verify.run(otp.requestId, code.trim());
    if (s) platformSession.set(s);
  }

  return (
    <div className="auth-page">
      <DemoBanner text="Demo mode: any email opens the team panel, and the code is 123456." />
      <div className="auth-center">
        <div className="card auth-card">
          <Logo height={30} />
          <div>
            <h1>Flockwise team</h1>
            <p className="muted">For the Agape Labs team only. Church staff sign in at <Link to="/admin/sign-in">the church office</Link>.</p>
          </div>
          {!otp ? (
            <form className="stack" onSubmit={onRequest}>
              <Field label="Team email"><input className="input" type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@flockwise.church" /></Field>
              <FormError error={request.error} />
              <button className="btn primary lg block" disabled={!email.trim() || request.busy}>Send code</button>
            </form>
          ) : (
            <form className="stack" onSubmit={onVerify}>
              <Field label="Enter the 6-digit code" hint={`We sent it to ${email}.`}><input className="input otp-input" inputMode="numeric" autoFocus maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} /></Field>
              {isUsingMocks() && <p className="small muted">Demo mode: the code is 123456.</p>}
              <FormError error={verify.error} />
              <button className="btn primary lg block" disabled={code.length !== 6 || verify.busy}>Sign in</button>
              <button type="button" className="btn ghost block" onClick={() => setOtp(null)}>Use a different email</button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function TeamShell({ session }: { session: PlatformSession }) {
  const { pathname } = useLocation();
  const view = pathname.startsWith('/platform/churches') ? 'churches' : pathname.startsWith('/platform/activity') ? 'activity' : 'overview';
  async function signOut() {
    await TeamApi.signOut().catch(() => undefined);
    platformSession.set(null);
  }
  return (
    <div className="admin team">
      <DemoBanner text="Demo mode: sample churches. Nothing here is real." />
      <div className="admin-shell">
        <aside className="admin-side">
          <div className="admin-brand"><Logo reverse height={26} /></div>
          <div className="admin-church"><div className="ellipsis">Flockwise team</div><small>Agape Labs</small></div>
          <nav className="admin-nav">
            <NavLink to="/platform" end><LayoutDashboard size={18} /> Overview</NavLink>
            <NavLink to="/platform/churches"><Building2 size={18} /> Churches</NavLink>
            <NavLink to="/platform/activity"><Activity size={18} /> Team activity</NavLink>
          </nav>
          <div className="admin-user">
            <ShieldCheck size={20} />
            <div className="grow"><div className="ellipsis">{session.email}</div><small>Team</small></div>
            <button className="btn ghost icon sm" onClick={signOut} title="Sign out" aria-label="Sign out"><LogOut size={17} /></button>
          </div>
        </aside>
        <main className="admin-main">
          <div className="team-mobilebar row">
            <Logo height={22} />
            <span className="grow" />
            <Link to="/platform" className="btn ghost sm">Overview</Link>
            <Link to="/platform/churches" className="btn ghost sm">Churches</Link>
          </div>
          {view === 'overview' && <Overview />}
          {view === 'churches' && <Churches />}
          {view === 'activity' && <TeamActivity />}
        </main>
      </div>
    </div>
  );
}

function Overview() {
  const q = useApi(TeamApi.overview);
  if (q.error) return <ErrorState error={q.error} onRetry={q.reload} />;
  if (!q.data) return <Loading />;
  const o: TeamOverview = q.data;
  return (
    <>
      <div className="page-head"><div><h1>Overview</h1><p className="muted">All churches on Flockwise</p></div></div>
      <div className="grid cols-4">
        <div className="card kpi"><span className="label"><Building2 size={15} /> Churches</span><span className="value">{o.churches.toLocaleString('en-IN')}</span><span className="delta muted">+{o.newLast30} in 30 days · {o.activeLast30} active</span></div>
        <div className="card kpi"><span className="label"><IndianRupee size={15} /> Monthly revenue</span><span className="value">{inr(o.mrr.INR)}</span><span className="delta muted">{o.mrr.USD ? `+ ${usd(o.mrr.USD)} · ` : ''}{inr(o.arr.INR)} a year</span></div>
        <div className="card kpi"><span className="label"><ShieldCheck size={15} /> Paying</span><span className="value">{o.paying}</span><span className="delta muted">{o.trials} on trial</span></div>
        <div className="card kpi"><span className="label"><Users size={15} /> People</span><span className="value">{o.people.toLocaleString('en-IN')}</span><span className="delta muted">{o.messages.toLocaleString('en-IN')} messages · {o.aiCredits} AI credits this month</span></div>
      </div>
      <div className="grid cols-2">
        <div className="card">
          <div className="card-head"><h2>Sign-ups</h2><span className="small muted">Last 12 weeks</span></div>
          <div className="card-body"><BarChart data={o.signups.map((w) => ({ label: new Date(w.weekStart).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), value: w.signups }))} format={(v) => `${v} churches`} /></div>
        </div>
        <div className="card">
          <div className="card-head"><h2>Plans</h2></div>
          <div className="card-body stack-sm">
            {o.byPlan.map((p) => (
              <div key={p.plan} className="usage">
                <div className="row"><span className="grow">{p.name}</span><span className="mono small">{p.churches}</span></div>
                <div className="usage-bar"><span style={{ width: `${o.churches ? Math.round((p.churches / o.churches) * 100) : 0}%` }} /></div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="grid cols-2">
        <div className="card">
          <div className="card-head"><h2>Trials ending this week</h2></div>
          <div className="card-body">{o.trialsEnding.length ? <ul className="plain-list">{o.trialsEnding.map((t) => <li key={t.id}><Link to={`/platform/churches?open=${t.id}`}>{t.name}</Link> <span className="muted small">ends {day(t.trialEndsAt)}</span></li>)}</ul> : <p className="muted small">None this week.</p>}</div>
        </div>
        <div className="card">
          <div className="card-head"><h2>Failed renewals</h2></div>
          <div className="card-body">{o.pastDue.length ? <ul className="plain-list">{o.pastDue.map((t) => <li key={t.id}><Link to={`/platform/churches?open=${t.id}`}>{t.name}</Link> <span className="muted small">{PLANS[t.plan].name}</span></li>)}</ul> : <p className="muted small">No failed payments.</p>}</div>
        </div>
      </div>
    </>
  );
}

function Churches() {
  const { search } = useLocation();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [plan, setPlan] = useState('');
  const [status, setStatus] = useState('');
  const list = useApi(() => TeamApi.churches({ q, plan, status }), [q, plan, status]);
  const openId = new URLSearchParams(search).get('open');
  const setOpen = (id: string | null) => navigate(id ? `/platform/churches?open=${id}` : '/platform/churches', { replace: !id });

  return (
    <>
      <div className="page-head"><div><h1>Churches</h1><p className="muted">{list.data ? `${list.data.length} shown` : ' '}</p></div></div>
      <div className="card">
        <div className="card-body row wrap">
          <div className="search grow"><Search size={16} /><input className="input" placeholder="Name, address, city or owner email" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <select className="input" style={{ width: 'auto' }} value={plan} onChange={(e) => setPlan(e.target.value)}>
            <option value="">All plans</option>
            {PLAN_ORDER.map((p) => <option key={p} value={p}>{PLANS[p].name}</option>)}
          </select>
          <select className="input" style={{ width: 'auto' }} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Any status</option>
            <option value="trial">Trial</option>
            <option value="active">Active</option>
            <option value="past_due">Payment failed</option>
            <option value="cancelled">Cancelled</option>
            <option value="suspended">Paused</option>
          </select>
        </div>
        {list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : !list.data ? <Loading /> : list.data.length === 0 ? <Empty icon={<Building2 size={28} />} title="No churches match" /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Church</th><th>Plan</th><th>People</th><th>Logins</th><th>Last active</th><th>MRR</th><th>Joined</th></tr></thead>
              <tbody>
                {list.data.map((c) => {
                  const l = subLabel(c);
                  return (
                    <tr key={c.id} className="clickable" onClick={() => setOpen(c.id)}>
                      <td><strong>{c.name}</strong><div className="small muted">{c.city ? `${c.city} · ` : ''}<span className="mono">/c/{c.slug}</span></div></td>
                      <td>{PLANS[c.plan].name} <span className={`badge ${l.tone}`}>{l.text}</span></td>
                      <td className="mono">{c.people.toLocaleString('en-IN')}</td>
                      <td className="mono">{c.staff}</td>
                      <td className="small">{c.lastActiveAt ? formatRelative(c.lastActiveAt) : 'Never'}</td>
                      <td className="mono">{c.mrr ? (c.priceCurrency === 'INR' ? inr(c.mrr) : usd(c.mrr)) : '—'}</td>
                      <td className="small">{day(c.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {openId && <ChurchDrawer id={openId} onClose={() => setOpen(null)} onChanged={list.reload} />}
    </>
  );
}

function ChurchDrawer({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const q = useApi(() => TeamApi.church(id), [id]);
  const toast = useToast();
  const navigate = useNavigate();
  const sub = useAction(TeamApi.subscription);
  const update = useAction(TeamApi.update);
  const open = useAction(TeamApi.open);
  const [notes, setNotes] = useState<string | null>(null);
  const [planSel, setPlanSel] = useState<PlanId | ''>('');
  const [reason, setReason] = useState('');
  const [limit, setLimit] = useState('');
  useEffect(() => {
    setNotes(null);
    setPlanSel('');
    setLimit('');
  }, [id]);

  const c: TeamChurchDetail | null = q.data;
  const after = async (p: Promise<unknown>, msg: string) => {
    if (await p) {
      toast(msg);
      q.reload();
      onChanged();
    }
  };

  async function openOffice() {
    const r = await open.run(id, reason.trim());
    if (!r) return;
    memberSession.set(null);
    setChurch(r.church.slug);
    adminSession.set(r.session);
    navigate('/admin');
  }

  return (
    <Modal side wide title={c ? c.name : 'Church'} onClose={onClose}>
      {q.error ? <ErrorState error={q.error} onRetry={q.reload} /> : !c ? <Loading /> : (
        <div className="stack team-drawer">
          <div className="row wrap small muted">
            <span className="mono">/c/{c.slug}</span>
            <span>{c.city}{c.country !== 'IN' ? `, ${c.country}` : ''}</span>
            <span>Joined {day(c.createdAt)}</span>
            <span>Owner {c.ownerName} · {c.ownerEmail}</span>
          </div>
          <div className="stat-row">
            <div className="card kpi"><span className="label">Plan</span><span className="value">{PLANS[c.plan].name}</span><span className={`badge ${subLabel(c).tone}`}>{subLabel(c).text}</span></div>
            <div className="card kpi"><span className="label">People</span><span className="value">{c.people.toLocaleString('en-IN')}</span></div>
            <div className="card kpi"><span className="label">Logins</span><span className="value">{c.staff}</span></div>
            <div className="card kpi"><span className="label">MRR</span><span className="value">{c.mrr ? (c.priceCurrency === 'INR' ? inr(c.mrr) : usd(c.mrr)) : '—'}</span></div>
          </div>

          <section className="card card-pad stack">
            <h3>Plan</h3>
            <div className="row wrap">
              <select className="input" style={{ width: 'auto' }} value={planSel || c.subscription.plan} onChange={(e) => setPlanSel(e.target.value as PlanId)}>
                {PLAN_ORDER.map((p) => <option key={p} value={p}>{PLANS[p].name}</option>)}
              </select>
              <button className="btn" disabled={sub.busy || !planSel || planSel === c.subscription.plan} onClick={() => after(sub.run(id, { plan: planSel as PlanId, status: 'active' }), 'Plan changed')}>Set plan (active)</button>
              <button className="btn" disabled={sub.busy} onClick={() => after(sub.run(id, { plan: (planSel || c.subscription.plan) as PlanId, trialDays: 14 }), 'Trial extended by 14 days')}>Trial +14 days</button>
              <button className="btn ghost" disabled={sub.busy} onClick={() => after(sub.run(id, { founding: !c.subscription.founding }), c.subscription.founding ? 'Founding status removed' : 'Marked as a founding church')}>{c.subscription.founding ? 'Remove founding' : 'Make founding (no limits)'}</button>
            </div>
            <div className="row wrap">
              <Field label="Custom people limit" hint={c.subscription.peopleLimit ? `Now ${c.subscription.peopleLimit.toLocaleString('en-IN')}` : 'Uses the plan’s limit'}>
                <input className="input" inputMode="numeric" value={limit} onChange={(e) => setLimit(e.target.value.replace(/\D/g, ''))} placeholder={String(PLANS[c.subscription.plan].limits.people)} />
              </Field>
              <button className="btn" disabled={sub.busy} onClick={() => after(sub.run(id, { peopleLimit: limit ? Number(limit) : null }), limit ? 'People limit set' : 'People limit reset')}>{limit ? 'Set limit' : 'Use plan limit'}</button>
            </div>
            <FormError error={sub.error} />
          </section>

          <section className="card card-pad stack">
            <h3>Support access</h3>
            <p className="small muted">Opens the church office as the owner in this browser. The church sees it in its activity log.</p>
            <div className="row wrap">
              <input className="input grow" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason, e.g. Help with Excel import (ticket 42)" />
              <button className="btn primary" disabled={open.busy || reason.trim().length < 4 || c.status === 'suspended'} onClick={openOffice}>Open church office</button>
            </div>
            <FormError error={open.error} />
          </section>

          <section className="card card-pad stack">
            <h3>Account</h3>
            <Field label="Team notes (not seen by the church)">
              <textarea className="input" rows={3} value={notes ?? c.notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
            <div className="row wrap">
              <button className="btn" disabled={update.busy || notes === null || notes === c.notes} onClick={() => after(update.run(id, { notes: notes ?? '' }), 'Notes saved')}>Save notes</button>
              <span className="grow" />
              {c.status === 'active' ? (
                <button className="btn danger" disabled={update.busy} onClick={() => after(update.run(id, { status: 'suspended' }), 'Church paused')}>Pause church</button>
              ) : (
                <button className="btn" disabled={update.busy} onClick={() => after(update.run(id, { status: 'active' }), 'Church restored')}>Restore church</button>
              )}
            </div>
            <FormError error={update.error} />
          </section>

          <section className="card">
            <div className="card-head"><h3>Office team</h3></div>
            <div className="table-wrap">
              <table className="table">
                <tbody>
                  {c.team.map((m) => <tr key={m.id}><td>{m.name}<div className="small muted">{m.email}</div></td><td className="small">{m.role}</td><td className="small">{m.lastActiveAt ? formatRelative(m.lastActiveAt) : m.status}</td></tr>)}
                </tbody>
              </table>
            </div>
          </section>

          <div className="grid cols-2">
            <section className="card">
              <div className="card-head"><h3>Church activity</h3></div>
              <div className="card-body"><ul className="plain-list small">{c.activity.length ? c.activity.map((a) => <li key={a.id}><span className="muted">{formatRelative(a.at)}</span> {a.summary}</li>) : <li className="muted">Nothing yet.</li>}</ul></div>
            </section>
            <section className="card">
              <div className="card-head"><h3>Team log</h3></div>
              <div className="card-body"><ul className="plain-list small">{c.teamLog.length ? c.teamLog.map((a) => <li key={a.id}><span className="muted">{formatRelative(a.at)}</span> {a.summary} <span className="muted">· {a.actorName}</span></li>) : <li className="muted">Nothing yet.</li>}</ul></div>
            </section>
          </div>
        </div>
      )}
    </Modal>
  );
}

function TeamActivity() {
  const q = useApi(TeamApi.audit);
  return (
    <>
      <div className="page-head"><div><h1>Team activity</h1><p className="muted">Sign-ups, plan changes, pauses and support access</p></div></div>
      <div className="card">
        {q.error ? <ErrorState error={q.error} onRetry={q.reload} /> : !q.data ? <Loading /> : q.data.length === 0 ? <Empty icon={<Activity size={28} />} title="Nothing yet" /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>When</th><th>Who</th><th>What</th></tr></thead>
              <tbody>
                {q.data.map((a) => (
                  <tr key={a.id}>
                    <td className="small">{formatRelative(a.at)}</td>
                    <td className="small">{a.actorName}</td>
                    <td>{a.entityId ? <Link to={`/platform/churches?open=${a.entityId}`}>{a.summary}</Link> : a.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="small muted"><Link to="/admin"><ArrowLeft size={13} /> Back to the church office</Link></p>
    </>
  );
}
