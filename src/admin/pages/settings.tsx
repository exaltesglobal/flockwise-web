import { Building2, CreditCard, History, Landmark, Pencil, Plus, ReceiptText, Search, Trash2, UserPlus } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { AuditEntry, Campus, ChurchSettings, LanguageCode, Room } from '@/api/admin-types';
import { AdminApi } from '@/api/endpoints';
import type { StaffRole } from '@/api/types';
import { ServerSettings } from '@/components/server-settings';
import { Empty, ErrorState, Field, FormError, Loading, Modal, useToast } from '@/components/ui';
import { languages } from '@/i18n';
import { formatRelative } from '@/lib/format';
import { ROLE_LABELS, useCan } from '@/lib/perms';
import { useAction, useApi } from '@/lib/use-api';

import { PageHeader } from '../layout';
import { CustomFieldsSettings, PublicPageSettings } from './publishing';

const ROLE_HELP: Record<StaffRole, string> = {
  owner: 'Everything, including billing and ownership',
  admin: 'Everything except changing the owner',
  pastor: 'People, care, events, groups, messages and serving. No individual giving.',
  finance: 'Giving, funds, pledges and 80G receipts, plus the people list',
  leader: 'Groups, care, check-in, volunteers and service plans',
  coordinator: 'Volunteer rotas, service plans, events and check-in',
  checkin: 'Only the check-in desk and kiosk',
};
const INVITABLE: StaffRole[] = ['admin', 'pastor', 'finance', 'leader', 'coordinator', 'checkin'];

type Tab = 'church' | 'giving' | 'campuses' | 'kids' | 'fields' | 'page' | 'team' | 'audit' | 'server';

export function SettingsPage() {
  const can = useCan();
  const tabs: { value: Tab; label: string; show: boolean }[] = [
    { value: 'church', label: 'Church', show: can('settings') },
    { value: 'giving', label: 'Giving & compliance', show: can('settings') },
    { value: 'campuses', label: 'Campuses', show: can('settings') },
    { value: 'kids', label: 'Kids check-in', show: can('settings') },
    { value: 'fields', label: 'Custom fields', show: can('settings') },
    { value: 'page', label: 'Public page', show: can('settings') },
    { value: 'team', label: 'Team & roles', show: can('staff') },
    { value: 'audit', label: 'Activity log', show: can('settings') },
    { value: 'server', label: 'Server', show: true },
  ];
  const visible = tabs.filter((t) => t.show);
  const [tab, setTab] = useState<Tab>(() => {
    const h = window.location.hash.slice(1) as Tab;
    return visible.some((t) => t.value === h) ? h : visible[0].value;
  });

  return (
    <>
      <PageHeader title="Settings" />
      <div className="tabs">
        {visible.map((t) => <button key={t.value} className={tab === t.value ? 'on' : ''} onClick={() => setTab(t.value)}>{t.label}</button>)}
      </div>
      {(tab === 'church' || tab === 'giving' || tab === 'kids') && <ChurchSettingsForm section={tab} />}
      {tab === 'campuses' && <Campuses />}
      {tab === 'kids' && <Rooms />}
      {tab === 'fields' && <CustomFieldsSettings />}
      {tab === 'page' && <PublicPageSettings />}
      {tab === 'team' && <Team />}
      {tab === 'audit' && <Audit />}
      {tab === 'server' && <div className="card card-pad" id="server"><ServerSettings /></div>}
    </>
  );
}

function ChurchSettingsForm({ section }: { section: 'church' | 'giving' | 'kids' }) {
  const settings = useApi(AdminApi.settings.get);
  const [form, setForm] = useState<ChurchSettings | null>(null);
  const save = useAction(AdminApi.settings.update);
  const connect = useAction(AdminApi.settings.connectPayments);
  const toast = useToast();

  useEffect(() => {
    if (settings.data) setForm(settings.data);
  }, [settings.data]);

  if (settings.error) return <ErrorState error={settings.error} onRetry={settings.reload} />;
  if (!form) return <Loading />;
  const set = <K extends keyof ChurchSettings>(k: K, v: ChurchSettings[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const india = form.country === 'IN';
  const dirty = JSON.stringify(form) !== JSON.stringify(settings.data);

  async function onSave() {
    if (!form) return;
    const saved = await save.run(form);
    if (saved) {
      settings.setData(saved);
      toast('Settings saved');
    }
  }

  const saveBar = (
    <div className="row" style={{ justifyContent: 'flex-end' }}>
      <FormError error={save.error} />
      <button className="btn primary" disabled={!dirty || save.busy} onClick={onSave}>{save.busy ? 'Saving…' : 'Save changes'}</button>
    </div>
  );

  if (section === 'kids')
    return (
      <div className="card">
        <div className="card-head"><h2>Children</h2></div>
        <div className="card-body stack">
          <Field label="Children are younger than" hint="Children check in to a room and get a matching security label for their parent. Older people check in as adults.">
            <div className="row"><input className="input" style={{ width: 100 }} type="number" min={1} max={21} value={form.childAgeLimit} onChange={(e) => set('childAgeLimit', Number(e.target.value) || 12)} /><span className="muted">years</span></div>
          </Field>
          {saveBar}
        </div>
      </div>
    );

  if (section === 'church')
    return (
      <>
        <div className="card">
          <div className="card-head"><h2>Church profile</h2></div>
          <div className="card-body grid cols-2">
            <Field label="Church name"><input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} /></Field>
            <Field label="City"><input className="input" value={form.city} onChange={(e) => set('city', e.target.value)} /></Field>
            <Field label="Office phone"><input className="input" value={form.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
            <Field label="Office email" hint="Replies to church emails go here"><input className="input" value={form.email} onChange={(e) => set('email', e.target.value)} /></Field>
            <Field label="Website"><input className="input" value={form.website} onChange={(e) => set('website', e.target.value)} /></Field>
            <Field label="Time zone" hint="Used for birthdays, reminders and reports"><input className="input" value={form.timezone} onChange={(e) => set('timezone', e.target.value)} /></Field>
            <div style={{ gridColumn: '1 / -1' }}>
              <Field label="Address" hint="Printed on tax receipts"><input className="input" value={form.address} onChange={(e) => set('address', e.target.value)} /></Field>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <Field label="Languages in the member app">
                <div className="row wrap" style={{ minHeight: 40 }}>
                  {(Object.keys(languages) as LanguageCode[]).map((l) => (
                    <label key={l} className="check">
                      <input type="checkbox" checked={form.languages.includes(l)} disabled={l === 'en'} onChange={(e) => set('languages', e.target.checked ? [...form.languages, l] : form.languages.filter((x) => x !== l))} />
                      <span>{languages[l].label}</span>
                    </label>
                  ))}
                </div>
              </Field>
            </div>
          </div>
        </div>
        {saveBar}
      </>
    );

  return (
    <>
      <div className="card">
        <div className="card-head"><h2>Online giving</h2><CreditCard size={18} className="muted" /></div>
        <div className="card-body stack">
          <div className="row wrap">
            <div className="grow">
              <h3>{form.payments.provider === 'razorpay' ? 'Razorpay' : 'Stripe'} {form.payments.connected ? <span className="badge ok">Connected</span> : <span className="badge warn">Not connected</span>}</h3>
              <p className="small muted">
                Gifts are paid straight into the church’s own {form.payments.provider === 'razorpay' ? 'Razorpay' : 'Stripe'} account{form.payments.accountId ? <> (<span className="mono">{form.payments.accountId}</span>)</> : ''}. Flockwise never holds the money.
                {form.payments.provider === 'razorpay' ? ' UPI, UPI AutoPay, cards and netbanking are supported. Your Razorpay keys are set on the server, never here.' : ''}
              </p>
            </div>
            <button className="btn" disabled={connect.busy} onClick={async () => {
              const r = await connect.run();
              if (r?.onboardingUrl) window.location.href = r.onboardingUrl;
              else if (r) { settings.reload(); toast('Payment account connected'); }
            }}>{form.payments.connected ? 'Reconnect' : 'Connect account'}</button>
          </div>
          <FormError error={connect.error} />
        </div>
      </div>

      {india && (
        <div className="grid cols-2">
          <div className="card">
            <div className="card-head"><h2>FCRA</h2><Landmark size={18} className="muted" /></div>
            <div className="card-body stack">
              <p className="small muted">Gifts from foreign citizens and OCI holders may only go to the church’s FCRA-designated account at SBI New Delhi Main Branch. Without registration, Flockwise refuses those gifts.</p>
              <label className="check"><input type="checkbox" checked={form.fcra.registered} onChange={(e) => set('fcra', { ...form.fcra, registered: e.target.checked })} /><span>This church is registered under FCRA</span></label>
              {form.fcra.registered && (
                <div className="grid cols-2">
                  <Field label="FCRA registration no."><input className="input mono" value={form.fcra.registrationNumber ?? ''} onChange={(e) => set('fcra', { ...form.fcra, registrationNumber: e.target.value })} /></Field>
                  <Field label="SBI FCRA account (last 4)"><input className="input mono" maxLength={4} value={form.fcra.accountLast4 ?? ''} onChange={(e) => set('fcra', { ...form.fcra, accountLast4: e.target.value.replace(/\D/g, '') })} /></Field>
                </div>
              )}
            </div>
          </div>
          <div className="card">
            <div className="card-head"><h2>80G tax receipts</h2><ReceiptText size={18} className="muted" /></div>
            <div className="card-body stack">
              <p className="small muted">When on, every eligible gift gets a receipt number (FY/00001), donors can print a yearly statement, and the Giving page prepares your Form 10BD data.</p>
              <label className="check"><input type="checkbox" checked={form.receipts80g.enabled} onChange={(e) => set('receipts80g', { ...form.receipts80g, enabled: e.target.checked })} /><span>Issue 80G receipts</span></label>
              {form.receipts80g.enabled && (
                <div className="grid cols-2">
                  <Field label="80G registration no."><input className="input mono" value={form.receipts80g.registrationNumber ?? ''} onChange={(e) => set('receipts80g', { ...form.receipts80g, registrationNumber: e.target.value.toUpperCase() })} /></Field>
                  <Field label="Church PAN"><input className="input mono" maxLength={10} value={form.receipts80g.pan ?? ''} onChange={(e) => set('receipts80g', { ...form.receipts80g, pan: e.target.value.toUpperCase() })} /></Field>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {saveBar}
    </>
  );
}

function Campuses() {
  const list = useApi(AdminApi.campuses.list);
  const [editing, setEditing] = useState<Campus | 'new' | null>(null);
  const toast = useToast();
  return (
    <div className="card">
      <div className="card-head">
        <h2>Campuses</h2>
        <button className="btn sm" onClick={() => setEditing('new')}><Plus size={15} /> Add campus</button>
      </div>
      {list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : !list.data ? <Loading /> : list.data.length === 0 ? (
        <Empty icon={<Building2 size={28} />} title="One location" body="Add campuses if your church meets in more than one place. People and events can then be filtered by campus." />
      ) : list.data.map((c) => (
        <div key={c.id} className="list-row">
          <Building2 size={18} className="muted" />
          <div className="grow">
            <div style={{ fontWeight: 600 }}>{c.name} <span className="small muted">· {c.city}</span></div>
            <div className="small muted">{[c.address, c.serviceTimes].filter(Boolean).join(' · ')}</div>
          </div>
          <span className="badge gray">{c.people} people</span>
          <button className="btn ghost icon sm" onClick={() => setEditing(c)}><Pencil size={15} /></button>
          <button className="btn ghost icon sm danger" onClick={async () => {
            if (!confirm(`Remove ${c.name}? People and events stay, without a campus.`)) return;
            await AdminApi.campuses.remove(c.id);
            toast('Removed');
            list.reload();
          }}><Trash2 size={15} /></button>
        </div>
      ))}
      {editing && <CampusForm campus={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); list.reload(); toast('Saved'); }} />}
    </div>
  );
}

function CampusForm({ campus, onClose, onSaved }: { campus: Campus | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: campus?.name ?? '', city: campus?.city ?? '', address: campus?.address ?? '', serviceTimes: campus?.serviceTimes ?? '' });
  const save = useAction(() => (campus ? AdminApi.campuses.update(campus.id, form) : AdminApi.campuses.create(form)));
  return (
    <Modal title={campus ? 'Edit campus' : 'New campus'} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={save.busy || !form.name.trim()} onClick={async () => { if (await save.run()) onSaved(); }}>Save</button></>}
    >
      <div className="stack">
        <FormError error={save.error} />
        <div className="grid cols-2">
          <Field label="Name"><input className="input" autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Gachibowli" /></Field>
          <Field label="City"><input className="input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></Field>
        </div>
        <Field label="Address"><input className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
        <Field label="Service times"><input className="input" value={form.serviceTimes} onChange={(e) => setForm({ ...form, serviceTimes: e.target.value })} placeholder="Sundays 8:00 am (Telugu), 10:30 am (English)" /></Field>
      </div>
    </Modal>
  );
}

function Rooms() {
  const list = useApi(AdminApi.checkin.rooms);
  const [editing, setEditing] = useState<Room | 'new' | null>(null);
  const toast = useToast();
  return (
    <div className="card">
      <div className="card-head">
        <h2>Kids rooms</h2>
        <button className="btn sm" onClick={() => setEditing('new')}><Plus size={15} /> Add room</button>
      </div>
      {!list.data ? <Loading /> : list.data.length === 0 ? <Empty title="No rooms" body="Children are sent to the room that matches their age." /> : list.data.map((r) => (
        <div key={r.id} className="list-row">
          <div className="grow">
            <div style={{ fontWeight: 600 }}>{r.name}</div>
            <div className="small muted">Ages {r.minAge}–{r.maxAge}{r.capacity ? ` · up to ${r.capacity} children` : ''}</div>
          </div>
          <button className="btn ghost icon sm" onClick={() => setEditing(r)}><Pencil size={15} /></button>
          <button className="btn ghost icon sm danger" onClick={async () => { if (!confirm(`Remove ${r.name}?`)) return; await AdminApi.checkin.removeRoom(r.id); toast('Removed'); list.reload(); }}><Trash2 size={15} /></button>
        </div>
      ))}
      {editing && <RoomForm room={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); list.reload(); toast('Saved'); }} />}
    </div>
  );
}

export function RoomForm({ room, onClose, onSaved }: { room: Room | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: room?.name ?? '', minAge: room?.minAge ?? 0, maxAge: room?.maxAge ?? 5, capacity: room?.capacity ?? null as number | null });
  const save = useAction(() => (room ? AdminApi.checkin.updateRoom(room.id, form) : AdminApi.checkin.createRoom(form)));
  return (
    <Modal title={room ? 'Edit room' : 'New room'} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={save.busy || !form.name.trim()} onClick={async () => { if (await save.run()) onSaved(); }}>Save</button></>}
    >
      <div className="stack">
        <FormError error={save.error} />
        <Field label="Name"><input className="input" autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Little Lambs" /></Field>
        <div className="grid cols-3">
          <Field label="From age"><input className="input" type="number" min={0} value={form.minAge} onChange={(e) => setForm({ ...form, minAge: Number(e.target.value) })} /></Field>
          <Field label="To age"><input className="input" type="number" min={0} value={form.maxAge} onChange={(e) => setForm({ ...form, maxAge: Number(e.target.value) })} /></Field>
          <Field label="Capacity"><input className="input" type="number" min={1} value={form.capacity ?? ''} onChange={(e) => setForm({ ...form, capacity: e.target.value ? Number(e.target.value) : null })} /></Field>
        </div>
      </div>
    </Modal>
  );
}

function Team() {
  const staff = useApi(AdminApi.staff.list);
  const [inviting, setInviting] = useState(false);
  const toast = useToast();
  return (
    <>
      <div className="card">
        <div className="card-head">
          <h2>Staff and volunteers with office access</h2>
          <button className="btn sm primary" onClick={() => setInviting(true)}><UserPlus size={15} /> Invite</button>
        </div>
        {staff.error ? <ErrorState error={staff.error} onRetry={staff.reload} /> : !staff.data ? <Loading /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Name</th><th>Role</th><th>Status</th><th>Last active</th><th /></tr></thead>
              <tbody>
                {staff.data.map((s) => (
                  <tr key={s.id}>
                    <td><div style={{ fontWeight: 600 }}>{s.name}</div><div className="small muted">{s.email}</div></td>
                    <td>
                      {s.role === 'owner' ? 'Owner' : (
                        <select className="select" style={{ width: 200, height: 34 }} value={s.role} onChange={async (e) => {
                          await AdminApi.staff.setRole(s.id, e.target.value as StaffRole);
                          toast(`${s.name} is now ${ROLE_LABELS[e.target.value as StaffRole]}`);
                          staff.reload();
                        }}>
                          {INVITABLE.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                        </select>
                      )}
                    </td>
                    <td>{s.status === 'active' ? <span className="badge ok">Active</span> : <span className="badge warn">Invited</span>}</td>
                    <td className="small muted">{s.lastActiveAt ? formatRelative(s.lastActiveAt) : '—'}</td>
                    <td style={{ textAlign: 'right' }}>
                      {s.role !== 'owner' && (
                        <button className="btn ghost icon sm danger" title="Remove" onClick={async () => {
                          if (!confirm(`Remove ${s.name}? They are signed out everywhere.`)) return;
                          await AdminApi.staff.remove(s.id);
                          staff.reload();
                          toast('Removed');
                        }}><Trash2 size={15} /></button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="card">
        <div className="card-head"><h2>What each role can do</h2></div>
        {(Object.keys(ROLE_HELP) as StaffRole[]).map((r) => (
          <div key={r} className="list-row"><b style={{ width: 180 }}>{ROLE_LABELS[r]}</b><span className="small muted grow">{ROLE_HELP[r]}</span></div>
        ))}
      </div>
      {inviting && <InviteForm onClose={() => setInviting(false)} onSaved={() => { setInviting(false); staff.reload(); toast('Invite sent'); }} />}
    </>
  );
}

function Audit() {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [extra, setExtra] = useState<AuditEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 250);
    return () => clearTimeout(t);
  }, [q]);
  const list = useApi(async () => {
    const p = await AdminApi.audit(debounced);
    setExtra([]);
    setCursor(p.nextCursor);
    return p;
  }, [debounced]);
  const rows = [...(list.data?.data ?? []), ...extra];
  return (
    <div className="card">
      <div className="toolbar">
        <div className="search"><Search size={16} /><input className="input" placeholder="Search activity or person" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <span className="small muted">Every change made in the church office is recorded here.</span>
      </div>
      {list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : !list.data ? <Loading /> : rows.length === 0 ? <Empty icon={<History size={28} />} title="Nothing recorded yet" /> : rows.map((a) => (
        <div key={a.id} className="list-row">
          <div className="grow">
            <div>{a.summary}</div>
            <div className="small muted">{a.actorName} · {formatRelative(a.at)}</div>
          </div>
          <span className="badge gray">{a.entity}</span>
        </div>
      ))}
      {cursor && <div style={{ padding: 16, textAlign: 'center', borderTop: '1px solid var(--border)' }}><button className="btn" onClick={async () => { const p = await AdminApi.audit(debounced, cursor); setExtra((e) => [...e, ...p.data]); setCursor(p.nextCursor); }}>Load more</button></div>}
    </div>
  );
}

function InviteForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<StaffRole>('admin');
  const invite = useAction(AdminApi.staff.invite);
  return (
    <Modal title="Invite to the church office" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={invite.busy || !name.trim() || !email.includes('@')} onClick={async () => { if (await invite.run({ name, email, role })) onSaved(); }}>Send invite</button></>}
    >
      <div className="stack">
        <FormError error={invite.error} />
        <Field label="Name"><input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Email" hint="They sign in with a one-time code emailed here"><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Role" hint={ROLE_HELP[role]}>
          <select className="select" value={role} onChange={(e) => setRole(e.target.value as StaffRole)}>
            {INVITABLE.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
        </Field>
      </div>
    </Modal>
  );
}
