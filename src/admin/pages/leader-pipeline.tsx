// Grow › Leadership pipeline: who is growing into a leader, from first spotted to leading, with the
// steps they have taken (membership class, leadership course, apprenticeship…), their mentor and how
// long they have been at each stage.
import { Plus, Sprout, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { AdminApi } from '@/api/endpoints';
import type { LeaderStage, LeaderStep, LeaderTrackView } from '@/core/types';
import { Empty, ErrorState, Field, FormError, Loading, Modal, useToast, useUndoableDelete } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { useCan } from '@/lib/perms';
import { useAction, useApi } from '@/lib/use-api';
import { useNewParam, useOpenParam } from '@/lib/use-new-param';

import { PersonField, type PickedPerson } from '../components/person-picker';
import { PageHeader } from '../layout';

const STAGE: Record<LeaderStage, { label: string; hint: string }> = {
  spotted: { label: 'Spotted', hint: 'Someone with a heart to lead' },
  training: { label: 'Training', hint: 'Doing the classes and course' },
  apprentice: { label: 'Apprentice', hint: 'Leading alongside a leader' },
  ready: { label: 'Ready', hint: 'Ready to be given a group' },
  leading: { label: 'Leading', hint: 'Leading their own group or ministry' },
};
const STAGES = Object.keys(STAGE) as LeaderStage[];
const AIMS = ['Cell group leader', 'Youth leader', 'Sunday school teacher', 'Worship leader', 'Deacon', 'Elder', 'Ministry leader'];
const today = () => new Date().toISOString().slice(0, 10);

export function LeaderPipelinePage() {
  const q = useApi(AdminApi.leaderPipeline.get);
  const can = useCan();
  const editable = can('care');
  const toast = useToast();
  const [adding, setAdding] = useState<PickedPerson | null | undefined>(undefined);
  const [open, setOpen] = useState<string | null>(null);
  useNewParam(() => setAdding(null));
  useOpenParam('open', (id) => { if (!q.data) return false; setOpen(id); return true; }, [q.data]);
  if (q.error) return <><PageHeader title="Leadership pipeline" /><ErrorState error={q.error} onRetry={q.reload} /></>;
  if (!q.data) return <><PageHeader title="Leadership pipeline" /><Loading /></>;
  const d = q.data;
  const track = d.tracks.find((t) => t.id === open);

  return (
    <>
      <PageHeader
        title="Leadership pipeline"
        subtitle="Who is growing into a leader, the steps they have taken and who is mentoring them. Move each person along as they grow."
        actions={editable && <button className="btn primary" onClick={() => setAdding(null)}><Plus size={16} /> Add someone</button>}
      />
      <div className="stack">
        {editable && d.suggestions.length > 0 && (
          <div className="card card-pad stack" style={{ gap: 8 }}>
            <b>May be ready to start</b>
            <div className="ds-need">
              {d.suggestions.map((s) => (
                <button key={s.personId} className="ds-need-item" onClick={() => setAdding({ id: s.personId, name: s.name })}>
                  <span><b>{s.name}</b><span className="small muted"> · {s.reason}</span></span>
                  <span className="small ds-link"><Plus size={14} /> Add</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {!d.tracks.length ? (
          <Empty icon={<Sprout size={28} />} title="Nobody on the pipeline yet" body={editable && d.suggestions.length > 0 ? 'Start with one of the people suggested above, or add someone else you see growing.' : 'Add the people you see growing: a faithful cell member, a young person who serves, an apprentice leader.'} action={editable && <button className="btn primary" onClick={() => setAdding(null)}>Add the first person</button>} />
        ) : (
          <div className="lp-board">
            {STAGES.map((s) => (
              <section key={s} className="lp-col">
                <header><b>{STAGE[s].label}</b> <span className="muted small">{d.counts[s]}</span><div className="small muted">{STAGE[s].hint}</div></header>
                {d.tracks.filter((t) => t.stage === s).map((t) => (
                  <button key={t.id} className="card lp-card" onClick={() => setOpen(t.id)}>
                    <b>{t.name}</b>
                    <span className="small muted">{t.aim}</span>
                    <span className="lp-bar" aria-label={`${t.done} of ${t.steps.length} steps`}><span style={{ width: `${t.steps.length ? (100 * t.done) / t.steps.length : 0}%` }} /></span>
                    <span className="small muted">{t.done}/{t.steps.length} steps{t.mentorName ? ` · with ${t.mentorName}` : ''}</span>
                    {t.leads.length > 0 && <span className="small">Leads {t.leads.join(', ')}</span>}
                    <span className="small muted">{t.daysInStage === 0 ? 'Since today' : `${t.daysInStage} day${t.daysInStage === 1 ? '' : 's'} at this stage`}</span>
                  </button>
                ))}
              </section>
            ))}
          </div>
        )}
      </div>
      {adding !== undefined && <AddPerson person={adding} onClose={() => setAdding(undefined)} onDone={(t) => { setAdding(undefined); toast(`${t.name} is on the pipeline.`); q.reload(); }} />}
      {track && <TrackEditor track={track} editable={editable} onClose={() => setOpen(null)} onChange={() => q.reload()} />}
    </>
  );
}

function AddPerson({ person: initial, onClose, onDone }: { person: PickedPerson | null; onClose: () => void; onDone: (t: LeaderTrackView) => void }) {
  const [person, setPerson] = useState<PickedPerson | null>(initial);
  const [mentor, setMentor] = useState<PickedPerson | null>(null);
  const [aim, setAim] = useState(AIMS[0]);
  const [stage, setStage] = useState<LeaderStage>('spotted');
  const save = useAction(async () => {
    if (!person) throw new Error('Choose the person.');
    onDone(await AdminApi.leaderPipeline.create({ personId: person.id, aim, stage, mentorId: mentor?.id ?? null }));
  });
  return (
    <Modal title="Add to the pipeline" onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => void save.run()} disabled={save.busy || !person}>Add</button></>}>
      <div className="stack">
        <Field label="Person"><PersonField value={person} onChange={setPerson} /></Field>
        <Field label="Growing into"><input list="lp-aims" value={aim} onChange={(e) => setAim(e.target.value)} maxLength={80} /><datalist id="lp-aims">{AIMS.map((a) => <option key={a} value={a} />)}</datalist></Field>
        <Field label="Stage"><select value={stage} onChange={(e) => setStage(e.target.value as LeaderStage)}>{STAGES.map((s) => <option key={s} value={s}>{STAGE[s].label}: {STAGE[s].hint.toLowerCase()}</option>)}</select></Field>
        <Field label="Mentor" hint="Optional. A leader who walks with them."><PersonField value={mentor} onChange={setMentor} placeholder="Search for the mentor" /></Field>
        <p className="small muted" style={{ margin: 0 }}>They start with the usual steps (membership class, leadership course, apprenticeship…). You can change the steps afterwards.</p>
        <FormError error={save.error} />
      </div>
    </Modal>
  );
}

function TrackEditor({ track, editable, onClose, onChange }: { track: LeaderTrackView; editable: boolean; onClose: () => void; onChange: () => void }) {
  const [aim, setAim] = useState(track.aim);
  const [stage, setStage] = useState(track.stage);
  const [mentor, setMentor] = useState<PickedPerson | null>(track.mentorId ? { id: track.mentorId, name: track.mentorName ?? 'Mentor' } : null);
  const [steps, setSteps] = useState<LeaderStep[]>(track.steps);
  const [notes, setNotes] = useState(track.notes);
  const [newStep, setNewStep] = useState('');
  const toast = useToast();
  const undoable = useUndoableDelete();
  const save = useAction(async () => {
    await AdminApi.leaderPipeline.update(track.id, { aim, stage, mentorId: mentor?.id ?? null, steps: steps.map((s) => (s.id.startsWith('new-') ? { ...s, id: '' } : s)), notes });
    toast('Saved.'); onChange(); onClose();
  });
  const addStep = () => { if (newStep.trim()) { setSteps([...steps, { id: `new-${Date.now()}`, title: newStep.trim(), doneOn: null }]); setNewStep(''); } };
  return (
    <Modal
      title={track.name}
      onClose={onClose}
      footer={editable && <>
        <button className="btn ghost grow" style={{ justifyContent: 'flex-start' }} onClick={() => { onClose(); undoable({ text: `${track.name} taken off the pipeline.`, hide: () => undefined, show: onChange, run: () => AdminApi.leaderPipeline.remove(track.id), done: onChange }); }}><Trash2 size={14} /> Take off the pipeline</button>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={() => void save.run()} disabled={save.busy}>Save</button>
      </>}
    >
      <div className="stack">
        <div className="small muted">On the pipeline since {formatDate(`${track.startedOn}T12:00:00`)}{track.phone ? ` · ${track.phone}` : ''}</div>
        <Field label="Growing into"><input value={aim} onChange={(e) => setAim(e.target.value)} disabled={!editable} maxLength={80} /></Field>
        <Field label="Stage">
          <div className="lp-stages">
            {STAGES.map((s) => <button key={s} type="button" className={`chip ${stage === s ? '' : 'off'}`} onClick={() => editable && setStage(s)} title={STAGE[s].hint}>{STAGE[s].label}</button>)}
          </div>
        </Field>
        <Field label="Mentor"><PersonField value={mentor} onChange={setMentor} placeholder="Search for the mentor" /></Field>
        <div className="stack" style={{ gap: 4 }}>
          <b className="small">Steps</b>
          {steps.map((s) => (
            <label key={s.id} className="mt-action">
              <input type="checkbox" checked={!!s.doneOn} disabled={!editable} onChange={(e) => setSteps(steps.map((x) => (x.id === s.id ? { ...x, doneOn: e.target.checked ? today() : null } : x)))} />
              <span className="grow">{s.title}{s.doneOn && <span className="small muted"> · {formatDate(`${s.doneOn}T12:00:00`)}</span>}</span>
              {editable && <button type="button" className="btn sm ghost icon" onClick={(e) => { e.preventDefault(); setSteps(steps.filter((x) => x.id !== s.id)); }} aria-label={`Remove ${s.title}`}><Trash2 size={13} /></button>}
            </label>
          ))}
          {editable && (
            <div className="row" style={{ gap: 6 }}>
              <input className="grow" value={newStep} onChange={(e) => setNewStep(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addStep(); } }} placeholder="Add a step, like Safeguarding training" maxLength={120} />
              <button className="btn sm" onClick={addStep} disabled={!newStep.trim()}>Add</button>
            </div>
          )}
        </div>
        <Field label="Notes" hint="Gifts, growth areas, what they need next."><textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!editable} maxLength={4000} /></Field>
        <FormError error={save.error} />
      </div>
    </Modal>
  );
}
