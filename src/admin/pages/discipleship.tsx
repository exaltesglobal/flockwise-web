// Care › Discipleship: one-to-one mentoring pairs, how often they meet, who is overdue, and new
// people who have nobody walking with them yet.
import { Footprints, Plus, Trash2, UserPlus } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import { AdminApi } from '@/api/endpoints';
import type { MentorFocus, MentorshipDetail, MentorshipView } from '@/core/types';
import { Empty, ErrorState, Field, FormError, Loading, Modal, Segmented, useToast } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { useCan } from '@/lib/perms';
import { useAction, useApi } from '@/lib/use-api';

import { PersonField, type PickedPerson } from '../components/person-picker';
import { PageHeader } from '../layout';

const FOCUS: Record<MentorFocus, string> = { new_believer: 'New believer', baptism: 'Preparing for baptism', leadership: 'Growing leader', marriage: 'Young couple', youth: 'Youth', other: 'Other' };
const RHYTHM: Record<number, string> = { 7: 'Every week', 14: 'Every two weeks', 30: 'Every month' };
const day = (d: string) => formatDate(`${d}T12:00:00`);
const today = () => new Date().toISOString().slice(0, 10);

export function DiscipleshipPage() {
  const q = useApi(AdminApi.discipleship.hub);
  const can = useCan();
  const editable = can('care');
  const toast = useToast();
  const [pairing, setPairing] = useState<PickedPerson | null | undefined>(undefined);
  const [logging, setLogging] = useState<MentorshipView | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<'active' | 'all'>('active');
  if (q.error) return <><PageHeader title="Discipleship" /><ErrorState error={q.error} onRetry={q.reload} /></>;
  if (!q.data) return <><PageHeader title="Discipleship" /><Loading /></>;
  const d = q.data;
  const pairs = d.pairs.filter((p) => filter === 'all' || p.status !== 'completed');

  return (
    <>
      <PageHeader
        title="Discipleship"
        subtitle="One-to-one mentoring: someone mature in faith walks with a new believer, a young leader or a young couple. Mentors log meetings in the app; overdue pairs get a gentle nudge."
        actions={editable && <button className="btn primary" onClick={() => setPairing(null)}><Plus size={16} /> New pair</button>}
      />
      <div className="stack">
        <div className="stat-row">
          <div className="card card-pad co-stat"><span className="muted small">Walking together</span><b className="co-big">{d.counts.active}</b><span className="small muted">{d.counts.mentors} mentor{d.counts.mentors === 1 ? '' : 's'}</span></div>
          <div className={`card card-pad co-stat ${d.counts.overdue ? 'sg-risk' : ''}`}><span className="muted small">Overdue to meet</span><b className="co-big">{d.counts.overdue}</b></div>
          <div className="card card-pad co-stat"><span className="muted small">Meetings this month</span><b className="co-big">{d.counts.meetingsThisMonth}</b></div>
          <div className="card card-pad co-stat"><span className="muted small">New people with no mentor</span><b className="co-big">{d.needMentor.length}</b><span className="small muted">joined in the last 4 months</span></div>
        </div>

        {d.needMentor.length > 0 && editable && (
          <div className="card card-pad stack" style={{ gap: 8 }}>
            <b>New people with nobody walking with them</b>
            <div className="ds-need">
              {d.needMentor.slice(0, 12).map((n) => (
                <button key={n.personId} className="ds-need-item" onClick={() => setPairing({ id: n.personId, name: n.name })}>
                  <span><b>{n.name}</b><span className="small muted"> · joined {formatDate(n.joinedAt)}</span></span>
                  <span className="small ds-link"><UserPlus size={14} /> Find a mentor</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <Segmented value={filter} onChange={setFilter} options={[{ value: 'active', label: 'Current pairs' }, { value: 'all', label: `All (${d.pairs.length})` }]} />
        {!pairs.length ? (
          <Empty icon={<Footprints size={28} />} title="No pairs yet" body="Pair a new believer with someone who will meet them, pray with them and read the Bible together." action={editable && <button className="btn primary" onClick={() => setPairing(null)}>Make the first pair</button>} />
        ) : (
          <div className="card table-wrap">
            <table className="table">
              <thead><tr><th>Mentor</th><th>Walking with</th><th>Focus</th><th>Last met</th><th>Next meeting</th>{editable && <th />}</tr></thead>
              <tbody>
                {pairs.map((p) => (
                  <tr key={p.id} onClick={() => setOpen(p.id)} style={{ cursor: 'pointer' }}>
                    <td><b>{p.mentorName}</b></td>
                    <td>{p.menteeName}{p.goal && <div className="small muted ellipsis" style={{ maxWidth: 260 }}>{p.goal}</div>}</td>
                    <td className="small">{FOCUS[p.focus]}<div className="muted">{RHYTHM[p.everyDays]}</div></td>
                    <td className="small">{p.lastMet ? day(p.lastMet) : <span className="muted">Not yet</span>}<div className="muted">{p.meetings} meeting{p.meetings === 1 ? '' : 's'}</div></td>
                    <td>{p.status !== 'active' ? <span className="badge gray">{p.status === 'paused' ? 'Paused' : 'Completed'}</span> : p.overdue ? <span className="badge danger">Overdue since {day(p.dueOn)}</span> : <span className="small">{day(p.dueOn)}</span>}</td>
                    {editable && <td onClick={(e) => e.stopPropagation()}>{p.status === 'active' && <button className="btn sm" onClick={() => setLogging(p)}>Log a meeting</button>}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {pairing !== undefined && <NewPair mentee={pairing} onClose={() => setPairing(undefined)} onDone={(p) => { setPairing(undefined); toast(`${p.mentorName} is walking with ${p.menteeName}.`); q.reload(); }} />}
      {logging && <LogMeeting pair={logging} onClose={() => setLogging(null)} onDone={() => { setLogging(null); toast('Meeting logged.'); q.reload(); }} />}
      {open && <PairDetail id={open} editable={editable} onClose={() => { setOpen(null); q.reload(); }} />}
    </>
  );
}

function NewPair({ mentee: initial, onClose, onDone }: { mentee: PickedPerson | null; onClose: () => void; onDone: (p: MentorshipDetail) => void }) {
  const [mentor, setMentor] = useState<PickedPerson | null>(null);
  const [mentee, setMentee] = useState<PickedPerson | null>(initial);
  const [focus, setFocus] = useState<MentorFocus>('new_believer');
  const [everyDays, setEvery] = useState(14);
  const [goal, setGoal] = useState('');
  const save = useAction(async (e: FormEvent) => {
    e.preventDefault();
    if (!mentor || !mentee) throw new Error('Choose both people.');
    onDone(await AdminApi.discipleship.create({ mentorId: mentor.id, menteeId: mentee.id, focus, everyDays, goal }));
  });
  return (
    <Modal title="New discipleship pair" onClose={onClose}>
      <form className="stack" onSubmit={save.run}>
        <Field label="Walking with" hint="The new believer, young leader or couple."><PersonField value={mentee} onChange={setMentee} /></Field>
        <Field label="Mentor" hint="Someone mature in faith, ideally of the same gender for one-to-one meetings."><PersonField value={mentor} onChange={setMentor} placeholder="Search for the mentor" /></Field>
        <Field label="Focus"><select value={focus} onChange={(e) => setFocus(e.target.value as MentorFocus)}>{(Object.keys(FOCUS) as MentorFocus[]).map((k) => <option key={k} value={k}>{FOCUS[k]}</option>)}</select></Field>
        <Field label="How often they meet"><Segmented value={String(everyDays)} onChange={(v) => setEvery(Number(v))} options={Object.entries(RHYTHM).map(([value, label]) => ({ value, label }))} /></Field>
        <Field label="What they are working on" hint="Optional. The mentor sees this in the app."><input value={goal} onChange={(e) => setGoal(e.target.value)} maxLength={300} placeholder="Reading Mark together, prayer, preparing for baptism" /></Field>
        <FormError error={save.error} />
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={save.busy}>Create pair</button>
        </div>
      </form>
    </Modal>
  );
}

function LogMeeting({ pair, onClose, onDone }: { pair: MentorshipView; onClose: () => void; onDone: (p: MentorshipDetail) => void }) {
  const [date, setDate] = useState(today());
  const [topic, setTopic] = useState('');
  const [note, setNote] = useState('');
  const save = useAction(async (e: FormEvent) => { e.preventDefault(); onDone(await AdminApi.discipleship.log(pair.id, { date, topic, note })); });
  return (
    <Modal title={`${pair.mentorName} met ${pair.menteeName}`} onClose={onClose}>
      <form className="stack" onSubmit={save.run}>
        <Field label="When"><input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} required /></Field>
        <Field label="What they talked about"><input value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={120} placeholder="Mark 2, prayer, family" /></Field>
        <Field label="Note for the pastors" hint="Only the church office sees this."><textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} /></Field>
        <FormError error={save.error} />
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={save.busy}>Save</button>
        </div>
      </form>
    </Modal>
  );
}

function PairDetail({ id, editable, onClose }: { id: string; editable: boolean; onClose: () => void }) {
  const q = useApi(() => AdminApi.discipleship.get(id), [id]);
  const [p, setP] = useState<MentorshipDetail | null>(null);
  const pair = p ?? q.data;
  const act = useAction(async (fn: () => Promise<MentorshipDetail>) => setP(await fn()));
  return (
    <Modal title={pair ? `${pair.mentorName} and ${pair.menteeName}` : 'Pair'} onClose={onClose} wide>
      {q.error ? <ErrorState error={q.error} onRetry={q.reload} /> : !pair ? <Loading /> : (
        <div className="stack">
          <div className="small muted">{FOCUS[pair.focus]} · {RHYTHM[pair.everyDays]} · since {day(pair.startedOn)}{pair.endedOn ? `, completed ${day(pair.endedOn)}` : ''}{pair.mentorPhone ? ` · mentor ${pair.mentorPhone}` : ''}{pair.menteePhone ? ` · ${pair.menteeName.split(' ')[0]} ${pair.menteePhone}` : ''}</div>
          {pair.goal && <p style={{ margin: 0 }}>{pair.goal}</p>}
          {editable && (
            <div className="row wrap" style={{ gap: 8 }}>
              <select value={pair.everyDays} onChange={(e) => void act.run(() => AdminApi.discipleship.update(pair.id, { everyDays: Number(e.target.value) }))}>{Object.entries(RHYTHM).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              {pair.status === 'active' && <button className="btn sm" onClick={() => void act.run(() => AdminApi.discipleship.update(pair.id, { status: 'paused' }))}>Pause</button>}
              {pair.status !== 'active' && <button className="btn sm" onClick={() => void act.run(() => AdminApi.discipleship.update(pair.id, { status: 'active' }))}>Resume</button>}
              {pair.status !== 'completed' && <button className="btn sm" onClick={() => void act.run(() => AdminApi.discipleship.update(pair.id, { status: 'completed' }))}>Mark completed</button>}
            </div>
          )}
          <FormError error={act.error} />
          <b className="small">Meetings</b>
          {!pair.log.length ? <p className="muted small" style={{ margin: 0 }}>No meetings logged yet.</p> : (
            <ul className="ds-log">
              {pair.log.map((m) => (
                <li key={m.id}>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <b>{day(m.date)}</b>{m.topic && <> · {m.topic}</>}
                    {m.note && <div className="small">{m.note}</div>}
                    <div className="small muted">Logged by {m.loggedBy || 'someone'}{m.via === 'app' ? ' in the app' : ''}</div>
                  </div>
                  {editable && <button className="btn sm ghost" aria-label="Remove meeting" onClick={() => { if (confirm('Remove this meeting?')) void act.run(() => AdminApi.discipleship.unlog(pair.id, m.id)); }}><Trash2 size={14} /></button>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
}
