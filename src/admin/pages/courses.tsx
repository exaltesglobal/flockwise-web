// People › Classes & courses: baptism class, membership class, pre-marital counselling, Alpha, or your
// own. Each has sessions, a roster and attendance per session; enough sessions completes a person.
import { ArrowLeft, Check, GraduationCap, Pencil, Plus, Trash2, UserMinus } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import { AdminApi } from '@/api/endpoints';
import type { CourseDetail, CourseSession, CourseTemplate, CourseView } from '@/core/types';
import { Empty, ErrorState, Field, FormError, Loading, Modal, useToast } from '@/components/ui';
import { formatDay, formatTime } from '@/lib/format';
import { useCan } from '@/lib/perms';
import { useAction, useApi } from '@/lib/use-api';

import { PersonSearch } from '../components/person-picker';
import { PageHeader } from '../layout';

const when = (s: CourseSession) => (s.date ? `${formatDay(s.date)}${s.date.length > 10 ? `, ${formatTime(s.date)}` : ''}` : 'No date yet');

export function CoursesPage() {
  const [open, setOpen] = useState<string | null>(null);
  return open ? <CourseScreen id={open} onBack={() => setOpen(null)} /> : <CourseList onOpen={setOpen} />;
}

function CourseList({ onOpen }: { onOpen: (id: string) => void }) {
  const hub = useApi(AdminApi.courses.hub);
  const can = useCan();
  const [creating, setCreating] = useState(false);
  if (hub.error) return <><PageHeader title="Classes & courses" /><ErrorState error={hub.error} onRetry={hub.reload} /></>;
  if (!hub.data) return <><PageHeader title="Classes & courses" /><Loading /></>;
  const d = hub.data;
  const open = d.courses.filter((c) => c.status === 'open');
  const done = d.courses.filter((c) => c.status === 'finished');
  return (
    <>
      <PageHeader
        title="Classes & courses"
        subtitle="Baptism and membership classes, pre-marital counselling, Alpha. Mark who came to each session; enough sessions completes a person and tags them."
        actions={can('people.edit') && <button className="btn primary" onClick={() => setCreating(true)}><Plus size={16} /> New course</button>}
      />
      {!d.courses.length ? (
        <Empty icon={<GraduationCap size={28} />} title="No courses yet" body="Start a baptism class, membership class, pre-marital counselling or Alpha from a ready-made outline, or make your own." action={can('people.edit') && <button className="btn primary" onClick={() => setCreating(true)}>Start a course</button>} />
      ) : (
        <div className="stack">
          <div className="co-grid">{open.map((c) => <CourseCard key={c.id} c={c} onOpen={onOpen} />)}</div>
          {done.length > 0 && <><h3 className="co-h">Finished</h3><div className="co-grid">{done.map((c) => <CourseCard key={c.id} c={c} onOpen={onOpen} />)}</div></>}
        </div>
      )}
      {creating && <NewCourse templates={d.templates} onClose={() => setCreating(false)} onDone={(c) => { setCreating(false); onOpen(c.id); }} />}
    </>
  );
}

function CourseCard({ c, onOpen }: { c: CourseView; onOpen: (id: string) => void }) {
  return (
    <button className="card card-pad co-card" onClick={() => onOpen(c.id)}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <b>{c.name}</b>
        {c.status === 'finished' ? <span className="badge gray">Finished</span> : c.openToEnroll ? <span className="badge ok">Taking sign-ups</span> : <span className="badge gray">Sign-up closed</span>}
      </div>
      <div className="small muted">{c.sessions.length} sessions{c.leaderName ? ` · ${c.leaderName}` : ''}{c.location ? ` · ${c.location}` : ''}</div>
      <div className="co-nums"><span><b>{c.enrolled}</b>{c.capacity ? ` / ${c.capacity}` : ''} enrolled</span><span><b>{c.completed}</b> completed</span></div>
      <div className="small">{c.nextSession ? <>Next: {c.nextSession.title}, {when(c.nextSession)}</> : <span className="muted">No upcoming session</span>}</div>
    </button>
  );
}

function NewCourse({ templates, onClose, onDone }: { templates: { id: CourseTemplate; name: string; sessions: number; minAttendance: number }[]; onClose: () => void; onDone: (c: CourseDetail) => void }) {
  const [template, setTemplate] = useState<CourseTemplate>('baptism');
  const [name, setName] = useState('');
  const [leaderName, setLeader] = useState('');
  const [location, setLocation] = useState('');
  const [capacity, setCapacity] = useState('');
  const [sessions, setSessions] = useState('');
  const t = templates.find((x) => x.id === template);
  const save = useAction(async (e: FormEvent) => {
    e.preventDefault();
    const custom = sessions.split('\n').map((s) => s.trim()).filter(Boolean).map((title) => ({ title }));
    onDone(await AdminApi.courses.create({ template, name: name || undefined, leaderName: leaderName || undefined, location, capacity: Number(capacity) || null, sessions: template === 'custom' ? custom : undefined }));
  });
  return (
    <Modal title="New course" onClose={onClose}>
      <form className="stack" onSubmit={save.run}>
        <div className="co-templates">
          {templates.map((x) => (
            <label key={x.id} className={`co-template ${template === x.id ? 'on' : ''}`}><input type="radio" name="tpl" checked={template === x.id} onChange={() => setTemplate(x.id)} /><b>{x.name}</b><span className="small muted">{x.sessions} sessions, complete after {x.minAttendance}</span></label>
          ))}
          <label className={`co-template ${template === 'custom' ? 'on' : ''}`}><input type="radio" name="tpl" checked={template === 'custom'} onChange={() => setTemplate('custom')} /><b>Your own</b><span className="small muted">Name the sessions yourself</span></label>
        </div>
        <Field label="Name" hint={t ? `Leave blank for “${t.name}”. Add a month to tell batches apart, e.g. “Baptism class, November”.` : undefined}><input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required={template === 'custom'} /></Field>
        {template === 'custom' && <Field label="Sessions" hint="One per line."><textarea rows={4} value={sessions} onChange={(e) => setSessions(e.target.value)} required /></Field>}
        <div className="row wrap">
          <Field label="Led by"><input value={leaderName} onChange={(e) => setLeader(e.target.value)} maxLength={80} placeholder="You" /></Field>
          <Field label="Where"><input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={120} placeholder="Church hall" /></Field>
          <Field label="Places" hint="Blank for no limit."><input type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} style={{ width: 90 }} /></Field>
        </div>
        <p className="small muted" style={{ margin: 0 }}>Members can sign up from the app until you close sign-up. Set the session dates on the next screen.</p>
        <FormError error={save.error} />
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={save.busy}>Create</button>
        </div>
      </form>
    </Modal>
  );
}

function CourseScreen({ id, onBack }: { id: string; onBack: () => void }) {
  const q = useApi(() => AdminApi.courses.get(id), [id]);
  const can = useCan();
  const editable = can('people.edit');
  const toast = useToast();
  const [c, setC] = useState<CourseDetail | null>(null);
  const [editing, setEditing] = useState(false);
  const course = c ?? q.data;
  const act = useAction(async (fn: () => Promise<CourseDetail>, msg?: string) => { setC(await fn()); if (msg) toast(msg); });
  if (q.error) return <><PageHeader title="Course" /><ErrorState error={q.error} onRetry={q.reload} /></>;
  if (!course) return <><PageHeader title="Course" /><Loading /></>;

  const toggle = (sessionId: string, personId: string) => {
    const present = course.roster.filter((r) => r.attended.includes(sessionId)).map((r) => r.personId);
    const next = present.includes(personId) ? present.filter((p) => p !== personId) : [...present, personId];
    void act.run(() => AdminApi.courses.attendance(course.id, sessionId, next));
  };
  const allPresent = (sessionId: string) => void act.run(() => AdminApi.courses.attendance(course.id, sessionId, course.roster.map((r) => r.personId)));

  return (
    <>
      <PageHeader
        title={course.name}
        subtitle={`${course.sessions.length} sessions · complete after ${course.minAttendance}${course.completeTag ? ` · tags “${course.completeTag}”` : ''}${course.leaderName ? ` · led by ${course.leaderName}` : ''}${course.location ? ` · ${course.location}` : ''}`}
        actions={<>
          <button className="btn ghost" onClick={onBack}><ArrowLeft size={16} /> All courses</button>
          {editable && <button className="btn" onClick={() => setEditing(true)}><Pencil size={14} /> Edit</button>}
        </>}
      />
      <div className="stack">
        {course.description && <p className="muted" style={{ margin: 0, maxWidth: '65ch' }}>{course.description}</p>}
        <div className="stat-row">
          <div className="card card-pad co-stat"><span className="muted small">Enrolled</span><b className="co-big">{course.enrolled}{course.capacity ? ` / ${course.capacity}` : ''}</b></div>
          <div className="card card-pad co-stat"><span className="muted small">Completed</span><b className="co-big">{course.completed}</b></div>
          <div className="card card-pad co-stat"><span className="muted small">Next session</span><b>{course.nextSession ? course.nextSession.title : '—'}</b><span className="small muted">{course.nextSession ? when(course.nextSession) : course.status === 'finished' ? 'Finished' : 'Set dates under Edit'}</span></div>
        </div>
        {editable && course.status === 'open' && (
          <div className="card card-pad co-add">
            <span className="small muted">Add someone</span>
            <PersonSearch exclude={course.roster.map((r) => r.personId)} placeholder="Search people to add to this course" onPick={(p) => void act.run(() => AdminApi.courses.enroll(course.id, [p.id]), `${p.name} added.`)} />
          </div>
        )}
        <FormError error={act.error} />
        {!course.roster.length ? (
          <Empty icon={<GraduationCap size={28} />} title="Nobody enrolled yet" body={course.openToEnroll ? 'Add people above, or let members sign up from the app.' : 'Add people above.'} />
        ) : (
          <div className="card table-wrap">
            <table className="table co-table">
              <thead>
                <tr>
                  <th>Person</th>
                  {course.sessions.map((s, i) => (
                    <th key={s.id} className="co-sess" title={`${s.title} · ${when(s)}`}>
                      <span>{i + 1}</span>
                      <span className="small muted">{s.date ? formatDay(s.date).replace(/^\w+,?\s*/, '') : ''}</span>
                      {editable && <button className="btn sm ghost co-all" onClick={() => allPresent(s.id)} title="Mark everyone present">All</button>}
                    </th>
                  ))}
                  <th>Status</th>
                  {editable && <th />}
                </tr>
              </thead>
              <tbody>
                {course.roster.map((r) => (
                  <tr key={r.id}>
                    <td><b>{r.name}</b><div className="small muted">{r.phone ?? ''}{r.via === 'app' ? ' · signed up in the app' : ''}</div></td>
                    {course.sessions.map((s) => {
                      const on = r.attended.includes(s.id);
                      return (
                        <td key={s.id} className="co-cell">
                          <button className={`co-tick ${on ? 'on' : ''}`} disabled={!editable || act.busy} aria-pressed={on} aria-label={`${r.name} at ${s.title}`} onClick={() => toggle(s.id, r.personId)}>{on && <Check size={14} />}</button>
                        </td>
                      );
                    })}
                    <td>{r.status === 'completed' ? <span className="badge ok">Completed</span> : <span className="badge gray">{r.attended.length} of {course.minAttendance}</span>}</td>
                    {editable && (
                      <td className="co-actions">
                        {r.status !== 'completed' && <button className="btn sm ghost" title="Mark complete (make-up sessions)" onClick={() => void act.run(() => AdminApi.courses.complete(course.id, r.id), `${r.name} completed.`)}><Check size={14} /></button>}
                        <button className="btn sm ghost" title="Remove from course" onClick={() => { if (confirm(`Remove ${r.name} from ${course.name}?`)) void act.run(() => AdminApi.courses.drop(course.id, r.id)); }}><UserMinus size={14} /></button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <ol className="co-legend small muted">{course.sessions.map((s) => <li key={s.id}>{s.title} · {when(s)}</li>)}</ol>
      </div>
      {editing && <EditCourse course={course} onClose={() => setEditing(false)} onDone={(next) => { setEditing(false); setC(next); toast('Saved.'); }} />}
    </>
  );
}

function EditCourse({ course, onClose, onDone }: { course: CourseDetail; onClose: () => void; onDone: (c: CourseDetail) => void }) {
  const [f, setF] = useState({ name: course.name, description: course.description, leaderName: course.leaderName, location: course.location, minAttendance: String(course.minAttendance), capacity: course.capacity ? String(course.capacity) : '', completeTag: course.completeTag ?? '', openToEnroll: course.openToEnroll, status: course.status });
  const [sessions, setSessions] = useState(course.sessions.map((s) => ({ ...s, date: s.date ?? '' })));
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const save = useAction(async (e: FormEvent) => {
    e.preventDefault();
    onDone(await AdminApi.courses.update(course.id, { ...f, minAttendance: Number(f.minAttendance) || 1, capacity: Number(f.capacity) || null, completeTag: f.completeTag || null, sessions: sessions.map((s) => ({ id: s.id, title: s.title, date: s.date || null })) }));
  });
  return (
    <Modal title={`Edit ${course.name}`} onClose={onClose} wide>
      <form className="stack" onSubmit={save.run}>
        <Field label="Name"><input value={f.name} onChange={(e) => set('name', e.target.value)} maxLength={80} required /></Field>
        <Field label="About this course" hint="Members see this when they sign up."><textarea rows={3} value={f.description} onChange={(e) => set('description', e.target.value)} maxLength={600} /></Field>
        <div className="row wrap">
          <Field label="Led by"><input value={f.leaderName} onChange={(e) => set('leaderName', e.target.value)} maxLength={80} /></Field>
          <Field label="Where"><input value={f.location} onChange={(e) => set('location', e.target.value)} maxLength={120} /></Field>
          <Field label="Places"><input type="number" min={1} value={f.capacity} onChange={(e) => set('capacity', e.target.value)} style={{ width: 90 }} /></Field>
        </div>
        <div className="stack co-sessions">
          <span className="small muted">Sessions</span>
          {sessions.map((s, i) => (
            <div key={s.id} className="row co-sess-row">
              <span className="muted">{i + 1}.</span>
              <input value={s.title} onChange={(e) => setSessions((xs) => xs.map((x) => (x.id === s.id ? { ...x, title: e.target.value } : x)))} maxLength={100} required aria-label={`Session ${i + 1} title`} />
              <input type="datetime-local" value={s.date} onChange={(e) => setSessions((xs) => xs.map((x) => (x.id === s.id ? { ...x, date: e.target.value } : x)))} aria-label={`Session ${i + 1} date`} />
              <button type="button" className="btn sm ghost" disabled={sessions.length < 2} onClick={() => setSessions((xs) => xs.filter((x) => x.id !== s.id))} aria-label="Remove session"><Trash2 size={14} /></button>
            </div>
          ))}
          <div><button type="button" className="btn sm" onClick={() => setSessions((xs) => [...xs, { id: `new-${xs.length}-${Date.now()}`, title: `Session ${xs.length + 1}`, date: '' }])}><Plus size={14} /> Add a session</button></div>
        </div>
        <div className="row wrap">
          <Field label="Complete after" hint="Sessions attended."><input type="number" min={1} max={sessions.length} value={f.minAttendance} onChange={(e) => set('minAttendance', e.target.value)} style={{ width: 90 }} /></Field>
          <Field label="Tag on completion" hint="Added to the person's record; blank for none."><input value={f.completeTag} onChange={(e) => set('completeTag', e.target.value)} maxLength={40} /></Field>
        </div>
        <label className="row"><input type="checkbox" checked={f.openToEnroll} onChange={(e) => set('openToEnroll', e.target.checked)} /> Members can sign up from the app</label>
        <label className="row"><input type="checkbox" checked={f.status === 'finished'} onChange={(e) => set('status', e.target.checked ? 'finished' : 'open')} /> This course has finished</label>
        <FormError error={save.error} />
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={save.busy}>Save</button>
        </div>
      </form>
    </Modal>
  );
}
