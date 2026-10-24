// Care › Morning list: the few people most worth a call today, each with the reason, a Call and a
// WhatsApp button, and one tap to record how it went. Someone called drops off for a few weeks.
import { Check, MessageCircle, Phone, RotateCcw, Settings2, Sunrise } from 'lucide-react';
import { useState } from 'react';

import { AdminApi } from '@/api/endpoints';
import type { MorningCallOutcome, MorningListView, MorningRow } from '@/core/types';
import { Avatar, Empty, ErrorState, Field, FormError, Loading, Modal, useToast } from '@/components/ui';
import { formatRelative } from '@/lib/format';
import { useAction, useApi } from '@/lib/use-api';

import { PageHeader } from '../layout';

const OUTCOME: Record<MorningCallOutcome, string> = { called: 'Called', no_answer: 'No answer', visited: 'Visited', messaged: 'Messaged' };
const TONE: Record<string, string> = { hospital: 'danger', grief: 'danger', care: 'warn', absent: 'warn', visitor: 'accent', prayer: 'accent', birthday: 'ok', anniversary: 'ok', giving: 'gray' };
const wa = (phone: string) => `https://wa.me/${phone.replace(/\D/g, '').replace(/^(\d{10})$/, '91$1')}`;

export function MorningListPage() {
  const q = useApi(AdminApi.morningList.get);
  const [setup, setSetup] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const title = "Today's calls";
  if (q.error) return <><PageHeader title={title} /><ErrorState error={q.error} onRetry={q.reload} /></>;
  if (!q.data) return <><PageHeader title={title} /><Loading /></>;
  const d = q.data;
  const left = d.today.filter((r) => !r.doneToday).length;
  return (
    <>
      <PageHeader
        title={title}
        subtitle="Every morning Flockwise picks the people most worth a call today: someone in hospital or grieving, members who have stopped coming, new visitors nobody has called, fresh prayer requests, birthdays and anniversaries. Record the call and they rest for a few weeks."
        actions={<button className="btn" onClick={() => setSetup(true)}><Settings2 size={15} /> {d.settings.count} a day, {d.settings.hour}:00</button>}
      />
      {!d.today.length ? (
        <Empty icon={<Sunrise size={28} />} title="No one needs a call today" body="Everyone on the list has been called recently. Check again tomorrow morning." />
      ) : (
        <>
          <p className="muted small" style={{ marginTop: 0 }}>{left ? `${left} of ${d.today.length} still to call today.` : 'All done for today. Thank you!'}</p>
          <div className="stack">{d.today.map((r) => <CallCard key={r.personId} r={r} onChange={q.setData} />)}</div>
          {d.more.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <button className="btn ghost sm" onClick={() => setShowMore((v) => !v)}>{showMore ? 'Hide' : `${d.more.length} more people worth a call`}</button>
              {showMore && <div className="stack" style={{ marginTop: 8 }}>{d.more.map((r) => <CallCard key={r.personId} r={r} onChange={q.setData} />)}</div>}
            </div>
          )}
        </>
      )}
      {setup && <SetupModal d={d} onClose={() => setSetup(false)} onSaved={q.setData} />}
    </>
  );
}

function CallCard({ r, onChange }: { r: MorningRow; onChange: (d: MorningListView) => void }) {
  const toast = useToast();
  const [note, setNote] = useState('');
  const [open, setOpen] = useState(false);
  const done = useAction(async (outcome: MorningCallOutcome) => { onChange(await AdminApi.morningList.done(r.personId, outcome, note || undefined)); setOpen(false); setNote(''); toast(`${r.name.split(' ')[0]}: ${OUTCOME[outcome].toLowerCase()}`); });
  const undo = useAction(async () => onChange(await AdminApi.morningList.undo(r.personId)));
  return (
    <article className={`card card-pad ml-card ${r.doneToday ? 'ml-done' : ''}`}>
      <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
        <Avatar name={r.name} person={{ id: r.personId, photoUrl: r.photoUrl, avatar: r.avatar }} />
        <div className="stack grow" style={{ gap: 6, minWidth: 0 }}>
          <div className="row between wrap" style={{ gap: 8 }}>
            <a href={`/admin/people?open=${r.personId}`} style={{ fontWeight: 600, fontSize: 16 }}>{r.name}</a>
            {r.doneToday && r.lastCall ? <span className="badge ok"><Check size={12} /> {OUTCOME[r.lastCall.outcome]}</span> : r.lastCall && <span className="small muted">Last: {OUTCOME[r.lastCall.outcome].toLowerCase()} {formatRelative(r.lastCall.at)}</span>}
          </div>
          <div className="row wrap" style={{ gap: 6 }}>{r.reasons.map((x, i) => <span key={i} className={`badge ${TONE[x.kind] ?? 'gray'}`}>{x.text}</span>)}</div>
          {!r.doneToday ? (
            <div className="row wrap" style={{ gap: 6, marginTop: 4 }}>
              {r.phone && <a className="btn sm primary" href={`tel:${r.phone}`}><Phone size={14} /> Call</a>}
              {r.phone && <a className="btn sm" href={wa(r.phone)} target="_blank" rel="noreferrer"><MessageCircle size={14} /> WhatsApp</a>}
              {!r.phone && <span className="small muted">No phone number on record.</span>}
              <span className="grow" />
              <button className="btn sm" onClick={() => setOpen((v) => !v)}><Check size={14} /> Record</button>
            </div>
          ) : (
            <div className="row" style={{ gap: 6 }}>
              {r.lastCall?.note && <span className="small muted grow">“{r.lastCall.note}”</span>}
              <button className="btn sm ghost" disabled={undo.busy} onClick={() => void undo.run()}><RotateCcw size={13} /> Undo</button>
            </div>
          )}
          {open && (
            <div className="stack" style={{ gap: 8 }}>
              <FormError error={done.error} />
              <input className="input" placeholder="A short note (optional), saved on their care case" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
              <div className="row wrap" style={{ gap: 6 }}>
                {(['called', 'no_answer', 'messaged', 'visited'] as const).map((o) => <button key={o} className={`btn sm ${o === 'called' ? 'primary' : ''}`} disabled={done.busy} onClick={() => void done.run(o)}>{OUTCOME[o]}</button>)}
              </div>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function SetupModal({ d, onClose, onSaved }: { d: MorningListView; onClose: () => void; onSaved: (d: MorningListView) => void }) {
  const [s, setS] = useState(d.settings);
  const save = useAction(async () => { onSaved(await AdminApi.morningList.settings(s)); onClose(); });
  return (
    <Modal title="Morning list" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={save.busy} onClick={() => void save.run()}>Save</button></>}>
      <div className="stack">
        <FormError error={save.error} />
        <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={s.enabled} onChange={(e) => setS({ ...s, enabled: e.target.checked })} /> Send the list to the care team as a phone notification every morning</label>
        <div className="grid cols-2">
          <Field label="People a day"><input className="input" type="number" min={1} max={20} value={s.count} onChange={(e) => setS({ ...s, count: Number(e.target.value) })} /></Field>
          <Field label="Send at (hour, church time)">
            <select className="input" value={s.hour} onChange={(e) => setS({ ...s, hour: Number(e.target.value) })}>{Array.from({ length: 9 }, (_, i) => i + 4).map((h) => <option key={h} value={h}>{h}:00 am</option>)}</select>
          </Field>
        </div>
        <p className="small muted" style={{ margin: 0 }}>Each person with care access gets their own list, limited to the zones or groups they look after. The notification never mentions giving.</p>
      </div>
    </Modal>
  );
}
