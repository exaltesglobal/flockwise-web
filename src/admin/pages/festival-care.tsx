// Care › Festival care: before Diwali, Pongal, Onam or Christmas, the people who may feel left out at
// home (first-generation believers, homes that keep another faith), each with a suggested visit,
// gift, call or invitation the team can plan and tick off. Sensitive: care staff only.
import { Check, Gift, MessageCircle, Pencil, Phone, Plus, RotateCcw, Settings2, Sparkles, Trash2, UserPlus, X } from 'lucide-react';
import { useState } from 'react';

import { AdminApi } from '@/api/endpoints';
import type { FestivalCareAction, FestivalCareHub, FestivalCareRow, FestivalHome } from '@/core/types';
import { PersonSearch } from '@/admin/components/person-picker';
import { Empty, ErrorState, Field, FormError, Loading, Modal, useHiddenRows, useToast, useUndoableDelete } from '@/components/ui';
import { formatDay } from '@/lib/format';
import { useAction, useApi } from '@/lib/use-api';

import { PageHeader } from '../layout';

const ACTION: Record<FestivalCareAction, string> = { visit: 'Visit', gift: 'Gift', call: 'Call', invite: 'Invite' };
const wa = (phone: string) => `https://wa.me/${phone.replace(/\D/g, '').replace(/^(\d{10})$/, '91$1')}`;
type Upcoming = FestivalCareHub['upcoming'][number];
type Editing = { personId: string; name: string; home: FestivalHome; firstGeneration: boolean; festivals: string[]; note: string } | 'new';

export function FestivalCarePage() {
  const q = useApi(AdminApi.festivalCare.get);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [setup, setSetup] = useState(false);
  const rows = useHiddenRows();
  const undoable = useUndoableDelete();
  const title = 'Festival care';
  if (q.error) return <><PageHeader title={title} /><ErrorState error={q.error} onRetry={q.reload} /></>;
  if (!q.data) return <><PageHeader title={title} /><Loading /></>;
  const d = q.data;
  const families = d.families.filter((f) => !rows.hidden.has(f.id));
  return (
    <>
      <PageHeader
        title={title}
        subtitle="Festivals can be lonely for someone who is the only one at home following Jesus. Before each festival, see who may feel left out and plan a visit, a gift or an invitation. Only care staff see this list, and members never do."
        actions={<>
          <button className="btn" onClick={() => setSetup(true)}><Settings2 size={15} /> Festivals</button>
          <button className="btn primary" onClick={() => setEditing('new')}><UserPlus size={15} /> Add someone</button>
        </>}
      />
      {!d.families.length ? (
        <Empty icon={<Gift size={28} />} title="No one on the list yet" body="Add people who are the first in their family to follow Jesus, or whose family keeps another faith. They will show up before each festival with a suggestion." action={<button className="btn primary" onClick={() => setEditing('new')}>Add someone</button>} />
      ) : !d.upcoming.length ? (
        <div className="card card-pad muted">No festival in the next few weeks. Pick the festivals your church follows with the Festivals button.</div>
      ) : (
        <div className="stack">{d.upcoming.map((f) => <FestivalCard key={`${f.key}:${f.date}`} f={f} onChange={q.setData} />)}</div>
      )}

      {d.maybe.length > 0 && (
        <section className="card card-pad stack" style={{ marginTop: 16, gap: 8 }}>
          <b className="row" style={{ gap: 6 }}><Sparkles size={15} /> Maybe also</b>
          <span className="small muted">Baptised in the last two years and the only one from their home in the church. Add them if their family keeps another faith.</span>
          {d.maybe.map((m) => (
            <div key={m.personId} className="row between wrap" style={{ gap: 8 }}>
              <span><a href={`/admin/people?open=${m.personId}`}>{m.name}</a> <span className="small muted">· {m.why}</span></span>
              <button className="btn sm" onClick={() => setEditing({ personId: m.personId, name: m.name, home: 'other', firstGeneration: true, festivals: [], note: '' })}><Plus size={13} /> Add</button>
            </div>
          ))}
        </section>
      )}

      {families.length > 0 && (
        <section className="card" style={{ marginTop: 16 }}>
          <div className="card-pad" style={{ paddingBottom: 0 }}><b>The list ({families.length})</b></div>
          {families.map((f) => (
            <div key={f.id} className="list-row">
              <div className="grow" style={{ minWidth: 0 }}>
                <a href={`/admin/people?open=${f.id}`} style={{ fontWeight: 600 }}>{f.name}</a>
                <div className="small muted">
                  {[f.firstGeneration && 'First in the family to follow Jesus', f.home === 'other' ? 'Family keeps another faith' : 'Some of the family follow Jesus', f.festivals.length ? `Only ${f.festivals.map((k) => d.known.find((x) => x.key === k)?.name ?? d.settings.custom.find((c) => c.key === k)?.name ?? k).join(', ')}` : null, f.note].filter(Boolean).join(' · ')}
                </div>
              </div>
              <button className="btn ghost icon sm" aria-label="Edit" onClick={() => setEditing({ personId: f.id, name: f.name, home: f.home, firstGeneration: f.firstGeneration, festivals: f.festivals, note: f.note ?? '' })}><Pencil size={15} /></button>
              <button className="btn ghost icon sm danger" aria-label="Take off the list" onClick={() => undoable({ text: `${f.name} is off the list.`, hide: () => rows.hide(f.id), show: () => rows.show(f.id), run: () => AdminApi.festivalCare.remove(f.id), done: q.reload })}><Trash2 size={15} /></button>
            </div>
          ))}
        </section>
      )}
      {editing && <FamilyModal d={d} editing={editing} onClose={() => setEditing(null)} onSaved={(hub) => { q.setData(hub); setEditing(null); }} />}
      {setup && <SettingsModal d={d} onClose={() => setSetup(false)} onSaved={(hub) => { q.setData(hub); setSetup(false); }} />}
    </>
  );
}

function FestivalCard({ f, onChange }: { f: Upcoming; onChange: (d: FestivalCareHub) => void }) {
  return (
    <section className="card">
      <header className="card-pad row between wrap" style={{ gap: 8, paddingBottom: 8 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18 }}>{f.name}</h2>
          <span className="small muted">{formatDay(`${f.date}T12:00:00`)} · {f.daysAway === 0 ? 'today' : f.daysAway === 1 ? 'tomorrow' : `in ${f.daysAway} days`}</span>
        </div>
        {f.rows.length > 0 && <span className={`badge ${f.done === f.rows.length ? 'ok' : 'gray'}`}>{f.done} of {f.rows.length} done</span>}
      </header>
      {!f.rows.length && <p className="card-pad muted small" style={{ paddingTop: 0 }}>No one on the list for {f.name}.</p>}
      {f.rows.map((r) => <CareRow key={r.personId} f={f} r={r} onChange={onChange} />)}
    </section>
  );
}

function CareRow({ f, r, onChange }: { f: Upcoming; r: FestivalCareRow; onChange: (d: FestivalCareHub) => void }) {
  const toast = useToast();
  const [planning, setPlanning] = useState(false);
  const [action, setAction] = useState<FestivalCareAction>(r.record?.action ?? r.suggestion.action);
  const [by, setBy] = useState(r.record?.by ?? r.zoneLeaders[0] ?? '');
  const base = { festivalKey: f.key, date: f.date, personId: r.personId };
  const save = useAction(async (extra: { status?: 'planned' | 'done'; clear?: boolean }) => {
    onChange(await AdminApi.festivalCare.record({ ...base, action, by: by.trim() || null, ...extra }));
    setPlanning(false);
    if (extra.status === 'done') toast(`${r.name.split(' ')[0]}: done`);
  });
  const done = r.record?.status === 'done';
  return (
    <div className={`list-row fc-row ${done ? 'fc-done' : ''}`} style={{ alignItems: 'flex-start' }}>
      <div className="stack grow" style={{ gap: 4, minWidth: 0 }}>
        <div className="row wrap" style={{ gap: 8 }}>
          <a href={`/admin/people?open=${r.personId}`} style={{ fontWeight: 600 }}>{r.name}</a>
          {r.zone && <span className="small muted">{r.zone}{r.zoneLeaders.length ? ` · ${r.zoneLeaders.join(', ')}` : ''}</span>}
        </div>
        <span className="small muted">{r.reason}</span>
        <span className="small"><b>{ACTION[r.suggestion.action]}:</b> {r.suggestion.text}</span>
        {r.record && <span className={`badge ${done ? 'ok' : 'accent'}`} style={{ alignSelf: 'flex-start' }}>{done ? <Check size={12} /> : null} {ACTION[r.record.action]}{r.record.by ? ` · ${r.record.by}` : ''}{done ? ' · done' : ' · planned'}</span>}
        {planning && (
          <div className="row wrap" style={{ gap: 6, marginTop: 4 }}>
            <select className="select" value={action} onChange={(e) => setAction(e.target.value as FestivalCareAction)} aria-label="What">
              {(Object.keys(ACTION) as FestivalCareAction[]).map((a) => <option key={a} value={a}>{ACTION[a]}</option>)}
            </select>
            <input className="input" style={{ width: 180 }} value={by} onChange={(e) => setBy(e.target.value)} placeholder="Who will go" aria-label="Who will go" maxLength={60} />
            <button className="btn sm primary" disabled={save.busy} onClick={() => void save.run({ status: 'planned' })}>Save</button>
            <button className="btn sm ghost icon" aria-label="Cancel" onClick={() => setPlanning(false)}><X size={14} /></button>
          </div>
        )}
        <FormError error={save.error} />
      </div>
      <div className="row wrap" style={{ gap: 6, justifyContent: 'flex-end' }}>
        {r.phone && !done && <a className="btn sm ghost icon" href={`tel:${r.phone}`} aria-label="Call"><Phone size={14} /></a>}
        {r.phone && !done && <a className="btn sm ghost icon" href={wa(r.phone)} target="_blank" rel="noreferrer" aria-label="WhatsApp"><MessageCircle size={14} /></a>}
        {done ? (
          <button className="btn sm ghost" disabled={save.busy} onClick={() => void save.run({ status: 'planned' })}><RotateCcw size={13} /> Undo</button>
        ) : (
          <>
            {!planning && <button className="btn sm" onClick={() => setPlanning(true)}>{r.record ? 'Change' : 'Plan'}</button>}
            <button className="btn sm primary" disabled={save.busy} onClick={() => void save.run({ status: 'done' })}><Check size={14} /> Done</button>
          </>
        )}
      </div>
    </div>
  );
}

function FamilyModal({ d, editing, onClose, onSaved }: { d: FestivalCareHub; editing: Editing; onClose: () => void; onSaved: (hub: FestivalCareHub) => void }) {
  const isNew = editing === 'new';
  const [who, setWho] = useState<{ id: string; name: string } | null>(isNew ? null : { id: editing.personId, name: editing.name });
  const [home, setHome] = useState<FestivalHome>(isNew ? 'other' : editing.home);
  const [first, setFirst] = useState(isNew ? true : editing.firstGeneration);
  const [only, setOnly] = useState<string[]>(isNew ? [] : editing.festivals);
  const [note, setNote] = useState(isNew ? '' : editing.note);
  const festivals = [...d.known.filter((k) => d.settings.festivals.includes(k.key)).map((k) => ({ key: k.key, name: k.name })), ...d.settings.custom];
  const save = useAction(async () => { if (who) onSaved(await AdminApi.festivalCare.save(who.id, { home, firstGeneration: first, festivals: only, note: note.trim() || undefined })); });
  const toggle = (k: string) => setOnly((xs) => (xs.includes(k) ? xs.filter((x) => x !== k) : [...xs, k]));
  return (
    <Modal title={who && !isNew ? who.name : 'Add to festival care'} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!who || save.busy} onClick={() => void save.run()}>Save</button></>}>
      <div className="stack">
        {isNew && (who ? (
          <div className="row between"><b>{who.name}</b><button className="btn sm ghost" onClick={() => setWho(null)}>Change</button></div>
        ) : <PersonSearch onPick={(p) => setWho(p)} exclude={d.families.map((f) => f.id)} autoFocus />)}
        <Field label="At home">
          <div className="stack" style={{ gap: 6 }}>
            <label className="row" style={{ gap: 8 }}><input type="radio" checked={home === 'other'} onChange={() => setHome('other')} /> The rest of the family keep another faith</label>
            <label className="row" style={{ gap: 8 }}><input type="radio" checked={home === 'mixed'} onChange={() => setHome('mixed')} /> Some of the family follow Jesus</label>
          </div>
        </Field>
        <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={first} onChange={(e) => setFirst(e.target.checked)} /> The first in their family to follow Jesus</label>
        {festivals.length > 1 && (
          <Field label="Which festivals" hint="Leave all unticked for every festival the church follows.">
            <div className="row wrap" style={{ gap: 10 }}>{festivals.map((f) => <label key={f.key} className="row" style={{ gap: 6 }}><input type="checkbox" checked={only.includes(f.key)} onChange={() => toggle(f.key)} /> {f.name}</label>)}</div>
          </Field>
        )}
        <Field label="Note for the team (optional)" hint="Something that helps the visit, e.g. 'Visit when her father is at work'. Keep it kind; it is private to care staff.">
          <textarea className="textarea" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
        </Field>
        <FormError error={save.error} />
      </div>
    </Modal>
  );
}

function SettingsModal({ d, onClose, onSaved }: { d: FestivalCareHub; onClose: () => void; onSaved: (hub: FestivalCareHub) => void }) {
  const [on, setOn] = useState<string[]>(d.settings.festivals);
  const [custom, setCustom] = useState(d.settings.custom.map((c) => ({ ...c })));
  const [lead, setLead] = useState(String(d.settings.leadDays));
  const save = useAction(async () => onSaved(await AdminApi.festivalCare.settings({ festivals: on, custom: custom.filter((c) => c.name.trim() || c.date), leadDays: Number(lead) })));
  return (
    <Modal title="Festivals your church prepares for" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={save.busy} onClick={() => void save.run()}>Save</button></>}>
      <div className="stack">
        <div className="stack" style={{ gap: 6 }}>
          {d.known.map((k) => (
            <label key={k.key} className="row" style={{ gap: 8 }}>
              <input type="checkbox" checked={on.includes(k.key)} onChange={() => setOn((xs) => (xs.includes(k.key) ? xs.filter((x) => x !== k.key) : [...xs, k.key]))} />
              <span className="grow">{k.name}</span>
              <span className="small muted">{k.next ? formatDay(`${k.next}T12:00:00`) : 'Add the next date below'}</span>
            </label>
          ))}
        </div>
        <Field label="Your own festivals" hint="A regional festival (Bihu, Durga Puja, Ugadi) or a later year's date. Each needs a name and a date.">
          <div className="stack" style={{ gap: 6 }}>
            {custom.map((c, i) => (
              <div key={i} className="row" style={{ gap: 6 }}>
                <input className="input grow" value={c.name} onChange={(e) => setCustom((xs) => xs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="Name" maxLength={40} aria-label="Festival name" />
                <input className="input" type="date" value={c.date} onChange={(e) => setCustom((xs) => xs.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)))} aria-label="Date" />
                <button className="btn ghost icon sm" aria-label="Remove" onClick={() => setCustom((xs) => xs.filter((_, j) => j !== i))}><X size={14} /></button>
              </div>
            ))}
            <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setCustom((xs) => [...xs, { key: '', name: '', date: '' }])}><Plus size={13} /> Add a festival</button>
          </div>
        </Field>
        <Field label="Show the list this many days before" hint="Between 7 and 60 days.">
          <input className="input" style={{ width: 90 }} inputMode="numeric" value={lead} onChange={(e) => setLead(e.target.value.replace(/\D/g, ''))} />
        </Field>
        <FormError error={save.error} />
      </div>
    </Modal>
  );
}
