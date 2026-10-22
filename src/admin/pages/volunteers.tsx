import { CalendarOff, KeyRound, Mail, Pencil, Plus, Printer, Smartphone, Trash2, UserPlus, Users, Wand2, X } from 'lucide-react';
import { useState } from 'react';

import type { AssignmentStatus, AvailablePerson, Schedule, ScheduleSlot, TeamLoginView, TeamView } from '@/api/admin-types';
import { AdminApi } from '@/api/endpoints';
import { Avatar, Empty, ErrorState, Field, FormError, Loading, Modal, useToast } from '@/components/ui';
import { formatDate, formatDay, formatRelative, formatTime } from '@/lib/format';
import { printHtml } from '@/lib/print';
import { toApiError, useAction, useApi } from '@/lib/use-api';

import { PersonField, PersonSearch, type PickedPerson } from '../components/person-picker';
import { PageHeader } from '../layout';

const STATUS_TONE: Record<AssignmentStatus, string> = { accepted: 'ok', pending: 'warn', declined: 'danger' };
const STATUS_LABEL: Record<AssignmentStatus, string> = { accepted: 'Confirmed', pending: 'Asked', declined: 'Declined' };
const COLORS = ['#1F6B5C', '#F2A93B', '#7C5CBF', '#D9534F', '#2E86AB', '#8FB339', '#C06C84', '#5B6B68'];

type Tab = 'schedule' | 'teams' | 'blockouts' | 'logins';

export function VolunteersPage() {
  const [tab, setTab] = useState<Tab>('schedule');
  return (
    <>
      <PageHeader title="Volunteers" subtitle="Build rotas, avoid clashes with people's away dates, and let volunteers accept or decline in the app." />
      <div className="tabs">
        <button className={tab === 'schedule' ? 'on' : ''} onClick={() => setTab('schedule')}>Schedule</button>
        <button className={tab === 'teams' ? 'on' : ''} onClick={() => setTab('teams')}>Teams</button>
        <button className={tab === 'blockouts' ? 'on' : ''} onClick={() => setTab('blockouts')}>Away dates</button>
        <button className={tab === 'logins' ? 'on' : ''} onClick={() => setTab('logins')}>App logins</button>
      </div>
      {tab === 'schedule' && <SchedulePane />}
      {tab === 'teams' && <TeamsPane />}
      {tab === 'blockouts' && <BlockoutsPane />}
      {tab === 'logins' && <LoginsPane />}
    </>
  );
}

function SchedulePane() {
  const overview = useApi(AdminApi.volunteers.overview);
  const [eventId, setEventId] = useState<string | null>(null);
  const current = eventId ?? overview.data?.[0]?.event.id ?? null;
  if (overview.error) return <ErrorState error={overview.error} onRetry={overview.reload} />;
  if (!overview.data) return <Loading />;
  if (!overview.data.length) return <div className="card"><Empty icon={<Users size={32} />} title="Nothing to schedule" body="Upcoming services and events appear here." /></div>;
  return (
    <div className="split">
      <div className="card side-list">
        {overview.data.map((o) => (
          <div key={o.event.id} className={`list-row ${o.event.id === current ? 'on' : ''}`} onClick={() => setEventId(o.event.id)}>
            <div className="date-chip"><b>{new Date(o.event.startsAt).getDate()}</b><small>{new Date(o.event.startsAt).toLocaleDateString('en-IN', { month: 'short' })}</small></div>
            <div className="grow">
              <div className="ellipsis" style={{ fontWeight: 600 }}>{o.event.title}</div>
              <div className="progress" style={{ margin: '6px 0 3px' }}><i style={{ width: `${o.needed ? Math.min(100, (o.accepted / o.needed) * 100) : 0}%` }} /></div>
              <div className="small muted">{o.accepted}/{o.needed} confirmed{o.pending ? ` · ${o.pending} asked` : ''}{o.declined ? ` · ${o.declined} declined` : ''}</div>
            </div>
          </div>
        ))}
      </div>
      {current && <EventSchedule key={current} eventId={current} onChanged={overview.reload} />}
    </div>
  );
}

function EventSchedule({ eventId, onChanged }: { eventId: string; onChanged: () => void }) {
  const { data, error, reload, setData } = useApi(() => AdminApi.volunteers.schedule(eventId), [eventId]);
  const [adding, setAdding] = useState<ScheduleSlot | null>(null);
  const toast = useToast();
  const autofill = useAction(AdminApi.volunteers.autofill);
  const notify = useAction(AdminApi.volunteers.notify);
  const refresh = () => { reload(); onChanged(); };

  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const teams = groupByTeam(data);
  const open = data.slots.reduce((s, x) => s + x.open, 0);
  const pending = data.slots.reduce((s, x) => s + x.assignments.filter((a) => a.status === 'pending').length, 0);

  return (
    <div className="stack">
      <div className="card card-pad row wrap between">
        <div>
          <h2>{data.event.title}</h2>
          <div className="small muted">{formatDay(data.event.startsAt)} · {formatTime(data.event.startsAt)} · {open} open {open === 1 ? 'slot' : 'slots'}</div>
        </div>
        <div className="row wrap">
          <button className="btn" onClick={() => printRota(data)}><Printer size={15} /> Print rota</button>
          <button className="btn" disabled={notify.busy || !pending} title="Email everyone who has not replied" onClick={async () => { const r = await notify.run(eventId); if (r) toast(`Emailed ${r.notified} ${r.notified === 1 ? 'volunteer' : 'volunteers'}`); }}><Mail size={15} /> Remind {pending || ''}</button>
          <button className="btn primary" disabled={autofill.busy || !open} onClick={async () => { const r = await autofill.run(eventId); if (r) { setData(r.schedule); onChanged(); toast(r.added ? `Filled ${r.added} ${r.added === 1 ? 'slot' : 'slots'}, fairly by who served least` : 'No available people for the open slots'); } }}><Wand2 size={15} /> Auto-fill</button>
        </div>
      </div>
      <FormError error={autofill.error ?? notify.error} />
      {teams.length === 0 && <div className="card"><Empty icon={<Users size={28} />} title="No teams yet" body="Create teams with positions in the Teams tab." /></div>}
      {teams.map(({ team, slots }) => (
        <div key={team.id} className="card">
          <div className="card-head"><h2 className="row" style={{ gap: 8 }}><span className="dot" style={{ background: team.color }} /> {team.name}</h2></div>
          {slots.map((slot) => (
            <div key={slot.position.id} className="list-row" style={{ alignItems: 'flex-start' }}>
              <div style={{ width: 150, flexShrink: 0, paddingTop: 6 }}>
                <b>{slot.position.name}</b>
                <div className="small muted">{slot.assignments.filter((a) => a.status !== 'declined').length}/{slot.position.needed} needed</div>
              </div>
              <div className="grow row wrap" style={{ gap: 8 }}>
                {slot.assignments.map((a) => (
                  <span key={a.id} className="chip" style={{ opacity: a.status === 'declined' ? 0.6 : 1 }}>
                    {a.name}
                    <select className={`badge ${STATUS_TONE[a.status]}`} style={{ border: 0, cursor: 'pointer' }} value={a.status} title="Change status" onChange={async (e) => { await AdminApi.volunteers.setStatus(a.id, e.target.value as AssignmentStatus); refresh(); }}>
                      {(['pending', 'accepted', 'declined'] as const).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                    </select>
                    <button title="Remove" onClick={async () => { await AdminApi.volunteers.unassign(a.id); refresh(); }}><X size={13} /></button>
                  </span>
                ))}
                {slot.open > 0 && <button className="btn sm" onClick={() => setAdding(slot)}><UserPlus size={14} /> Add{slot.open > 1 ? ` (${slot.open} open)` : ''}</button>}
              </div>
            </div>
          ))}
        </div>
      ))}
      {adding && <AssignModal eventId={eventId} slot={adding} onClose={() => setAdding(null)} onDone={() => { setAdding(null); refresh(); }} />}
    </div>
  );
}

function groupByTeam(s: Schedule) {
  const map = new Map<string, { team: ScheduleSlot['team']; slots: ScheduleSlot[] }>();
  for (const slot of s.slots) {
    const entry = map.get(slot.team.id) ?? { team: slot.team, slots: [] };
    entry.slots.push(slot);
    map.set(slot.team.id, entry);
  }
  return [...map.values()];
}

function printRota(s: Schedule) {
  const esc = (v: string) => v.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
  const body = `<h1>${esc(s.event.title)}</h1><div class="muted">${esc(formatDay(s.event.startsAt))} · ${esc(formatTime(s.event.startsAt))}</div>
    ${groupByTeam(s).map(({ team, slots }) => `<h2>${esc(team.name)}</h2><table><tbody>${slots.map((sl) => `<tr><td style="width:35%"><b>${esc(sl.position.name)}</b></td><td>${sl.assignments.filter((a) => a.status !== 'declined').map((a) => esc(a.name) + (a.status === 'pending' ? ' <span class="muted">(not confirmed)</span>' : '')).join(', ') || '<span class="muted">Open</span>'}</td></tr>`).join('')}</tbody></table>`).join('')}`;
  printHtml(`Rota ${s.event.title}`, body);
}

function AssignModal({ eventId, slot, onClose, onDone }: { eventId: string; slot: ScheduleSlot; onClose: () => void; onDone: () => void }) {
  const people = useApi(() => AdminApi.volunteers.available(eventId, slot.team.id, slot.position.id), [slot.position.id]);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const taken = new Set(slot.assignments.map((a) => a.personId));

  async function assign(p: AvailablePerson | PickedPerson, force = false) {
    const personId = 'personId' in p ? p.personId : p.id;
    try {
      await AdminApi.volunteers.assign({ eventId, teamId: slot.team.id, positionId: slot.position.id, personId, force });
      toast(`${p.name} asked to serve`);
      onDone();
    } catch (e) {
      const err = toApiError(e);
      if (err.code === 'conflict' && confirm(`${err.message}\n\nSchedule anyway?`)) return assign(p, true);
      setError(err.message);
    }
  }

  return (
    <Modal title={`${slot.team.name}: ${slot.position.name}`} onClose={onClose}>
      <div className="stack">
        {error && <div className="alert error">{error}</div>}
        {people.error ? <ErrorState error={people.error} onRetry={people.reload} /> : !people.data ? <Loading /> : (
          <div className="card">
            {people.data.filter((p) => !taken.has(p.personId)).length === 0 && <p className="card-body small muted">No one on this team plays this position yet. Add someone below or in the Teams tab.</p>}
            {people.data.filter((p) => !taken.has(p.personId)).map((p) => (
              <div key={p.personId} className="list-row">
                <Avatar name={p.name} />
                <div className="grow">
                  <b>{p.name}</b>
                  <div className="small muted">
                    {p.available ? <>Served {p.timesServed90d}× in 90 days{p.lastServedAt ? ` · last ${formatRelative(p.lastServedAt)}` : ''}</> : <span style={{ color: 'var(--danger)' }}>{p.reason}</span>}
                  </div>
                </div>
                <button className={`btn sm ${p.available ? 'primary' : ''}`} onClick={() => assign(p, !p.available)}>{p.available ? 'Ask' : 'Ask anyway'}</button>
              </div>
            ))}
          </div>
        )}
        <span className="section-title">Someone else</span>
        <PersonSearch placeholder="Search anyone in the church" onPick={(p) => assign(p)} />
      </div>
    </Modal>
  );
}

function TeamsPane() {
  const teams = useApi(AdminApi.volunteers.teams);
  const [editing, setEditing] = useState<TeamView | 'new' | null>(null);
  const [members, setMembers] = useState<TeamView | null>(null);
  const toast = useToast();
  if (teams.error) return <ErrorState error={teams.error} onRetry={teams.reload} />;
  if (!teams.data) return <Loading />;
  return (
    <>
      <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn primary" onClick={() => setEditing('new')}><Plus size={16} /> New team</button></div>
      <div className="grid cols-3">
        {teams.data.map((t) => (
          <div key={t.id} className="card card-pad stack">
            <div className="row between">
              <h3 className="row" style={{ gap: 8 }}><span className="dot" style={{ background: t.color }} /> {t.name}</h3>
              <div className="row" style={{ gap: 2 }}>
                <button className="btn ghost icon sm" onClick={() => setEditing(t)}><Pencil size={15} /></button>
                <button className="btn ghost icon sm danger" onClick={async () => { if (!confirm(`Delete ${t.name}? Its rota assignments are removed.`)) return; await AdminApi.volunteers.removeTeam(t.id); toast('Team deleted'); teams.reload(); }}><Trash2 size={15} /></button>
              </div>
            </div>
            <p className="small muted">{t.description || '—'}</p>
            <div className="row wrap" style={{ gap: 6 }}>{t.positions.map((p) => <span key={p.id} className="badge gray">{p.name} ×{p.needed}</span>)}</div>
            <div className="row between" style={{ marginTop: 'auto' }}>
              <span className="small"><b>{t.members.length}</b> volunteers{t.leaderName ? ` · led by ${t.leaderName}` : ''}</span>
              <button className="btn sm" onClick={() => setMembers(t)}><Users size={14} /> Members</button>
            </div>
          </div>
        ))}
      </div>
      {editing && <TeamForm team={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); teams.reload(); toast('Saved'); }} />}
      {members && <MembersModal team={members} onClose={() => { setMembers(null); teams.reload(); }} />}
    </>
  );
}

function TeamForm({ team, onClose, onSaved }: { team: TeamView | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(team?.name ?? '');
  const [description, setDescription] = useState(team?.description ?? '');
  const [color, setColor] = useState(team?.color ?? COLORS[0]);
  const [leader, setLeader] = useState<PickedPerson | null>(team?.leaderId ? { id: team.leaderId, name: team.leaderName ?? '' } : null);
  const [positions, setPositions] = useState<{ id?: string; name: string; needed: number }[]>(team?.positions ?? [{ name: '', needed: 1 }]);
  const save = useAction(() => {
    const input = { name, description, color, leaderId: leader?.id ?? null, positions: positions.filter((p) => p.name.trim()) };
    return team ? AdminApi.volunteers.updateTeam(team.id, input) : AdminApi.volunteers.createTeam(input);
  });
  return (
    <Modal title={team ? `Edit ${team.name}` : 'New team'} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={save.busy || !name.trim()} onClick={async () => { if (await save.run()) onSaved(); }}>Save</button></>}
    >
      <div className="stack">
        <FormError error={save.error} />
        <Field label="Team name"><input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Worship band" /></Field>
        <Field label="Description"><input className="input" value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        <Field label="Colour">
          <div className="row wrap" style={{ gap: 6 }}>{COLORS.map((c) => <button key={c} type="button" onClick={() => setColor(c)} style={{ width: 28, height: 28, borderRadius: '50%', background: c, border: color === c ? '3px solid var(--text)' : '2px solid var(--card)', cursor: 'pointer' }} aria-label={c} />)}</div>
        </Field>
        <Field label="Team leader"><PersonField value={leader} onChange={setLeader} /></Field>
        <span className="section-title">Positions and how many are needed each time</span>
        {positions.map((p, i) => (
          <div key={i} className="row">
            <input className="input grow" value={p.name} onChange={(e) => setPositions(positions.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="Keys, Vocals, Sound desk…" />
            <input className="input" style={{ width: 80 }} type="number" min={0} value={p.needed} onChange={(e) => setPositions(positions.map((x, j) => (j === i ? { ...x, needed: Number(e.target.value) } : x)))} />
            <button className="btn ghost icon sm" onClick={() => setPositions(positions.filter((_, j) => j !== i))}><X size={15} /></button>
          </div>
        ))}
        <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setPositions([...positions, { name: '', needed: 1 }])}><Plus size={14} /> Add position</button>
      </div>
    </Modal>
  );
}

function MembersModal({ team, onClose }: { team: TeamView; onClose: () => void }) {
  const [rows, setRows] = useState(team.memberDetails.map((m) => ({ personId: m.personId, name: m.name, positionIds: m.positionIds, times: m.timesServed90d })));
  const save = useAction(() => AdminApi.volunteers.setMembers(team.id, rows.map((r) => ({ personId: r.personId, positionIds: r.positionIds }))));
  const toast = useToast();
  const logins = useApi(AdminApi.volunteers.logins);
  const [sending, setSending] = useState<string | null>(null);
  const loginOf = (pid: string) => logins.data?.find((l) => l.personId === pid && !l.disabled);
  const saved = new Set(team.memberDetails.map((m) => m.personId));
  async function sendLogin(personId: string) {
    setSending(personId);
    try {
      await AdminApi.volunteers.sendLogin(personId);
      toast('Login emailed');
      logins.reload();
    } catch (e) {
      toast(toApiError(e).message);
    } finally {
      setSending(null);
    }
  }
  const toggle = (pid: string, pos: string) => setRows(rows.map((r) => (r.personId === pid ? { ...r, positionIds: r.positionIds.includes(pos) ? r.positionIds.filter((x) => x !== pos) : [...r.positionIds, pos] } : r)));
  return (
    <Modal title={`${team.name} members`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Close</button><button className="btn primary" disabled={save.busy} onClick={async () => { if (await save.run()) { toast('Members saved'); onClose(); } }}>Save</button></>}
    >
      <div className="stack">
        <PersonSearch placeholder="Add a volunteer" exclude={rows.map((r) => r.personId)} onPick={(p) => setRows([...rows, { personId: p.id, name: p.name, positionIds: team.positions.length === 1 ? [team.positions[0].id] : [], times: 0 }])} />
        <FormError error={save.error} />
        <div className="card">
          {rows.length === 0 && <p className="card-body small muted">No volunteers yet.</p>}
          {rows.map((r) => (
            <div key={r.personId} className="list-row" style={{ alignItems: 'flex-start' }}>
              <div className="grow">
                <b>{r.name}</b> <span className="small muted">· served {r.times}× in 90 days</span>
                <div className="row wrap" style={{ gap: 6, marginTop: 6 }}>
                  {team.positions.map((p) => (
                    <label key={p.id} className={`badge ${r.positionIds.includes(p.id) ? '' : 'gray'}`} style={{ cursor: 'pointer' }}>
                      <input type="checkbox" hidden checked={r.positionIds.includes(p.id)} onChange={() => toggle(r.personId, p.id)} />
                      {r.positionIds.includes(p.id) ? '✓ ' : ''}{p.name}
                    </label>
                  ))}
                </div>
              </div>
              {loginOf(r.personId) ? (
                <span className="badge ok small" title="Has a team app login"><Smartphone size={12} /> App</span>
              ) : saved.has(r.personId) ? (
                <button className="btn sm" title="Email this volunteer a password for the team app" disabled={sending === r.personId} onClick={() => sendLogin(r.personId)}><Smartphone size={14} /> {sending === r.personId ? 'Sending…' : 'Send app login'}</button>
              ) : (
                <span className="small muted" title="Save first, then send the app login">Save first</span>
              )}
              <button className="btn ghost icon sm danger" onClick={() => setRows(rows.filter((x) => x.personId !== r.personId))}><X size={15} /></button>
            </div>
          ))}
        </div>
        <p className="small muted" style={{ margin: 0 }}>The team app is for volunteers only. “Send app login” emails a temporary password; they pick their team when they sign in and see only their own rota.</p>
      </div>
    </Modal>
  );
}

function LoginsPane() {
  const list = useApi(AdminApi.volunteers.logins);
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  async function act(l: TeamLoginView, what: 'reset' | 'disable') {
    if (what === 'disable' && !confirm(`Switch off the app login for ${l.name}? Their phone is signed out and the password stops working.`)) return;
    setBusy(l.personId);
    try {
      if (what === 'reset') await AdminApi.volunteers.resetLogin(l.personId);
      else await AdminApi.volunteers.disableLogin(l.personId);
      toast(what === 'reset' ? 'New password emailed' : 'Login switched off');
      list.reload();
    } catch (e) {
      toast(toApiError(e).message);
    } finally {
      setBusy(null);
    }
  }
  if (list.error) return <ErrorState error={list.error} onRetry={list.reload} />;
  if (!list.data) return <Loading />;
  return (
    <div className="card">
      <div className="card-head"><h2>Team app logins</h2><span className="small muted">Send one from a team's Members list. Each volunteer picks their team at sign-in and sees only their own rota.</span></div>
      {list.data.length === 0 ? <Empty icon={<Smartphone size={28} />} title="No app logins yet" body="Open a team, choose Members, and press “Send app login” next to a volunteer." /> : list.data.map((l) => (
        <div key={l.personId} className="list-row">
          <Avatar name={l.name} />
          <div className="grow">
            <b>{l.name}</b> <span className="small muted">· {l.email}</span>
            <div className="small muted">
              {l.teams.map((t) => t.name).join(', ') || 'Not on a team'}
              {l.disabled ? ' · switched off' : l.mustChangePassword ? ' · temporary password, not signed in yet' : l.lastSignInAt ? ` · last signed in ${formatRelative(l.lastSignInAt)}` : ''}
            </div>
          </div>
          {l.disabled ? <span className="badge gray">Off</span> : l.mustChangePassword ? <span className="badge warn">Waiting</span> : <span className="badge ok">Active</span>}
          <button className="btn sm" disabled={busy === l.personId} title="Email a new temporary password" onClick={() => act(l, 'reset')}><KeyRound size={14} /> {l.disabled ? 'Send again' : 'Reset'}</button>
          {!l.disabled && <button className="btn ghost icon sm danger" disabled={busy === l.personId} title="Switch off" onClick={() => act(l, 'disable')}><X size={15} /></button>}
        </div>
      ))}
    </div>
  );
}

function BlockoutsPane() {
  const list = useApi(AdminApi.volunteers.blockouts);
  if (list.error) return <ErrorState error={list.error} onRetry={list.reload} />;
  if (!list.data) return <Loading />;
  return (
    <div className="card">
      <div className="card-head"><h2>Upcoming away dates</h2><span className="small muted">Volunteers add these in the app. Auto-fill skips them.</span></div>
      {list.data.length === 0 ? <Empty icon={<CalendarOff size={28} />} title="No one is away" /> : list.data.map((b) => (
        <div key={b.id} className="list-row">
          <Avatar name={b.name} />
          <div className="grow"><b>{b.name}</b><div className="small muted">{b.reason || 'Away'}</div></div>
          <span className="small">{formatDate(b.from)}{b.to !== b.from ? ` – ${formatDate(b.to)}` : ''}</span>
        </div>
      ))}
    </div>
  );
}
