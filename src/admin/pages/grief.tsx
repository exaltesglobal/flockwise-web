// Care › Grief calendar: the day someone lost a loved one, remembered every year. A few days before,
// the pastor is reminded to call or visit; on the day the family gets a short message in their own
// language. Burials recorded in the register are added for the household by themselves.
import { Check, Flower2, Pencil, Plus, Send, Settings2, Trash2, X } from 'lucide-react';
import { useState } from 'react';

import { AdminApi, type GriefInput } from '@/api/endpoints';
import type { Channel, GriefDateView, GriefHub } from '@/core/types';
import { PersonSearch } from '@/admin/components/person-picker';
import { Empty, ErrorState, Field, FormError, Loading, Modal, useHiddenRows, useToast, useUndoableDelete } from '@/components/ui';
import { formatDate, formatDay } from '@/lib/format';
import { useAction, useApi } from '@/lib/use-api';

import { PageHeader } from '../layout';

const day = (d: string) => formatDay(`${d}T12:00:00`);
const died = (d: string) => formatDate(`${d}T12:00:00`);
const CHANNELS: { value: Channel; label: string }[] = [{ value: 'whatsapp', label: 'WhatsApp' }, { value: 'sms', label: 'SMS' }, { value: 'email', label: 'Email' }];

function when(g: GriefDateView) {
  const n = g.next;
  const what = n.kind === 'day40' ? '40th day' : n.years === 1 ? 'First anniversary' : `${n.years} years`;
  const away = n.daysAway === 0 ? 'today' : n.daysAway === 1 ? 'tomorrow' : `in ${n.daysAway} days`;
  return `${what} · ${day(n.on)} (${away})`;
}

export function GriefPage() {
  const q = useApi(AdminApi.grief.get);
  const [editing, setEditing] = useState<GriefDateView | 'new' | null>(null);
  const [settings, setSettings] = useState(false);
  const rows = useHiddenRows();
  const undoable = useUndoableDelete();
  const title = 'Grief calendar';
  const actions = <>
    <button className="btn" onClick={() => setSettings(true)}><Settings2 size={15} /> Settings</button>
    <button className="btn primary" onClick={() => setEditing('new')}><Plus size={15} /> Add a date</button>
  </>;
  if (q.error) return <><PageHeader title={title} /><ErrorState error={q.error} onRetry={q.reload} /></>;
  if (!q.data) return <><PageHeader title={title} /><Loading /></>;
  const d = q.data;
  const dates = d.dates.filter((g) => !rows.hidden.has(g.id));
  const soon = dates.filter((g) => g.next.daysAway <= 30);
  const later = dates.filter((g) => g.next.daysAway > 30);
  const remove = (g: GriefDateView) => undoable({ text: 'Removed.', hide: () => rows.hide(g.id), show: () => rows.show(g.id), run: () => AdminApi.grief.remove(g.id), done: q.reload });
  return (
    <>
      <PageHeader title={title} subtitle={`The first years after a death are the hardest, and anniversaries bring it back. You are reminded ${d.settings.nudgeDaysBefore === 0 ? 'on the day' : `${d.settings.nudgeDaysBefore} days before`} each anniversary${d.settings.day40 ? ' and 40 days after a death' : ''}, so you can call or visit. On the day the family gets a short message in their own language${d.settings.autoSend ? ', sent by itself' : ' once you send it'}. Burials in the register are added here for the household. Only people with care access see this page.`} actions={actions} />
      {!dates.length ? (
        <Empty icon={<Flower2 size={28} />} title="No dates yet" body="Add the day someone in your church lost a loved one. Burials you record in the register are added here by themselves." action={<button className="btn primary" onClick={() => setEditing('new')}>Add a date</button>} />
      ) : (
        <div className="stack">
          {soon.length > 0 && <h3 style={{ margin: 0 }}>Coming up in the next 30 days</h3>}
          {soon.map((g) => <SoonCard key={g.id} g={g} onChange={q.setData} onEdit={() => setEditing(g)} onDelete={() => remove(g)} />)}
          {later.length > 0 && (
            <div className="card">
              <div className="card-pad" style={{ paddingBottom: 0 }}><h3 style={{ margin: 0 }}>Later in the year</h3></div>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Remembering</th><th>Died</th><th>Family</th><th>Next</th><th /></tr></thead>
                  <tbody>{later.map((g) => (
                    <tr key={g.id}>
                      <td><b>{g.lovedOne}</b>{g.relation && <span className="small muted"> · {g.relation}</span>}</td>
                      <td>{died(g.date)}</td>
                      <td className="small">{g.family.map((f) => f.name).join(', ') || <span className="muted">No one added</span>}</td>
                      <td className="small">{day(g.next.on)}</td>
                      <td className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
                        <button className="btn ghost icon sm" aria-label="Edit" onClick={() => setEditing(g)}><Pencil size={15} /></button>
                        <button className="btn ghost icon sm danger" aria-label="Remove" onClick={() => remove(g)}><Trash2 size={15} /></button>
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
      {editing && <EditModal g={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={(h) => { q.setData(h); setEditing(null); }} />}
      {settings && <SettingsModal d={d} onClose={() => setSettings(false)} onSaved={(h) => { q.setData(h); setSettings(false); }} />}
    </>
  );
}

function SoonCard({ g, onChange, onEdit, onDelete }: { g: GriefDateView; onChange: (h: GriefHub) => void; onEdit: () => void; onDelete: () => void }) {
  const toast = useToast();
  const [text, setText] = useState(g.draft);
  // An edited message goes to everyone; the first person's name becomes {name} so each gets their own.
  const first = g.family[0]?.name.split(' ')[0];
  const send = useAction(async () => { onChange(await AdminApi.grief.send(g.id, text === g.draft ? undefined : first ? text.replaceAll(first, '{name}') : text)); toast('Message sent to the family.'); });
  const canSend = g.next.kind === 'year' && g.sendMessage && g.family.length > 0;
  return (
    <article className="card card-pad stack" style={{ gap: 8 }}>
      <div className="row between wrap" style={{ gap: 8, alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{g.lovedOne}{g.relation && <span className="small muted" style={{ fontWeight: 400 }}> · {g.relation}</span>}</div>
          <div className="small"><span className={`badge ${g.next.daysAway <= 3 ? 'accent' : 'gray'}`}>{when(g)}</span> <span className="muted">Died {died(g.date)}</span></div>
        </div>
        <div className="row" style={{ gap: 4 }}>
          <button className="btn ghost icon sm" aria-label="Edit" onClick={onEdit}><Pencil size={15} /></button>
          <button className="btn ghost icon sm danger" aria-label="Remove" onClick={onDelete}><Trash2 size={15} /></button>
        </div>
      </div>
      <div className="small">
        {g.family.length ? g.family.map((f, i) => <span key={f.id}>{i > 0 && ', '}<a href={`/admin/people?open=${f.id}`}>{f.name}</a>{f.phone && <span className="muted"> {f.phone}</span>}</span>) : <span className="muted">No family added yet. Add who to remember with.</span>}
      </div>
      {g.note && <div className="small muted">{g.note}</div>}
      {g.next.kind === 'day40' && <div className="small muted">Many families hold a memorial prayer around the 40th day. A visit or a call to offer one would mean a lot.</div>}
      {canSend && (g.sentThisTime ? (
        <div className="small row" style={{ gap: 6 }}><Check size={15} /> The message went to the family on {formatDay(g.sentThisTime)}.</div>
      ) : (
        <div className="stack" style={{ gap: 6 }}>
          <Field label={g.family.length > 1 ? `Message to the family (each gets it with their own name${new Set(g.family.map((f) => f.language)).size > 1 ? ', in their own language' : ''})` : 'Message to the family'}>
            <textarea className="input" rows={4} value={text} onChange={(e) => setText(e.target.value)} maxLength={700} />
          </Field>
          {text !== g.draft && <span className="small muted">Everyone gets your words as written here.</span>}
          <FormError error={send.error} />
          <button className="btn primary sm" style={{ alignSelf: 'flex-start' }} disabled={send.busy || !text.trim()} onClick={() => void send.run()}><Send size={14} /> Send now</button>
        </div>
      ))}
    </article>
  );
}

function EditModal({ g, onClose, onSaved }: { g: GriefDateView | null; onClose: () => void; onSaved: (h: GriefHub) => void }) {
  const [form, setForm] = useState({ lovedOne: g?.lovedOne ?? '', relation: g?.relation ?? '', date: g?.date ?? '', note: g?.note ?? '', message: g?.message ?? '', sendMessage: g?.sendMessage ?? true });
  const [family, setFamily] = useState<{ id: string; name: string }[]>(g?.family.map((f) => ({ id: f.id, name: f.name })) ?? []);
  const save = useAction(async () => {
    const body: GriefInput = { lovedOne: form.lovedOne, date: form.date, relation: form.relation || null, note: form.note || null, message: form.message || null, sendMessage: form.sendMessage, familyIds: family.map((f) => f.id) };
    onSaved(g ? await AdminApi.grief.update(g.id, body) : await AdminApi.grief.add(body));
  });
  return (
    <Modal title={g ? 'Edit date' : 'Add a date to remember'} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!form.lovedOne.trim() || !form.date || save.busy} onClick={() => void save.run()}>Save</button></>}>
      <div className="stack">
        <div className="row wrap" style={{ gap: 10 }}>
          <div className="grow"><Field label="Who died"><input className="input" value={form.lovedOne} onChange={(e) => setForm({ ...form, lovedOne: e.target.value })} placeholder="e.g. Joseph Thomas, or Appa" maxLength={80} autoFocus /></Field></div>
          <div><Field label="Date they died"><input className="input" type="date" value={form.date} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field></div>
        </div>
        <Field label="Relation to the family (optional)"><input className="input" value={form.relation} onChange={(e) => setForm({ ...form, relation: e.target.value })} placeholder="e.g. Father, Wife, Son" maxLength={40} /></Field>
        <Field label="Family to remember with">
          <div className="stack" style={{ gap: 6 }}>
            {family.length > 0 && <div className="row wrap" style={{ gap: 6 }}>{family.map((f) => <span key={f.id} className="badge gray row" style={{ gap: 4 }}>{f.name}<button className="btn ghost icon sm" aria-label={`Remove ${f.name}`} onClick={() => setFamily((xs) => xs.filter((x) => x.id !== f.id))}><X size={12} /></button></span>)}</div>}
            <PersonSearch onPick={(p) => setFamily((xs) => (xs.some((x) => x.id === p.id) ? xs : [...xs, { id: p.id, name: p.name }]))} exclude={family.map((f) => f.id)} placeholder="Add someone from the family" />
          </div>
        </Field>
        <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={form.sendMessage} onChange={(e) => setForm({ ...form, sendMessage: e.target.checked })} /> Send the family a message on the anniversary</label>
        {form.sendMessage && <Field label="Your own words (optional)" hint="Leave empty for the default, in each person's language. Use {name} for their first name and {lovedOne} for the one who died."><textarea className="input" rows={3} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} maxLength={700} placeholder="Dear {name}, today we remember {lovedOne} with you…" /></Field>}
        <Field label="Note for the care team (optional)"><input className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="e.g. Mother finds evenings hardest. Likes a visit after work." maxLength={500} /></Field>
        <FormError error={save.error} />
      </div>
    </Modal>
  );
}

function SettingsModal({ d, onClose, onSaved }: { d: GriefHub; onClose: () => void; onSaved: (h: GriefHub) => void }) {
  const [s, setS] = useState(d.settings);
  const save = useAction(async () => onSaved(await AdminApi.grief.settings(s)));
  return (
    <Modal title="Grief calendar settings" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={save.busy} onClick={() => void save.run()}>Save</button></>}>
      <div className="stack">
        <Field label="Remind me this many days before"><input className="input" type="number" min={0} max={14} value={s.nudgeDaysBefore} onChange={(e) => setS({ ...s, nudgeDaysBefore: Number(e.target.value) })} style={{ width: 100 }} /></Field>
        <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={s.day40} onChange={(e) => setS({ ...s, day40: e.target.checked })} /> Also remind me 40 days after a death</label>
        <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={s.autoSend} onChange={(e) => setS({ ...s, autoSend: e.target.checked })} /> Send the family message by itself on the day</label>
        <span className="small muted">When this is off, you read the message here and send it yourself.</span>
        <Field label="Send by">
          <select className="input" value={s.channel} onChange={(e) => setS({ ...s, channel: e.target.value as Channel })}>{CHANNELS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select>
        </Field>
        <FormError error={save.error} />
      </div>
    </Modal>
  );
}
