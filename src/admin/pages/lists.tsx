import { ArrowLeft, ChevronRight, Download, Filter, GitBranch, Pencil, Plus, Send, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';

import type { CustomField, ListRule, ListRuleField, ListRuleOp, SmartListView, Workflow, WorkflowCardView, WorkflowView } from '@/api/admin-types';
import { AdminApi } from '@/api/endpoints';
import { Empty, ErrorState, Field, FormError, Loading, Modal, Segmented, useToast, useHiddenRows, useUndoableDelete } from '@/components/ui';
import { downloadCsv, formatRelative } from '@/lib/format';
import { useCan } from '@/lib/perms';
import { useAction, useApi } from '@/lib/use-api';

import { PageHeader } from '../layout';

// ---------- smart lists ----------

type RuleDef = { label: string; ops: { value: ListRuleOp; label: string }[]; input: 'status' | 'tag' | 'campus' | 'gender' | 'number' | 'group' | 'team' | 'month' | 'bool' | 'form' | 'workflow' | 'custom' };
const IS = [{ value: 'is' as const, label: 'is' }, { value: 'is_not' as const, label: 'is not' }];
const IN = [{ value: 'is' as const, label: 'is in' }, { value: 'is_not' as const, label: 'is not in' }];
const DAYS = [{ value: 'within' as const, label: 'in the last (days)' }, { value: 'not_within' as const, label: 'not in the last (days)' }];
const RULES: Record<ListRuleField, RuleDef> = {
  status: { label: 'Status', ops: IS, input: 'status' },
  tag: { label: 'Tag', ops: [{ value: 'is', label: 'has' }, { value: 'is_not', label: "doesn't have" }], input: 'tag' },
  campus: { label: 'Campus', ops: IS, input: 'campus' },
  gender: { label: 'Gender', ops: IS, input: 'gender' },
  age: { label: 'Age', ops: [{ value: 'gt', label: 'is over' }, { value: 'lt', label: 'is under' }, { value: 'is', label: 'is exactly' }, { value: 'empty', label: 'is unknown' }], input: 'number' },
  birthdayMonth: { label: 'Birthday month', ops: IS, input: 'month' },
  joinedDays: { label: 'Added', ops: DAYS, input: 'number' },
  lastAttendedDays: { label: 'Last attended', ops: [...DAYS, { value: 'empty', label: 'never' }], input: 'number' },
  group: { label: 'Group', ops: IN, input: 'group' },
  team: { label: 'Volunteer team', ops: IN, input: 'team' },
  gaveDays: { label: 'Gave', ops: DAYS, input: 'number' },
  hasEmail: { label: 'Has email', ops: IS, input: 'bool' },
  hasPhone: { label: 'Has mobile', ops: IS, input: 'bool' },
  formResponse: { label: 'Registered for', ops: [{ value: 'is', label: 'did' }, { value: 'is_not', label: "didn't" }], input: 'form' },
  workflow: { label: 'In workflow', ops: IN, input: 'workflow' },
  custom: { label: 'Custom field', ops: [{ value: 'is', label: 'is' }, { value: 'is_not', label: 'is not' }, { value: 'contains', label: 'contains' }, { value: 'gt', label: 'is over' }, { value: 'lt', label: 'is under' }, { value: 'empty', label: 'is empty' }, { value: 'not_empty', label: 'is set' }], input: 'custom' },
};
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function ListsPage() {
  const { data, error, reload } = useApi(AdminApi.lists.list);
  const rows = useHiddenRows();
  const undoable = useUndoableDelete();
  const [editing, setEditing] = useState<SmartListView | 'new' | null>(null);
  const [open, setOpen] = useState<SmartListView | null>(null);
  const toast = useToast();
  if (open) return <ListPeople list={open} onBack={() => { setOpen(null); reload(); }} onEdit={() => setEditing(open)} />;
  return (
    <>
      <PageHeader title="Saved lists" subtitle="Lists that keep themselves up to date from rules. Use them to send messages or start follow-ups." actions={<button className="btn primary" onClick={() => setEditing('new')}><Plus size={16} /> New list</button>} />
      <div className="card">
        {error ? <ErrorState error={error} onRetry={reload} /> : !data ? <Loading /> : data.length === 0 ? <Empty icon={<Filter size={32} />} title="No lists yet" body="For example: visitors in the last 60 days, or members not in a group." action={<button className="btn primary" onClick={() => setEditing('new')}><Plus size={16} /> New list</button>} /> : data.filter((l) => !rows.hidden.has(l.id)).map((l) => (
          <div key={l.id} className="list-row">
            <button className="grow link-btn" style={{ textAlign: 'left' }} onClick={() => setOpen(l)}>
              <div style={{ fontWeight: 600, color: 'var(--text)' }}>{l.name}</div>
              <div className="small muted">{l.rules.length ? l.rules.map((r) => RULES[r.field]?.label).join(l.match === 'all' ? ' and ' : ' or ') : 'Everyone'}{l.description ? ` · ${l.description}` : ''}</div>
            </button>
            <b>{l.count}</b><span className="small muted">people</span>
            <button className="btn ghost icon sm" onClick={() => setEditing(l)}><Pencil size={15} /></button>
            <button className="btn ghost icon sm danger" onClick={() => undoable({ text: `“${l.name}” deleted`, run: () => AdminApi.lists.remove(l.id), hide: () => rows.hide(l.id), show: () => rows.show(l.id), done: reload })}><Trash2 size={15} /></button>
            <ChevronRight size={16} className="muted" />
          </div>
        ))}
      </div>
      {editing && <ListEditor list={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={(l) => { setEditing(null); reload(); if (open) setOpen(l); toast('Saved'); }} />}
    </>
  );
}

function ListPeople({ list, onBack, onEdit }: { list: SmartListView; onBack: () => void; onEdit: () => void }) {
  const { data, error, reload } = useApi(() => AdminApi.lists.people(list.id), [list.id, list.rules]);
  const workflows = useApi(AdminApi.workflows.list);
  const navigate = useNavigate();
  const toast = useToast();
  const can = useCan();
  return (
    <>
      <button className="link-btn row small" style={{ gap: 4 }} onClick={onBack}><ArrowLeft size={15} /> All lists</button>
      <PageHeader title={list.name} subtitle={`${data?.total ?? list.count} people match right now`} actions={<>
        <button className="btn" onClick={onEdit}><Pencil size={15} /> Edit rules</button>
        {can('comms') && <button className="btn" onClick={() => navigate(`/admin/messages?list=${list.id}`)}><Send size={15} /> Message them</button>}
        <button className="btn" disabled={!data} onClick={() => downloadCsv(`${list.name}.csv`, [['First name', 'Last name', 'Status', 'Mobile', 'Email'], ...(data?.data ?? []).map((p) => [p.firstName, p.lastName, p.status, p.phone, p.email])])}><Download size={15} /> Export</button>
        {can('people.edit', 'care') && (workflows.data?.length ?? 0) > 0 && (
          <select className="select" style={{ width: 'auto' }} value="" onChange={async (e) => { if (!e.target.value) return; const r = await AdminApi.workflows.add(e.target.value, { listId: list.id }); toast(`${r.added} added to the workflow`); }}>
            <option value="">Add all to a workflow…</option>
            {workflows.data!.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        )}
      </>} />
      <div className="card">
        {error ? <ErrorState error={error} onRetry={reload} /> : !data ? <Loading /> : data.data.length === 0 ? <Empty title="Nobody matches these rules" /> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Name</th><th>Status</th><th>Mobile</th><th>Email</th><th>Last attended</th></tr></thead>
            <tbody>{data.data.map((p) => (
              <tr key={p.id}><td><Link to={`/admin/people/${p.id}`} style={{ fontWeight: 600 }}>{p.firstName} {p.lastName}</Link></td><td className="small">{p.status}</td><td className="small mono">{p.phone ?? '—'}</td><td className="small">{p.email ?? '—'}</td><td className="small muted">{p.lastAttendedAt ? formatRelative(p.lastAttendedAt) : 'Never'}</td></tr>
            ))}</tbody>
          </table></div>
        )}
        {data && data.total > data.data.length && <p className="small muted card-pad">Showing the first {data.data.length} of {data.total}. Export to see everyone.</p>}
      </div>
    </>
  );
}

function RuleValue({ rule, onChange, fields }: { rule: ListRule; onChange: (r: ListRule) => void; fields: CustomField[] }) {
  const def = RULES[rule.field];
  const tags = useApi(AdminApi.people.tags, []);
  const campuses = useApi(AdminApi.campuses.list, []);
  const groups = useApi(AdminApi.groups.list, []);
  const teams = useApi(AdminApi.volunteers.teams, []);
  const forms = useApi(AdminApi.forms.list, []);
  const workflows = useApi(AdminApi.workflows.list, []);
  if (rule.op === 'empty' || rule.op === 'not_empty') return null;
  const sel = (opts: { value: string; label: string }[], any = false) => (
    <select className="select" value={rule.value} onChange={(e) => onChange({ ...rule, value: e.target.value })}>
      {any ? <option value="">Any</option> : <option value="" disabled>Choose…</option>}
      {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
  switch (def.input) {
    case 'status': return sel(['visitor', 'regular', 'member', 'inactive'].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) })));
    case 'gender': return sel([{ value: 'female', label: 'Female' }, { value: 'male', label: 'Male' }]);
    case 'bool': return sel([{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }]);
    case 'month': return sel(MONTHS.map((m, i) => ({ value: String(i + 1), label: m })));
    case 'tag': return sel((tags.data ?? []).map((t) => ({ value: t.tag, label: `${t.tag} (${t.count})` })));
    case 'campus': return sel((campuses.data ?? []).map((c) => ({ value: c.id, label: c.name })));
    case 'group': return sel((groups.data?.data ?? []).map((g) => ({ value: g.id, label: g.name })), true);
    case 'team': return sel((teams.data ?? []).map((t) => ({ value: t.id, label: t.name })), true);
    case 'form': return sel((forms.data ?? []).map((f) => ({ value: f.id, label: f.title })));
    case 'workflow': return sel((workflows.data ?? []).map((w) => ({ value: w.id, label: w.name })));
    case 'custom': {
      const f = fields.find((x) => x.id === rule.customFieldId);
      if (f?.type === 'select' && (rule.op === 'is' || rule.op === 'is_not')) return sel(f.options.map((o) => ({ value: o, label: o })));
      if (f?.type === 'checkbox') return sel([{ value: 'true', label: 'Ticked' }, { value: 'false', label: 'Not ticked' }]);
      return <input className="input" value={rule.value} onChange={(e) => onChange({ ...rule, value: e.target.value })} />;
    }
    default: return <input className="input" type="number" min={0} style={{ width: 110 }} value={rule.value} onChange={(e) => onChange({ ...rule, value: e.target.value })} />;
  }
}

function ListEditor({ list, onClose, onSaved }: { list: SmartListView | null; onClose: () => void; onSaved: (l: SmartListView) => void }) {
  const [name, setName] = useState(list?.name ?? '');
  const [description, setDescription] = useState(list?.description ?? '');
  const [match, setMatch] = useState<'all' | 'any'>(list?.match ?? 'all');
  const [rules, setRules] = useState<ListRule[]>(list?.rules ?? [{ field: 'status', op: 'is', value: 'visitor' }]);
  const [preview, setPreview] = useState<{ count: number; sample: { id: string; name: string }[] } | null>(null);
  const fields = useApi(AdminApi.fields.list);
  const save = useAction(() => (list ? AdminApi.lists.update(list.id, { name, description, match, rules }) : AdminApi.lists.create({ name, description, match, rules })));
  useEffect(() => {
    const t = setTimeout(() => { AdminApi.lists.preview(rules, match).then(setPreview).catch(() => setPreview(null)); }, 300);
    return () => clearTimeout(t);
  }, [JSON.stringify(rules), match]); // eslint-disable-line react-hooks/exhaustive-deps
  const setRule = (i: number, r: ListRule) => setRules(rules.map((x, j) => (j === i ? r : x)));
  return (
    <Modal wide title={list ? 'Edit list' : 'New smart list'} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={save.busy || !name.trim()} onClick={async () => { const l = await save.run(); if (l) onSaved(l); }}>Save list</button></>}>
      <div className="stack">
        <FormError error={save.error} />
        <div className="grid cols-2">
          <Field label="Name"><input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Young adults not in a group" /></Field>
          <Field label="Description (optional)"><input className="input" value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        </div>
        <div className="row" style={{ gap: 8 }}><span>People who match</span><Segmented value={match} onChange={setMatch} options={[{ value: 'all', label: 'all rules' }, { value: 'any', label: 'any rule' }]} /></div>
        {rules.map((r, i) => (
          <div key={i} className="row wrap" style={{ gap: 8 }}>
            <select className="select" style={{ width: 170 }} value={r.field} onChange={(e) => { const field = e.target.value as ListRuleField; setRule(i, { field, op: RULES[field].ops[0].value, value: '', ...(field === 'custom' ? { customFieldId: fields.data?.[0]?.id } : {}) }); }}>
              {(Object.keys(RULES) as ListRuleField[]).filter((f) => f !== 'custom' || (fields.data?.length ?? 0) > 0).map((f) => <option key={f} value={f}>{RULES[f].label}</option>)}
            </select>
            {r.field === 'custom' && <select className="select" style={{ width: 160 }} value={r.customFieldId} onChange={(e) => setRule(i, { ...r, customFieldId: e.target.value, value: '' })}>{fields.data?.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select>}
            <select className="select" style={{ width: 170 }} value={r.op} onChange={(e) => setRule(i, { ...r, op: e.target.value as ListRuleOp })}>
              {RULES[r.field].ops.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <div style={{ minWidth: 160, flex: 1 }}><RuleValue rule={r} onChange={(x) => setRule(i, x)} fields={fields.data ?? []} /></div>
            <button className="btn ghost icon sm danger" onClick={() => setRules(rules.filter((_, j) => j !== i))}><X size={15} /></button>
          </div>
        ))}
        <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => setRules([...rules, { field: 'tag', op: 'is', value: '' }])}><Plus size={15} /> Add a rule</button>
        {preview && <div className="callout"><b>{preview.count} people</b> match{preview.sample.length ? `: ${preview.sample.map((s) => s.name).join(', ')}${preview.count > preview.sample.length ? '…' : ''}` : '.'}</div>}
      </div>
    </Modal>
  );
}

// ---------- workflows ----------

const TRIGGER_LABEL: Record<Workflow['trigger'], string> = { manual: 'Added by hand', new_visitor: 'Every new visitor', form: 'Someone registers on a form', list: 'Someone joins a smart list' };

export function WorkflowsPage() {
  const { data, error, reload } = useApi(AdminApi.workflows.list);
  const [editing, setEditing] = useState<WorkflowView | 'new' | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [mine, setMine] = useState(false);
  const myCards = useApi(() => AdminApi.workflows.cards({ mine: true }));
  const can = useCan();
  const toast = useToast();
  if (open) return <Board id={open} onBack={() => { setOpen(null); reload(); myCards.reload(); }} onEdit={(w) => setEditing(w)} editing={editing} setEditing={setEditing} />;
  return (
    <>
      <PageHeader title="Follow-up workflows" subtitle="Step-by-step follow-up so nobody slips through: new visitors, baptism classes, new members." actions={can('people.edit') && <button className="btn primary" onClick={() => setEditing('new')}><Plus size={16} /> New workflow</button>} />
      <div className="tabs">
        <button className={!mine ? 'on' : ''} onClick={() => setMine(false)}>Workflows</button>
        <button className={mine ? 'on' : ''} onClick={() => setMine(true)}>My follow-ups {!!myCards.data?.length && <span className="count">{myCards.data.length}</span>}</button>
      </div>
      {mine ? <CardList cards={myCards.data} onChanged={myCards.reload} /> : (
        <div className="card">
          {error ? <ErrorState error={error} onRetry={reload} /> : !data ? <Loading /> : data.length === 0 ? <Empty icon={<GitBranch size={32} />} title="No workflows yet" body="Create a “New visitor follow-up” with a call, a welcome pack and a lunch invite." /> : data.map((w) => (
            <button key={w.id} className="list-row picker-item" style={{ borderRadius: 0, textAlign: 'left' }} onClick={() => setOpen(w.id)}>
              <div className="grow">
                <div style={{ fontWeight: 600 }}>{w.name} {!w.active && <span className="badge gray">Paused</span>}</div>
                <div className="small muted">{w.steps.length} steps · {TRIGGER_LABEL[w.trigger]}</div>
              </div>
              <span className="small"><b>{w.active_cards}</b> in progress</span>
              {w.overdue > 0 && <span className="badge danger">{w.overdue} overdue</span>}
              <span className="small muted">{w.done_cards} done</span>
              <ChevronRight size={16} className="muted" />
            </button>
          ))}
        </div>
      )}
      {editing && <WorkflowEditor workflow={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); toast('Saved'); }} />}
    </>
  );
}

function CardActions({ c, onChanged }: { c: WorkflowCardView; onChanged: () => void }) {
  const toast = useToast();
  const act = async (action: 'advance' | 'back' | 'snooze' | 'remove' | 'note', extra: { note?: string; days?: number } = {}) => {
    await AdminApi.workflows.act(c.id, action, extra);
    toast(action === 'advance' ? 'Moved on' : action === 'snooze' ? 'Snoozed a week' : action === 'remove' ? 'Removed' : 'Saved');
    onChanged();
  };
  return (
    <div className="row wrap" style={{ gap: 4 }}>
      <button className="btn sm primary" onClick={() => act('advance', { note: prompt('Note (optional)') ?? '' })}>Done</button>
      <button className="btn sm ghost" onClick={() => act('snooze', { days: 7 })}>Snooze</button>
      <button className="btn sm ghost danger" onClick={() => confirm(`Take ${c.personName} off this workflow?`) && act('remove')}>Remove</button>
    </div>
  );
}

function CardList({ cards, onChanged }: { cards: WorkflowCardView[] | null; onChanged: () => void }) {
  if (!cards) return <Loading />;
  if (!cards.length) return <div className="card"><Empty title="Nothing assigned to you" body="Follow-ups assigned to you will show up here." /></div>;
  return (
    <div className="card">
      {cards.map((c) => (
        <div key={c.id} className="list-row">
          <div className="grow">
            <Link to={`/admin/people/${c.personId}`} style={{ fontWeight: 600 }}>{c.personName}</Link>
            <div className="small muted">{c.workflowName}: {c.stepTitle} · {c.overdue ? <span style={{ color: 'var(--danger)' }}>overdue</span> : `due ${formatRelative(c.dueAt)}`}{c.personPhone ? ` · ${c.personPhone}` : ''}</div>
          </div>
          <CardActions c={c} onChanged={onChanged} />
        </div>
      ))}
    </div>
  );
}

function Board({ id, onBack, onEdit, editing, setEditing }: { id: string; onBack: () => void; onEdit: (w: WorkflowView) => void; editing: WorkflowView | 'new' | null; setEditing: (w: WorkflowView | 'new' | null) => void }) {
  const { data, error, reload } = useApi(() => AdminApi.workflows.get(id), [id]);
  const [adding, setAdding] = useState(false);
  const toast = useToast();
  const can = useCan();
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const w = data.workflow;
  return (
    <>
      <button className="link-btn row small" style={{ gap: 4 }} onClick={onBack}><ArrowLeft size={15} /> All workflows</button>
      <PageHeader title={w.name} subtitle={`${w.description ? `${w.description} · ` : ''}${TRIGGER_LABEL[w.trigger]}`} actions={<>
        {can('people.edit', 'care') && <button className="btn" onClick={() => setAdding(true)}><Plus size={15} /> Add people</button>}
        {can('people.edit') && <button className="btn" onClick={() => onEdit(w)}><Pencil size={15} /> Edit steps</button>}
        {can('people.edit') && <button className="btn ghost danger" onClick={async () => { if (!confirm(`Delete “${w.name}” and all its cards?`)) return; await AdminApi.workflows.remove(w.id); onBack(); }}><Trash2 size={15} /></button>}
      </>} />
      <div className="board" style={{ gridTemplateColumns: `repeat(${Math.min(4, w.steps.length)}, minmax(0, 1fr))` }}>
        {w.steps.map((s, i) => {
          const cards = data.cards.filter((c) => c.stepIndex === i);
          return (
            <div key={s.id} className="board-col">
              <h3><span>{i + 1}. {s.title}</span><span className="muted">{cards.length}</span></h3>
              {cards.length === 0 && <span className="small muted" style={{ padding: '0 4px' }}>Nobody at this step</span>}
              {cards.map((c) => (
                <div key={c.id} className="card case-card" style={{ cursor: 'default' }}>
                  <Link to={`/admin/people/${c.personId}`} style={{ fontWeight: 600 }}>{c.personName}</Link>
                  <span className="small muted">{c.assigneeName ?? 'Unassigned'} · {c.overdue ? <span style={{ color: 'var(--danger)' }}>overdue</span> : `due ${formatRelative(c.dueAt)}`}</span>
                  {c.history.length > 0 && c.history[c.history.length - 1].note && <span className="small">“{c.history[c.history.length - 1].note}”</span>}
                  {can('people.edit', 'care') && <CardActions c={c} onChanged={reload} />}
                </div>
              ))}
            </div>
          );
        })}
      </div>
      {adding && <AddPeople workflowId={w.id} onClose={() => setAdding(false)} onDone={(n) => { setAdding(false); reload(); toast(`${n} added`); }} />}
      {editing && editing !== 'new' && <WorkflowEditor workflow={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); toast('Saved'); }} />}
    </>
  );
}

function AddPeople({ workflowId, onClose, onDone }: { workflowId: string; onClose: () => void; onDone: (n: number) => void }) {
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<{ id: string; name: string }[]>([]);
  const [listId, setListId] = useState('');
  const lists = useApi(AdminApi.lists.list);
  const found = useApi(() => (q.trim().length > 1 ? AdminApi.people.list({ q }) : Promise.resolve(null)), [q]);
  const save = useAction(() => AdminApi.workflows.add(workflowId, { personIds: picked.map((p) => p.id), listId: listId || undefined }));
  return (
    <Modal title="Add people to this workflow" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={save.busy || (!picked.length && !listId)} onClick={async () => { const r = await save.run(); if (r) onDone(r.added); }}>Add</button></>}>
      <div className="stack">
        <FormError error={save.error} />
        <Field label="Search people"><input className="input" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or mobile" /></Field>
        {found.data?.data.slice(0, 8).map((p) => (
          <label key={p.id} className="check"><input type="checkbox" checked={picked.some((x) => x.id === p.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, { id: p.id, name: `${p.firstName} ${p.lastName}` }] : picked.filter((x) => x.id !== p.id))} /> {p.firstName} {p.lastName} <span className="small muted">{p.status}</span></label>
        ))}
        {picked.length > 0 && <div className="row wrap" style={{ gap: 6 }}>{picked.map((p) => <span key={p.id} className="chip">{p.name}<button onClick={() => setPicked(picked.filter((x) => x.id !== p.id))}><X size={12} /></button></span>)}</div>}
        <Field label="Or everyone on a smart list">
          <select className="select" value={listId} onChange={(e) => setListId(e.target.value)}><option value="">None</option>{lists.data?.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.count})</option>)}</select>
        </Field>
      </div>
    </Modal>
  );
}

function WorkflowEditor({ workflow, onClose, onSaved }: { workflow: WorkflowView | null; onClose: () => void; onSaved: () => void }) {
  const staff = useApi(AdminApi.staff.list);
  const forms = useApi(AdminApi.forms.list);
  const lists = useApi(AdminApi.lists.list);
  const [w, setW] = useState<Partial<Workflow>>(() => workflow ?? { name: '', description: '', trigger: 'manual', triggerId: null, defaultAssigneeId: null, active: true, steps: [{ id: '', title: 'Phone call', dueDays: 2, assigneeId: null }] });
  const steps = w.steps ?? [];
  const save = useAction(() => (workflow ? AdminApi.workflows.update(workflow.id, w) : AdminApi.workflows.create(w)));
  const setStep = (i: number, patch: Partial<Workflow['steps'][number]>) => setW({ ...w, steps: steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  return (
    <Modal wide title={workflow ? 'Edit workflow' : 'New workflow'} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={save.busy || !w.name?.trim() || !steps.some((s) => s.title.trim())} onClick={async () => { if (await save.run()) onSaved(); }}>Save</button></>}>
      <div className="stack">
        <FormError error={save.error} />
        <div className="grid cols-2">
          <Field label="Name"><input className="input" autoFocus value={w.name ?? ''} onChange={(e) => setW({ ...w, name: e.target.value })} placeholder="New visitor follow-up" /></Field>
          <Field label="Description"><input className="input" value={w.description ?? ''} onChange={(e) => setW({ ...w, description: e.target.value })} /></Field>
          <Field label="Start automatically when">
            <select className="select" value={w.trigger} onChange={(e) => setW({ ...w, trigger: e.target.value as Workflow['trigger'], triggerId: null })}>
              {Object.entries(TRIGGER_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
          {w.trigger === 'form' && <Field label="Which form"><select className="select" value={w.triggerId ?? ''} onChange={(e) => setW({ ...w, triggerId: e.target.value || null })}><option value="">Choose…</option>{forms.data?.map((f) => <option key={f.id} value={f.id}>{f.title}</option>)}</select></Field>}
          {w.trigger === 'list' && <Field label="Which list"><select className="select" value={w.triggerId ?? ''} onChange={(e) => setW({ ...w, triggerId: e.target.value || null })}><option value="">Choose…</option>{lists.data?.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>}
          <Field label="Default person responsible"><select className="select" value={w.defaultAssigneeId ?? ''} onChange={(e) => setW({ ...w, defaultAssigneeId: e.target.value || null })}><option value="">Nobody</option>{staff.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        </div>
        <label className="check"><input type="checkbox" checked={w.active ?? true} onChange={(e) => setW({ ...w, active: e.target.checked })} /> Active</label>
        <h3 className="section-title">Steps</h3>
        {steps.map((s, i) => (
          <div key={i} className="row wrap" style={{ gap: 8 }}>
            <span className="small muted" style={{ width: 18 }}>{i + 1}.</span>
            <input className="input grow" style={{ minWidth: 200 }} value={s.title} placeholder="Step" onChange={(e) => setStep(i, { title: e.target.value })} />
            <label className="row small" style={{ gap: 4 }}>due after <input className="input" type="number" min={0} style={{ width: 70 }} value={s.dueDays} onChange={(e) => setStep(i, { dueDays: Number(e.target.value) })} /> days</label>
            <select className="select" style={{ width: 170 }} value={s.assigneeId ?? ''} onChange={(e) => setStep(i, { assigneeId: e.target.value || null })}><option value="">Default person</option>{staff.data?.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
            <button className="btn ghost icon sm danger" onClick={() => setW({ ...w, steps: steps.filter((_, j) => j !== i) })}><X size={15} /></button>
          </div>
        ))}
        <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => setW({ ...w, steps: [...steps, { id: '', title: '', dueDays: 7, assigneeId: null }] })}><Plus size={15} /> Add a step</button>
      </div>
    </Modal>
  );
}
