import { Check, Clock, MapPin, Pencil, Plus, Trash2, UserRound, UsersRound, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import type { AdminGroup, GroupInput } from '@/api/admin-types';
import { AdminApi } from '@/api/endpoints';
import { Avatar, Empty, ErrorState, Field, FormError, Loading, Modal, useToast } from '@/components/ui';
import { formatRelative } from '@/lib/format';
import { useAction, useApi } from '@/lib/use-api';

import { PageHeader } from '../layout';

export function GroupsPage() {
  const groups = useApi(AdminApi.groups.list);
  const requests = useApi(AdminApi.groups.joinRequests);
  const [editing, setEditing] = useState<AdminGroup | 'new' | null>(null);
  const toast = useToast();

  async function decide(id: string, name: string, decision: 'approve' | 'decline') {
    await AdminApi.groups.decide(id, decision);
    toast(decision === 'approve' ? `${name} added to the group` : 'Request declined');
    requests.reload();
    groups.reload();
  }

  return (
    <>
      <PageHeader
        title="Groups"
        subtitle="Home groups, ministries and teams. Open groups are listed in the member app."
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

      {groups.error ? <ErrorState error={groups.error} onRetry={groups.reload} /> : !groups.data ? <Loading /> : groups.data.data.length === 0 ? (
        <div className="card"><Empty icon={<UsersRound size={32} />} title="No groups yet" action={<button className="btn primary" onClick={() => setEditing('new')}>Create your first group</button>} /></div>
      ) : (
        <div className="grid cols-3">
          {groups.data.data.map((g) => (
            <div key={g.id} className="card card-pad stack">
              <div className="row between" style={{ alignItems: 'flex-start' }}>
                <h3>{g.name}</h3>
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
                <div>
                  <button className="btn ghost icon sm" title="Edit" onClick={() => setEditing(g)}><Pencil size={15} /></button>
                  <button className="btn ghost icon sm danger" title="Delete" onClick={async () => {
                    if (!confirm(`Delete ${g.name}?`)) return;
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

      {editing && <GroupForm group={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); groups.reload(); toast('Saved'); }} />}
    </>
  );
}

function GroupForm({ group, onClose, onSaved }: { group: AdminGroup | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<GroupInput>({
    name: group?.name ?? '',
    description: group?.description ?? '',
    meetingSchedule: group?.meetingSchedule ?? '',
    location: group?.location ?? '',
    leaderName: group?.leaderName ?? '',
    isOpen: group?.isOpen ?? true,
  });
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
        <Field label="Description"><textarea className="textarea" value={form.description} onChange={(e) => set('description', e.target.value)} /></Field>
        <div className="grid cols-2">
          <Field label="When it meets"><input className="input" value={form.meetingSchedule} onChange={(e) => set('meetingSchedule', e.target.value)} placeholder="Wednesdays, 7:30 pm" /></Field>
          <Field label="Where"><input className="input" value={form.location} onChange={(e) => set('location', e.target.value)} /></Field>
        </div>
        <Field label="Leader(s)"><input className="input" value={form.leaderName} onChange={(e) => set('leaderName', e.target.value)} placeholder="Joseph & Anita" /></Field>
        <label className="check">
          <input type="checkbox" checked={form.isOpen} onChange={(e) => set('isOpen', e.target.checked)} />
          <span>Open to new members <span className="small muted">(listed in the app; people can ask to join)</span></span>
        </label>
      </form>
    </Modal>
  );
}
