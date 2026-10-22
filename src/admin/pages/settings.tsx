import { CreditCard, Landmark, ReceiptText, Trash2, UserPlus } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { ChurchSettings } from '@/api/admin-types';
import { AdminApi } from '@/api/endpoints';
import type { StaffRole } from '@/api/types';
import { ServerSettings } from '@/components/server-settings';
import { ErrorState, Field, FormError, Loading, Modal, useToast } from '@/components/ui';
import { formatRelative } from '@/lib/format';
import { useAction, useApi } from '@/lib/use-api';

import { PageHeader } from '../layout';

const ROLES: { value: StaffRole; label: string; help: string }[] = [
  { value: 'admin', label: 'Admin', help: 'Everything except billing and removing the owner' },
  { value: 'pastor', label: 'Pastor', help: 'People, notes, events, groups, announcements' },
  { value: 'finance', label: 'Finance', help: 'Giving, funds and receipts' },
  { value: 'leader', label: 'Group leader', help: 'Their own groups and join requests' },
];

export function SettingsPage() {
  const settings = useApi(AdminApi.settings.get);
  const staff = useApi(AdminApi.staff.list);
  const [form, setForm] = useState<ChurchSettings | null>(null);
  const [inviting, setInviting] = useState(false);
  const save = useAction(AdminApi.settings.update);
  const connect = useAction(AdminApi.settings.connectPayments);
  const toast = useToast();

  useEffect(() => {
    if (settings.data) setForm(settings.data);
  }, [settings.data]);

  useEffect(() => {
    if (window.location.hash === '#server') document.getElementById('server')?.scrollIntoView();
  }, [form]);

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

  return (
    <>
      <PageHeader title="Settings" actions={<button className="btn primary" disabled={!dirty || save.busy} onClick={onSave}>{save.busy ? 'Saving…' : 'Save changes'}</button>} />
      <FormError error={save.error} />

      <div className="card">
        <div className="card-head"><h2>Church profile</h2></div>
        <div className="card-body grid cols-2">
          <Field label="Church name"><input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} /></Field>
          <Field label="City"><input className="input" value={form.city} onChange={(e) => set('city', e.target.value)} /></Field>
          <Field label="Office phone"><input className="input" value={form.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
          <Field label="Office email"><input className="input" value={form.email} onChange={(e) => set('email', e.target.value)} /></Field>
          <Field label="Website"><input className="input" value={form.website} onChange={(e) => set('website', e.target.value)} /></Field>
          <Field label="Time zone"><input className="input" value={form.timezone} onChange={(e) => set('timezone', e.target.value)} /></Field>
          <div style={{ gridColumn: '1 / -1' }}>
            <Field label="Address" hint="Printed on tax receipts"><input className="input" value={form.address} onChange={(e) => set('address', e.target.value)} /></Field>
          </div>
          <Field label="Languages in the member app">
            <div className="row" style={{ height: 40 }}>
              {(['en', 'hi'] as const).map((l) => (
                <label key={l} className="check">
                  <input type="checkbox" checked={form.languages.includes(l)} disabled={l === 'en'} onChange={(e) => set('languages', e.target.checked ? [...form.languages, l] : form.languages.filter((x) => x !== l))} />
                  <span>{l === 'en' ? 'English' : 'हिन्दी (Hindi)'}</span>
                </label>
              ))}
            </div>
          </Field>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h2>Online giving</h2><CreditCard size={18} className="muted" /></div>
        <div className="card-body stack">
          <div className="row wrap">
            <div className="grow">
              <h3>{form.payments.provider === 'razorpay' ? 'Razorpay' : 'Stripe'} {form.payments.connected ? <span className="badge ok">Connected</span> : <span className="badge warn">Not connected</span>}</h3>
              <p className="small muted">
                Gifts are paid straight into the church’s own {form.payments.provider === 'razorpay' ? 'Razorpay' : 'Stripe'} account{form.payments.accountId ? <> (<span className="mono">{form.payments.accountId}</span>)</> : ''}. Flockwise never holds the money.
                {form.payments.provider === 'razorpay' ? ' UPI, UPI AutoPay, cards and netbanking are supported.' : ''}
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
              <p className="small muted">When on, donors who give their PAN get an 80G receipt by email, and the Giving page prepares your Form 10BD data.</p>
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

      <div className="card">
        <div className="card-head">
          <h2>Staff & permissions</h2>
          <button className="btn sm" onClick={() => setInviting(true)}><UserPlus size={15} /> Invite</button>
        </div>
        {staff.error ? <ErrorState error={staff.error} onRetry={staff.reload} /> : !staff.data ? <Loading /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Name</th><th>Role</th><th>Status</th><th>Last active</th><th /></tr></thead>
              <tbody>
                {staff.data.map((s) => (
                  <tr key={s.id}>
                    <td><div style={{ fontWeight: 600 }}>{s.name}</div><div className="small muted">{s.email}</div></td>
                    <td>{s.role === 'owner' ? 'Owner' : ROLES.find((r) => r.value === s.role)?.label}</td>
                    <td>{s.status === 'active' ? <span className="badge ok">Active</span> : <span className="badge warn">Invited</span>}</td>
                    <td className="small muted">{s.lastActiveAt ? formatRelative(s.lastActiveAt) : '—'}</td>
                    <td style={{ textAlign: 'right' }}>
                      {s.role !== 'owner' && (
                        <button className="btn ghost icon sm danger" title="Remove" onClick={async () => {
                          if (!confirm(`Remove ${s.name} from staff?`)) return;
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

      <div className="card card-pad" id="server">
        <ServerSettings />
      </div>

      {inviting && <InviteForm onClose={() => setInviting(false)} onSaved={() => { setInviting(false); staff.reload(); toast('Invite sent'); }} />}
    </>
  );
}

function InviteForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<StaffRole>('admin');
  const invite = useAction(AdminApi.staff.invite);
  return (
    <Modal title="Invite a staff member" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={invite.busy || !name.trim() || !email.includes('@')} onClick={async () => { if (await invite.run({ name, email, role })) onSaved(); }}>Send invite</button></>}
    >
      <div className="stack">
        <FormError error={invite.error} />
        <Field label="Name"><input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Email" hint="They sign in with a one-time code sent here"><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Role">
          <select className="select" value={role} onChange={(e) => setRole(e.target.value as StaffRole)}>
            {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}: {r.help}</option>)}
          </select>
        </Field>
      </div>
    </Modal>
  );
}
