// Care › Moving away: members moving to another city for work. Suggest a church there (the church's
// own partners, or churches on Flockwise that welcome introductions) and, once the person agrees,
// send a warm introduction. A month later, check they found a home.
import { Check, Copy, MapPinned, Plus, Settings2, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { AdminApi } from '@/api/endpoints';
import type { MoveStatus, MoveView, MovesHub, OwnPartnerChurch, PartnerChurch } from '@/core/types';
import { PersonSearch } from '@/admin/components/person-picker';
import { Empty, ErrorState, Field, FormError, Loading, Modal, useHiddenRows, useToast, useUndoableDelete } from '@/components/ui';
import { formatDay } from '@/lib/format';
import { useAction, useApi } from '@/lib/use-api';

import { PageHeader } from '../layout';

const STATUS: Record<MoveStatus, { label: string; tone: string }> = { planning: { label: 'Planning', tone: 'gray' }, introduced: { label: 'Introduced', tone: 'accent' }, settled: { label: 'Found a church', tone: 'ok' }, lost: { label: 'Lost touch', tone: 'warn' } };
const day = (d: string) => formatDay(`${d}T12:00:00`);
const today = () => new Date().toISOString().slice(0, 10);

export function MovesPage() {
  const q = useApi(AdminApi.moves.get);
  const [adding, setAdding] = useState(false);
  const [partners, setPartners] = useState(false);
  const rows = useHiddenRows();
  const undoable = useUndoableDelete();
  const title = 'Moving away';
  const actions = <>
    <button className="btn" onClick={() => setPartners(true)}><Settings2 size={15} /> Partner churches</button>
    <button className="btn primary" onClick={() => setAdding(true)}><Plus size={15} /> Someone is moving</button>
  </>;
  if (q.error) return <><PageHeader title={title} /><ErrorState error={q.error} onRetry={q.reload} /></>;
  if (!q.data) return <><PageHeader title={title} /><Loading /></>;
  const d = q.data;
  const moves = d.moves.filter((m) => !rows.hidden.has(m.id));
  const due = moves.filter((m) => m.status === 'introduced' && m.checkBackOn && m.checkBackOn <= today());
  return (
    <>
      <PageHeader title={title} subtitle="When someone moves city for work, suggest a church near their new home and, once they agree, send a warm introduction. Members can also do this themselves from Me in the app. A month later you are reminded to check they found a church family." actions={actions} />
      {due.length > 0 && <div className="card card-pad" style={{ marginBottom: 12 }}><b>{due.length === 1 ? '1 person to check on' : `${due.length} people to check on`}:</b> <span className="muted">{due.map((m) => m.name.split(' ')[0]).join(', ')}. Did they find a church?</span></div>}
      {!moves.length ? (
        <Empty icon={<MapPinned size={28} />} title="No one is moving right now" body="Add someone who is moving to another city, or add the churches you trust in other cities first." action={<button className="btn primary" onClick={() => setAdding(true)}>Someone is moving</button>} />
      ) : (
        <div className="stack">{moves.map((m) => <MoveCard key={m.id} m={m} onChange={q.setData} onDelete={() => undoable({ text: 'Removed.', hide: () => rows.hide(m.id), show: () => rows.show(m.id), run: () => AdminApi.moves.remove(m.id), done: q.reload })} />)}</div>
      )}
      {adding && <AddModal onClose={() => setAdding(false)} onSaved={(h) => { q.setData(h); setAdding(false); }} />}
      {partners && <PartnersModal d={d} onClose={() => setPartners(false)} onSaved={(h) => { q.setData(h); setPartners(false); }} />}
    </>
  );
}

function MoveCard({ m, onChange, onDelete }: { m: MoveView; onChange: (h: MovesHub) => void; onDelete: () => void }) {
  const toast = useToast();
  const [choosing, setChoosing] = useState(false);
  const status = useAction(async (s: MoveStatus) => onChange(await AdminApi.moves.update(m.id, { status: s })));
  const s = STATUS[m.status];
  const copy = async () => { try { await navigator.clipboard.writeText(m.introText!); toast('Copied. Paste it into WhatsApp.'); } catch { toast('Select the text and copy it.', 'error'); } };
  return (
    <article className="card card-pad stack" style={{ gap: 8 }}>
      <div className="row between wrap" style={{ gap: 8, alignItems: 'flex-start' }}>
        <div>
          <a href={`/admin/people?open=${m.personId}`} style={{ fontWeight: 700, fontSize: 16 }}>{m.name}</a> <span className={`badge ${s.tone}`}>{s.label}</span>
          <div className="small muted">To {m.toCity}{m.movingOn ? ` around ${day(m.movingOn)}` : ''}{m.source === 'member' ? ' · told us in the app' : ''}</div>
          {m.partner && <div className="small">Introduced to <b>{m.partner.name}</b>{m.introducedAt ? ` on ${formatDay(m.introducedAt)}` : ''}{m.consentBy ? ` · ${m.consentBy === 'member' ? 'they agreed in the app' : 'agreed, recorded by the office'}` : ''}</div>}
          {m.note && <div className="small muted">{m.note}</div>}
        </div>
        <div className="row wrap" style={{ gap: 6 }}>
          {m.status === 'planning' && <button className="btn sm primary" onClick={() => setChoosing(true)}>Find a church</button>}
          {m.status === 'introduced' && <><button className="btn sm" disabled={status.busy} onClick={() => void status.run('settled')}><Check size={14} /> Found a church</button><button className="btn sm ghost" disabled={status.busy} onClick={() => void status.run('lost')}>Lost touch</button></>}
          <button className="btn ghost icon sm danger" aria-label="Remove" onClick={onDelete}><Trash2 size={15} /></button>
        </div>
      </div>
      {m.introText && m.status === 'introduced' && (
        <div className="card card-pad stack" style={{ gap: 6, background: 'var(--surface-2, transparent)' }}>
          <span className="small muted">This church has only a phone number. Send them this on WhatsApp{m.partner?.contact ? ` (${m.partner.contact})` : ''}:</span>
          <span className="small">{m.introText}</span>
          <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => void copy()}><Copy size={13} /> Copy</button>
        </div>
      )}
      {m.status === 'introduced' && m.checkBackOn && <span className="small muted">Check on them around {day(m.checkBackOn)}.</span>}
      <FormError error={status.error} />
      {choosing && <ChooseModal m={m} onClose={() => setChoosing(false)} onSaved={(h) => { onChange(h); setChoosing(false); toast('Introduction sent'); }} />}
    </article>
  );
}

function ChooseModal({ m, onClose, onSaved }: { m: MoveView; onClose: () => void; onSaved: (h: MovesHub) => void }) {
  const list = useApi(() => AdminApi.moves.suggest(m.toCity), [m.toCity]);
  const [pick, setPick] = useState<PartnerChurch | null>(null);
  const [consent, setConsent] = useState(!!m.consentAt);
  const send = useAction(async () => { if (pick) onSaved(await AdminApi.moves.introduce(m.id, pick.ref, consent)); });
  return (
    <Modal title={`A church in ${m.toCity}`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!pick || !consent || send.busy} onClick={() => void send.run()}>Send the introduction</button></>}>
      <div className="stack">
        {list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : !list.data ? <Loading /> : !list.data.length ? (
          <p className="muted">No church in {m.toCity} on your partner list or on Flockwise yet. Add one under Partner churches.</p>
        ) : list.data.map((c) => (
          <label key={c.ref} className={`card card-pad row ${pick?.ref === c.ref ? 'on' : ''}`} style={{ gap: 10, cursor: 'pointer' }}>
            <input type="radio" checked={pick?.ref === c.ref} onChange={() => setPick(c)} />
            <span className="grow"><b>{c.name}</b> <span className="small muted">· {c.city}{c.onFlockwise ? ' · on Flockwise' : ''}</span>{c.contact && <span className="small muted" style={{ display: 'block' }}>{c.contact}</span>}</span>
          </label>
        ))}
        <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} disabled={!!m.consentAt} /> {m.name.split(' ')[0]} agreed to be introduced, with their phone and email</label>
        <span className="small muted">A church on Flockwise gets them as a visitor with a welcome follow-up. A partner with email gets an email. For a phone-only partner you get the message to send on WhatsApp.</span>
        <FormError error={send.error} />
      </div>
    </Modal>
  );
}

function AddModal({ onClose, onSaved }: { onClose: () => void; onSaved: (h: MovesHub) => void }) {
  const [who, setWho] = useState<{ id: string; name: string } | null>(null);
  const [form, setForm] = useState({ toCity: '', movingOn: '', note: '' });
  const save = useAction(async () => { if (who) onSaved(await AdminApi.moves.add({ personId: who.id, toCity: form.toCity, movingOn: form.movingOn || undefined, note: form.note || undefined })); });
  return (
    <Modal title="Someone is moving" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!who || form.toCity.trim().length < 2 || save.busy} onClick={() => void save.run()}>Save</button></>}>
      <div className="stack">
        {who ? <div className="row between"><b>{who.name}</b><button className="btn sm ghost" onClick={() => setWho(null)}>Change</button></div> : <PersonSearch onPick={(p) => setWho(p)} autoFocus />}
        <div className="row wrap" style={{ gap: 10 }}>
          <div className="grow"><Field label="Moving to (city)"><input className="input" value={form.toCity} onChange={(e) => setForm({ ...form, toCity: e.target.value })} placeholder="e.g. Pune" maxLength={60} /></Field></div>
          <div><Field label="Around"><input className="input" type="date" value={form.movingOn} onChange={(e) => setForm({ ...form, movingOn: e.target.value })} /></Field></div>
        </div>
        <Field label="Note (optional)"><input className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="e.g. New job at Infosys, Hinjewadi" maxLength={300} /></Field>
        <FormError error={save.error} />
      </div>
    </Modal>
  );
}

function PartnersModal({ d, onClose, onSaved }: { d: MovesHub; onClose: () => void; onSaved: (h: MovesHub) => void }) {
  const [list, setList] = useState<Partial<OwnPartnerChurch>[]>(d.partners.map((p) => ({ ...p })));
  const [welcome, setWelcome] = useState(d.welcomeIntroductions);
  useEffect(() => { if (!list.length) setList([{ name: '', city: '' }]); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const save = useAction(async () => onSaved(await AdminApi.moves.partners(list.filter((p) => p.name?.trim() || p.city?.trim()), welcome)));
  const set = (i: number, k: keyof OwnPartnerChurch, v: string) => setList((xs) => xs.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  return (
    <Modal title="Partner churches" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={save.busy} onClick={() => void save.run()}>Save</button></>}>
      <div className="stack">
        <span className="small muted">Churches you trust in other cities. They are suggested first when someone moves there.</span>
        {list.map((p, i) => (
          <div key={i} className="card card-pad stack" style={{ gap: 6 }}>
            <div className="row" style={{ gap: 6 }}>
              <input className="input grow" value={p.name ?? ''} onChange={(e) => set(i, 'name', e.target.value)} placeholder="Church name" maxLength={80} aria-label="Church name" />
              <input className="input" style={{ width: 140 }} value={p.city ?? ''} onChange={(e) => set(i, 'city', e.target.value)} placeholder="City" maxLength={60} aria-label="City" />
              <button className="btn ghost icon sm" aria-label="Remove" onClick={() => setList((xs) => xs.filter((_, j) => j !== i))}><X size={14} /></button>
            </div>
            <div className="row wrap" style={{ gap: 6 }}>
              <input className="input grow" value={p.contactName ?? ''} onChange={(e) => set(i, 'contactName', e.target.value)} placeholder="Pastor or contact" maxLength={60} aria-label="Contact" />
              <input className="input" style={{ width: 150 }} value={p.phone ?? ''} onChange={(e) => set(i, 'phone', e.target.value)} placeholder="Phone" maxLength={20} aria-label="Phone" />
              <input className="input grow" value={p.email ?? ''} onChange={(e) => set(i, 'email', e.target.value)} placeholder="Email" maxLength={120} aria-label="Email" />
            </div>
          </div>
        ))}
        <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setList((xs) => [...xs, { name: '', city: '' }])}><Plus size={13} /> Add a church</button>
        {d.onFlockwise && <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={welcome} onChange={(e) => setWelcome(e.target.checked)} /> Let churches elsewhere on Flockwise introduce people moving to our city (needs the public page on)</label>}
        <FormError error={save.error} />
      </div>
    </Modal>
  );
}
