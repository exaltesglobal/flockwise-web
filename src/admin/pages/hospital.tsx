// Care › Hospital: one tap marks someone as admitted. Their zone leader and the pastors are told,
// the prayer chain is asked to pray (no medical details), and a meal and visit rota opens in the
// app. "Home" closes the rota and sends a check-in two days later.
import { BedDouble, CalendarPlus, Home, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { AdminApi } from '@/api/endpoints';
import type { HospitalStayView } from '@/core/types';
import { PersonSearch } from '@/admin/components/person-picker';
import { Empty, ErrorState, Field, FormError, Loading, Modal, useHiddenRows, useToast, useUndoableDelete } from '@/components/ui';
import { formatDay } from '@/lib/format';
import { useAction, useApi } from '@/lib/use-api';

import { PageHeader } from '../layout';

const day = (d: string) => formatDay(`${d}T12:00:00`);

export function HospitalPage() {
  const q = useApi(AdminApi.hospital.list);
  const [admitting, setAdmitting] = useState(false);
  const rows = useHiddenRows();
  const undoable = useUndoableDelete();
  const title = 'Hospital';
  const action = <button className="btn primary" onClick={() => setAdmitting(true)}><Plus size={15} /> Someone is admitted</button>;
  if (q.error) return <><PageHeader title={title} /><ErrorState error={q.error} onRetry={q.reload} /></>;
  if (!q.data) return <><PageHeader title={title} /><Loading /></>;
  const list = q.data.filter((s) => !rows.hidden.has(s.id));
  const open = list.filter((s) => !s.dischargedOn);
  const home = list.filter((s) => s.dischargedOn);
  const replace = (s: HospitalStayView) => q.setData(q.data!.map((x) => (x.id === s.id ? s : x)));
  return (
    <>
      <PageHeader title={title} subtitle="When someone is admitted, mark it here. Their zone leader and pastors are told, the prayer chain is asked to pray (no medical details are shared), and a meal and visit rota opens for their zone, groups and family to fill in the app. Two days after they go home, they get a check-in." actions={action} />
      {!open.length ? (
        <Empty icon={<BedDouble size={28} />} title="No one in hospital" body="When someone is admitted, mark it here. It takes a few seconds." action={action} />
      ) : (
        <div className="stack">{open.map((s) => <StayCard key={s.id} s={s} onChange={replace} />)}</div>
      )}
      {home.length > 0 && (
        <section className="card" style={{ marginTop: 16 }}>
          <div className="card-pad" style={{ paddingBottom: 0 }}><b>Home again</b></div>
          {home.map((s) => (
            <div key={s.id} className="list-row">
              <div className="grow">
                <a href={`/admin/people?open=${s.personId}`} style={{ fontWeight: 600 }}>{s.name}</a>
                <div className="small muted">{s.hospital} · {day(s.admittedOn)} to {day(s.dischargedOn!)} · {s.filled} {s.filled === 1 ? 'meal or visit' : 'meals and visits'} given{s.checkInSentAt ? ' · check-in sent' : s.checkInDue ? ` · check-in on ${formatDay(s.checkInDue)}` : ''}</div>
              </div>
              <button className="btn ghost icon sm danger" aria-label="Delete" onClick={() => undoable({ text: 'Hospital stay deleted.', hide: () => rows.hide(s.id), show: () => rows.show(s.id), run: () => AdminApi.hospital.remove(s.id), done: q.reload })}><Trash2 size={15} /></button>
            </div>
          ))}
        </section>
      )}
      {admitting && <AdmitModal exclude={open.map((s) => s.personId)} onClose={() => setAdmitting(false)} onSaved={() => { setAdmitting(false); void q.reload(); }} />}
    </>
  );
}

function StayCard({ s, onChange }: { s: HospitalStayView; onChange: (s: HospitalStayView) => void }) {
  const toast = useToast();
  const [note, setNote] = useState(s.note ?? '');
  const more = useAction(async () => onChange(await AdminApi.hospital.update(s.id, { addDays: 3 })));
  const saveNote = useAction(async () => { onChange(await AdminApi.hospital.update(s.id, { note })); toast('Note saved'); });
  const discharge = useAction(async () => { onChange(await AdminApi.hospital.discharge(s.id)); toast(`${s.name.split(' ')[0]} is home. A check-in goes in two days.`); });
  const dates = [...new Set(s.slots.map((x) => x.date))].sort();
  return (
    <article className="card card-pad stack" style={{ gap: 10 }}>
      <div className="row between wrap" style={{ gap: 8, alignItems: 'flex-start' }}>
        <div>
          <a href={`/admin/people?open=${s.personId}`} style={{ fontWeight: 700, fontSize: 17 }}>{s.name}</a>
          <div className="small muted">{s.hospital}{s.ward ? `, ${s.ward}` : ''} · since {day(s.admittedOn)}{s.zone ? ` · ${s.zone}` : ''}</div>
          <div className="small muted">Told: {s.told.pastors} on the care team, {s.told.leaders} zone {s.told.leaders === 1 ? 'leader' : 'leaders'}, {s.told.chain} on the prayer chain</div>
        </div>
        <div className="row wrap" style={{ gap: 6 }}>
          {s.phone && <a className="btn sm" href={`tel:${s.phone}`}>Call</a>}
          <button className="btn sm" disabled={more.busy} onClick={() => void more.run()}><CalendarPlus size={14} /> 3 more days</button>
          <button className="btn sm primary" disabled={discharge.busy} onClick={() => void discharge.run()}><Home size={14} /> Home</button>
        </div>
      </div>
      {dates.length > 0 && (
        <div className="hs-grid">
          {dates.map((d) => (
            <div key={d} className="hs-day">
              <b className="small">{day(d)}</b>
              {s.slots.filter((x) => x.date === d).map((x) => (
                <div key={x.id} className={`hs-slot ${x.takenBy ? 'taken' : ''}`}>
                  <span className="small muted">{x.kind === 'meal' ? 'Meal' : 'Visit'}</span>
                  <span className="small">{x.takenName ?? 'Open'}{x.note ? ` · ${x.note}` : ''}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
      <form className="row" style={{ gap: 6 }} onSubmit={(e) => { e.preventDefault(); void saveNote.run(); }}>
        <input className="input grow" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Private note for the care team (never sent to members)" maxLength={500} aria-label="Private note" />
        {note !== (s.note ?? '') && <button className="btn sm" disabled={saveNote.busy}>Save</button>}
      </form>
      <FormError error={more.error ?? discharge.error ?? saveNote.error} />
    </article>
  );
}

function AdmitModal({ exclude, onClose, onSaved }: { exclude: string[]; onClose: () => void; onSaved: () => void }) {
  const [who, setWho] = useState<{ id: string; name: string } | null>(null);
  const [form, setForm] = useState({ hospital: '', ward: '', note: '', days: '5', meals: true, visits: true, tellChain: true });
  const save = useAction(async () => { if (who) { await AdminApi.hospital.admit({ personId: who.id, hospital: form.hospital, ward: form.ward || undefined, note: form.note || undefined, days: Number(form.days) || 5, meals: form.meals, visits: form.visits, tellChain: form.tellChain }); onSaved(); } });
  const set = (k: keyof typeof form) => (e: { target: { value: string; checked?: boolean; type?: string } }) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? !!e.target.checked : e.target.value });
  return (
    <Modal title="Someone is in hospital" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!who || !form.hospital.trim() || save.busy} onClick={() => void save.run()}>Tell everyone</button></>}>
      <div className="stack">
        {who ? <div className="row between"><b>{who.name}</b><button className="btn sm ghost" onClick={() => setWho(null)}>Change</button></div> : <PersonSearch onPick={(p) => setWho(p)} exclude={exclude} autoFocus />}
        <div className="row wrap" style={{ gap: 10 }}>
          <div className="grow"><Field label="Hospital"><input className="input" value={form.hospital} onChange={set('hospital')} placeholder="e.g. Apollo, Jubilee Hills" maxLength={120} /></Field></div>
          <div style={{ width: 140 }}><Field label="Ward or room"><input className="input" value={form.ward} onChange={set('ward')} maxLength={60} /></Field></div>
        </div>
        <Field label="Private note (optional)" hint="Only the care team sees this. Never sent to members or the prayer chain.">
          <input className="input" value={form.note} onChange={set('note')} maxLength={500} />
        </Field>
        <div className="row wrap" style={{ gap: 14 }}>
          <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={form.meals} onChange={set('meals')} /> Meal rota</label>
          <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={form.visits} onChange={set('visits')} /> Visit rota</label>
          <label className="row" style={{ gap: 6 }}>for <input className="input" style={{ width: 56 }} inputMode="numeric" value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value.replace(/\D/g, '').slice(0, 2) })} aria-label="Days" /> days</label>
        </div>
        <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={form.tellChain} onChange={set('tellChain')} /> Ask the prayer chain to pray (first name only, no hospital details)</label>
        <FormError error={save.error} />
      </div>
    </Modal>
  );
}
