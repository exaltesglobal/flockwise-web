// Sunday school: classes by age and their teachers, the weekly register (ticked from kids' check-in),
// lessons with memory verses, exams with marks, grades and ranks, the annual day prize list, and moving
// every child up a class at the start of the year.
import { ArrowLeft, Award, BookOpen, CalendarCheck, GraduationCap, Plus, Send, Sparkles, Star, Trash2, UserPlus, X } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';

import type { Currency, Room, SsClassDetail, SsExamResults, SsLesson, SsOverview, SsRegister } from '@/api/admin-types';
import { adminSession } from '@/api/client';
import { AdminApi } from '@/api/endpoints';
import { Empty, ErrorState, Field, FormError, Loading, Modal, Segmented, useToast } from '@/components/ui';
import { formatDate, formatMoney } from '@/lib/format';
import { useSession } from '@/lib/session';
import { useAction, useApi } from '@/lib/use-api';

import { PersonSearch } from '../components/person-picker';
import { PageHeader } from '../layout';

type Tab = 'classes' | 'lessons' | 'exams' | 'prizes';
const day = (date: string) => formatDate(`${date}T00:00:00Z`);
const todayIso = () => new Date().toISOString().slice(0, 10);

function useCurrency() {
  return (useSession(adminSession)?.church.currency ?? 'INR') as Currency;
}

export function SundaySchoolPage() {
  const { classId, examId } = useParams();
  if (classId) return <ClassPage id={classId} />;
  if (examId) return <ExamPage id={examId} />;
  return <Overview />;
}

function Overview() {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('classes');
  const { data, error, reload } = useApi(AdminApi.sundaySchool.overview);
  const [creating, setCreating] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const setup = useAction(AdminApi.sundaySchool.setup);
  const enroll = useAction(AdminApi.sundaySchool.enroll);

  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const none = data.classes.length === 0;
  return (
    <>
      <PageHeader
        title="Sunday school"
        subtitle="Classes, the weekly register, lessons and memory verses, exams and the annual day prize list."
        actions={!none && (
          <>
            <button className="btn ghost" onClick={() => setPromoting(true)}><GraduationCap size={16} /> New year</button>
            <button className="btn primary" onClick={() => setCreating(true)}><Plus size={16} /> New class</button>
          </>
        )}
      />
      {none ? (
        <div className="card">
          <Empty
            icon={<BookOpen size={28} />}
            title="Set up your Sunday school"
            body="Start with the usual five classes (Beginners 3–5, Primary 6–8, Junior 9–11, Intermediate 12–14 and Senior 15–17). Every child is placed in the class for their age, and you can rename or change any of them."
            action={<button className="btn primary" disabled={setup.busy} onClick={async () => { const r = await setup.run(); if (r) { toast(`Classes ready. ${r.placed} children placed.`); reload(); } }}>Set up classes</button>}
          />
          <FormError error={setup.error} />
        </div>
      ) : (
        <>
          <div className="grid cols-4" style={{ marginBottom: 16 }}>
            <div className="card kpi"><span className="label">Children</span><span className="value">{data.students}</span></div>
            <div className="card kpi"><span className="label">Teachers</span><span className="value">{data.teachers}</span></div>
            <div className="card kpi"><span className="label">Registers for {day(data.sunday)}</span><span className="value">{data.markedThisSunday} of {data.classes.length}</span></div>
            <div className="card kpi"><span className="label">Next lesson</span><span style={{ fontWeight: 600 }}>{data.nextLesson ? data.nextLesson.title : 'Not planned'}</span>{data.nextLesson && <span className="small muted">{day(data.nextLesson.date)} · {data.nextLesson.scripture}</span>}</div>
          </div>
          {data.unassigned.length > 0 && (
            <div className="card card-pad row between wrap" style={{ gap: 12, marginBottom: 16, background: 'var(--warn-tint)' }}>
              <span><b>{data.unassigned.length} {data.unassigned.length === 1 ? 'child is' : 'children are'} not in a class:</b> <span className="muted">{data.unassigned.slice(0, 5).map((p) => p.name).join(', ')}{data.unassigned.length > 5 ? '…' : ''}</span></span>
              <button className="btn" disabled={enroll.busy} onClick={async () => { const r = await enroll.run(); if (r) { toast(`${r.placed} placed by age`); reload(); } }}><UserPlus size={16} /> Place by age</button>
            </div>
          )}
          <div className="seg-scroll" style={{ marginBottom: 14 }}>
            <Segmented value={tab} onChange={setTab} options={[{ value: 'classes', label: 'Classes' }, { value: 'lessons', label: 'Lessons' }, { value: 'exams', label: 'Exams' }, { value: 'prizes', label: 'Annual day' }]} />
          </div>
          {tab === 'classes' && <Classes data={data} />}
          {tab === 'lessons' && <Lessons data={data} />}
          {tab === 'exams' && <Exams data={data} />}
          {tab === 'prizes' && <Prizes />}
        </>
      )}
      {creating && <ClassForm onClose={() => setCreating(false)} onSaved={() => { setCreating(false); reload(); }} />}
      {promoting && <PromoteModal onClose={() => setPromoting(false)} onDone={() => { setPromoting(false); reload(); }} />}
    </>
  );
}

function Classes({ data }: { data: SsOverview }) {
  return (
    <div className="grid cols-3 ss-classes">
      {data.classes.map((c) => (
        <Link key={c.id} to={`/admin/sunday-school/class/${c.id}`} className="card card-pad stack" style={{ gap: 10 }}>
          <div className="row between" style={{ gap: 8 }}>
            <h3>{c.name}</h3>
            <span className="badge gray">Ages {c.minAge}–{c.maxAge}</span>
          </div>
          <div className="small muted">{c.teachers.length ? c.teachers.map((t) => t.name).join(', ') : 'No teacher yet'}{c.roomName ? ` · ${c.roomName}` : ''}</div>
          <div className="row between small">
            <span><b>{c.students}</b> children</span>
            <span>{c.attendance === null ? 'No registers yet' : <><b>{c.attendance}%</b> attend</>}</span>
          </div>
          {c.attendance !== null && <div className="progress"><i style={{ width: `${c.attendance}%` }} /></div>}
          <span className="small muted">{c.lastMarked === data.sunday ? `✓ Register taken for ${day(data.sunday)}` : c.lastMarked ? `Last register ${day(c.lastMarked)}` : ''}</span>
        </Link>
      ))}
    </div>
  );
}

function ClassForm({ cls, onClose, onSaved }: { cls?: SsClassDetail; onClose: () => void; onSaved: (c: SsClassDetail) => void }) {
  const rooms = useApi(AdminApi.checkin.rooms);
  const [f, setF] = useState({ name: cls?.name ?? '', minAge: String(cls?.minAge ?? 6), maxAge: String(cls?.maxAge ?? 8), roomId: cls?.roomId ?? '' });
  const save = useAction(() => {
    const input = { name: f.name, minAge: Number(f.minAge), maxAge: Number(f.maxAge), roomId: f.roomId || null };
    return cls ? AdminApi.sundaySchool.updateClass(cls.id, input) : AdminApi.sundaySchool.createClass(input);
  });
  return (
    <Modal title={cls ? `Edit ${cls.name}` : 'New class'} onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!f.name.trim() || save.busy} onClick={async () => { const c = await save.run(); if (c) onSaved(c); }}>{cls ? 'Save' : 'Add class'}</button></>}>
      <div className="stack">
        <Field label="Name"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Primary" autoFocus /></Field>
        <div className="row" style={{ gap: 12 }}>
          <Field label="Youngest age"><input className="input" type="number" min={0} max={25} value={f.minAge} onChange={(e) => setF({ ...f, minAge: e.target.value })} /></Field>
          <Field label="Oldest age"><input className="input" type="number" min={0} max={25} value={f.maxAge} onChange={(e) => setF({ ...f, maxAge: e.target.value })} /></Field>
        </div>
        <Field label="Check-in room" hint="Children checked in to this room are ticked on the register for you.">
          <select className="select" value={f.roomId} onChange={(e) => setF({ ...f, roomId: e.target.value })}>
            <option value="">No room</option>
            {(rooms.data ?? []).map((r: Room) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </Field>
        <FormError error={save.error} />
      </div>
    </Modal>
  );
}

function PromoteModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const promote = useAction(AdminApi.sundaySchool.promote);
  return (
    <Modal title="Start the new Sunday school year" onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={promote.busy} onClick={async () => { const r = await promote.run(); if (r) { toast(`${r.moved} moved up${r.graduated.length ? `, ${r.graduated.length} finished Sunday school` : ''}`); onDone(); } }}>Move everyone up</button></>}>
      <div className="stack">
        <p>Every child moves to the class for their age today. Children older than your senior class finish Sunday school and leave the register. Registers, marks and prizes from this year stay as they are.</p>
        <p className="small muted">Do this after your annual day, usually in January.</p>
        <FormError error={promote.error} />
      </div>
    </Modal>
  );
}

// ---------- one class: register and roster ----------

function ClassPage({ id }: { id: string }) {
  const { data, error, reload, setData } = useApi(() => AdminApi.sundaySchool.getClass(id), [id]);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState<'teacher' | 'student' | null>(null);
  const toast = useToast();
  const navigate = useNavigate();
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const update = async (input: { teacherIds?: string[]; studentIds?: string[] }) => setData(await AdminApi.sundaySchool.updateClass(data.id, input));
  const remove = async () => {
    if (!confirm(`Delete ${data.name}? Its registers are deleted too.`)) return;
    await AdminApi.sundaySchool.removeClass(data.id);
    navigate('/admin/sunday-school');
  };
  return (
    <>
      <div style={{ marginBottom: 8 }}><Link to="/admin/sunday-school" className="small row" style={{ gap: 4 }}><ArrowLeft size={14} /> Sunday school</Link></div>
      <PageHeader
        title={data.name}
        subtitle={`Ages ${data.minAge}–${data.maxAge} · ${data.students} children${data.roomName ? ` · ${data.roomName}` : ''}${data.attendance !== null ? ` · ${data.attendance}% attend` : ''}`}
        actions={<><button className="btn ghost danger" onClick={remove}><Trash2 size={16} /> Delete</button><button className="btn" onClick={() => setEditing(true)}>Edit class</button></>}
      />
      <div className="ss-layout">
        <Register classId={data.id} onSaved={reload} />
        <div className="stack">
          <div className="card card-pad stack" style={{ gap: 10 }}>
            <div className="row between"><h3>Teachers</h3><button className="btn sm ghost" onClick={() => setAdding('teacher')}><Plus size={14} /> Add</button></div>
            {data.teachers.length === 0 ? <p className="small muted">No teacher yet.</p> : data.teachers.map((t) => (
              <div key={t.id} className="row between small">
                <span>{t.name}</span>
                <button className="btn ghost icon sm" title="Remove" onClick={() => update({ teacherIds: data.teacherIds.filter((x) => x !== t.id) })}><X size={14} /></button>
              </div>
            ))}
          </div>
          {data.lessons.length > 0 && (
            <div className="card card-pad stack" style={{ gap: 8 }}>
              <h3>Lessons</h3>
              {data.lessons.map((l) => <div key={l.id} className="small"><b>{day(l.date)}</b> · {l.title} <span className="muted">· {l.scripture}</span></div>)}
            </div>
          )}
        </div>
      </div>
      <section className="stack" style={{ marginTop: 20 }}>
        <div className="row between wrap" style={{ gap: 8 }}>
          <h2>Children</h2>
          <button className="btn sm" onClick={() => setAdding('student')}><UserPlus size={14} /> Add a child</button>
        </div>
        <div className="card table-wrap">
          <table className="table">
            <thead><tr><th>Name</th><th>Age</th><th>Attendance</th><th>Verses</th><th>Weeks in a row</th><th /></tr></thead>
            <tbody>
              {data.roster.map((s) => (
                <tr key={s.id}>
                  <td><Link to={`/admin/people/${s.id}`}>{s.name}</Link></td>
                  <td>{s.age ?? '–'}</td>
                  <td>{s.percent === null ? '–' : `${s.percent}% (${s.present}/${s.of})`}</td>
                  <td>{s.verses}</td>
                  <td>{s.streak >= 4 ? <b>🔥 {s.streak}</b> : s.streak}</td>
                  <td><button className="btn ghost icon sm" title="Take out of this class" onClick={() => update({ studentIds: data.studentIds.filter((x) => x !== s.id) })}><X size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {editing && <ClassForm cls={data} onClose={() => setEditing(false)} onSaved={(c) => { setData(c); setEditing(false); toast('Saved'); }} />}
      {adding && (
        <Modal title={adding === 'teacher' ? 'Add a teacher' : 'Add a child'} onClose={() => setAdding(null)}>
          <PersonSearch
            autoFocus
            exclude={adding === 'teacher' ? data.teacherIds : data.studentIds}
            onPick={async (p) => {
              await update(adding === 'teacher' ? { teacherIds: [...data.teacherIds, p.id] } : { studentIds: [...data.studentIds, p.id] });
              setAdding(null);
              toast(`${p.name} added`);
            }}
          />
          {adding === 'student' && <p className="small muted" style={{ marginTop: 10 }}>A child who is in another class moves to this one.</p>}
        </Modal>
      )}
    </>
  );
}

function Register({ classId, onSaved }: { classId: string; onSaved: () => void }) {
  const [date, setDate] = useState<string | undefined>(undefined);
  const { data, error, reload } = useApi(() => AdminApi.sundaySchool.register(classId, date), [classId, date]);
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <div className="card card-pad"><Loading /></div>;
  return <RegisterForm key={`${data.date}:${data.saved}`} reg={data} onDate={setDate} onSaved={onSaved} />;
}

function RegisterForm({ reg, onDate, onSaved }: { reg: SsRegister; onDate: (d: string) => void; onSaved: () => void }) {
  const toast = useToast();
  const currency = useCurrency();
  const [present, setPresent] = useState(() => new Set(reg.students.filter((s) => s.present).map((s) => s.id)));
  const [verse, setVerse] = useState(() => new Set(reg.students.filter((s) => s.verse).map((s) => s.id)));
  const [visitors, setVisitors] = useState(String(reg.visitors || ''));
  const [offering, setOffering] = useState(reg.offering ? String(reg.offering / 100) : '');
  const save = useAction(() => AdminApi.sundaySchool.saveRegister(reg.classId, { date: reg.date, present: [...present], verse: [...verse].filter((id) => present.has(id)), visitors: Number(visitors) || 0, offering: Math.round(Number(offering || 0) * 100) }));
  const flip = (set: Set<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };
  const fromCheckin = reg.students.filter((s) => s.checkedIn).length;
  return (
    <div className="card card-pad stack">
      <div className="row between wrap" style={{ gap: 8 }}>
        <h3 className="row" style={{ gap: 8 }}><CalendarCheck size={18} /> Register</h3>
        <input className="input" type="date" style={{ width: 'auto' }} value={reg.date} max={todayIso()} onChange={(e) => e.target.value && onDate(e.target.value)} />
      </div>
      {reg.lesson && <div className="ss-lesson small"><span><b>{reg.lesson.title}</b> · {reg.lesson.scripture}</span>{reg.lesson.memoryVerse && <span className="muted">Memory verse: {reg.lesson.memoryVerse}</span>}</div>}
      <p className="small muted">
        {reg.saved ? 'Saved. Change anything and save again.' : fromCheckin ? `${fromCheckin} ticked from kids' check-in. Tick the rest and save.` : 'Tick who came. Tap the star for children who said the memory verse.'}
      </p>
      <div className="ss-register">
        {reg.students.map((s) => (
          <div key={s.id} className={`ss-kid ${present.has(s.id) ? 'on' : ''}`}>
            <label className="row grow" style={{ gap: 10, minWidth: 0 }}>
              <input type="checkbox" checked={present.has(s.id)} onChange={() => setPresent(flip(present, s.id))} />
              <span className="grow" style={{ minWidth: 0 }}>{s.name}{s.checkedIn && <span className="small muted"> · checked in</span>}</span>
            </label>
            <button type="button" className={`btn ghost icon sm ss-star ${verse.has(s.id) ? 'on' : ''}`} title="Said the memory verse" aria-pressed={verse.has(s.id)} disabled={!present.has(s.id)} onClick={() => setVerse(flip(verse, s.id))}>
              <Star size={16} />
            </button>
          </div>
        ))}
      </div>
      <div className="row wrap" style={{ gap: 12 }}>
        <Field label="Visitors"><input className="input" type="number" min={0} value={visitors} onChange={(e) => setVisitors(e.target.value)} style={{ width: 100 }} /></Field>
        <Field label={`Class offering (${currency})`}><input className="input" type="number" min={0} value={offering} onChange={(e) => setOffering(e.target.value)} style={{ width: 140 }} /></Field>
      </div>
      <FormError error={save.error} />
      <div className="row between wrap" style={{ gap: 8 }}>
        <span className="small"><b>{present.size}</b> of {reg.students.length} present · <b>{[...verse].filter((id) => present.has(id)).length}</b> verses{Number(offering) > 0 ? ` · ${formatMoney(Math.round(Number(offering) * 100), currency)}` : ''}</span>
        <button className="btn primary" disabled={save.busy} onClick={async () => { if (await save.run()) { toast('Register saved'); onSaved(); } }}>Save register</button>
      </div>
    </div>
  );
}

// ---------- lessons ----------

function Lessons({ data }: { data: SsOverview }) {
  const { data: lessons, error, reload } = useApi(AdminApi.sundaySchool.lessons);
  const [editing, setEditing] = useState<SsLesson | 'new' | null>(null);
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!lessons) return <Loading />;
  const today = todayIso();
  const name = (id: string | null) => (id ? data.classes.find((c) => c.id === id)?.name ?? 'One class' : 'All classes');
  return (
    <div className="stack">
      <div className="row between wrap" style={{ gap: 8 }}>
        <p className="muted small">Plan the lesson and memory verse for each Sunday. Teachers see it on the register, and parents see it in the app.</p>
        <button className="btn primary" onClick={() => setEditing('new')}><Plus size={16} /> Add lesson</button>
      </div>
      {lessons.length === 0 ? <div className="card"><Empty icon={<BookOpen size={28} />} title="No lessons planned" /></div> : (
        <div className="card">
          {lessons.map((l) => (
            <button key={l.id} type="button" className={`list-row ss-lesson-row ${l.date < today ? 'past' : ''}`} onClick={() => setEditing(l)}>
              <span className="ss-date">{day(l.date)}</span>
              <span className="grow" style={{ minWidth: 0 }}>
                <b>{l.title}</b> <span className="muted">· {l.scripture}</span>
                {l.memoryVerse && <span className="small muted ss-verse">{l.memoryVerse}</span>}
              </span>
              <span className="badge gray">{name(l.classId)}</span>
            </button>
          ))}
        </div>
      )}
      {editing && <LessonForm lesson={editing === 'new' ? null : editing} classes={data.classes} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </div>
  );
}

function nextSunday() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + ((7 - d.getUTCDay()) % 7 || 7));
  return d.toISOString().slice(0, 10);
}

function LessonForm({ lesson, classes, onClose, onSaved }: { lesson: SsLesson | null; classes: SsOverview['classes']; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ date: lesson?.date ?? nextSunday(), classId: lesson?.classId ?? '', title: lesson?.title ?? '', scripture: lesson?.scripture ?? '', memoryVerse: lesson?.memoryVerse ?? '', notes: lesson?.notes ?? '' });
  const save = useAction(() => {
    const input = { ...f, classId: f.classId || null };
    return lesson ? AdminApi.sundaySchool.updateLesson(lesson.id, input) : AdminApi.sundaySchool.createLesson(input);
  });
  const remove = async () => {
    if (!lesson || !confirm('Delete this lesson?')) return;
    await AdminApi.sundaySchool.removeLesson(lesson.id);
    onSaved();
  };
  return (
    <Modal
      title={lesson ? 'Edit lesson' : 'New lesson'}
      onClose={onClose}
      footer={<>{lesson && <button className="btn ghost danger" onClick={remove} style={{ marginRight: 'auto' }}><Trash2 size={16} /> Delete</button>}<button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!f.title.trim() || save.busy} onClick={async () => { if (await save.run()) onSaved(); }}>Save</button></>}
    >
      <div className="stack">
        <div className="row wrap" style={{ gap: 12 }}>
          <Field label="Sunday"><input className="input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
          <Field label="For">
            <select className="select" value={f.classId} onChange={(e) => setF({ ...f, classId: e.target.value })}>
              <option value="">All classes</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Lesson"><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="David and Goliath" autoFocus /></Field>
        <Field label="Bible passage"><input className="input" value={f.scripture} onChange={(e) => setF({ ...f, scripture: e.target.value })} placeholder="1 Samuel 17:32-50" /></Field>
        <Field label="Memory verse"><textarea className="textarea" rows={2} value={f.memoryVerse} onChange={(e) => setF({ ...f, memoryVerse: e.target.value })} /></Field>
        <Field label="Notes for teachers"><textarea className="textarea" rows={3} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Craft, song, activity" /></Field>
        <FormError error={save.error} />
      </div>
    </Modal>
  );
}

// ---------- exams ----------

function Exams({ data }: { data: SsOverview }) {
  const { data: exams, error, reload } = useApi(AdminApi.sundaySchool.exams);
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!exams) return <Loading />;
  return (
    <div className="stack">
      <div className="row between wrap" style={{ gap: 8 }}>
        <p className="muted small">Enter marks class by class. Flockwise works out grades and ranks, and sends each child's result to their parents on WhatsApp.</p>
        <button className="btn primary" onClick={() => setCreating(true)}><Plus size={16} /> New exam</button>
      </div>
      {exams.length === 0 ? <div className="card"><Empty icon={<Award size={28} />} title="No exams yet" /></div> : (
        <div className="card table-wrap">
          <table className="table">
            <thead><tr><th>Exam</th><th>Date</th><th>Marks entered</th><th>Status</th></tr></thead>
            <tbody>
              {exams.map((e) => {
                const entered = e.classes.reduce((n, c) => n + c.entered, 0);
                const of = e.classes.reduce((n, c) => n + c.of, 0);
                return (
                  <tr key={e.id} className="clickable" onClick={() => navigate(`/admin/sunday-school/exam/${e.id}`)}>
                    <td><Link to={`/admin/sunday-school/exam/${e.id}`}>{e.name}</Link></td>
                    <td>{day(e.date)}</td>
                    <td>{entered} of {of}</td>
                    <td>{e.status === 'published' ? <span className="badge ok">Results out</span> : <span className="badge gray">Marking</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {creating && <ExamForm classes={data.classes} onClose={() => setCreating(false)} onSaved={(e) => navigate(`/admin/sunday-school/exam/${e.id}`)} />}
    </div>
  );
}

function ExamForm({ classes, onClose, onSaved }: { classes: SsOverview['classes']; onClose: () => void; onSaved: (e: SsExamResults) => void }) {
  const [f, setF] = useState({ name: 'Annual exam', date: todayIso(), maxMarks: '100' });
  const [picked, setPicked] = useState(() => new Set(classes.map((c) => c.id)));
  const save = useAction(() => AdminApi.sundaySchool.createExam({ name: f.name, date: f.date, maxMarks: Number(f.maxMarks), classIds: [...picked] }));
  return (
    <Modal title="New exam" onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!f.name.trim() || !picked.size || save.busy} onClick={async () => { const e = await save.run(); if (e) onSaved(e); }}>Create</button></>}>
      <div className="stack">
        <Field label="Name"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></Field>
        <div className="row wrap" style={{ gap: 12 }}>
          <Field label="Date"><input className="input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
          <Field label="Out of"><input className="input" type="number" min={1} max={1000} value={f.maxMarks} onChange={(e) => setF({ ...f, maxMarks: e.target.value })} style={{ width: 110 }} /></Field>
        </div>
        <Field label="Classes sitting it">
          <div className="row wrap" style={{ gap: 12 }}>
            {classes.map((c) => (
              <label key={c.id} className="row small" style={{ gap: 6 }}>
                <input type="checkbox" checked={picked.has(c.id)} onChange={() => setPicked((s) => { const n = new Set(s); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; })} /> {c.name}
              </label>
            ))}
          </div>
        </Field>
        <FormError error={save.error} />
      </div>
    </Modal>
  );
}

function ExamPage({ id }: { id: string }) {
  const toast = useToast();
  const navigate = useNavigate();
  const { data, error, reload, setData } = useApi(() => AdminApi.sundaySchool.exam(id), [id]);
  const [classId, setClassId] = useState<string | null>(null);
  const send = useAction(AdminApi.sundaySchool.sendResults);
  const publish = useAction(AdminApi.sundaySchool.updateExam);
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const current = data.results.find((r) => r.classId === (classId ?? data.results[0]?.classId)) ?? null;
  const published = data.status === 'published';
  const remove = async () => {
    if (!confirm(`Delete ${data.name} and all its marks?`)) return;
    await AdminApi.sundaySchool.removeExam(data.id);
    navigate('/admin/sunday-school');
  };
  return (
    <>
      <div style={{ marginBottom: 8 }}><Link to="/admin/sunday-school" className="small row" style={{ gap: 4 }}><ArrowLeft size={14} /> Sunday school</Link></div>
      <PageHeader
        title={data.name}
        subtitle={`${day(data.date)} · out of ${data.maxMarks} · ${published ? 'Results are out. Parents see them in the app.' : 'Marking. Parents see results once you publish.'}`}
        actions={
          <>
            <button className="btn ghost danger" onClick={remove}><Trash2 size={16} /> Delete</button>
            {published ? (
              <>
                <button className="btn ghost" disabled={publish.busy} onClick={async () => { const x = await publish.run(data.id, { status: 'open' }); if (x) setData(x); }}>Back to marking</button>
                <button className="btn primary" disabled={send.busy} onClick={async () => { const r = await send.run(data.id); if (r) toast(`Sent to ${r.sent} parents${r.noParent.length ? `. ${r.noParent.length} children have no parent with a phone.` : ''}`); }}><Send size={16} /> Send to parents</button>
              </>
            ) : (
              <button className="btn primary" disabled={publish.busy} onClick={async () => { const x = await publish.run(data.id, { status: 'published' }); if (x) { setData(x); toast('Results published'); } }}><Sparkles size={16} /> Publish results</button>
            )}
          </>
        }
      />
      <FormError error={send.error ?? publish.error} />
      <div className="seg-scroll" style={{ marginBottom: 14 }}>
        <Segmented value={current?.classId ?? ''} onChange={setClassId} options={data.classes.map((c) => ({ value: c.id, label: `${c.name} · ${c.entered}/${c.of}` }))} />
      </div>
      {current && <Marks key={`${current.classId}:${data.maxMarks}`} exam={data} classId={current.classId} onSaved={setData} />}
    </>
  );
}

function Marks({ exam, classId, onSaved }: { exam: SsExamResults; classId: string; onSaved: (e: SsExamResults) => void }) {
  const toast = useToast();
  const res = exam.results.find((r) => r.classId === classId)!;
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(res.rows.map((r) => [r.id, r.marks === null ? (r.absent ? 'AB' : '') : String(r.marks)])));
  const save = useAction(() => AdminApi.sundaySchool.saveMarks(exam.id, classId, Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, v.trim().toUpperCase() === 'AB' ? null : v.trim() === '' ? '' : Number(v)]))));
  return (
    <div className="card">
      <div className="card-pad row between wrap" style={{ gap: 8 }}>
        <span className="small muted">Type the marks. Type AB for a child who was absent. {res.average !== null && <>Class average <b>{res.average}%</b>.</>}</span>
        <button className="btn primary" disabled={save.busy} onClick={async () => { const x = await save.run(); if (x) { onSaved(x); toast('Marks saved'); } }}>Save marks</button>
      </div>
      <FormError error={save.error} />
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Rank</th><th>Name</th><th>Marks / {exam.maxMarks}</th><th>Grade</th></tr></thead>
          <tbody>
            {res.rows.map((r) => (
              <tr key={r.id}>
                <td>{r.rank ? (r.rank <= 3 ? <b className={`ss-rank r${r.rank}`}>{r.rank}</b> : r.rank) : '–'}</td>
                <td>{r.name}</td>
                <td><input className="input ss-mark" inputMode="decimal" value={vals[r.id] ?? ''} onChange={(e) => setVals({ ...vals, [r.id]: e.target.value })} aria-label={`Marks for ${r.name}`} /></td>
                <td>{r.grade ?? (r.absent ? 'Absent' : '')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------- annual day ----------

function Prizes() {
  const year = new Date().getFullYear();
  const { data, error, reload } = useApi(() => AdminApi.sundaySchool.prizes(`${year}-01-01`, `${year}-12-31`), [year]);
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const medal = (n: number) => (n === 1 ? '🥇' : n === 2 ? '🥈' : '🥉');
  return (
    <div className="stack">
      <div className="row between wrap" style={{ gap: 8 }}>
        <p className="muted small">The prize list for annual day {year}: exam toppers, best attendance and most memory verses in each class, from published exams and this year's registers.</p>
        <button className="btn" onClick={() => window.print()}>Print</button>
      </div>
      <div className="grid cols-2 ss-prizes">
        {data.classes.map((c) => (
          <div key={c.classId} className="card card-pad stack" style={{ gap: 10 }}>
            <h3>{c.name}</h3>
            {c.toppers.length === 0 && c.attendance.length === 0 && c.verses.length === 0 && <p className="small muted">Nothing yet this year.</p>}
            {c.toppers.length > 0 && (
              <div className="stack" style={{ gap: 4 }}>
                <span className="small muted">Exam toppers</span>
                {c.toppers.map((t, i) => <div key={i} className="small">{medal(t.rank)} <b>{t.name}</b> · {t.marks}/{t.maxMarks} <span className="muted">· {t.exam}</span></div>)}
              </div>
            )}
            {c.attendance.length > 0 && (
              <div className="stack" style={{ gap: 4 }}>
                <span className="small muted">Best attendance</span>
                {c.attendance.map((a, i) => <div key={i} className="small">🏅 <b>{a.name}</b> · {a.present} of {a.of} Sundays</div>)}
              </div>
            )}
            {c.verses.length > 0 && (
              <div className="stack" style={{ gap: 4 }}>
                <span className="small muted">Most memory verses</span>
                {c.verses.map((v, i) => <div key={i} className="small">⭐ <b>{v.name}</b> · {v.verses} verses</div>)}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
