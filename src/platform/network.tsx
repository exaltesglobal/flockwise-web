// The church network and diocese office (/network). A network leader signs in with an email code,
// makes a network and gives its join code to each church office. The panel adds up each church's
// totals: people, Sunday attendance, groups, serving, and giving where a church chooses to share it.
// It never shows anyone's name or details.
import { ArrowLeft, Building2, Copy, Download, HandCoins, LogOut, Network as NetworkIcon, Plus, RefreshCw, Trash2, TrendingDown, TrendingUp, UserPlus, Users } from 'lucide-react';
import { useEffect, useState, useSyncExternalStore, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';

import { networkSession, type PlatformSession } from '@/api/client';
import { NetworkApi } from '@/api/endpoints';
import type { OtpRequest } from '@/api/types';
import type { NetworkChurchStats, NetworkKind, NetworkOverview } from '@/core/types';
import { DemoBanner } from '@/components/server-settings';
import { BarChart, Empty, ErrorState, Field, FormError, Loading, Logo, Modal, useToast } from '@/components/ui';
import { isUsingMocks } from '@/lib/config';
import { downloadCsv, formatMoney, formatMoneyShort, formatRelative } from '@/lib/format';
import { useAction, useApi } from '@/lib/use-api';

import '../admin/admin.css';

const KIND_LABEL: Record<NetworkKind, string> = { network: 'Church network', diocese: 'Diocese', denomination: 'Denomination', association: 'Association' };
const useNetworkSession = () => useSyncExternalStore((cb) => networkSession.subscribe(cb), () => networkSession.get());
const num = (n: number) => n.toLocaleString('en-IN');
const pct = (part: number, whole: number) => (whole ? `${Math.round((part * 100) / whole)}%` : '—');
const shortDay = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'short' });

export function NetworkPanel() {
  const session = useNetworkSession();
  if (!session) return <NetworkSignIn />;
  return <NetworkShell session={session} />;
}

function NetworkSignIn() {
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState<OtpRequest | null>(null);
  const [code, setCode] = useState('');
  const request = useAction(NetworkApi.request);
  const verify = useAction(NetworkApi.verify);

  async function onRequest(e: FormEvent) {
    e.preventDefault();
    const r = await request.run(email.trim());
    if (r) setOtp(r);
  }
  async function onVerify(e: FormEvent) {
    e.preventDefault();
    if (!otp) return;
    const s = await verify.run(otp.requestId, code.trim());
    if (s) networkSession.set(s);
  }

  return (
    <div className="auth-page">
      <DemoBanner text="Demo mode: any email opens a sample network of four churches, and the code is 123456." />
      <div className="auth-center">
        <div className="card auth-card">
          <Logo height={30} />
          <div>
            <h1>Network office</h1>
            <p className="muted">For dioceses, denominations and church networks. See every church’s attendance, growth and giving totals in one place. Church staff sign in at <Link to="/admin/sign-in">the church office</Link>.</p>
          </div>
          {!otp ? (
            <form className="stack" onSubmit={onRequest}>
              <Field label="Your email"><input className="input" type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="office@diocese.org" /></Field>
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
          <p className="small muted" style={{ margin: 0 }}>Each church shares totals only. Names, phone numbers and individual gifts never leave the church.</p>
        </div>
      </div>
    </div>
  );
}

function NetworkShell({ session }: { session: PlatformSession }) {
  const { id } = useParams();
  async function signOut() {
    await NetworkApi.signOut().catch(() => undefined);
    networkSession.set(null);
  }
  return (
    <div className="net-page">
      <DemoBanner text="Demo mode: sample churches. Nothing here is real." />
      <header className="net-top">
        <Link to="/network" className="row" style={{ gap: 10, color: 'inherit', textDecoration: 'none' }}><Logo height={24} /><span className="net-tag">Network office</span></Link>
        <span className="grow" />
        <span className="small muted ellipsis net-email">{session.email}</span>
        <button className="btn ghost sm" onClick={signOut}><LogOut size={15} /> Sign out</button>
      </header>
      <main className="net-main stack">{id ? <Overview id={id} email={session.email} /> : <NetworkList />}</main>
    </div>
  );
}

function NetworkList() {
  const list = useApi(NetworkApi.mine);
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  // One network: go straight to it.
  useEffect(() => {
    if (list.data?.length === 1) navigate(`/network/${list.data[0].id}`, { replace: true });
  }, [list.data, navigate]);
  if (list.error) return <ErrorState error={list.error} onRetry={list.reload} />;
  if (!list.data) return <Loading />;
  return (
    <>
      <div className="page-head">
        <div><h1>Your networks</h1><p className="muted">Make a network, then give its join code to each church office.</p></div>
        <button className="btn primary" onClick={() => setCreating(true)}><Plus size={16} /> New network</button>
      </div>
      {list.data.length === 0 ? (
        <div className="card"><Empty icon={<NetworkIcon size={28} />} title="No networks yet" body="Start one for your diocese, denomination or group of churches. Churches on Flockwise join with a code from their Settings." /></div>
      ) : (
        <div className="grid cols-2">
          {list.data.map((n) => (
            <Link key={n.id} to={`/network/${n.id}`} className="card card-pad" style={{ color: 'inherit', textDecoration: 'none' }}>
              <span className="small muted">{KIND_LABEL[n.kind]}</span>
              <h2 style={{ margin: '4px 0' }}>{n.name}</h2>
              <span className="small">{n.churches} {n.churches === 1 ? 'church' : 'churches'}</span>
            </Link>
          ))}
        </div>
      )}
      {creating && <CreateModal onClose={() => setCreating(false)} onDone={(id) => navigate(`/network/${id}`)} />}
    </>
  );
}

function CreateModal({ onClose, onDone }: { onClose: () => void; onDone: (id: string) => void }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<NetworkKind>('diocese');
  const create = useAction(NetworkApi.create);
  return (
    <Modal title="New network" onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={name.trim().length < 3 || create.busy} onClick={async () => { const n = await create.run({ name: name.trim(), kind }); if (n) onDone(n.id); }}>Create</button></>}>
      <div className="stack">
        <Field label="Name"><input className="input" autoFocus value={name} placeholder="Diocese of Hyderabad" onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Kind">
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value as NetworkKind)}>
            {(Object.keys(KIND_LABEL) as NetworkKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
        </Field>
        <FormError error={create.error} />
      </div>
    </Modal>
  );
}

function Overview({ id, email }: { id: string; email: string }) {
  const q = useApi(() => NetworkApi.overview(id), [id]);
  const [data, setData] = useState<NetworkOverview | null>(null);
  useEffect(() => setData(q.data ?? null), [q.data]);
  if (q.error) return <ErrorState error={q.error} onRetry={q.reload} />;
  if (!data) return <Loading />;
  const o = data;
  const t = o.totals;
  const change = (() => {
    const pts = o.attendance;
    const avg = (xs: typeof pts) => (xs.length ? xs.reduce((n, x) => n + x.count, 0) / xs.length : 0);
    const now = avg(pts.slice(-4));
    const before = avg(pts.slice(-8, -4));
    return before ? Math.round(((now - before) * 100) / before) : null;
  })();

  function exportCsv() {
    downloadCsv(`${o.network.name.replace(/[^\w]+/g, '-').toLowerCase()}-churches.csv`, [
      ['Church', 'City', 'People', 'Members', 'Households', 'New in 90 days', 'Average Sunday (last 4)', 'Change %', 'Last Sunday', 'Groups', 'In groups', 'Serving', 'Baptisms this year', `Giving last 12 months (${o.giving.currency})`, 'Online last stream', 'Joined'],
      ...o.churches.map((c) => [c.name, c.city, c.people, c.members, c.households, c.newPeople90, c.avgAttendance, c.attendanceChange, c.lastSunday, c.groups, c.inGroups, c.serving, c.baptismsThisYear, c.giving12m === null ? 'Not shared' : c.currency === o.giving.currency ? c.giving12m / 100 : `${c.giving12m / 100} ${c.currency}`, c.onlineLastStream, c.joinedAt.slice(0, 10)]),
    ]);
  }

  return (
    <>
      <Link to="/network" className="small muted row" style={{ gap: 4 }}><ArrowLeft size={14} /> Your networks</Link>
      <div className="page-head">
        <div><h1>{o.network.name}</h1><p className="muted">{KIND_LABEL[o.network.kind]} · {t.churches} {t.churches === 1 ? 'church' : 'churches'}</p></div>
        {o.churches.length > 0 && <button className="btn" onClick={exportCsv}><Download size={16} /> Export CSV</button>}
      </div>

      <div className="grid cols-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
        <div className="card kpi"><span className="label"><Users size={15} /> Sunday attendance</span><span className="value">{num(t.avgAttendance)}</span><span className={`delta ${change === null ? 'muted' : change >= 0 ? 'up' : 'down'}`}>{change === null ? 'average of the last 4 Sundays' : `${change >= 0 ? '+' : ''}${change}% on the 4 before`}</span></div>
        <div className="card kpi"><span className="label"><Users size={15} /> People</span><span className="value">{num(t.people)}</span><span className="delta muted">{num(t.members)} members · {num(t.households)} households</span></div>
        <div className="card kpi"><span className="label"><UserPlus size={15} /> New in 90 days</span><span className="value">{num(t.newPeople90)}</span><span className="delta muted">{num(t.baptismsThisYear)} baptisms this year</span></div>
        <div className="card kpi"><span className="label"><Building2 size={15} /> In a group</span><span className="value">{pct(t.inGroups, t.people)}</span><span className="delta muted">{num(t.inGroups)} people · {num(t.serving)} serving</span></div>
      </div>

      {o.churches.length === 0 ? (
        <JoinCode o={o} onChange={setData} />
      ) : (
        <>
          <div className="grid cols-2">
            <div className="card">
              <div className="card-head"><h2>Sunday attendance, all churches</h2><span className="small muted">Last 12 weeks</span></div>
              <div className="card-body">{o.attendance.length ? <BarChart data={o.attendance.map((w) => ({ label: shortDay(w.weekStart), value: w.count }))} format={(v) => `${num(v)} people`} /> : <p className="muted small">No attendance recorded yet.</p>}</div>
            </div>
            <div className="card">
              <div className="card-head"><h2><HandCoins size={17} style={{ verticalAlign: '-3px' }} /> Giving</h2><span className="small muted">{o.giving.churches} of {t.churches} share it</span></div>
              <div className="card-body">
                {o.giving.churches === 0 ? (
                  <p className="muted small">No church shares its giving totals yet. Each church office can turn this on in Settings › Networks.</p>
                ) : (
                  <>
                    <div className="row wrap" style={{ gap: 6, alignItems: 'baseline' }}><b style={{ fontSize: '1.5rem' }}>{formatMoney(o.giving.total, o.giving.currency)}</b><span className="small muted">in the last 12 months</span></div>
                    <BarChart data={o.giving.months.map((m) => ({ label: monthLabel(m.month), value: m.amount }))} format={(v) => formatMoney(v, o.giving.currency)} />
                  </>
                )}
              </div>
            </div>
          </div>
          <ChurchTable o={o} onChange={setData} />
          <div className="grid cols-2">
            <JoinCode o={o} onChange={setData} />
            <Leaders o={o} email={email} onChange={setData} />
          </div>
        </>
      )}
      {o.churches.length === 0 && <Leaders o={o} email={email} onChange={setData} />}
    </>
  );
}

function Trend({ c }: { c: NetworkChurchStats }) {
  if (c.attendanceChange === null) return null;
  const up = c.attendanceChange >= 0;
  return <span className={`net-trend ${up ? 'up' : 'down'}`}>{up ? <TrendingUp size={13} /> : <TrendingDown size={13} />}{up ? '+' : ''}{c.attendanceChange}%</span>;
}

function ChurchTable({ o, onChange }: { o: NetworkOverview; onChange: (o: NetworkOverview) => void }) {
  const [removing, setRemoving] = useState<NetworkChurchStats | null>(null);
  const remove = useAction(() => NetworkApi.removeChurch(o.network.id, removing!.churchId));
  const toast = useToast();
  return (
    <div className="card">
      <div className="card-head"><h2>Churches</h2><span className="small muted">Sorted by Sunday attendance</span></div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Church</th><th>Sunday</th><th>People</th><th>New (90 days)</th><th>In groups</th><th>Serving</th><th>Giving (12 months)</th><th>Online</th><th /></tr></thead>
          <tbody>
            {o.churches.map((c) => (
              <tr key={c.churchId}>
                <td><strong>{c.name}</strong><div className="small muted">{c.city || '—'}{c.lastActiveAt ? ` · active ${formatRelative(c.lastActiveAt)}` : ''}</div></td>
                <td className="mono">{num(c.avgAttendance)} <Trend c={c} /></td>
                <td className="mono">{num(c.people)}</td>
                <td className="mono">{num(c.newPeople90)}</td>
                <td className="mono">{pct(c.inGroups, c.people)}</td>
                <td className="mono">{num(c.serving)}</td>
                <td className="mono">{c.giving12m === null ? <span className="badge gray">Not shared</span> : formatMoneyShort(c.giving12m, c.currency)}</td>
                <td className="mono">{c.onlineLastStream ?? '—'}</td>
                <td><button className="btn ghost icon sm" title={`Remove ${c.name}`} aria-label={`Remove ${c.name}`} onClick={() => setRemoving(c)}><Trash2 size={15} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {removing && (
        <Modal title={`Remove ${removing.name}?`} onClose={() => setRemoving(null)} footer={<><button className="btn ghost" onClick={() => setRemoving(null)}>Cancel</button><button className="btn danger" disabled={remove.busy} onClick={async () => { const r = await remove.run(); if (r) { onChange(r); setRemoving(null); toast('Removed from the network'); } }}>Remove</button></>}>
          <p>Its numbers stop showing here. The church keeps all its own data, and can join again with the join code.</p>
          <FormError error={remove.error} />
        </Modal>
      )}
    </div>
  );
}

function JoinCode({ o, onChange }: { o: NetworkOverview; onChange: (o: NetworkOverview) => void }) {
  const toast = useToast();
  const regen = useAction(() => NetworkApi.newCode(o.network.id));
  const [confirming, setConfirming] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(o.network.code);
      toast('Copied');
    } catch {
      toast(o.network.code);
    }
  };
  return (
    <div className="card card-pad stack">
      <h2 style={{ margin: 0 }}>Add a church</h2>
      <p className="small muted" style={{ margin: 0 }}>Give this code to the church office. They enter it in Flockwise under Settings › Networks and choose whether to share their giving totals.</p>
      <div className="net-code">
        <span className="mono">{o.network.code}</span>
        <button className="btn sm" onClick={copy}><Copy size={14} /> Copy</button>
      </div>
      {confirming ? (
        <div className="row wrap" style={{ gap: 8 }}>
          <span className="small grow">The old code stops working. Churches already in stay in.</span>
          <button className="btn sm ghost" onClick={() => setConfirming(false)}>Cancel</button>
          <button className="btn sm" disabled={regen.busy} onClick={async () => { const r = await regen.run(); if (r) { onChange(r); setConfirming(false); toast('New code made'); } }}>Make new code</button>
        </div>
      ) : <button className="btn ghost sm" style={{ alignSelf: 'flex-start' }} onClick={() => setConfirming(true)}><RefreshCw size={14} /> New code</button>}
    </div>
  );
}

function Leaders({ o, email, onChange }: { o: NetworkOverview; email: string; onChange: (o: NetworkOverview) => void }) {
  const [add, setAdd] = useState('');
  const save = useAction((admins: string[]) => NetworkApi.update(o.network.id, { admins }));
  const toast = useToast();
  const run = async (admins: string[]) => {
    const r = await save.run(admins);
    if (r) {
      onChange(r);
      setAdd('');
      toast('Saved');
    }
  };
  return (
    <div className="card card-pad stack">
      <h2 style={{ margin: 0 }}>Network leaders</h2>
      <p className="small muted" style={{ margin: 0 }}>Everyone here signs in with their email and sees the same totals.</p>
      <div className="stack" style={{ gap: 0 }}>
        {o.network.admins.map((a) => (
          <div key={a} className="list-row" style={{ paddingInline: 0 }}>
            <span className="grow ellipsis">{a}{a === email && <span className="small muted"> (you)</span>}</span>
            {a !== email && <button className="btn ghost icon sm" aria-label={`Remove ${a}`} disabled={save.busy} onClick={() => run(o.network.admins.filter((x) => x !== a))}><Trash2 size={15} /></button>}
          </div>
        ))}
      </div>
      <form className="row" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); if (add.trim()) void run([...o.network.admins, add.trim()]); }}>
        <input className="input grow" type="email" placeholder="colleague@diocese.org" value={add} onChange={(e) => setAdd(e.target.value)} />
        <button className="btn" disabled={!add.trim() || save.busy}><UserPlus size={15} /> Add</button>
      </form>
      <FormError error={save.error} />
    </div>
  );
}
