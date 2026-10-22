import { Check, ClipboardCheck, Clock, MapPin, Pencil, Plus, Trash2, UserMinus, UserRound, UsersRound, X } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router';

import type { AdminGroup, GroupDetail, GroupInput, GroupType } from '@/api/admin-types';
import { AdminApi } from '@/api/endpoints';
import { Avatar, Empty, ErrorState, Field, FormError, Loading, Modal, Segmented, useToast } from '@/components/ui';
import { formatDate, formatRelative } from '@/lib/format';
import { useAction, useApi } from '@/lib/use-api';

import { PersonField, PersonSearch, type PickedPerson } from '../components/person-picker';
import { PageHeader } from '../layout';

const TYPES: { value: GroupType; label: string }[] = [
  { value: 'cell', label: 'Home group' },
  { value: 'ministry', label: 'Ministry' },
  { value: 'class', label: 'Class' },
  { value: 'other', label: 'Other' },
];
const typeLabel = (t: GroupType) => TYPES.find((x) => x.value === t)?.label ?? t;

export function GroupsPage() {
  const groups = useApi(AdminApi.groups.list);
  const requests = useApi(AdminApi.groups.joinRequests);
  const [editing, setEditing] = useState<AdminGroup | 'new' | null>(null);
  const [opened, setOpened] = useState<string | null>(null);
  const [type, setType] = useState<GroupType | 'all'>('all');
  const [zone, setZone] = useState('');
  const toast = useToast();

  async function decide(id: string, name: string, decision: 'approve' | 'decline') {
    await AdminApi.groups.decide(id, decision);
    toast(decision === 'approve' ? `${name} added to the group` : 'Request declined');
    requests.reload();
    groups.reload();
  }

  const zones = useMemo(() => [...new Set((groups.data?.data ?? []).map((g) => g.zone).filter(Boolean))].sort(), [groups.data]);
  const list = (groups.data?.data ?? []).filter((g) => (type === 'all' || g.type === type) && (!zone || g.zone === zone));
  const totalMembers = list.reduce((s, g) => s + g.memberCount, 0);

  return (
    <>
      <PageHeader
        title="Groups"
        subtitle="Home groups, ministries and classes. Open groups are listed in the member app."
        actions={<button className="btn primary" onClick={() => setEditing('new')}><Plus size={16} /> New group</button>}
      />

      {requests.data && requests.data.data.length > 0 && (
        <div className="card">
          <div className="card-head">
            <h2>Join requests</h2>
            <span className="badge accent">{requests.data.data.length} waiting</span>
          </div>
          {requests.data.data.map((r) => (
            <div key={r.id} className="list-row">
              <Avatar name={r.person.name} />
              <div className="grow">
                <div style={{ fontWeight: 600 }}>{r.person.name}</div>
                <div className="small muted">wants to join <b>{r.groupName}</b> · {formatRelative(r.requestedAt)}{r.person.phone ? ` · ${r.person.phone}` : ''}</div>
              </div>
              <button className="btn sm" onClick={() => decide(r.id, r.person.name, 'decline')}><X size={15} /> Decline</button>
              <button className="btn sm primary" onClick={() => decide(r.id, r.person.name, 'approve')}><Check size={15} /> Approve</button>
            </div>
          ))}
        </div>
      )}

      <div className="row wrap between">
        <div className="row wrap">
          <Segmented value={type} onChange={setType} options={[{ value: 'all', label: 'All' }, ...TYPES]} />
          {zones.length > 0 && (
            <select className="select" style={{ width: 180 }} value={zone} onChange={(e) => setZone(e.target.value)}>
              <option value="">All zones</option>
              {zones.map((z) => <option key={z} value={z}>{z}</option>)}
            </select>
          )}
        </div>
        {groups.data && <span className="small muted">{list.length} groups · {totalMembers} members</span>}
      </div>

      {groups.error ? <ErrorState error={groups.error} onRetry={groups.reload} /> : !groups.data ? <Loading /> : list.length === 0 ? (
        <div className="card"><Empty icon={<UsersRound size={32} />} title="No groups here yet" action={<button className="btn primary" onClick={() => setEditing('new')}>Create a group</button>} /></div>
      ) : (
        <div className="grid cols-3">
          {list.map((g) => (
            <div key={g.id} className="card card-pad stack">
              <div className="row between" style={{ alignItems: 'flex-start' }}>
                <div>
                  <h3><button className="link-btn" style={{ color: 'var(--text)', fontSize: 16, textAlign: 'left' }} onClick={() => setOpened(g.id)}>{g.name}</button></h3>
                  <span className="small muted">{typeLabel(g.type)}{g.zone ? ` · ${g.zone}` : ''}</span>
                </div>
                {g.isOpen ? <span className="badge ok">Open</span> : <span className="badge gray">Closed</span>}
              </div>
              <p className="small muted" style={{ minHeight: 40 }}>{g.description}</p>
              <div className="stack small" style={{ gap: 4 }}>
                <span className="row" style={{ gap: 6 }}><Clock size={14} className="muted" /> {g.meetingSchedule || '—'}</span>
                <span className="row" style={{ gap: 6 }}><MapPin size={14} className="muted" /> {g.location || '—'}</span>
                <span className="row" style={{ gap: 6 }}><UserRound size={14} className="muted" /> {g.leaderName || 'No leader yet'}</span>
              </div>
              <div className="row between" style={{ marginTop: 'auto' }}>
                <span className="small"><b>{g.memberCount}</b> members{g.pendingRequests ? <span className="badge accent" style={{ marginLeft: 6 }}>{g.pendingRequests} pending</span> : null}</span>
                <div className="row" style={{ gap: 2 }}>
                  <button className="btn sm" onClick={() => setOpened(g.id)}>Open</button>
                  <button className="btn ghost icon sm" title="Edit" onClick={() => setEditing(g)}><Pencil size={15} /></button>
                  <button className="btn ghost icon sm danger" title="Delete" onClick={async () => {
                    if (!confirm(`Delete ${g.name}? Members and meeting history will be removed.`)) return;
                    await AdminApi.groups.remove(g.id);
                    toast('Group deleted');
                    groups.reload();
                  }}><Trash2 size={15} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && <GroupForm group={editing === 'new' ? null : editing} zones={zones} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); groups.reload(); toast('Saved'); }} />}
      {opened && <GroupDrawer id={opened} onClose={() => { setOpened(null); groups.reload(); }} onEdit={(g) => { setOpened(null); setEditing(g); }} />}
    </>
  );
}

function GroupDrawer({ id, onClose, onEdit }: { id: string; onClose: () => void; onEdit: (g: AdminGroup) => void }) {
  const { data, error, reload } = useApi(() => AdminApi.groups.get(id), [id]);
  const [tab, setTab] = useState<'members' | 'meetings'>('members');
  const [recording, setRecording] = useState(false);
  const toast = useToast();

  return (
    <Modal side title={data?.group.name ?? 'Group'} onClose={onClose}
      footer={data && <><button className="btn" onClick={() => onEdit(data.group)}><Pencil size={15} /> Edit details</button><button className="btn primary" onClick={() => setRecording(true)}><ClipboardCheck size={15} /> Record a meeting</button></>}
    >
      {error ? <ErrorState error={error} onRetry={reload} /> : !data ? <Loading /> : (
        <div className="stack lg">
          <div className="small muted">{typeLabel(data.group.type)}{data.group.zone ? ` · ${data.group.zone}` : ''} · {data.group.meetingSchedule || 'No schedule'} · Led by {data.group.leaderName || '—'}</div>
          <div className="tabs">
            <button className={tab === 'members' ? 'on' : ''} onClick={() => setTab('members')}>Members <span className="count">{data.members.length}</span></button>
            <button className={tab === 'meetings' ? 'on' : ''} onClick={() => setTab('meetings')}>Meetings <span className="count">{data.meetings.length}</span></button>
          </div>
          {tab === 'members' ? (
            <div className="stack">
              <PersonSearch placeholder="Add someone to this group" exclude={data.members.map((m) => m.id)} onPick={async (p) => {
                await AdminApi.groups.addMembers(id, [p.id]);
                toast(`${p.name} added`);
                reload();
              }} />
              <div className="card">
                {data.members.length === 0 && <p className="card-body muted small">No members yet.</p>}
                {data.members.map((m) => (
                  <div key={m.id} className="list-row">
                    <Avatar name={m.name} />
                    <div className="grow">
                      <Link to={`/admin/people/${m.id}`} style={{ fontWeight: 600 }}>{m.name}</Link>
                      <div className="small muted">{m.phone ?? ''}</div>
                    </div>
                    {data.group.leaderId === m.id && <span className="badge">Leader</span>}
                    <button className="btn ghost icon sm danger" title="Remove from group" onClick={async () => {
                      if (!confirm(`Remove ${m.name} from ${data.group.name}?`)) return;
                      await AdminApi.groups.removeMember(id, m.id);
                      reload();
                    }}><UserMinus size={15} /></button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <MeetingHistory detail={data} />
          )}
        </div>
      )}
      {recording && data && <MeetingForm detail={data} onClose={() => setRecording(false)} onSaved={() => { setRecording(false); setTab('meetings'); reload(); toast('Meeting recorded'); }} />}
    </Modal>
  );
}

function MeetingHistory({ detail }: { detail: GroupDetail }) {
  const names = new Map(detail.members.map((m) => [m.id, m.name]));
  if (detail.meetings.length === 0) return <Empty icon={<ClipboardCheck size={28} />} title="No meetings recorded" body="Record who came each week. Attendance feeds the care alerts for people who drift away." />;
  const avg = Math.round(detail.meetings.reduce((s, m) => s + m.presentIds.length + m.guests, 0) / detail.meetings.length);
  return (
    <div className="stack">
      <div className="small muted">Average attendance <b style={{ color: 'var(--text)' }}>{avg}</b> over the last {detail.meetings.length} meetings</div>
      <div className="card">
        {detail.meetings.map((m) => (
          <div key={m.id} className="list-row" style={{ alignItems: 'flex-start' }}>
            <div className="grow">
              <div style={{ fontWeight: 600 }}>{formatDate(m.date)}</div>
              <div className="small muted">{m.presentIds.map((id) => names.get(id) ?? 'Former member').join(', ') || 'No members marked'}</div>
              {m.notes && <div className="small" style={{ marginTop: 4 }}>{m.notes}</div>}
            </div>
            <span className="badge gray">{m.presentIds.length}{m.guests ? ` + ${m.guests}` : ''}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MeetingForm({ detail, onClose, onSaved }: { detail: GroupDetail; onClose: () => void; onSaved: () => void }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [present, setPresent] = useState<Set<string>>(new Set());
  const [guests, setGuests] = useState(0);
  const [notes, setNotes] = useState('');
  const save = useAction(() => AdminApi.groups.recordMeeting(detail.group.id, { date, presentIds: [...present], guests, notes }));
  const toggle = (id: string) => setPresent((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return (
    <Modal title={`Meeting: ${detail.group.name}`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={save.busy} onClick={async () => { if (await save.run()) onSaved(); }}>Save attendance</button></>}
    >
      <div className="stack">
        <div className="grid cols-2">
          <Field label="Date"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Guests"><input className="input" type="number" min={0} value={guests} onChange={(e) => setGuests(Number(e.target.value) || 0)} /></Field>
        </div>
        <div className="row between">
          <span className="section-title">Who came? ({present.size})</span>
          <button className="link-btn small" onClick={() => setPresent(present.size === detail.members.length ? new Set() : new Set(detail.members.map((m) => m.id)))}>{present.size === detail.members.length ? 'Clear' : 'Everyone'}</button>
        </div>
        <div className="card" style={{ maxHeight: 280, overflowY: 'auto' }}>
          {detail.members.map((m) => (
            <label key={m.id} className="list-row check" style={{ cursor: 'pointer' }}>
              <input type="checkbox" checked={present.has(m.id)} onChange={() => toggle(m.id)} />
              <span>{m.name}</span>
            </label>
          ))}
        </div>
        <Field label="Notes"><textarea className="textarea" style={{ minHeight: 70 }} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Prayer needs, follow-ups, what you studied" /></Field>
        <FormError error={save.error} />
      </div>
    </Modal>
  );
}

function GroupForm({ group, zones, onClose, onSaved }: { group: AdminGroup | null; zones: string[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<GroupInput>({
    name: group?.name ?? '',
    description: group?.description ?? '',
    meetingSchedule: group?.meetingSchedule ?? '',
    location: group?.location ?? '',
    leaderName: group?.leaderName ?? '',
    isOpen: group?.isOpen ?? true,
    type: group?.type ?? 'cell',
    zone: group?.zone ?? '',
    leaderId: group?.leaderId ?? null,
  });
  const [leader, setLeader] = useState<PickedPerson | null>(group?.leaderId ? { id: group.leaderId, name: group.leaderName } : null);
  const save = useAction((input: GroupInput) => (group ? AdminApi.groups.update(group.id, input) : AdminApi.groups.create(input)));
  const set = <K extends keyof GroupInput>(k: K, v: GroupInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (await save.run(form)) onSaved();
  }

  return (
    <Modal title={group ? 'Edit group' : 'New group'} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" form="group-form" disabled={save.busy}>{save.busy ? 'Saving…' : 'Save'}</button></>}
    >
      <form id="group-form" className="stack" onSubmit={onSubmit}>
        <FormError error={save.error?.fields ? null : save.error} />
        <Field label="Name" error={save.error?.fields?.name}><input className="input" autoFocus value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Kondapur Home Group" /></Field>
        <div className="grid cols-2">
          <Field label="Type">
            <select className="select" value={form.type} onChange={(e) => set('type', e.target.value as GroupType)}>
              {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="Zone or area" hint="Used to organise home groups by locality">
            <input className="input" list="zones" value={form.zone} onChange={(e) => set('zone', e.target.value)} placeholder="West Hyderabad" />
            <datalist id="zones">{zones.map((z) => <option key={z} value={z} />)}</datalist>
          </Field>
        </div>
        <Field label="Description"><textarea className="textarea" value={form.description} onChange={(e) => set('description', e.target.value)} /></Field>
        <div className="grid cols-2">
          <Field label="When it meets"><input className="input" value={form.meetingSchedule} onChange={(e) => set('meetingSchedule', e.target.value)} placeholder="Wednesdays, 7:30 pm" /></Field>
          <Field label="Where"><input className="input" value={form.location} onChange={(e) => set('location', e.target.value)} /></Field>
        </div>
        <Field label="Leader" hint="Picking someone from your people list adds them to the group">
          <PersonField value={leader} onChange={(p) => { setLeader(p); setForm((f) => ({ ...f, leaderId: p?.id ?? null, leaderName: p ? p.name : f.leaderName })); }} placeholder="Search for the leader" />
        </Field>
        <Field label="Leader name shown to members"><input className="input" value={form.leaderName} onChange={(e) => set('leaderName', e.target.value)} placeholder="Joseph & Anita" /></Field>
        <label className="check">
          <input type="checkbox" checked={form.isOpen} onChange={(e) => set('isOpen', e.target.checked)} />
          <span>Open to new members <span className="small muted">(listed in the app; people can ask to join)</span></span>
        </label>
      </form>
    </Modal>
  );
}
