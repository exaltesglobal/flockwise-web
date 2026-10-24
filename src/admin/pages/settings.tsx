import { FeaturesSettings } from './features';
import { useOfficeT } from '../i18n';
import { LanguagePicker } from '../language-button';
import { Baby, CheckCircle2, Bell, Building2, CreditCard, Globe, History, Landmark, ListPlus, MapPinned, Palette, Pencil, Plug, Plus, ReceiptText, Search, Server, ShieldCheck, Trash2, UserPlus, UsersRound, Network, ToggleRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router';

import type { AuditEntry, Campus, ChurchSettings, LanguageCode, Room, StaffView } from '@/api/admin-types';
import { adminSession } from '@/api/client';
import { AdminApi, type RoleChoice } from '@/api/endpoints';
import type { StaffRole } from '@/api/types';
import { ServerSettings } from '@/components/server-settings';
import { AppearancePanel } from '@/components/theme-picker';
import { Empty, ErrorState, Field, FormError, Loading, Modal, useToast } from '@/components/ui';
import { PERMISSION_INFO, ROLE_SCOPES } from '@/core/types';
import type { Permission, RoleScope } from '@/api/admin-types';
import type { RoleView } from '@/api/endpoints';

import { asChoice, permLabel, RolePicker, toChoice, type Choice } from '../components/role-picker';
import { canOverrideServer } from '@/lib/config';
import { languages } from '@/i18n';
import { formatRelative } from '@/lib/format';
import { ROLE_LABELS, useCan } from '@/lib/perms';
import { useAction, useApi } from '@/lib/use-api';

import { PageHeader } from '../layout';
import { PlanBilling, RazorpayCard } from './billing';
import { BrandKitCard } from './brand';
import { IntegrationsSettings } from './integrations';
import { NotificationsSettings } from './notifications';
import { NetworkSettings } from './networks';
import { PrivacySettings } from './privacy';
import { CustomFieldsSettings, PublicPageSettings } from './publishing';

const ROLE_HELP: Record<StaffRole, string> = {
  owner: 'Everything, including billing and ownership',
  admin: 'Everything except changing the owner',
  pastor: 'People, care, events, groups, messages and serving. No individual giving.',
  finance: 'Giving, funds, pledges and 80G receipts, plus the people list',
  leader: 'Groups, care, check-in, volunteers and service plans',
  coordinator: 'Volunteer rotas, service plans, events and check-in',
  checkin: 'Only the check-in desk and kiosk',
  custom: 'A role this church made: see the Roles card',
};

type Tab = 'features' | 'church' | 'billing' | 'giving' | 'campuses' | 'kids' | 'fields' | 'page' | 'integrations' | 'notifications' | 'networks' | 'privacy' | 'team' | 'audit' | 'appearance' | 'server';

export function SettingsPage() {
  const can = useCan();
  // Grouped so fourteen sections read as a short menu, not a scrolling strip of tabs.
  const { tr } = useOfficeT();
  const tabs: { value: Tab; label: string; show: boolean; icon: typeof Building2; group: string }[] = [
    { value: 'church', label: 'Church', show: can('settings'), icon: Building2, group: 'Church' },
    { value: 'features', label: 'Features', show: can('settings'), icon: ToggleRight, group: 'Church' },
    { value: 'campuses', label: 'Campuses', show: can('settings'), icon: MapPinned, group: 'Church' },
    { value: 'page', label: 'Public page', show: can('settings'), icon: Globe, group: 'Church' },
    { value: 'fields', label: 'Custom fields', show: can('settings'), icon: ListPlus, group: 'Church' },
    { value: 'kids', label: 'Kids check-in', show: can('settings'), icon: Baby, group: 'Church' },
    { value: 'billing', label: 'Plan & billing', show: can('settings'), icon: CreditCard, group: 'Money' },
    { value: 'giving', label: 'Giving & compliance', show: can('settings'), icon: ReceiptText, group: 'Money' },
    { value: 'integrations', label: 'Integrations', show: can('settings'), icon: Plug, group: 'Connections' },
    { value: 'notifications', label: 'Notifications', show: can('settings'), icon: Bell, group: 'Connections' },
    { value: 'networks', label: 'Networks', show: can('settings'), icon: Network, group: 'Connections' },
    { value: 'team', label: 'Team & roles', show: can('staff'), icon: UsersRound, group: 'People & access' },
    { value: 'privacy', label: 'Privacy (DPDP)', show: can('settings') || can('people.edit'), icon: ShieldCheck, group: 'People & access' },
    { value: 'audit', label: 'Activity log', show: can('settings'), icon: History, group: 'People & access' },
    { value: 'appearance', label: 'Appearance & language', show: true, icon: Palette, group: 'This browser' },
    { value: 'server', label: 'Server', show: canOverrideServer(), icon: Server, group: 'This browser' },
  ];
  const visible = tabs.filter((t) => t.show);
  const [tab, setTab] = useState<Tab>(() => {
    const h = window.location.hash.slice(1) as Tab;
    return visible.some((t) => t.value === h) ? h : visible[0].value;
  });
  const { hash } = useLocation();
  useEffect(() => {
    const h = hash.slice(1) as Tab;
    if (visible.some((t) => t.value === h)) setTab(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hash]);

  return (
    <>
      <PageHeader title={tr('Settings')} />
      <div className="settings-layout">
      <nav className="settings-nav" aria-label="Settings sections">
        <select className="select settings-select" value={tab} onChange={(e) => { setTab(e.target.value as Tab); history.replaceState(null, '', `#${e.target.value}`); }} aria-label="Settings section">
          {visible.map((t) => <option key={t.value} value={t.value}>{tr(t.group)} · {tr(t.label)}</option>)}
        </select>
        {[...new Set(visible.map((t) => t.group))].map((g) => (
          <div key={g} className="settings-group">
            <div className="settings-group-title">{tr(g)}</div>
            {visible.filter((t) => t.group === g).map(({ value, label, icon: Icon }) => (
              <a key={value} href={`#${value}`} className={tab === value ? 'on' : ''} aria-current={tab === value ? 'page' : undefined} onClick={(e) => { e.preventDefault(); setTab(value); history.replaceState(null, '', `#${value}`); }}>
                <Icon size={16} /> {tr(label)}
              </a>
            ))}
          </div>
        ))}
      </nav>
      <div className="settings-body">
      {tab === 'billing' && <PlanBilling />}
      {(tab === 'church' || tab === 'giving' || tab === 'kids') && <ChurchSettingsForm section={tab} />}
      {tab === 'features' && <FeaturesSettings />}
      {tab === 'campuses' && <Campuses />}
      {tab === 'kids' && <Rooms />}
      {tab === 'fields' && <CustomFieldsSettings />}
      {tab === 'page' && <PublicPageSettings />}
      {tab === 'integrations' && <IntegrationsSettings />}
      {tab === 'notifications' && <NotificationsSettings />}
      {tab === 'networks' && <NetworkSettings />}
      {tab === 'privacy' && <PrivacySettings />}
      {tab === 'team' && <Team />}
      {tab === 'audit' && <Audit />}
      {tab === 'appearance' && (
        <div className="card card-pad stack appearance-card">
          <div>
            <h2>Appearance</h2>
            <p className="muted small">Light or dark, and which brand colours the menu and buttons use. Saved in this browser only.</p>
          </div>
          <AppearancePanel />
          <div className="stack" style={{ gap: 6 }}>
            <h3>{tr('Office language')}</h3>
            <p className="muted small">{tr('Menus and everyday words change now; more of each page follows in coming updates.')} {tr('Members choose their own language in the app.')}</p>
            <div style={{ maxWidth: 360 }}><LanguagePicker /></div>
          </div>
        </div>
      )}
      {tab === 'server' && <div className="card card-pad" id="server"><ServerSettings /></div>}
      </div>
      </div>
    </>
  );
}

function ChurchSettingsForm({ section }: { section: 'church' | 'giving' | 'kids' }) {
  const settings = useApi(AdminApi.settings.get);
  const [form, setForm] = useState<ChurchSettings | null>(null);
  const save = useAction(AdminApi.settings.update);

  // Load once; after that the form is the person's own copy, saved as they go.
  useEffect(() => {
    if (settings.data) setForm((f) => f ?? settings.data);
  }, [settings.data]);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const dirty = !!form && !!settings.data && JSON.stringify(form) !== JSON.stringify(settings.data);

  // Autosave: a moment after the last change, with a small "Saved" tick instead of a Save button.
  useEffect(() => {
    if (!dirty || !form) return;
    const t = setTimeout(() => {
      void save.run(form).then((saved) => {
        if (!saved) return;
        settings.setData(saved);
        setSavedAt(Date.now());
        const s = adminSession.get();
        if (s) adminSession.set({ ...s, church: { ...s.church, name: saved.name, city: saved.city, logoUrl: saved.logoUrl ?? null, brand: saved.brand ?? null } });
      });
    }, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, dirty]);

  if (settings.error) return <ErrorState error={settings.error} onRetry={settings.reload} />;
  if (!form) return <Loading />;
  const set = <K extends keyof ChurchSettings>(k: K, v: ChurchSettings[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const india = form.country === 'IN';

  const saveBar = (
    <div className="row autosave" style={{ justifyContent: 'flex-end' }}>
      <FormError error={save.error} />
      <span className="small muted" aria-live="polite">
        {save.busy || dirty ? 'Saving…' : savedAt ? <><CheckCircle2 size={14} color="var(--ok)" /> Saved</> : 'Changes save by themselves'}
      </span>
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
                      <span>{l === 'en' ? 'English' : `${languages[l].label} (${languages[l].english})`}</span>
                    </label>
                  ))}
                </div>
              </Field>
            </div>
          </div>
        </div>
        <BrandKitCard form={form} set={set} />
        {saveBar}
      </>
    );

  return (
    <>
      <RazorpayCard india={india} />

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
  const roles = useApi(AdminApi.roles.list);
  const [inviting, setInviting] = useState(false);
  const [changing, setChanging] = useState<StaffView | null>(null);
  const [editingRole, setEditingRole] = useState<RoleView | 'new' | null>(null);
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
                      <div>{s.roleName}{s.scopeNames.length > 0 && <span className="small muted"> · {s.scopeNames.join(', ')}</span>}</div>
                      {s.role !== 'owner' && <button className="btn ghost sm" style={{ marginLeft: -8 }} onClick={() => setChanging(s)}><Pencil size={13} /> Change</button>}
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
        <div className="card-head">
          <h2>Roles this church made</h2>
          <button className="btn sm" onClick={() => setEditingRole('new')}><Plus size={15} /> New role</button>
        </div>
        <p className="small muted" style={{ padding: '0 16px 12px' }}>Make a role for zone leaders, ushers, Sunday school teachers or anyone else: pick what they can do and how far it reaches. Give it to someone from their record (People › Edit › Access) or from the list above.</p>
        {roles.error ? <ErrorState error={roles.error} onRetry={roles.reload} /> : !roles.data ? <Loading /> : roles.data.length === 0 ? <Empty icon={<ShieldCheck size={28} />} title="No custom roles yet" body="The built-in roles below cover most churches. Make one when a leader needs a different mix, or should only see their own zone, group or team." /> : roles.data.map((r) => (
          <div key={r.id} className="list-row" style={{ alignItems: 'flex-start' }}>
            <div className="grow" style={{ minWidth: 0 }}>
              <div><b>{r.name}</b> <span className="badge gray">{ROLE_SCOPES.find((x) => x.id === r.scope)?.label}</span> <span className="small muted">· {r.holders === 0 ? 'nobody yet' : r.holders === 1 ? '1 person' : `${r.holders} people`}</span></div>
              {r.description && <div className="small muted">{r.description}</div>}
              <div className="small">{r.permissions.map(permLabel).join(' · ')}</div>
            </div>
            <button className="btn ghost icon sm" title="Edit" onClick={() => setEditingRole(r)}><Pencil size={14} /></button>
            <button className="btn ghost icon sm danger" title="Remove" disabled={r.holders > 0} onClick={async () => {
              if (!confirm(`Remove the ${r.name} role?`)) return;
              await AdminApi.roles.remove(r.id);
              roles.reload();
              toast('Role removed');
            }}><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
      <div className="card">
        <div className="card-head"><h2>What each built-in role can do</h2></div>
        {(Object.keys(ROLE_HELP) as StaffRole[]).filter((r) => r !== 'custom').map((r) => (
          <div key={r} className="list-row"><b style={{ width: 180 }}>{ROLE_LABELS[r]}</b><span className="small muted grow">{ROLE_HELP[r]}</span></div>
        ))}
      </div>
      {inviting && <InviteForm roles={roles.data ?? []} onClose={() => setInviting(false)} onSaved={() => { setInviting(false); staff.reload(); roles.reload(); toast('Invite sent'); }} />}
      {changing && <ChangeRoleModal member={changing} roles={roles.data ?? []} onClose={() => setChanging(null)} onSaved={(v) => { setChanging(null); staff.reload(); roles.reload(); toast(`${v.name} is now ${v.roleName}`); }} />}
      {editingRole && <RoleModal role={editingRole === 'new' ? null : editingRole} onClose={() => setEditingRole(null)} onSaved={() => { setEditingRole(null); roles.reload(); toast('Role saved'); }} />}
    </>
  );
}

function ChangeRoleModal({ member, roles, onClose, onSaved }: { member: StaffView; roles: RoleView[]; onClose: () => void; onSaved: (v: StaffView) => void }) {
  const [choice, setChoice] = useState<Choice>(asChoice(member));
  const save = useAction(() => AdminApi.staff.setRole(member.id, toChoice(choice) as RoleChoice));
  return (
    <Modal title={`${member.name}’s role`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={save.busy} onClick={async () => { const v = await save.run(); if (v) onSaved(v); }}>Save</button></>}>
      <div className="stack">
        <FormError error={save.error} />
        <RolePicker value={choice} onChange={setChoice} roles={roles} autoFocus />
      </div>
    </Modal>
  );
}

/** Make or change a role: name, what it can do, how far it reaches. */
function RoleModal({ role, onClose, onSaved }: { role: RoleView | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [scope, setScope] = useState<RoleScope>(role?.scope ?? 'church');
  const [perms, setPerms] = useState<Permission[]>(role?.permissions ?? ['people.view']);
  const save = useAction(() => (role ? AdminApi.roles.update(role.id, { name, description, scope, permissions: perms }) : AdminApi.roles.create({ name, description, scope, permissions: perms })));
  const fe = save.error?.fields ?? {};
  const toggle = (p: Permission) => setPerms((x) => (x.includes(p) ? x.filter((y) => y !== p) : [...x, p]));
  return (
    <Modal title={role ? `Edit the ${role.name} role` : 'New role'} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={save.busy || !name.trim() || perms.length === 0} onClick={async () => { if (await save.run()) onSaved(); }}>Save role</button></>}>
      <div className="stack">
        <FormError error={save.error?.fields ? null : save.error} />
        <div className="grid cols-2">
          <Field label="Name" error={fe.name}><input className="input" autoFocus value={name} maxLength={60} placeholder="e.g. Zone leader, Usher captain" onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Reaches" hint={ROLE_SCOPES.find((x) => x.id === scope)?.hint} error={fe.scope}>
            <select className="select" value={scope} onChange={(e) => setScope(e.target.value as RoleScope)}>{ROLE_SCOPES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select>
          </Field>
        </div>
        <Field label="What this role is for" hint="Shown when someone is given the role"><input className="input" value={description} maxLength={300} onChange={(e) => setDescription(e.target.value)} /></Field>
        <Field label="Can do" error={fe.permissions}>
          <div className="grid cols-2" style={{ gap: 6 }}>
            {PERMISSION_INFO.map((p) => (
              <label key={p.id} className="check" style={{ alignItems: 'flex-start' }}>
                <input type="checkbox" checked={perms.includes(p.id)} onChange={() => toggle(p.id)} />
                <span>{p.label}<span className="small muted" style={{ display: 'block' }}>{p.hint}</span></span>
              </label>
            ))}
          </div>
        </Field>
        {scope !== 'church' && perms.some((p) => ['giving.view', 'settings', 'staff'].includes(p)) && <div className="alert warn">Giving, settings and team access are church-wide; the {scope} limit applies to people, care, groups and zones.</div>}
      </div>
    </Modal>
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

function InviteForm({ roles, onClose, onSaved }: { roles: RoleView[]; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [choice, setChoice] = useState<Choice>({ role: 'admin' });
  const invite = useAction(AdminApi.staff.invite);
  return (
    <Modal title="Invite to the church office" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={invite.busy || !name.trim() || !email.includes('@')} onClick={async () => { if (await invite.run({ name, email, ...(toChoice(choice) as RoleChoice) })) onSaved(); }}>Send invite</button></>}
    >
      <div className="stack">
        <FormError error={invite.error} />
        <Field label="Name"><input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Email" hint="They sign in with a one-time code emailed here"><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <RolePicker value={choice} onChange={setChoice} roles={roles} />
      </div>
    </Modal>
  );
}
