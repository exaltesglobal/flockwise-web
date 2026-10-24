// Care › Emergency alert: who is told when a pastor or member presses the safety button in the app.
// Choose the leaders who respond (they see the live location), the legal-aid contacts (WhatsApp and
// SMS with a link), whether the prayer chain is asked to pray and for how long the location is
// shared. Past alerts are listed for care staff, with a note of what followed.
import { MapPin, Plus, ShieldAlert, Trash2, X } from 'lucide-react';
import { useState } from 'react';

import { AdminApi } from '@/api/endpoints';
import type { SafetyAlertView, SafetyHub, SafetyLegalContact } from '@/core/types';
import { ErrorState, Field, FormError, Loading, useToast } from '@/components/ui';
import { formatDate, formatTime } from '@/lib/format';
import { useAction, useApi } from '@/lib/use-api';

import { PersonSearch } from '../components/person-picker';
import { PageHeader } from '../layout';

const KIND: Record<SafetyAlertView['kind'], string> = { threat: 'Threats', violence: 'Violence', police: 'Police or arrest', mob: 'A mob', medical: 'Medical', other: 'Other' };

export function SafetyPage() {
  const q = useApi(AdminApi.safety.get);
  const [hub, setHub] = useState<SafetyHub | null>(null);
  const d = hub ?? q.data;
  const title = 'Emergency alert';
  if (q.error) return <><PageHeader title={title} /><ErrorState error={q.error} onRetry={q.reload} /></>;
  if (!d) return <><PageHeader title={title} /><Loading /></>;
  const active = d.alerts.filter((a) => a.status === 'active');
  return (
    <>
      <PageHeader title={title} subtitle="If a pastor or member faces threats, violence, a mob or a police complaint, they press and hold one button in the app. The leaders you choose here are told at once and see their location, your legal-aid contact gets a WhatsApp and SMS with a link, and the prayer chain is asked to pray. The location is shared only for the time you set, then wiped. Nothing appears on the directory or any public page." />
      <div className="stack" style={{ gap: 16 }}>
        {active.length > 0 && active.map((a) => <AlertRow key={a.id} a={a} onChange={setHub} />)}
        <Settings hub={d} onSaved={setHub} />
        <section className="stack" style={{ gap: 8 }}>
          <h3 style={{ margin: 0 }}>Past alerts</h3>
          {d.alerts.filter((a) => a.status !== 'active').length === 0 ? <div className="card card-pad small muted">No alerts so far. Tell your members where the button is: Safety alert, in More in the app.</div> : d.alerts.filter((a) => a.status !== 'active').map((a) => <AlertRow key={a.id} a={a} onChange={setHub} />)}
        </section>
      </div>
    </>
  );
}

function Settings({ hub, onSaved }: { hub: SafetyHub; onSaved: (h: SafetyHub) => void }) {
  const [leaders, setLeaders] = useState(hub.leaders.map((l) => ({ id: l.id, name: l.name })));
  const [legal, setLegal] = useState<Partial<SafetyLegalContact>[]>(hub.settings.legal);
  const [chain, setChain] = useState(hub.settings.prayerChain);
  const [names, setNames] = useState(hub.settings.chainNames);
  const [minutes, setMinutes] = useState(hub.settings.shareMinutes);
  const toast = useToast();
  const save = useAction(async () => { onSaved(await AdminApi.safety.settings({ leaderIds: leaders.map((l) => l.id), legal: legal.filter((c) => c.name?.trim() && c.phone?.trim()), prayerChain: chain, chainNames: names, shareMinutes: minutes })); toast('Saved'); });
  return (
    <section className="card card-pad stack" style={{ gap: 12 }}>
      <h3 style={{ margin: 0 }}>Who is told</h3>
      <FormError error={save.error} />
      <Field label="Leaders who respond" hint="Pastors, elders or zone leaders who can act at any hour. They need the member app to see the location.">
        <div className="stack" style={{ gap: 6 }}>
          {leaders.map((l) => (
            <div key={l.id} className="row" style={{ gap: 6 }}><span className="grow">{l.name}</span><button className="btn ghost icon sm" title="Remove" onClick={() => setLeaders(leaders.filter((x) => x.id !== l.id))}><X size={14} /></button></div>
          ))}
          {leaders.length < 20 && <PersonSearch exclude={leaders.map((l) => l.id)} placeholder="Add a leader" onPick={(p) => setLeaders([...leaders, p])} />}
        </div>
      </Field>
      <Field label="Legal-aid contacts" hint="A Christian lawyer or a religious-liberty legal aid line. They get a WhatsApp and SMS with a link to the live location.">
        <div className="stack" style={{ gap: 6 }}>
          {legal.map((c, i) => (
            <div key={c.id ?? i} className="row wrap" style={{ gap: 6 }}>
              <input className="input grow" style={{ minWidth: 140 }} value={c.name ?? ''} onChange={(e) => setLegal(legal.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="Name" />
              <input className="input grow" style={{ minWidth: 140 }} value={c.org ?? ''} onChange={(e) => setLegal(legal.map((x, j) => (j === i ? { ...x, org: e.target.value } : x)))} placeholder="Organisation" />
              <input className="input" style={{ width: 160 }} value={c.phone ?? ''} onChange={(e) => setLegal(legal.map((x, j) => (j === i ? { ...x, phone: e.target.value } : x)))} placeholder="+91 98…" />
              <button className="btn ghost icon sm" title="Remove" onClick={() => setLegal(legal.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
            </div>
          ))}
          {legal.length < 5 && <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setLegal([...legal, { name: '', org: '', phone: '' }])}><Plus size={14} /> Add a contact</button>}
        </div>
      </Field>
      <label className="check"><input type="checkbox" checked={chain} onChange={(e) => setChain(e.target.checked)} /><span>Ask the prayer chain to pray</span></label>
      {chain && <label className="check"><input type="checkbox" checked={names} onChange={(e) => setNames(e.target.checked)} /><span>Include the person's name for the prayer chain <span className="small muted">(off by default: "one of our church family")</span></span></label>}
      <Field label="Share the location for">
        <select className="select" style={{ maxWidth: 200 }} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
          {[30, 60, 120, 180, 240].map((m) => <option key={m} value={m}>{m < 60 ? `${m} minutes` : `${m / 60} hour${m === 60 ? '' : 's'}`}</option>)}
        </select>
      </Field>
      <button className="btn primary" style={{ alignSelf: 'flex-start' }} disabled={save.busy} onClick={() => save.run()}>Save</button>
    </section>
  );
}

function AlertRow({ a, onChange }: { a: SafetyAlertView; onChange: (h: SafetyHub) => void }) {
  const [note, setNote] = useState(a.followUp);
  const save = useAction(async () => onChange(await AdminApi.safety.update(a.id, { followUp: note })));
  const close = useAction(async () => onChange(await AdminApi.safety.update(a.id, { status: 'closed' })));
  const live = a.status === 'active';
  return (
    <div className="card card-pad stack" style={{ gap: 6, borderLeft: `4px solid ${live ? 'var(--danger)' : 'var(--border)'}` }}>
      <div className="row between wrap" style={{ gap: 6 }}>
        <b>{live && <ShieldAlert size={16} color="var(--danger)" style={{ verticalAlign: '-3px' }} />} {a.name} · {KIND[a.kind]}</b>
        <span className="small muted">{formatDate(a.startedAt)} {formatTime(a.startedAt)}</span>
      </div>
      {a.note && <span>“{a.note}”</span>}
      <span className="small">{live ? 'Happening now.' : a.status === 'safe' ? `Said they were safe${a.endedAt ? ` at ${formatTime(a.endedAt)}` : ''}.` : `Closed${a.endedBy ? ` by ${a.endedBy}` : ''}.`} {a.acks.length ? `Responding: ${a.acks.map((x) => x.name).join(', ')}.` : 'Nobody has responded yet.'}</span>
      {live && a.location && <a className="small" href={`https://maps.google.com/?q=${a.location.lat},${a.location.lng}`} target="_blank" rel="noreferrer"><MapPin size={13} /> Last location at {formatTime(a.location.at)}</a>}
      <FormError error={save.error ?? close.error} />
      <div className="row wrap" style={{ gap: 6 }}>
        <input className="input grow" style={{ minWidth: 200 }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What followed (police complaint, visit, counselling)" />
        <button className="btn sm" disabled={save.busy || note === a.followUp} onClick={() => save.run()}>Save note</button>
        {live && <button className="btn sm" disabled={close.busy} onClick={() => close.run()}>Close and stop sharing</button>}
      </div>
    </div>
  );
}
