// Care › Prayer vigils: 24-hour prayer chains, all-night watches and fasting chains. The time is cut
// into slots; members take one from the app, the office fills the gaps, and everyone is reminded.
import { ArrowLeft, Copy, Hourglass, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import { AdminApi } from '@/api/endpoints';
import type { Vigil, VigilDetail, VigilKind, VigilSlot, VigilView } from '@/core/types';
import { Empty, ErrorState, Field, FormError, Loading, Modal, Segmented, useToast } from '@/components/ui';
import { formatDay, formatTime, toLocalInput } from '@/lib/format';
import { useAction, useApi } from '@/lib/use-api';

import { PersonSearch } from '../components/person-picker';
import { PageHeader } from '../layout';

const SIZES: { value: number; label: string }[] = [
  { value: 15, label: '15 minutes' }, { value: 30, label: '30 minutes' }, { value: 60, label: '1 hour' }, { value: 120, label: '2 hours' },
  { value: 180, label: '3 hours' }, { value: 360, label: '6 hours' }, { value: 720, label: 'Half a day' }, { value: 1440, label: 'A whole day' },
];
const slotLabel = (v: Pick<Vigil, 'slotMinutes'>, s: { start: string; end: string }) => (v.slotMinutes >= 1440 ? formatDay(s.start) : `${formatTime(s.start)} – ${formatTime(s.end)}`);
const pct = (v: VigilView) => (v.slots ? Math.round((100 * v.covered) / v.slots) : 0);

export function VigilsPage() {
  const [open, setOpen] = useState<string | null>(null);
  return open ? <VigilScreen id={open} onBack={() => setOpen(null)} /> : <VigilList onOpen={setOpen} />;
}

function VigilList({ onOpen }: { onOpen: (id: string) => void }) {
  const q = useApi(AdminApi.vigils.list);
  const [creating, setCreating] = useState(false);
  if (q.error) return <><PageHeader title="Prayer vigils" /><ErrorState error={q.error} onRetry={q.reload} /></>;
  if (!q.data) return <><PageHeader title="Prayer vigils" /><Loading /></>;
  const list = q.data.vigils;
  return (
    <>
      <PageHeader
        title="Prayer vigils"
        subtitle="A 24-hour prayer chain, an all-night watch, 21 days of fasting. Members take a slot in the app until every hour is covered, and get a reminder before theirs."
        actions={<button className="btn primary" onClick={() => setCreating(true)}><Plus size={16} /> New vigil</button>}
      />
      {!list.length ? (
        <Empty icon={<Hourglass size={28} />} title="No vigils yet" body="Start a prayer chain before a convention or a fasting chain for the new year." action={<button className="btn primary" onClick={() => setCreating(true)}>Start one</button>} />
      ) : (
        <div className="co-grid">
          {list.map((v) => (
            <button key={v.id} className="card card-pad co-card" onClick={() => onOpen(v.id)}>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <b>{v.name}</b>
                <span className={`badge ${v.status === 'closed' ? 'gray' : v.kind === 'fasting' ? 'warn' : 'ok'}`}>{v.status === 'closed' ? 'Closed' : v.kind === 'fasting' ? 'Fasting' : 'Prayer'}</span>
              </div>
              <div className="small muted">{formatDay(v.startsAt)}, {formatTime(v.startsAt)} to {formatDay(v.endsAt)}, {formatTime(v.endsAt)}</div>
              <div className="vg-bar" aria-label={`${pct(v)}% covered`}><span style={{ width: `${pct(v)}%` }} /></div>
              <div className="small"><b>{v.covered}</b> of {v.slots} slots covered · {v.people} {v.people === 1 ? 'person' : 'people'}</div>
              {v.nextGap && v.status === 'open' && <div className="small vg-gap">First gap: {formatDay(v.nextGap)}{v.slotMinutes < 1440 ? `, ${formatTime(v.nextGap)}` : ''}</div>}
            </button>
          ))}
        </div>
      )}
      {creating && <VigilForm onClose={() => setCreating(false)} onDone={(v) => { setCreating(false); onOpen(v.id); }} />}
    </>
  );
}

function VigilForm({ vigil, onClose, onDone }: { vigil?: VigilDetail; onClose: () => void; onDone: (v: VigilDetail) => void }) {
  const [kind, setKind] = useState<VigilKind>(vigil?.kind ?? 'prayer');
  const [name, setName] = useState(vigil?.name ?? '');
  const [purpose, setPurpose] = useState(vigil?.purpose ?? '');
  const [startsAt, setStarts] = useState(vigil ? toLocalInput(vigil.startsAt) : '');
  const [endsAt, setEnds] = useState(vigil ? toLocalInput(vigil.endsAt) : '');
  const [slotMinutes, setSlot] = useState(vigil?.slotMinutes ?? 60);
  const [perSlot, setPer] = useState(vigil?.perSlot ? String(vigil.perSlot) : '');
  const [location, setLocation] = useState(vigil?.location ?? '');
  const slots = startsAt && endsAt ? Math.max(0, Math.ceil((Date.parse(endsAt) - Date.parse(startsAt)) / (slotMinutes * 60000))) : 0;
  const save = useAction(async (e: FormEvent) => {
    e.preventDefault();
    const input = { kind, name, purpose, startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString(), slotMinutes, perSlot: Number(perSlot) || null, location };
    onDone(vigil ? await AdminApi.vigils.update(vigil.id, input) : await AdminApi.vigils.create(input));
  });
  const pickKind = (k: VigilKind) => { setKind(k); if (!vigil) setSlot(k === 'fasting' ? 1440 : 60); };
  return (
    <Modal title={vigil ? `Edit ${vigil.name}` : 'New vigil'} onClose={onClose}>
      <form className="stack" onSubmit={save.run}>
        <Segmented value={kind} onChange={pickKind} options={[{ value: 'prayer', label: 'Prayer chain' }, { value: 'fasting', label: 'Fasting chain' }]} />
        <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required placeholder={kind === 'fasting' ? '21 days of fasting' : '24-hour prayer chain'} /></Field>
        <Field label="What we are praying for" hint="Members see this, and it goes in their reminder."><textarea rows={3} value={purpose} onChange={(e) => setPurpose(e.target.value)} maxLength={600} placeholder="The gospel convention, the sick in our church, our nation" /></Field>
        <div className="row wrap">
          <Field label="Starts"><input type="datetime-local" value={startsAt} onChange={(e) => setStarts(e.target.value)} required /></Field>
          <Field label="Ends"><input type="datetime-local" value={endsAt} onChange={(e) => setEnds(e.target.value)} required /></Field>
        </div>
        <div className="row wrap">
          <Field label="Each slot"><select value={slotMinutes} onChange={(e) => setSlot(Number(e.target.value))}>{SIZES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select></Field>
          <Field label="People per slot" hint="Blank for any number."><input type="number" min={1} value={perSlot} onChange={(e) => setPer(e.target.value)} style={{ width: 100 }} /></Field>
          <Field label="Where"><input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={120} placeholder={kind === 'fasting' ? '' : 'At home, or the prayer room'} /></Field>
        </div>
        {slots > 0 && <p className="small muted" style={{ margin: 0 }}>That makes {slots} slot{slots === 1 ? '' : 's'}.{vigil ? ' Sign-ups on slots that no longer exist are removed.' : ''}</p>}
        <FormError error={save.error} />
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={save.busy}>{vigil ? 'Save' : 'Create'}</button>
        </div>
      </form>
    </Modal>
  );
}

function VigilScreen({ id, onBack }: { id: string; onBack: () => void }) {
  const q = useApi(() => AdminApi.vigils.get(id), [id]);
  const toast = useToast();
  const [v, setV] = useState<VigilDetail | null>(null);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'gaps'>('all');
  const act = useAction(async (fn: () => Promise<VigilDetail>) => setV(await fn()));
  const remove = useAction(async () => { await AdminApi.vigils.remove(id); onBack(); });
  const vigil = v ?? q.data;
  if (q.error) return <><PageHeader title="Prayer vigil" /><ErrorState error={q.error} onRetry={q.reload} /></>;
  if (!vigil) return <><PageHeader title="Prayer vigil" /><Loading /></>;

  const days = new Map<string, VigilSlot[]>();
  for (const s of vigil.slotList) {
    if (filter === 'gaps' && s.people.length) continue;
    const k = formatDay(s.start);
    days.set(k, [...(days.get(k) ?? []), s]);
  }
  const invite = async () => {
    const text = `🙏 ${vigil.name}\n${vigil.purpose ? `${vigil.purpose}\n` : ''}${vigil.covered} of ${vigil.slots} slots are taken. Please take ${vigil.kind === 'fasting' ? 'a day' : 'an hour'}: ${window.location.origin}/app/vigils`;
    try { await navigator.clipboard.writeText(text); toast('Invitation copied. Paste it in your WhatsApp groups.'); } catch { toast(text); }
  };

  return (
    <>
      <PageHeader
        title={vigil.name}
        subtitle={`${formatDay(vigil.startsAt)}, ${formatTime(vigil.startsAt)} to ${formatDay(vigil.endsAt)}, ${formatTime(vigil.endsAt)} · ${SIZES.find((s) => s.value === vigil.slotMinutes)?.label.toLowerCase()} slots${vigil.perSlot ? `, ${vigil.perSlot} per slot` : ''}${vigil.location ? ` · ${vigil.location}` : ''}`}
        actions={<>
          <button className="btn ghost" onClick={onBack}><ArrowLeft size={16} /> All vigils</button>
          <button className="btn" onClick={invite}><Copy size={14} /> Copy invitation</button>
          <button className="btn" onClick={() => setEditing(true)}><Pencil size={14} /> Edit</button>
        </>}
      />
      <div className="stack">
        {vigil.purpose && <p className="muted" style={{ margin: 0, maxWidth: '65ch' }}>{vigil.purpose}</p>}
        <div className="card card-pad stack" style={{ gap: 8 }}>
          <div className="row wrap" style={{ justifyContent: 'space-between' }}>
            <span><b className="co-big" style={{ display: 'inline' }}>{vigil.covered}</b> of {vigil.slots} slots covered · {vigil.people} {vigil.people === 1 ? 'person' : 'people'}</span>
            {vigil.nextGap && vigil.status === 'open' && <span className="small vg-gap">First gap: {formatDay(vigil.nextGap)}{vigil.slotMinutes < 1440 ? `, ${formatTime(vigil.nextGap)}` : ''}</span>}
          </div>
          <div className="vg-bar"><span style={{ width: `${pct(vigil)}%` }} /></div>
        </div>
        <Segmented value={filter} onChange={setFilter} options={[{ value: 'all', label: `Every slot (${vigil.slots})` }, { value: 'gaps', label: `Gaps (${vigil.slots - vigil.covered})` }]} />
        <FormError error={act.error} />
        {!days.size && <Empty icon={<Hourglass size={28} />} title="Every slot is covered" />}
        {[...days].map(([day, slots]) => (
          <div key={day} className="card">
            {vigil.slotMinutes < 1440 && <div className="vg-day">{day}</div>}
            {slots.map((s) => (
              <div key={s.start} className={`vg-slot ${s.people.length ? '' : 'vg-open'}`}>
                <span className="vg-time">{slotLabel(vigil, s)}</span>
                <div className="vg-people">
                  {s.people.map((p) => (
                    <span key={p.signupId} className="vg-chip">{p.name}<button aria-label={`Remove ${p.name}`} onClick={() => void act.run(() => AdminApi.vigils.drop(vigil.id, p.signupId))}><X size={12} /></button></span>
                  ))}
                  {!s.people.length && <span className="small muted">Nobody yet</span>}
                </div>
                {(!vigil.perSlot || s.people.length < vigil.perSlot) && (adding === s.start ? (
                  <div className="vg-add"><PersonSearch autoFocus exclude={s.people.map((p) => p.personId)} placeholder="Who will take this slot?" onPick={(p) => { setAdding(null); void act.run(() => AdminApi.vigils.add(vigil.id, p.id, s.start)); }} /></div>
                ) : (
                  <button className="btn sm ghost" onClick={() => setAdding(s.start)}><Plus size={14} /> Add</button>
                ))}
              </div>
            ))}
          </div>
        ))}
        <div className="row wrap">
          <button className="btn" onClick={() => void act.run(() => AdminApi.vigils.update(vigil.id, { status: vigil.status === 'open' ? 'closed' : 'open' }))}>{vigil.status === 'open' ? 'Close sign-ups' : 'Reopen sign-ups'}</button>
          <button className="btn danger" onClick={() => { if (confirm(`Delete ${vigil.name} and all its sign-ups?`)) void remove.run(); }}><Trash2 size={14} /> Delete</button>
        </div>
        <FormError error={remove.error} />
      </div>
      {editing && <VigilForm vigil={vigil} onClose={() => setEditing(false)} onDone={(next) => { setEditing(false); setV(next); toast('Saved.'); }} />}
    </>
  );
}
