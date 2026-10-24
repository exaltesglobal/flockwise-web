// Care › Meetings & minutes: elders, deacons and committee meetings. Plan the agenda, send it,
// take minutes on the day, record decisions and action items with owners, then send the minutes.
// Actions still open come back on the next meeting of the same kind until someone ticks them off.
import { ArrowDown, ArrowUp, ClipboardList, Plus, Send, Trash2, X } from 'lucide-react';
import { useState } from 'react';

import { AdminApi } from '@/api/endpoints';
import type { MeetingAction, MeetingAgendaItem, MeetingKind, MeetingView, OpenMeetingAction } from '@/core/types';
import { Empty, ErrorState, Field, FormError, Loading, Modal, Segmented, useHiddenRows, useToast, useUndoableDelete } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { useAction, useApi } from '@/lib/use-api';
import { useNewParam, useOpenParam } from '@/lib/use-new-param';

import { PersonField, PersonSearch, type PickedPerson } from '../components/person-picker';
import { PageHeader } from '../layout';

const KIND: Record<MeetingKind, string> = { elders: 'Elders', deacons: 'Deacons', committee: 'Committee', staff: 'Staff', ministry: 'Ministry', other: 'Other' };
const day = (d: string) => formatDate(`${d}T12:00:00`);
const today = () => new Date().toISOString().slice(0, 10);
const tmp = () => `new-${Math.random().toString(36).slice(2, 9)}`;

export function MeetingsPage() {
  const q = useApi(AdminApi.meetings.hub);
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [kind, setKind] = useState<MeetingKind | 'all'>('all');
  const rows = useHiddenRows();
  const undoable = useUndoableDelete();
  useNewParam(() => setCreating(true));
  useOpenParam('open', (id) => { setOpen(id); return true; });
  const tick = useAction(async (a: OpenMeetingAction) => { await AdminApi.meetings.tick(a.meetingId, a.id, true); toast('Done.'); q.reload(); });

  if (q.error) return <><PageHeader title="Meetings & minutes" /><ErrorState error={q.error} onRetry={q.reload} /></>;
  if (!q.data) return <><PageHeader title="Meetings & minutes" /><Loading /></>;
  const d = q.data;
  const kinds = [...new Set(d.meetings.map((m) => m.kind))];
  const list = d.meetings.filter((m) => !rows.hidden.has(m.id) && (kind === 'all' || m.kind === kind));

  return (
    <>
      <PageHeader
        title="Meetings & minutes"
        subtitle="Elders, deacons and committee meetings: the agenda before, the minutes after, and action items that stay on the list until they are done."
        actions={<button className="btn primary" onClick={() => setCreating(true)}><Plus size={16} /> New meeting</button>}
      />
      <div className="stack">
        {d.actions.length > 0 && (
          <div className="card card-pad stack" style={{ gap: 8 }}>
            <b>Open actions ({d.actions.length})</b>
            <FormError error={tick.error} />
            <div className="mt-actions">
              {d.actions.map((a) => (
                <label key={`${a.meetingId}-${a.id}`} className="mt-action">
                  <input type="checkbox" checked={false} onChange={() => void tick.run(a)} disabled={tick.busy} />
                  <span className="grow">
                    {a.text}
                    <span className="small muted" style={{ display: 'block' }}>
                      {a.ownerName ?? 'No owner'} · from {a.meetingTitle}, {day(a.meetingDate)}
                    </span>
                  </span>
                  {a.due && <span className={`badge ${a.overdue ? 'danger' : 'gray'}`}>{a.overdue ? 'Overdue' : 'By'} {day(a.due)}</span>}
                </label>
              ))}
            </div>
          </div>
        )}
        {kinds.length > 1 && <Segmented value={kind} onChange={setKind} options={[{ value: 'all', label: 'All' }, ...kinds.map((k) => ({ value: k, label: KIND[k] }))]} />}
        {!list.length ? (
          <Empty icon={<ClipboardList size={28} />} title="No meetings yet" body="Plan the next elders or committee meeting: the agenda goes to everyone, and the minutes and action items follow." action={<button className="btn primary" onClick={() => setCreating(true)}>Plan a meeting</button>} />
        ) : (
          <div className="card table-wrap">
            <table className="table">
              <thead><tr><th>Date</th><th>Meeting</th><th>People</th><th>Actions</th><th /></tr></thead>
              <tbody>
                {list.map((m) => (
                  <tr key={m.id} onClick={() => setOpen(m.id)} style={{ cursor: 'pointer' }}>
                    <td className="small">{day(m.date)}{m.time && <div className="muted">{m.time}</div>}</td>
                    <td><b>{m.title}</b><div className="small muted">{m.status === 'held' ? (m.minutesSentAt ? 'Minutes sent' : 'Held') : m.agendaSentAt ? 'Agenda sent' : 'Planned'}{m.place ? ` · ${m.place}` : ''}</div></td>
                    <td className="small">{m.attendees.length}</td>
                    <td className="small">{m.openActions ? <span className="badge">{m.openActions} open</span> : m.actions.length ? <span className="muted">All done</span> : <span className="muted">None</span>}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button className="btn sm ghost icon" aria-label="Delete meeting" onClick={() => undoable({ text: `${m.title} deleted.`, hide: () => rows.hide(m.id), show: () => rows.show(m.id), run: () => AdminApi.meetings.remove(m.id), done: q.reload })}><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {creating && <NewMeeting onClose={() => setCreating(false)} onDone={(m) => { setCreating(false); q.reload(); setOpen(m.id); }} />}
      {open && <MeetingEditor id={open} onClose={() => { setOpen(null); q.reload(); }} />}
    </>
  );
}

function NewMeeting({ onClose, onDone }: { onClose: () => void; onDone: (m: MeetingView) => void }) {
  const [kind, setKind] = useState<MeetingKind>('elders');
  const [date, setDate] = useState(today());
  const [time, setTime] = useState('');
  const [place, setPlace] = useState('');
  const save = useAction(async () => onDone(await AdminApi.meetings.create({ kind, date, time, place })));
  return (
    <Modal title="New meeting" onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => void save.run()} disabled={save.busy || !date}>Create</button></>}>
      <div className="stack">
        <Field label="Kind" hint="The people from the last meeting of this kind are added for you.">
          <select value={kind} onChange={(e) => setKind(e.target.value as MeetingKind)}>{(Object.keys(KIND) as MeetingKind[]).map((k) => <option key={k} value={k}>{KIND[k]}</option>)}</select>
        </Field>
        <div className="row" style={{ gap: 10 }}>
          <Field label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Time"><input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
        </div>
        <Field label="Place"><input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Church office, or a Zoom link" maxLength={120} /></Field>
        <FormError error={save.error} />
      </div>
    </Modal>
  );
}

type Draft = Pick<MeetingView, 'title' | 'kind' | 'date' | 'time' | 'place' | 'minutes' | 'decisions' | 'status'> & {
  people: PickedPerson[]; apologyIds: string[]; agenda: MeetingAgendaItem[]; actions: (MeetingAction & { ownerName: string | null })[];
};
const draftOf = (m: MeetingView): Draft => ({
  title: m.title, kind: m.kind, date: m.date, time: m.time, place: m.place, minutes: m.minutes, decisions: m.decisions, status: m.status,
  people: m.attendees, apologyIds: m.apologyIds, agenda: m.agenda,
  actions: m.actions.map((a) => ({ ...a, ownerName: a.ownerId ? m.attendees.find((p) => p.id === a.ownerId)?.name ?? null : null })),
});

function MeetingEditor({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useApi(() => AdminApi.meetings.get(id), [id]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dirty, setDirty] = useState(false);
  const toast = useToast();
  const m = q.data;
  const d = draft ?? (m ? draftOf(m) : null);
  const set = (patch: Partial<Draft>) => { setDraft({ ...d!, ...patch }); setDirty(true); };
  const body = (x: Draft) => ({
    title: x.title, kind: x.kind, date: x.date, time: x.time, place: x.place, minutes: x.minutes, status: x.status,
    attendeeIds: x.people.map((p) => p.id), apologyIds: x.apologyIds, decisions: x.decisions.filter((s) => s.trim()),
    agenda: x.agenda.map((a) => ({ ...a, id: a.id.startsWith('new-') ? undefined : a.id })),
    actions: x.actions.map((a) => ({ id: a.id.startsWith('new-') ? undefined : a.id, text: a.text, ownerId: a.ownerId, due: a.due, done: !!a.doneAt })),
  });
  const persist = async () => {
    if (!d || !dirty) return m!;
    const saved = await AdminApi.meetings.update(id, body(d));
    q.setData(saved); setDraft(draftOf(saved)); setDirty(false);
    return saved;
  };
  const save = useAction(async () => { await persist(); toast('Saved.'); });
  const send = useAction(async (what: 'agenda' | 'minutes') => {
    await persist();
    const sent = await AdminApi.meetings.send(id, what);
    q.setData(sent); setDraft(draftOf(sent));
    toast(what === 'agenda' ? 'Agenda sent.' : 'Minutes sent.');
  });
  const tick = useAction(async (a: OpenMeetingAction) => { await AdminApi.meetings.tick(a.meetingId, a.id, true); q.reload(); });
  const close = () => { if (dirty && d) void AdminApi.meetings.update(id, body(d)).finally(onClose); else onClose(); };

  if (q.error) return <Modal title="Meeting" onClose={onClose}><ErrorState error={q.error} onRetry={q.reload} /></Modal>;
  if (!m || !d) return <Modal title="Meeting" onClose={onClose}><Loading /></Modal>;
  const planned = d.agenda.reduce((n, a) => n + a.minutes, 0);
  const moveAgenda = (i: number, by: number) => { const next = [...d.agenda]; const [x] = next.splice(i, 1); next.splice(i + by, 0, x); set({ agenda: next }); };

  return (
    <Modal
      wide
      title={d.title || 'Meeting'}
      onClose={close}
      footer={<>
        <button className="btn" onClick={() => void send.run('agenda')} disabled={send.busy || !d.people.length}><Send size={14} /> Send agenda</button>
        <button className="btn" onClick={() => void send.run('minutes')} disabled={send.busy || !d.people.length}><Send size={14} /> Send minutes</button>
        <button className="btn primary" onClick={() => void save.run()} disabled={save.busy || !dirty}>Save</button>
      </>}
    >
      <div className="stack">
        {(m.agendaSentAt || m.minutesSentAt) && <div className="small muted">{m.agendaSentAt && `Agenda sent ${formatDate(m.agendaSentAt)}. `}{m.minutesSentAt && `Minutes sent ${formatDate(m.minutesSentAt)}.`}</div>}
        <FormError error={save.error ?? send.error ?? tick.error} />
        <div className="mt-grid">
          <Field label="Title"><input value={d.title} onChange={(e) => set({ title: e.target.value })} maxLength={120} /></Field>
          <Field label="Kind"><select value={d.kind} onChange={(e) => set({ kind: e.target.value as MeetingKind })}>{(Object.keys(KIND) as MeetingKind[]).map((k) => <option key={k} value={k}>{KIND[k]}</option>)}</select></Field>
          <Field label="Date"><input type="date" value={d.date} onChange={(e) => set({ date: e.target.value })} /></Field>
          <Field label="Time"><input type="time" value={d.time} onChange={(e) => set({ time: e.target.value })} /></Field>
          <Field label="Place"><input value={d.place} onChange={(e) => set({ place: e.target.value })} maxLength={120} /></Field>
        </div>

        <section className="stack" style={{ gap: 6 }}>
          <b>People <span className="small muted">· tap a name to mark apologies</span></b>
          <div className="chips">
            {d.people.map((p) => {
              const away = d.apologyIds.includes(p.id);
              return (
                <span key={p.id} className={`chip ${away ? 'off' : ''}`}>
                  <button type="button" className="mt-chip-name" onClick={() => set({ apologyIds: away ? d.apologyIds.filter((x) => x !== p.id) : [...d.apologyIds, p.id] })} title={away ? 'Sent apologies' : 'Present'}>
                    {p.name}{away && ' (apologies)'}
                  </button>
                  <button type="button" className="mt-chip-x" aria-label={`Remove ${p.name}`} onClick={() => set({ people: d.people.filter((x) => x.id !== p.id), apologyIds: d.apologyIds.filter((x) => x !== p.id) })}><X size={12} /></button>
                </span>
              );
            })}
          </div>
          <PersonSearch placeholder="Add someone to this meeting" exclude={d.people.map((p) => p.id)} onPick={(p) => set({ people: [...d.people, p] })} />
        </section>

        {m.carried.length > 0 && (
          <section className="card card-pad stack mt-carried" style={{ gap: 6 }}>
            <b>Still open from earlier meetings</b>
            {m.carried.map((a) => (
              <label key={`${a.meetingId}-${a.id}`} className="mt-action">
                <input type="checkbox" checked={false} onChange={() => void tick.run(a)} disabled={tick.busy} />
                <span className="grow">{a.text}<span className="small muted" style={{ display: 'block' }}>{a.ownerName ?? 'No owner'} · {day(a.meetingDate)}{a.due ? ` · by ${day(a.due)}` : ''}</span></span>
              </label>
            ))}
          </section>
        )}

        <section className="stack" style={{ gap: 6 }}>
          <div className="row between"><b>Agenda</b>{planned > 0 && <span className="small muted">{planned} min planned</span>}</div>
          {d.agenda.map((a, i) => (
            <div key={a.id} className="mt-agenda">
              <span className="mt-num">{i + 1}</span>
              <div className="grow stack" style={{ gap: 4 }}>
                <div className="row" style={{ gap: 6 }}>
                  <input className="grow" value={a.title} onChange={(e) => set({ agenda: d.agenda.map((x) => (x.id === a.id ? { ...x, title: e.target.value } : x)) })} placeholder="Item" aria-label={`Agenda item ${i + 1}`} maxLength={200} />
                  <input type="number" min={0} max={240} style={{ width: 70, flex: 'none' }} value={a.minutes || ''} onChange={(e) => set({ agenda: d.agenda.map((x) => (x.id === a.id ? { ...x, minutes: Number(e.target.value) || 0 } : x)) })} placeholder="min" aria-label="Minutes" />
                  <button className="btn sm ghost icon" disabled={i === 0} onClick={() => moveAgenda(i, -1)} aria-label="Move up"><ArrowUp size={13} /></button>
                  <button className="btn sm ghost icon" disabled={i === d.agenda.length - 1} onClick={() => moveAgenda(i, 1)} aria-label="Move down"><ArrowDown size={13} /></button>
                  <button className="btn sm ghost icon" onClick={() => set({ agenda: d.agenda.filter((x) => x.id !== a.id) })} aria-label="Remove item"><Trash2 size={13} /></button>
                </div>
                <textarea rows={1} value={a.notes} onChange={(e) => set({ agenda: d.agenda.map((x) => (x.id === a.id ? { ...x, notes: e.target.value } : x)) })} placeholder="Notes on this item" maxLength={4000} />
              </div>
            </div>
          ))}
          <button className="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => set({ agenda: [...d.agenda, { id: tmp(), title: '', minutes: 0, notes: '' }] })}><Plus size={14} /> Add an item</button>
        </section>

        <section className="stack" style={{ gap: 6 }}>
          <b>Decisions</b>
          {d.decisions.map((x, i) => (
            <div key={i} className="row" style={{ gap: 6 }}>
              <input className="grow" value={x} onChange={(e) => set({ decisions: d.decisions.map((y, j) => (j === i ? e.target.value : y)) })} placeholder="What was decided" aria-label={`Decision ${i + 1}`} maxLength={500} />
              <button className="btn sm ghost icon" onClick={() => set({ decisions: d.decisions.filter((_, j) => j !== i) })} aria-label="Remove decision"><Trash2 size={13} /></button>
            </div>
          ))}
          <button className="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => set({ decisions: [...d.decisions, ''] })}><Plus size={14} /> Add a decision</button>
        </section>

        <section className="stack" style={{ gap: 6 }}>
          <b>Action items</b>
          {d.actions.map((a, i) => (
            <div key={a.id} className="mt-action-edit">
              <input type="checkbox" checked={!!a.doneAt} onChange={(e) => set({ actions: d.actions.map((x) => (x.id === a.id ? { ...x, doneAt: e.target.checked ? new Date().toISOString() : null } : x)) })} aria-label="Done" />
              <input className="grow" value={a.text} onChange={(e) => set({ actions: d.actions.map((x) => (x.id === a.id ? { ...x, text: e.target.value } : x)) })} placeholder="What needs doing" aria-label={`Action ${i + 1}`} maxLength={300} />
              <div className="mt-owner"><PersonField value={a.ownerId ? { id: a.ownerId, name: a.ownerName ?? 'Owner' } : null} onChange={(p) => set({ actions: d.actions.map((x) => (x.id === a.id ? { ...x, ownerId: p?.id ?? null, ownerName: p?.name ?? null } : x)) })} placeholder="Who" /></div>
              <input type="date" value={a.due ?? ''} onChange={(e) => set({ actions: d.actions.map((x) => (x.id === a.id ? { ...x, due: e.target.value || null } : x)) })} aria-label="Due" />
              <button className="btn sm ghost icon" onClick={() => set({ actions: d.actions.filter((x) => x.id !== a.id) })} aria-label="Remove action"><Trash2 size={13} /></button>
            </div>
          ))}
          <button className="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => set({ actions: [...d.actions, { id: tmp(), text: '', ownerId: null, ownerName: null, due: null, doneAt: null }] })}><Plus size={14} /> Add an action</button>
        </section>

        <Field label="Minutes" hint="Anything else worth keeping. Sending the minutes marks the meeting as held.">
          <textarea rows={6} value={d.minutes} onChange={(e) => set({ minutes: e.target.value })} maxLength={20000} placeholder="Opened in prayer by…" />
        </Field>
      </div>
    </Modal>
  );
}
