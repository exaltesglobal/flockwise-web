// Missions support: missionaries the church supports, monthly commitments (members and the church budget),
// gifts received to each missionary's fund and money sent on, and field reports for supporters.
import { ArrowLeft, Globe, Plus, Send, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';

import type { Currency, MissionaryDetail, MissionPayout, MissionSupportView, SupportStatus } from '@/api/admin-types';
import { adminSession } from '@/api/client';
import { AdminApi, type MissionaryInput } from '@/api/endpoints';
import { BarChart, Empty, ErrorState, Field, FormError, Loading, Modal, Segmented, useToast } from '@/components/ui';
import { formatDate, formatMoney, formatMoneyShort } from '@/lib/format';
import { useCan } from '@/lib/perms';
import { useSession } from '@/lib/session';
import { useAction, useApi } from '@/lib/use-api';

import { PersonSearch, type PickedPerson } from '../components/person-picker';
import { PageHeader } from '../layout';

const STATUS: Record<SupportStatus, { label: string; cls: string }> = {
  behind: { label: 'Behind', cls: 'warn' },
  on_track: { label: 'Giving', cls: 'ok' },
  autopay: { label: 'AutoPay', cls: 'ok' },
  church: { label: 'Church budget', cls: '' },
  ended: { label: 'Ended', cls: 'gray' },
};
const METHODS: { value: MissionPayout['method']; label: string }[] = [
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'upi', label: 'UPI' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'cash', label: 'Cash' },
];
const toPaise = (v: string) => Math.round(Number(v || 0) * 100);
const today = () => new Date().toISOString().slice(0, 10);
const day = (d: string) => formatDate(`${d}T00:00:00Z`);

function useCurrency() {
  return (useSession(adminSession)?.church.currency ?? 'INR') as Currency;
}

export function MissionsPage() {
  const { id } = useParams();
  return id ? <MissionaryPage id={id} /> : <MissionsList />;
}

function MissionsList() {
  const can = useCan();
  const currency = useCurrency();
  const { data, error, reload } = useApi(AdminApi.missions.overview);
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const m = (v: number) => formatMoney(v, currency);
  const add = can('giving.edit') && <button className="btn primary" onClick={() => setCreating(true)}><Plus size={16} /> Add missionary</button>;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <Loading />;
  return (
    <>
      <PageHeader title="Missions" subtitle="The missionaries you support: monthly commitments, gifts in, money sent on and news from the field." actions={add} />
      {data.missionaries.length === 0 ? (
        <div className="card"><Empty icon={<Globe size={28} />} title="No missionaries yet" body="Add the missionaries, children's homes and mission projects your church supports. Each gets its own fund for gifts and 80G receipts." action={add} /></div>
      ) : (
        <>
          <div className="grid cols-4" style={{ marginBottom: 16 }}>
            <div className="card kpi"><span className="label">Committed each month</span><span className="value">{formatMoneyShort(data.committed, currency)}</span>{data.needed > 0 && <span className="small muted">of {formatMoneyShort(data.needed, currency)} needed</span>}</div>
            <div className="card kpi"><span className="label">Received this year</span><span className="value">{formatMoneyShort(data.receivedFy, currency)}</span></div>
            <div className="card kpi"><span className="label">Sent on this year</span><span className="value">{formatMoneyShort(data.sentFy, currency)}</span></div>
            <div className="card kpi"><span className="label">Supporters behind</span><span className="value">{data.behind.length}</span>{data.behind.length > 0 && <span className="small muted">{data.behind.slice(0, 2).map((b) => b.name).join(', ')}{data.behind.length > 2 ? '…' : ''}</span>}</div>
          </div>
          <div className="grid cols-3 ms-cards">
            {data.missionaries.map((x) => {
              const pct = x.monthlyNeed ? Math.min(100, Math.round((x.committed * 100) / x.monthlyNeed)) : null;
              return (
                <button key={x.id} type="button" className={`card card-pad stack ms-card ${x.status === 'ended' ? 'ended' : ''}`} onClick={() => navigate(`/admin/missions/${x.id}`)}>
                  <div className="row" style={{ gap: 12, minWidth: 0 }}>
                    <span className="ms-avatar">{x.photoUrl ? <img src={x.photoUrl} alt="" /> : x.name.replace(/^(Rev\.|Dr\.|Mr\.|Mrs\.)\s*/, '').slice(0, 1)}</span>
                    <span className="grow" style={{ minWidth: 0 }}>
                      <b className="ms-name">{x.name}</b>
                      <span className="small muted ms-sub">{x.field}{x.organisation ? ` · ${x.organisation}` : ''}</span>
                    </span>
                  </div>
                  <div className="row between small"><span><b>{m(x.committed)}</b> a month</span>{x.monthlyNeed ? <span className="muted">of {formatMoneyShort(x.monthlyNeed, currency)}</span> : null}</div>
                  {pct !== null && <div className="progress"><i style={{ width: `${pct}%` }} /></div>}
                  <div className="row between small muted"><span>{x.supporters} supporters</span><span>{x.status === 'ended' ? 'Support ended' : x.lastReportAt ? `News ${day(x.lastReportAt)}` : 'No news yet'}</span></div>
                </button>
              );
            })}
          </div>
        </>
      )}
      {creating && <MissionaryForm onClose={() => setCreating(false)} onSaved={(x) => navigate(`/admin/missions/${x.id}`)} />}
    </>
  );
}

function MissionaryForm({ missionary, onClose, onSaved }: { missionary?: MissionaryDetail; onClose: () => void; onSaved: (m: MissionaryDetail) => void }) {
  const [f, setF] = useState({
    name: missionary?.name ?? '',
    field: missionary?.field ?? '',
    organisation: missionary?.organisation ?? '',
    work: missionary?.work ?? '',
    prayerPoints: missionary?.prayerPoints ?? '',
    monthlyNeed: missionary?.monthlyNeed ? String(missionary.monthlyNeed / 100) : '',
    since: missionary?.since ?? '',
    email: missionary?.email ?? '',
    phone: missionary?.phone ?? '',
    showPublic: missionary?.showPublic ?? true,
  });
  const save = useAction(() => {
    const input: MissionaryInput = { ...f, monthlyNeed: f.monthlyNeed ? toPaise(f.monthlyNeed) : null, since: f.since || null, email: f.email || null, phone: f.phone || null };
    return missionary ? AdminApi.missions.update(missionary.id, input) : AdminApi.missions.create(input);
  });
  return (
    <Modal title={missionary ? `Edit ${missionary.name}` : 'Add a missionary'} onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!f.name.trim() || save.busy} onClick={async () => { const m = await save.run(); if (m) onSaved(m); }}>{missionary ? 'Save' : 'Add'}</button></>}>
      <div className="stack">
        <Field label="Name" hint="A person, a couple, or a project such as a children's home."><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Rev. Joseph & Mary Kujur" autoFocus /></Field>
        <div className="row wrap" style={{ gap: 12 }}>
          <Field label="Where they serve"><input className="input" value={f.field} onChange={(e) => setF({ ...f, field: e.target.value })} placeholder="Gumla, Jharkhand" /></Field>
          <Field label="Mission or organisation"><input className="input" value={f.organisation} onChange={(e) => setF({ ...f, organisation: e.target.value })} /></Field>
        </div>
        <Field label="Their work"><textarea className="textarea" rows={3} value={f.work} onChange={(e) => setF({ ...f, work: e.target.value })} /></Field>
        <Field label="Prayer points"><textarea className="textarea" rows={3} value={f.prayerPoints} onChange={(e) => setF({ ...f, prayerPoints: e.target.value })} /></Field>
        <div className="row wrap" style={{ gap: 12 }}>
          <Field label="Monthly need" hint="Optional. Shows how much is still to be found."><input className="input" type="number" min={0} value={f.monthlyNeed} onChange={(e) => setF({ ...f, monthlyNeed: e.target.value })} style={{ width: 160 }} /></Field>
          <Field label="Supported since"><input className="input" type="date" value={f.since} onChange={(e) => setF({ ...f, since: e.target.value })} /></Field>
        </div>
        <div className="row wrap" style={{ gap: 12 }}>
          <Field label="Email (office only)"><input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="Phone (office only)"><input className="input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        </div>
        <label className="row small" style={{ gap: 8 }}><input type="checkbox" checked={f.showPublic} onChange={(e) => setF({ ...f, showPublic: e.target.checked })} /> Show to members in the app, so they can pray, give and commit monthly</label>
        {!missionary && <p className="small muted">Flockwise makes a fund called "Missions · {f.name || 'name'}" so gifts, receipts and totals stay separate.</p>}
        <FormError error={save.error} />
      </div>
    </Modal>
  );
}

type Tab = 'support' | 'money' | 'news';

function MissionaryPage({ id }: { id: string }) {
  const can = useCan();
  const toast = useToast();
  const navigate = useNavigate();
  const currency = useCurrency();
  const { data, error, reload, setData } = useApi(() => AdminApi.missions.get(id), [id]);
  const [tab, setTab] = useState<Tab>('support');
  const [modal, setModal] = useState<'edit' | 'support' | 'payout' | 'report' | null>(null);
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const edit = can('giving.edit');
  const m = (v: number) => formatMoney(v, currency);
  const ended = data.status === 'ended';
  const toggleEnded = async () => {
    setData(await AdminApi.missions.update(data.id, { status: ended ? 'active' : 'ended' }));
    toast(ended ? 'Support restarted' : 'Marked as ended. The fund is closed to new gifts.');
  };
  const remove = async () => {
    if (!confirm(`Delete ${data.name}?`)) return;
    try {
      await AdminApi.missions.remove(data.id);
      navigate('/admin/missions');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };
  return (
    <>
      <div style={{ marginBottom: 8 }}><Link to="/admin/missions" className="small row" style={{ gap: 4 }}><ArrowLeft size={14} /> Missions</Link></div>
      <PageHeader
        title={data.name}
        subtitle={[data.field, data.organisation, data.since ? `since ${day(data.since)}` : ''].filter(Boolean).join(' · ')}
        actions={edit && (
          <>
            <button className="btn ghost danger" onClick={remove}><Trash2 size={16} /> Delete</button>
            <button className="btn ghost" onClick={toggleEnded}>{ended ? 'Restart support' : 'End support'}</button>
            <button className="btn" onClick={() => setModal('edit')}>Edit</button>
          </>
        )}
      />
      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        <div className="card kpi"><span className="label">Committed each month</span><span className="value">{formatMoneyShort(data.committed, currency)}</span><span className="small muted">{data.gap ? `${m(data.gap)} still to find` : data.monthlyNeed ? 'Need fully covered' : `${data.supporters} supporters`}</span></div>
        <div className="card kpi"><span className="label">Received this year</span><span className="value">{formatMoneyShort(data.receivedFy, currency)}</span><span className="small muted">to {data.fundName}</span></div>
        <div className="card kpi"><span className="label">Sent on this year</span><span className="value">{formatMoneyShort(data.sentFy, currency)}</span>{data.lastPayoutAt && <span className="small muted">Last {day(data.lastPayoutAt)}</span>}</div>
        <div className="card kpi"><span className="label">Held for them</span><span className="value" style={{ color: data.balance < 0 ? "var(--danger)" : undefined }}>{data.balance < 0 ? `−${formatMoneyShort(-data.balance, currency)}` : formatMoneyShort(data.balance, currency)}</span><span className="small muted">{data.balance < 0 ? 'Sent more than received' : 'Received, not yet sent'}</span></div>
      </div>
      <div className="seg-scroll" style={{ marginBottom: 14 }}>
        <Segmented value={tab} onChange={setTab} options={[{ value: 'support', label: `Supporters · ${data.support.filter((s) => s.status !== 'ended').length}` }, { value: 'money', label: 'Money' }, { value: 'news', label: `Field news · ${data.reports.length}` }]} />
      </div>

      {tab === 'support' && (
        <div className="stack">
          <div className="row between wrap" style={{ gap: 8 }}>
            <p className="small muted">"Behind" means their gifts to {data.fundName} over the last three months are short of what they committed. An AutoPay to the fund always counts as giving.</p>
            {edit && <button className="btn primary" onClick={() => setModal('support')}><Plus size={16} /> Add supporter</button>}
          </div>
          {data.support.length === 0 ? <div className="card"><Empty title="No commitments yet" body="Add members who give monthly, and the church's own share from the budget." /></div> : (
            <div className="card table-wrap">
              <table className="table">
                <thead><tr><th>Supporter</th><th>Each month</th><th>Last 3 months</th><th>Since</th><th>Status</th>{edit && <th />}</tr></thead>
                <tbody>
                  {data.support.map((s) => <SupportRow key={s.id} s={s} missionaryId={data.id} edit={edit} onChange={setData} />)}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'money' && (
        <div className="stack">
          <div className="card card-pad stack">
            <h3>Last 12 months</h3>
            <BarChart data={data.months.map((x) => ({ label: new Date(`${x.month}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' }), value: x.received }))} format={(v) => formatMoneyShort(v, currency)} />
            <p className="small muted">Gifts received to {data.fundName} each month.</p>
          </div>
          <div className="row between wrap" style={{ gap: 8 }}>
            <h3>Sent to {data.name}</h3>
            {edit && <button className="btn primary" onClick={() => setModal('payout')}><Plus size={16} /> Record money sent</button>}
          </div>
          {data.payouts.length === 0 ? <div className="card"><Empty title="Nothing sent yet" /></div> : (
            <div className="card table-wrap">
              <table className="table">
                <thead><tr><th>Date</th><th>Amount</th><th>How</th><th>Reference</th><th>By</th>{edit && <th />}</tr></thead>
                <tbody>
                  {data.payouts.map((p) => (
                    <tr key={p.id}>
                      <td>{day(p.date)}</td>
                      <td><b>{m(p.amount)}</b></td>
                      <td>{METHODS.find((x) => x.value === p.method)?.label}</td>
                      <td className="mono">{p.reference || '–'}</td>
                      <td>{p.by}</td>
                      {edit && <td><button className="btn ghost icon sm" title="Delete" onClick={async () => { if (confirm('Delete this payment?')) setData(await AdminApi.missions.removePayout(data.id, p.id)); }}><Trash2 size={14} /></button></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'news' && (
        <div className="stack">
          <div className="row between wrap" style={{ gap: 8 }}>
            <p className="small muted">Post a letter or update from the field. Supporters get it by email, or WhatsApp when they have no email, and members see it in the app.</p>
            {(edit || can('comms')) && <button className="btn primary" onClick={() => setModal('report')}><Plus size={16} /> Post news</button>}
          </div>
          {data.prayerPoints && <div className="card card-pad stack" style={{ gap: 6 }}><span className="small muted">Prayer points</span><p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{data.prayerPoints}</p></div>}
          {data.reports.length === 0 ? <div className="card"><Empty title="No news yet" /></div> : data.reports.map((r) => (
            <article key={r.id} className="card card-pad stack" style={{ gap: 8 }}>
              <div className="row between wrap" style={{ gap: 8 }}>
                <h3>{r.title}</h3>
                <span className="small muted">{day(r.date)}{r.published ? ' · in the app' : ''}{r.sentAt ? ` · sent to ${r.sentCount}` : ''}</span>
              </div>
              <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{r.body}</p>
              {r.prayerPoints && <p className="small" style={{ margin: 0, whiteSpace: 'pre-wrap' }}><b>Please pray:</b> {r.prayerPoints}</p>}
              <div className="row" style={{ gap: 8 }}>
                <button className="btn sm" onClick={async () => { const x = await AdminApi.missions.sendReport(data.id, r.id); setData(x); toast(`Sent to ${x.delivery.sent} supporters${x.delivery.unreachable ? `. ${x.delivery.unreachable} have no email or phone we can use.` : ''}`); }}><Send size={14} /> {r.sentAt ? 'Send again' : 'Send to supporters'}</button>
                <button className="btn ghost sm danger" onClick={async () => { if (confirm('Delete this report?')) setData(await AdminApi.missions.removeReport(data.id, r.id)); }}>Delete</button>
              </div>
            </article>
          ))}
        </div>
      )}

      {modal === 'edit' && <MissionaryForm missionary={data} onClose={() => setModal(null)} onSaved={(x) => { setData(x); setModal(null); toast('Saved'); }} />}
      {modal === 'support' && <SupportForm id={data.id} onClose={() => setModal(null)} onSaved={(x) => { setData(x); setModal(null); }} />}
      {modal === 'payout' && <PayoutForm id={data.id} balance={data.balance} onClose={() => setModal(null)} onSaved={(x) => { setData(x); setModal(null); toast('Recorded'); }} />}
      {modal === 'report' && <ReportForm id={data.id} onClose={() => setModal(null)} onSaved={(x, sent) => { setData(x); setModal(null); toast(sent === null ? 'Posted' : `Posted and sent to ${sent} supporters`); }} />}
    </>
  );
}

function SupportRow({ s, missionaryId, edit, onChange }: { s: MissionSupportView; missionaryId: string; edit: boolean; onChange: (m: MissionaryDetail) => void }) {
  const currency = useCurrency();
  const st = STATUS[s.status];
  return (
    <tr className={s.status === 'ended' ? 'muted' : ''}>
      <td>{s.personId ? <Link to={`/admin/people/${s.personId}`}>{s.name}</Link> : s.name}</td>
      <td><b>{formatMoney(s.amount, currency)}</b></td>
      <td>{s.kind === 'church' ? '–' : s.expected3m ? `${formatMoneyShort(s.given3m, currency)} of ${formatMoneyShort(s.expected3m, currency)}` : formatMoneyShort(s.given3m, currency)}</td>
      <td>{day(s.startedOn)}{s.endedOn ? ` to ${day(s.endedOn)}` : ''}</td>
      <td><span className={`badge ${st.cls}`}>{st.label}</span></td>
      {edit && (
        <td style={{ whiteSpace: 'nowrap' }}>
          {s.status !== 'ended'
            ? <button className="btn ghost sm" onClick={async () => onChange(await AdminApi.missions.updateSupport(missionaryId, s.id, { endedOn: today() }))}>End</button>
            : <button className="btn ghost icon sm" title="Delete" onClick={async () => onChange(await AdminApi.missions.removeSupport(missionaryId, s.id))}><Trash2 size={14} /></button>}
        </td>
      )}
    </tr>
  );
}

function SupportForm({ id, onClose, onSaved }: { id: string; onClose: () => void; onSaved: (m: MissionaryDetail) => void }) {
  const [kind, setKind] = useState<'member' | 'church'>('member');
  const [person, setPerson] = useState<PickedPerson | null>(null);
  const [name, setName] = useState('Church budget');
  const [amount, setAmount] = useState('');
  const [startedOn, setStartedOn] = useState(today());
  const save = useAction(() => AdminApi.missions.addSupport(id, kind === 'member' ? { kind, personId: person?.id, amount: toPaise(amount), startedOn } : { kind, name, amount: toPaise(amount), startedOn }));
  return (
    <Modal title="Add a monthly commitment" onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!(Number(amount) > 0) || (kind === 'member' ? !person : !name.trim()) || save.busy} onClick={async () => { const m = await save.run(); if (m) onSaved(m); }}>Add</button></>}>
      <div className="stack">
        <Segmented value={kind} onChange={setKind} options={[{ value: 'member', label: 'A member' }, { value: 'church', label: 'Church budget or group' }]} />
        {kind === 'member' ? (
          person ? <div className="row between card card-pad"><b>{person.name}</b><button className="btn ghost sm" onClick={() => setPerson(null)}>Change</button></div> : <PersonSearch autoFocus onPick={(p) => setPerson(p)} />
        ) : (
          <Field label="Name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Church budget, Women's fellowship" /></Field>
        )}
        <div className="row wrap" style={{ gap: 12 }}>
          <Field label="Each month"><input className="input" type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} style={{ width: 160 }} /></Field>
          <Field label="Starting"><input className="input" type="date" value={startedOn} onChange={(e) => setStartedOn(e.target.value)} /></Field>
        </div>
        <FormError error={save.error} />
      </div>
    </Modal>
  );
}

function PayoutForm({ id, balance, onClose, onSaved }: { id: string; balance: number; onClose: () => void; onSaved: (m: MissionaryDetail) => void }) {
  const currency = useCurrency();
  const [f, setF] = useState({ amount: balance > 0 ? String(balance / 100) : '', date: today(), method: 'bank_transfer' as MissionPayout['method'], reference: '', note: '' });
  const save = useAction(() => AdminApi.missions.addPayout(id, { ...f, amount: toPaise(f.amount) }));
  return (
    <Modal title="Record money sent" onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!(Number(f.amount) > 0) || save.busy} onClick={async () => { const m = await save.run(); if (m) onSaved(m); }}>Record</button></>}>
      <div className="stack">
        {balance > 0 && <p className="small muted">{formatMoney(balance, currency)} has come in and not been sent yet.</p>}
        <div className="row wrap" style={{ gap: 12 }}>
          <Field label="Amount"><input className="input" type="number" min={1} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} style={{ width: 160 }} autoFocus /></Field>
          <Field label="Date"><input className="input" type="date" value={f.date} max={today()} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        </div>
        <Segmented value={f.method} onChange={(v) => setF({ ...f, method: v })} options={METHODS} />
        <Field label="UTR, cheque or reference number"><input className="input" value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></Field>
        <Field label="Note"><input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        <FormError error={save.error} />
      </div>
    </Modal>
  );
}

function ReportForm({ id, onClose, onSaved }: { id: string; onClose: () => void; onSaved: (m: MissionaryDetail, sent: number | null) => void }) {
  const [f, setF] = useState({ title: '', body: '', prayerPoints: '', date: today(), published: true, send: true });
  const save = useAction(() => AdminApi.missions.addReport(id, f));
  return (
    <Modal title="Post news from the field" onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!f.title.trim() || save.busy} onClick={async () => { const m = await save.run(); if (m) onSaved(m, m.delivery ? m.delivery.sent : null); }}>{f.send ? 'Post and send' : 'Post'}</button></>}>
      <div className="stack">
        <Field label="Title"><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Baptisms at Palkot" autoFocus /></Field>
        <Field label="Date"><input className="input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} style={{ width: 'auto' }} /></Field>
        <Field label="News"><textarea className="textarea" rows={6} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} placeholder="Paste their letter or write a summary." /></Field>
        <Field label="Prayer points"><textarea className="textarea" rows={3} value={f.prayerPoints} onChange={(e) => setF({ ...f, prayerPoints: e.target.value })} /></Field>
        <label className="row small" style={{ gap: 8 }}><input type="checkbox" checked={f.published} onChange={(e) => setF({ ...f, published: e.target.checked })} /> Show to members in the app</label>
        <label className="row small" style={{ gap: 8 }}><input type="checkbox" checked={f.send} onChange={(e) => setF({ ...f, send: e.target.checked })} /> Send to supporters now (email, or WhatsApp when they have no email)</label>
        <FormError error={save.error} />
      </div>
    </Modal>
  );
}
