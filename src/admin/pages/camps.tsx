// Events › Camps & retreats: sign-ups from the app, medical and emergency details, payments, and
// rooms and bus seats filled in one tap (families together, everyone else by gender).
import { ArrowLeft, Plus, Tent, Trash2, UserPlus, Wand2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import { AdminApi } from '@/api/endpoints';
import type { Camp, CampBus, CampDetail, CampRoom, CampView } from '@/core/types';
import { Empty, ErrorState, Field, FormError, Loading, Modal, Segmented, useToast } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { useCan } from '@/lib/perms';
import { useAction, useApi } from '@/lib/use-api';

import { PersonSearch, type PickedPerson } from '../components/person-picker';
import { PageHeader } from '../layout';

const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const day = (d: string) => formatDate(`${d}T12:00:00`);
const span = (c: Pick<Camp, 'startsOn' | 'endsOn'>) => (c.startsOn === c.endsOn ? day(c.startsOn) : `${day(c.startsOn)} to ${day(c.endsOn)}`);
const FOR: Record<CampRoom['for'], string> = { any: 'Anyone', male: 'Men and boys', female: 'Women and girls', family: 'Families' };

export function CampsPage() {
  const q = useApi(AdminApi.camps.list);
  const can = useCan();
  const editable = can('events');
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const toast = useToast();
  if (open) return <CampScreen id={open} editable={editable} onBack={() => { setOpen(null); q.reload(); }} />;
  if (q.error) return <><PageHeader title="Camps & retreats" /><ErrorState error={q.error} onRetry={q.reload} /></>;
  if (!q.data) return <><PageHeader title="Camps & retreats" /><Loading /></>;
  return (
    <>
      <PageHeader
        title="Camps & retreats"
        subtitle="Youth camps, family retreats and conferences out of town. Families sign up from the app with medical and emergency details; you track payments and fill rooms and bus seats in one tap."
        actions={editable && <button className="btn primary" onClick={() => setCreating(true)}><Plus size={16} /> New camp</button>}
      />
      {!q.data.camps.length ? (
        <Empty icon={<Tent size={28} />} title="No camps yet" body="Add the camp with its rooms and buses, and members can sign up their family from the app." action={editable && <button className="btn primary" onClick={() => setCreating(true)}>Add a camp</button>} />
      ) : (
        <div className="co-grid">
          {q.data.camps.map((c) => <CampCard key={c.id} c={c} onOpen={() => setOpen(c.id)} />)}
        </div>
      )}
      {creating && <CampForm camp={null} onClose={() => setCreating(false)} onDone={(c) => { setCreating(false); toast(`${c.name} added.`); setOpen(c.id); }} />}
    </>
  );
}

function CampCard({ c, onOpen }: { c: CampView; onOpen: () => void }) {
  return (
    <button className="card card-pad co-card stack" style={{ gap: 6, textAlign: 'left' }} onClick={onOpen}>
      <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}><b>{c.name}</b>{c.open ? <span className="badge ok">Sign-ups open</span> : <span className="badge gray">Closed</span>}</div>
      <span className="small muted">{span(c)}{c.place ? ` · ${c.place}` : ''}</span>
      <span className="small"><b>{c.going}</b>{c.capacity ? ` of ${c.capacity}` : ''} going{c.fee ? ` · ${rupees(c.collected)} collected, ${rupees(c.due)} due` : ''}</span>
      {(c.roomless > 0 || c.busless > 0) && <span className="small muted">{c.roomless ? `${c.roomless} without a room` : ''}{c.roomless && c.busless ? ' · ' : ''}{c.busless ? `${c.busless} without a bus seat` : ''}</span>}
    </button>
  );
}

function CampScreen({ id, editable, onBack }: { id: string; editable: boolean; onBack: () => void }) {
  const q = useApi(() => AdminApi.camps.get(id), [id]);
  const toast = useToast();
  const [tab, setTab] = useState<'people' | 'rooms' | 'buses'>('people');
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const act = useAction(async (fn: () => Promise<CampDetail>, msg?: string) => { q.setData(await fn()); if (msg) toast(msg); });
  const del = useAction(async () => { await AdminApi.camps.remove(id); toast('Camp removed.'); onBack(); });
  const back = <button className="btn ghost sm" onClick={onBack}><ArrowLeft size={15} /> All camps</button>;
  if (q.error) return <><PageHeader title="Camp" actions={back} /><ErrorState error={q.error} onRetry={q.reload} /></>;
  if (!q.data) return <><PageHeader title="Camp" actions={back} /><Loading /></>;
  const c = q.data;
  const roomName = (rid: string | null) => c.rooms.find((r) => r.id === rid)?.name;
  return (
    <>
      <PageHeader title={c.name} subtitle={`${span(c)}${c.place ? ` · ${c.place}` : ''}${c.fee ? ` · ${rupees(c.fee)} per person` : ''}`} actions={back} />
      <div className="stack">
        <div className="stat-row">
          <div className="card card-pad co-stat"><span className="muted small">Going</span><b className="co-big">{c.going}</b><span className="small muted">{c.capacity ? `of ${c.capacity} places` : 'no limit'}</span></div>
          {c.fee > 0 && <div className="card card-pad co-stat"><span className="muted small">Collected</span><b className="co-big">{rupees(c.collected)}</b><span className="small muted">{c.paidUp} paid in full</span></div>}
          {c.fee > 0 && <div className={`card card-pad co-stat ${c.due ? 'sg-risk' : ''}`}><span className="muted small">Still due</span><b className="co-big">{rupees(c.due)}</b></div>}
          <div className="card card-pad co-stat"><span className="muted small">Without a room or seat</span><b className="co-big">{c.roomless + c.busless}</b><span className="small muted">{c.roomless} room · {c.busless} bus</span></div>
        </div>
        {editable && (
          <div className="row wrap" style={{ gap: 8 }}>
            <button className="btn sm" onClick={() => setAdding(true)}><UserPlus size={14} /> Add people</button>
            {(c.rooms.length > 0 || c.buses.length > 0) && <button className="btn sm primary" disabled={act.busy} onClick={() => void act.run(() => AdminApi.camps.assign(c.id), 'Rooms and seats filled. Adjust any by hand.')}><Wand2 size={14} /> Fill rooms and seats</button>}
            <button className="btn sm" onClick={() => setEditing(true)}>Edit camp, rooms and buses</button>
            <button className="btn sm ghost" onClick={() => void act.run(() => AdminApi.camps.update(c.id, { open: !c.open }), c.open ? 'Sign-ups closed.' : 'Sign-ups open.')}>{c.open ? 'Close sign-ups' : 'Open sign-ups'}</button>
            <button className="btn sm ghost" aria-label="Delete camp" onClick={() => { if (confirm(`Delete ${c.name} and its sign-ups?`)) void del.run(); }}><Trash2 size={14} /></button>
          </div>
        )}
        <FormError error={act.error ?? del.error} />
        <Segmented value={tab} onChange={setTab} options={[{ value: 'people', label: `People (${c.going})` }, { value: 'rooms', label: `Rooms (${c.rooms.length})` }, { value: 'buses', label: `Buses (${c.buses.length})` }]} />

        {tab === 'people' ? (
          !c.signups.length ? <Empty icon={<Tent size={28} />} title="Nobody yet" body={c.open ? 'Members see this camp in the app and can sign up their family.' : 'Open sign-ups so members can sign up from the app.'} /> : (
            <div className="card table-wrap">
              <table className="table">
                <thead><tr><th>Name</th><th>Medical and emergency</th><th>Room</th><th>Bus</th>{c.fee > 0 && <th>Paid</th>}{editable && <th />}</tr></thead>
                <tbody>
                  {c.signups.map((s) => (
                    <tr key={s.id}>
                      <td><b>{s.name}</b><div className="small muted">{[s.age != null ? `${s.age} yrs` : '', s.gender === 'male' ? 'M' : s.gender === 'female' ? 'F' : '', s.household].filter(Boolean).join(' · ')}</div></td>
                      <td className="small">{s.medical ? <span className="badge warn">{s.medical}</span> : <span className="muted">None</span>}{(s.emergencyName || s.emergencyPhone) && <div className="muted">{s.emergencyName} {s.emergencyPhone}</div>}</td>
                      <td>{editable && c.rooms.length ? (
                        <select value={s.roomId ?? ''} onChange={(e) => void act.run(() => AdminApi.camps.setSignup(c.id, s.id, { roomId: e.target.value || null }))}>
                          <option value="">No room</option>
                          {c.rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>) : <span className="small">{roomName(s.roomId) ?? '-'}</span>}</td>
                      <td>{!s.needsBus ? <span className="small muted">Own transport</span> : editable && c.buses.length ? (
                        <select value={s.busId ?? ''} onChange={(e) => void act.run(() => AdminApi.camps.setSignup(c.id, s.id, { busId: e.target.value || null }))}>
                          <option value="">No seat</option>
                          {c.buses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>) : <span className="small">{c.buses.find((b) => b.id === s.busId)?.name ?? '-'}</span>}</td>
                      {c.fee > 0 && <td>{editable ? <PaidCell paid={s.paid} fee={c.fee} onSave={(n) => void act.run(() => AdminApi.camps.setSignup(c.id, s.id, { paid: n }), 'Payment saved.')} /> : s.paid >= c.fee ? <span className="badge ok">Paid</span> : rupees(s.paid)}</td>}
                      {editable && <td><button className="btn sm ghost" onClick={() => { if (confirm(`Remove ${s.name} from the camp?`)) void act.run(() => AdminApi.camps.setSignup(c.id, s.id, { status: 'cancelled', roomId: null, busId: null })); }}>Remove</button></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          <div className="co-grid">
            {(tab === 'rooms' ? c.rooms : c.buses).map((x) => {
              const people = c.signups.filter((s) => (tab === 'rooms' ? s.roomId : s.busId) === x.id);
              const cap = 'beds' in x ? x.beds : x.seats;
              return (
                <div key={x.id} className="card card-pad stack" style={{ gap: 6 }}>
                  <div className="row" style={{ justifyContent: 'space-between' }}><b>{x.name}</b><span className={`small ${people.length >= cap ? '' : 'muted'}`}>{people.length} / {cap}</span></div>
                  {'for' in x && <span className="small muted">{FOR[x.for]}</span>}
                  <div className="vg-bar"><span style={{ width: `${Math.min(100, Math.round((people.length / cap) * 100))}%` }} /></div>
                  <span className="small">{people.map((p) => p.name).join(', ') || <span className="muted">Empty</span>}</span>
                </div>
              );
            })}
            {!(tab === 'rooms' ? c.rooms : c.buses).length && <p className="muted small">None added. Use “Edit camp, rooms and buses”.</p>}
          </div>
        )}
      </div>
      {editing && <CampForm camp={c} onClose={() => setEditing(false)} onDone={(d) => { q.setData(d); setEditing(false); toast('Camp saved.'); }} />}
      {adding && <AddPeople camp={c} onClose={() => setAdding(false)} onDone={(d) => { q.setData(d); setAdding(false); toast('Added.'); }} />}
    </>
  );
}

function PaidCell({ paid, fee, onSave }: { paid: number; fee: number; onSave: (n: number) => void }) {
  const [v, setV] = useState(String(paid));
  return (
    <div className="row" style={{ gap: 4 }}>
      <input className="input" style={{ width: 84 }} inputMode="numeric" value={v} onChange={(e) => setV(e.target.value.replace(/\D/g, ''))} onBlur={() => { if (Number(v) !== paid) onSave(Number(v)); }} />
      {paid < fee && <button className="btn sm ghost" title="Mark paid in full" onClick={() => { setV(String(fee)); onSave(fee); }}>Full</button>}
    </div>
  );
}

function AddPeople({ camp, onClose, onDone }: { camp: CampDetail; onClose: () => void; onDone: (d: CampDetail) => void }) {
  const [people, setPeople] = useState<PickedPerson[]>([]);
  const save = useAction(async (e: FormEvent) => { e.preventDefault(); if (!people.length) throw new Error('Choose at least one person.'); onDone(await AdminApi.camps.add(camp.id, people.map((p) => p.id))); });
  return (
    <Modal title={`Add people to ${camp.name}`} onClose={onClose}>
      <form className="stack" onSubmit={save.run}>
        {people.length > 0 && <div className="row wrap" style={{ gap: 6 }}>{people.map((p) => <span key={p.id} className="badge gray">{p.name}</span>)}</div>}
        <PersonSearch exclude={[...people.map((p) => p.id), ...camp.signups.map((s) => s.personId)]} onPick={(p) => setPeople((x) => [...x, p])} autoFocus />
        <FormError error={save.error} />
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={save.busy}>Add {people.length || ''}</button>
        </div>
      </form>
    </Modal>
  );
}

function CampForm({ camp, onClose, onDone }: { camp: Camp | null; onClose: () => void; onDone: (c: CampDetail) => void }) {
  const [f, setF] = useState({ name: camp?.name ?? '', startsOn: camp?.startsOn ?? '', endsOn: camp?.endsOn ?? '', place: camp?.place ?? '', fee: String(camp?.fee ?? ''), capacity: String(camp?.capacity || ''), note: camp?.note ?? '' });
  const [rooms, setRooms] = useState<CampRoom[]>(camp?.rooms ?? []);
  const [buses, setBuses] = useState<CampBus[]>(camp?.buses ?? []);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const save = useAction(async (e: FormEvent) => {
    e.preventDefault();
    const input = { ...f, fee: Number(f.fee) || 0, capacity: Number(f.capacity) || 0, endsOn: f.endsOn || f.startsOn, rooms, buses };
    onDone(camp ? await AdminApi.camps.update(camp.id, input) : await AdminApi.camps.create(input));
  });
  const newId = () => `new-${Math.random().toString(36).slice(2, 8)}`;
  return (
    <Modal title={camp ? 'Edit camp' : 'New camp'} onClose={onClose} wide>
      <form className="stack" onSubmit={save.run}>
        <Field label="Name"><input value={f.name} onChange={(e) => set('name', e.target.value)} maxLength={100} required placeholder="Youth camp 2026" /></Field>
        <div className="co-grid">
          <Field label="Starts"><input type="date" value={f.startsOn} onChange={(e) => set('startsOn', e.target.value)} required /></Field>
          <Field label="Ends"><input type="date" value={f.endsOn} min={f.startsOn} onChange={(e) => set('endsOn', e.target.value)} /></Field>
          <Field label="Fee per person (₹)"><input inputMode="numeric" value={f.fee} onChange={(e) => set('fee', e.target.value.replace(/\D/g, ''))} placeholder="0 for free" /></Field>
          <Field label="Places" hint="Leave empty for no limit."><input inputMode="numeric" value={f.capacity} onChange={(e) => set('capacity', e.target.value.replace(/\D/g, ''))} /></Field>
        </div>
        <Field label="Place"><input value={f.place} onChange={(e) => set('place', e.target.value)} maxLength={160} placeholder="Retreat centre, Vikarabad" /></Field>
        <Field label="Note for families" hint="Shown in the app: what to bring, departure time."><textarea rows={2} value={f.note} onChange={(e) => set('note', e.target.value)} maxLength={1000} /></Field>

        <b className="small">Rooms</b>
        {rooms.map((r, i) => (
          <div key={r.id} className="row wrap" style={{ gap: 6 }}>
            <input className="input grow" style={{ minWidth: 140 }} value={r.name} onChange={(e) => setRooms((x) => x.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)))} placeholder="Room name" aria-label="Room name" />
            <input className="input" style={{ width: 80 }} inputMode="numeric" value={r.beds} onChange={(e) => setRooms((x) => x.map((y, j) => (j === i ? { ...y, beds: Number(e.target.value.replace(/\D/g, '')) || 1 } : y)))} aria-label="Beds" />
            <select value={r.for} onChange={(e) => setRooms((x) => x.map((y, j) => (j === i ? { ...y, for: e.target.value as CampRoom['for'] } : y)))} aria-label="Room for">{Object.entries(FOR).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            <button type="button" className="btn sm ghost" aria-label="Remove room" onClick={() => setRooms((x) => x.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
          </div>
        ))}
        <div><button type="button" className="btn sm" onClick={() => setRooms((x) => [...x, { id: newId(), name: `Room ${x.length + 1}`, beds: 4, for: 'any' }])}><Plus size={14} /> Add room</button></div>

        <b className="small">Buses</b>
        {buses.map((b, i) => (
          <div key={b.id} className="row wrap" style={{ gap: 6 }}>
            <input className="input grow" style={{ minWidth: 140 }} value={b.name} onChange={(e) => setBuses((x) => x.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)))} aria-label="Bus name" />
            <input className="input" style={{ width: 80 }} inputMode="numeric" value={b.seats} onChange={(e) => setBuses((x) => x.map((y, j) => (j === i ? { ...y, seats: Number(e.target.value.replace(/\D/g, '')) || 1 } : y)))} aria-label="Seats" />
            <button type="button" className="btn sm ghost" aria-label="Remove bus" onClick={() => setBuses((x) => x.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
          </div>
        ))}
        <div><button type="button" className="btn sm" onClick={() => setBuses((x) => [...x, { id: newId(), name: `Bus ${x.length + 1}`, seats: 40 }])}><Plus size={14} /> Add bus</button></div>

        <FormError error={save.error} />
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={save.busy}>{camp ? 'Save' : 'Create camp'}</button>
        </div>
      </form>
    </Modal>
  );
}
