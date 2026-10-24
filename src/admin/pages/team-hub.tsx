// Team hub: notice board, chat threads and tasks shared between the office and the serving teams.
// Volunteers see the same channels in the Team app; this is the office side.
import { Archive, Bell, CheckSquare, ListChecks, MessagesSquare, Pin, PinOff, Plus, Send, Square, Trash2, Users } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';

import { AdminApi } from '@/api/endpoints';
import { Empty, ErrorState, Field, FormError, Loading, Modal, Segmented, useToast } from '@/components/ui';
import type { HubChannelView, HubMember, HubPost, HubView, MyTask } from '@/core/types';
import { formatDate, formatRelative } from '@/lib/format';
import { useCan } from '@/lib/perms';
import { useAction, useApi } from '@/lib/use-api';

import { PageHeader } from '../layout';

const TASKS = 'tasks';
const POLL_MS = 15_000;
type PostKind = HubPost['kind'];

const first = (name: string) => name.split(' ')[0];
const kindOf = (c: HubChannelView) => (c.kind === 'staff' ? 'Office' : c.kind === 'team' ? 'Team' : c.teamName ? `${c.teamName} · thread` : 'Thread');

export function TeamHubPage() {
  const [params, setParams] = useSearchParams();
  const selected = params.get('c');
  const { data, error, reload, setData } = useApi(() => AdminApi.teamHub.get(), []);
  const [newThread, setNewThread] = useState(false);
  const toast = useToast();

  const select = useCallback((id: string) => setParams({ c: id }), [setParams]);
  // First visit lands on the channel with news, else the first one.
  useEffect(() => {
    if (!data || selected) return;
    const busy = data.channels.find((c) => c.unread > 0) ?? data.channels[0];
    if (busy) select(busy.id);
  }, [data, selected, select]);

  // The list refreshes quietly so new messages and unread counts show up without a reload.
  useEffect(() => {
    const t = setInterval(() => void AdminApi.teamHub.get().then(setData).catch(() => undefined), POLL_MS);
    return () => clearInterval(t);
  }, [setData]);

  if (error) return <><PageHeader title="Staff chat" /><div className="card card-pad"><ErrorState error={error} onRetry={reload} /></div></>;
  if (!data) return <><PageHeader title="Staff chat" /><Loading /></>;

  const openTasks = data.tasks.filter((t) => !t.task?.done).length;
  const current = data.channels.find((c) => c.id === selected);

  return (
    <>
      <PageHeader title="Staff chat" subtitle="Notices, chat and tasks for the office and every serving team. Volunteers see their team's channel in the Team app."
        actions={<button className="btn primary" onClick={() => setNewThread(true)}><Plus size={16} /> New thread</button>} />
      <div className="split">
        <div className="card side-list">
          <div className={`list-row ${selected === TASKS ? 'on' : ''}`} onClick={() => select(TASKS)}>
            <ListChecks size={18} className="muted" />
            <div className="grow"><strong>My tasks</strong><div className="small muted">{openTasks ? `${openTasks} open` : 'Nothing open'}</div></div>
            {openTasks > 0 && <span className="badge warn">{openTasks}</span>}
          </div>
          {data.channels.map((c) => (
            <div key={c.id} className={`list-row ${selected === c.id ? 'on' : ''}`} onClick={() => select(c.id)} style={{ alignItems: 'flex-start' }}>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="row between" style={{ gap: 8 }}>
                  <strong className="ellipsis">{c.name}</strong>
                  {c.lastAt && <span className="small muted" style={{ whiteSpace: 'nowrap' }}>{formatRelative(c.lastAt)}</span>}
                </div>
                <div className="small muted">{kindOf(c)} · {c.members.length} {c.members.length === 1 ? 'person' : 'people'}{c.openTasks ? ` · ${c.openTasks} ${c.openTasks === 1 ? 'task' : 'tasks'}` : ''}</div>
                {c.lastText && <div className={`small ellipsis ${c.unread ? '' : 'muted'}`}>{c.lastText}</div>}
              </div>
              {c.unread > 0 && <span className="badge">{c.unread}</span>}
            </div>
          ))}
        </div>
        {selected === TASKS ? (
          <TasksPane tasks={data.tasks} onChange={(t) => setData((d) => (d ? { ...d, tasks: d.tasks.map((x) => (x.id === t.id ? { ...x, ...t } : x)) } : d))} onOpen={select} />
        ) : current ? (
          <ChannelPane key={current.id} channel={current} me={data.me} onChanged={() => void AdminApi.teamHub.get().then(setData).catch(() => undefined)} onArchived={() => { setParams({}); reload(); toast('Thread archived'); }} />
        ) : (
          <div className="card"><Empty icon={<MessagesSquare size={32} />} title="Pick a channel" body="Each serving team has its own channel, and the office has one for staff. Start a thread for anything smaller." /></div>
        )}
      </div>
      {newThread && <NewThreadModal hub={data} onClose={() => setNewThread(false)} onCreated={(c) => { setNewThread(false); setData((d) => (d ? { ...d, channels: [c, ...d.channels] } : d)); select(c.id); }} />}
    </>
  );
}

function ChannelPane({ channel, me, onChanged, onArchived }: { channel: HubChannelView; me: HubMember; onChanged: () => void; onArchived: () => void }) {
  const { data, error, reload, setData } = useApi(() => AdminApi.teamHub.channel(channel.id), [channel.id]);
  const can = useCan();
  const office = can('staff');
  const toast = useToast();
  const [kind, setKind] = useState<PostKind>('message');
  const [text, setText] = useState('');
  const [assignee, setAssignee] = useState('');
  const [due, setDue] = useState('');
  const [members, setMembers] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const post = useAction((input: Parameters<typeof AdminApi.teamHub.post>[1]) => AdminApi.teamHub.post(channel.id, input));
  const archive = useAction(() => AdminApi.teamHub.updateChannel(channel.id, { archived: true }));

  useEffect(() => {
    const t = setInterval(() => void AdminApi.teamHub.channel(channel.id).then(setData).catch(() => undefined), POLL_MS);
    return () => clearInterval(t);
  }, [channel.id, setData]);
  const count = data?.posts.length ?? 0;
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'end' }); }, [count, channel.id]);

  // The API lists newest first; a chat reads oldest to newest.
  const posts = useMemo(() => (data ? [...data.posts].reverse() : []), [data]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const input = kind === 'task' ? { kind, text, task: { assigneeKey: assignee, dueAt: due || null } } : { kind, text };
    const p = await post.run(input);
    if (!p) return;
    setText(''); setDue('');
    setData((d) => (d ? (p.pinned ? { ...d, pinned: [p, ...d.pinned] } : { ...d, posts: [p, ...d.posts] }) : d));
    onChanged();
    if (kind === 'notice') toast(`Notice sent to ${channel.members.length - 1} ${channel.members.length === 2 ? 'person' : 'people'}`);
    if (kind === 'task') toast(`Task given to ${first(channel.members.find((m) => m.key === assignee)?.name ?? 'them')}`);
  }

  function patch(p: HubPost) {
    setData((d) => (d ? { ...d, pinned: d.pinned.filter((x) => x.id !== p.id).concat(p.pinned ? [p] : []), posts: p.pinned ? d.posts.filter((x) => x.id !== p.id) : d.posts.some((x) => x.id === p.id) ? d.posts.map((x) => (x.id === p.id ? p : x)) : [p, ...d.posts] } : d));
    onChanged();
  }
  async function remove(p: HubPost) {
    if (!confirm('Remove this post for everyone?')) return;
    await AdminApi.teamHub.removePost(p.id);
    setData((d) => (d ? { ...d, pinned: d.pinned.filter((x) => x.id !== p.id), posts: d.posts.filter((x) => x.id !== p.id) } : d));
    onChanged();
  }

  const canNotice = office || channel.kind === 'custom';
  const kinds = [{ value: 'message' as PostKind, label: 'Message' }, ...(canNotice ? [{ value: 'notice' as PostKind, label: 'Notice' }] : []), { value: 'task' as PostKind, label: 'Task' }];

  return (
    <div className="card hub-pane">
      <div className="hub-head row between wrap">
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: 0 }}>{channel.name}</h2>
          <div className="small muted">{kindOf(channel)} · <button className="linkish" onClick={() => setMembers(true)}><Users size={12} /> {channel.members.length} {channel.members.length === 1 ? 'person' : 'people'}</button>{channel.kind === 'team' ? ' · everyone on this team and the office' : channel.kind === 'staff' ? ' · every office login' : ''}</div>
        </div>
        {channel.kind === 'custom' && (channel.createdBy === me.key || office) && (
          <button className="btn ghost sm" disabled={archive.busy} onClick={async () => { if (confirm('Archive this thread? Nobody will see it any more.')) { if (await archive.run()) onArchived(); } }}><Archive size={14} /> Archive</button>
        )}
      </div>
      {error ? <div className="card-pad"><ErrorState error={error} onRetry={reload} /></div> : !data ? <Loading /> : (
        <div className="hub-scroll">
          {data.pinned.length > 0 && (
            <div className="hub-pinned">
              {data.pinned.map((p) => <Post key={p.id} p={p} me={me} office={office} onPatch={patch} onRemove={remove} pinnedBoard />)}
            </div>
          )}
          {posts.length === 0 && data.pinned.length === 0 && <Empty icon={<MessagesSquare size={28} />} title="No messages yet" body="Say hello, pin a notice or give someone a task." />}
          {posts.map((p, i) => <Post key={p.id} p={p} me={me} office={office} onPatch={patch} onRemove={remove} dayBreak={i === 0 || p.at.slice(0, 10) !== posts[i - 1].at.slice(0, 10)} />)}
          <div ref={bottom} />
        </div>
      )}
      <form className="hub-compose" onSubmit={(e) => void send(e)}>
        <div className="row between wrap" style={{ gap: 8 }}>
          <Segmented value={kind} onChange={setKind} options={kinds} />
          {kind === 'task' && (
            <div className="row wrap" style={{ gap: 8 }}>
              <select className="select" required value={assignee} onChange={(e) => setAssignee(e.target.value)} aria-label="Who is this task for">
                <option value="">Who is it for?</option>
                {channel.members.filter((m) => m.key !== me.key).map((m) => <option key={m.key} value={m.key}>{m.name}</option>)}
              </select>
              <input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date" />
            </div>
          )}
        </div>
        <div className="row" style={{ alignItems: 'flex-end', gap: 8 }}>
          <textarea className="textarea grow" rows={2} style={{ minHeight: 56 }} required maxLength={4000} value={text} onChange={(e) => setText(e.target.value)}
            placeholder={kind === 'notice' ? 'A notice is pinned on top and everyone in the channel is told.' : kind === 'task' ? 'What needs doing? The person is told and sees it under My tasks.' : `Message ${channel.name}… use @Name to tell someone`}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) (e.currentTarget.form as HTMLFormElement).requestSubmit(); }} />
          <button className="btn primary" disabled={post.busy || !text.trim()} type="submit">{kind === 'notice' ? <><Bell size={16} /> Pin notice</> : kind === 'task' ? <><CheckSquare size={16} /> Give task</> : <><Send size={16} /> Send</>}</button>
        </div>
        <FormError error={post.error} />
      </form>
      {members && (
        <Modal title={`${channel.name} · people`} onClose={() => setMembers(false)}>
          <div className="stack" style={{ gap: 6 }}>
            {channel.members.map((m) => <div key={m.key} className="row between"><span>{m.name}{m.key === me.key ? ' (you)' : ''}</span><span className="small muted">{m.staffId ? 'Office' : 'Volunteer'}</span></div>)}
          </div>
        </Modal>
      )}
    </div>
  );
}

function Post({ p, me, office, onPatch, onRemove, pinnedBoard, dayBreak }: { p: HubPost; me: HubMember; office: boolean; onPatch: (p: HubPost) => void; onRemove: (p: HubPost) => void; pinnedBoard?: boolean; dayBreak?: boolean }) {
  const mine = p.authorKey === me.key;
  const task = p.task;
  const canTick = task && (task.assigneeKey === me.key || mine || office);
  const toggle = async () => { if (task && canTick) onPatch(await AdminApi.teamHub.updatePost(p.id, { done: !task.done })); };
  const pin = async () => onPatch(await AdminApi.teamHub.updatePost(p.id, { pinned: !p.pinned }));
  return (
    <>
      {dayBreak && <div className="hub-day"><span>{formatDate(p.at)}</span></div>}
      <div className={`hub-post ${mine ? 'mine' : ''} ${p.kind} ${pinnedBoard ? 'pinned' : ''}`}>
        <div className="hub-meta row wrap" style={{ gap: 6 }}>
          {p.kind === 'notice' && <span className="badge"><Pin size={11} /> Notice</span>}
          {p.kind === 'task' && task && <span className={`badge ${task.done ? 'ok' : 'warn'}`}><CheckSquare size={11} /> {task.done ? 'Done' : 'Task'}</span>}
          <strong>{mine ? 'You' : p.authorName}</strong>
          <span className="small muted">{formatRelative(p.at)}</span>
          <span className="grow" />
          {(mine || office) && <button className="btn ghost icon sm" title={p.pinned ? 'Unpin' : 'Pin to the top'} onClick={() => void pin()}>{p.pinned ? <PinOff size={13} /> : <Pin size={13} />}</button>}
          {(mine || office) && <button className="btn ghost icon sm danger" title="Remove" onClick={() => void onRemove(p)}><Trash2 size={13} /></button>}
        </div>
        {task ? (
          <div className="row" style={{ alignItems: 'flex-start', gap: 10 }}>
            <button className="btn ghost icon sm" disabled={!canTick} onClick={() => void toggle()} aria-label={task.done ? 'Mark not done' : 'Mark done'}>{task.done ? <CheckSquare size={20} /> : <Square size={20} />}</button>
            <div className="grow">
              <div className={task.done ? 'muted' : ''} style={{ textDecoration: task.done ? 'line-through' : undefined, whiteSpace: 'pre-wrap' }}>{p.text}</div>
              <div className="small muted">For {task.assigneeKey === me.key ? 'you' : task.assigneeName}{task.dueAt ? ` · by ${formatDate(task.dueAt.length === 10 ? `${task.dueAt}T12:00:00` : task.dueAt)}` : ''}{task.done && task.doneAt ? ` · done ${formatRelative(task.doneAt)}${task.doneByName ? ` by ${first(task.doneByName)}` : ''}` : ''}</div>
            </div>
          </div>
        ) : (
          <div style={{ whiteSpace: 'pre-wrap' }}>{p.text}</div>
        )}
      </div>
    </>
  );
}

function TasksPane({ tasks, onChange, onOpen }: { tasks: MyTask[]; onChange: (t: HubPost) => void; onOpen: (channelId: string) => void }) {
  const open = tasks.filter((t) => !t.task?.done);
  const done = tasks.filter((t) => t.task?.done);
  const row = (t: MyTask) => (
    <div key={t.id} className="list-row" style={{ alignItems: 'flex-start' }}>
      <button className="btn ghost icon sm" onClick={async () => onChange(await AdminApi.teamHub.updatePost(t.id, { done: !t.task!.done }))} aria-label={t.task!.done ? 'Mark not done' : 'Mark done'}>{t.task!.done ? <CheckSquare size={20} /> : <Square size={20} />}</button>
      <div className="grow" style={{ minWidth: 0 }}>
        <div className={t.task!.done ? 'muted' : ''} style={{ textDecoration: t.task!.done ? 'line-through' : undefined }}>{t.text}</div>
        <div className="small muted">From {first(t.authorName)} in <button className="linkish" onClick={() => onOpen(t.channelId)}>{t.channelName}</button>{t.task!.dueAt ? ` · by ${formatDate(t.task!.dueAt.length === 10 ? `${t.task!.dueAt}T12:00:00` : t.task!.dueAt)}` : ''}</div>
      </div>
    </div>
  );
  return (
    <div className="card">
      <div className="hub-head"><h2 style={{ margin: 0 }}>My tasks</h2><div className="small muted">Tasks given to you on any channel. Tick them here or in the thread.</div></div>
      {tasks.length === 0 ? <Empty icon={<ListChecks size={28} />} title="Nothing on your plate" body="When someone gives you a task on the hub it shows up here." /> : (
        <>
          {open.map(row)}
          {done.length > 0 && <><div className="small muted" style={{ padding: '12px 16px 4px' }}>Done</div>{done.map(row)}</>}
        </>
      )}
    </div>
  );
}

function NewThreadModal({ hub, onClose, onCreated }: { hub: HubView; onClose: () => void; onCreated: (c: HubChannelView) => void }) {
  const [name, setName] = useState('');
  const [teamId, setTeamId] = useState('');
  const [keys, setKeys] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const create = useAction(() => AdminApi.teamHub.createChannel({ name, memberKeys: keys, teamId: teamId || null }));
  const teams = hub.channels.filter((c) => c.kind === 'team');
  const teamChannel = teams.find((c) => c.teamId === teamId);
  // With a team picked, the list narrows to that team; otherwise anyone the office can reach.
  const pool = (teamChannel ? teamChannel.members : hub.people).filter((m) => m.key !== hub.me.key && m.name.toLowerCase().includes(q.toLowerCase()));
  const toggle = (k: string) => setKeys((ks) => (ks.includes(k) ? ks.filter((x) => x !== k) : [...ks, k]));
  return (
    <Modal title="New thread" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={create.busy || !name.trim() || keys.length === 0} onClick={async () => { const c = await create.run(); if (c) onCreated(c); }}>Start thread</button></>}>
      <div className="stack">
        <Field label="What is it about"><input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Christmas carols, Sound desk rota, Youth camp…" maxLength={80} /></Field>
        <Field label="Team (optional)" hint="A thread on a team shows up in that team's Team app.">
          <select className="select" value={teamId} onChange={(e) => { setTeamId(e.target.value); setKeys([]); }}>
            <option value="">No team, just these people</option>
            {teams.map((t) => <option key={t.id} value={t.teamId!}>{t.name}</option>)}
          </select>
        </Field>
        <Field label={`People${keys.length ? ` · ${keys.length} picked` : ''}`}>
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name" />
        </Field>
        <div className="hub-pick">
          {pool.length === 0 ? <p className="small muted">No one matches.</p> : pool.map((m) => (
            <label key={m.key} className="row hub-pick-row"><input type="checkbox" checked={keys.includes(m.key)} onChange={() => toggle(m.key)} /><span className="grow">{m.name}</span><span className="small muted">{m.staffId ? 'Office' : 'Volunteer'}</span></label>
          ))}
        </div>
        <FormError error={create.error} />
      </div>
    </Modal>
  );
}
