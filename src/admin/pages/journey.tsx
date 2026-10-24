// People › Journey map: how many people are at each step of their walk with the church, who has
// been stuck at one step for six months or more, and what seems to help people move on. Any
// person's timeline opens from here, and the office can add steps records cannot know.
import { Flag, Footprints, Plus, Search, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { AdminApi } from '@/api/endpoints';
import type { JourneyStep } from '@/core/types';
import { PersonSearch } from '@/admin/components/person-picker';
import { ErrorState, Field, FormError, Loading, Modal } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { useAction, useApi } from '@/lib/use-api';

import { PageHeader } from '../layout';
import '../journey.css';

const dateOf = (d: string) => formatDate(`${d}T12:00:00`);
const span = (days: number) => (days < 14 ? `${days} days` : days < 70 ? `${Math.round(days / 7)} weeks` : days < 730 ? `${Math.round(days / 30)} months` : `${(days / 365).toFixed(1)} years`);

export function JourneyPage() {
  const q = useApi(AdminApi.journey.get);
  const [who, setWho] = useState<{ id: string; name: string } | null>(null);
  const title = 'Journey map';
  if (q.error) return <><PageHeader title={title} /><ErrorState error={q.error} onRetry={q.reload} /></>;
  if (!q.data) return <><PageHeader title={title} /><Loading /></>;
  const d = q.data;
  const max = Math.max(1, ...d.stages.map((s) => s.count));
  return (
    <>
      <PageHeader title={title} subtitle="Each person's walk with the church, worked out from what the records already hold: first visit, coming regularly, a group, baptism, courses, serving and mentoring. See where people get stuck and what helps them take the next step." />
      <div className="card card-pad row wrap" style={{ gap: 10, marginBottom: 16 }}>
        <Search size={18} className="muted" />
        <b>See someone's journey</b>
        <div className="grow" style={{ minWidth: 220 }}><PersonSearch onPick={(p) => setWho({ id: p.id, name: p.name })} placeholder="Search by name or phone" /></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 16, alignItems: 'start' }}>
        <section className="card card-pad stack" style={{ gap: 10 }}>
          <h3 style={{ margin: 0 }}>Where people are</h3>
          <span className="small muted">Out of {d.people} people. Each bar counts everyone who has reached that step.</span>
          {d.stages.map((s) => (
            <div key={s.key} className="stack" style={{ gap: 3 }}>
              <div className="row between small"><b>{s.label}</b><span>{s.count}</span></div>
              <div style={{ height: 12, borderRadius: 6, background: 'var(--border)' }}><div style={{ width: `${(s.count / max) * 100}%`, height: '100%', borderRadius: 6, background: 'var(--primary)' }} /></div>
              {s.medianDays !== null && <span className="small muted">Usually {span(s.medianDays)} after the step before</span>}
            </div>
          ))}
        </section>
        <section className="card card-pad stack" style={{ gap: 10 }}>
          <h3 style={{ margin: 0 }}>What seems to help</h3>
          {d.helps.length ? d.helps.map((h) => (
            <div key={h.text} className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
              <Flag size={18} style={{ color: 'var(--primary)', flex: 'none', marginTop: 2 }} />
              <span>{h.text} <span className="small muted">({h.withCount} with, {h.withoutCount} without)</span></span>
            </div>
          )) : <span className="small muted">Not enough people yet to see a pattern. As more steps are recorded, this shows what helps people move on.</span>}
          <span className="small muted">These are patterns, not proof: they show where to look, and what to try.</span>
        </section>
      </div>
      <h3 style={{ margin: '20px 0 8px' }}>Stuck for six months or more</h3>
      {!d.stuck.length ? <div className="card card-pad muted">No one has been stuck at a step for six months. 🎉</div> : (
        <div className="stack">
          {d.stuck.map((s) => (
            <details key={s.stage} className="card card-pad" open={s.stage === 'regular'}>
              <summary style={{ cursor: 'pointer' }}><b>{s.label}</b>, not yet {s.next} <span className="badge gray">{s.people.length}</span></summary>
              <div className="row wrap" style={{ gap: 6, marginTop: 10 }}>
                {s.people.map((p) => (
                  <button key={p.id} className="btn sm" onClick={() => setWho({ id: p.id, name: p.name })}>
                    {p.name}{p.days !== null && <span className="muted"> · {span(p.days)}</span>}
                  </button>
                ))}
              </div>
            </details>
          ))}
        </div>
      )}
      {who && <TimelineModal who={who} onClose={() => setWho(null)} onChanged={q.reload} />}
    </>
  );
}

export function TimelineModal({ who, onClose, onChanged }: { who: { id: string; name: string }; onClose: () => void; onChanged?: () => void }) {
  const q = useApi(() => AdminApi.journey.person(who.id), [who.id]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ kind: 'faith' as 'faith' | 'custom', label: '', date: '' });
  const add = useAction(async () => { q.setData(await AdminApi.journey.add(who.id, form)); setAdding(false); setForm({ kind: 'faith', label: '', date: '' }); onChanged?.(); });
  const remove = useAction(async (id: string) => { q.setData(await AdminApi.journey.removeMark(id)); onChanged?.(); });
  return (
    <Modal title={`${who.name}: journey`} onClose={onClose} footer={<><a className="btn" href={`/admin/people?open=${who.id}`}>Open their record</a><span style={{ flex: 1 }} /><button className="btn" onClick={onClose}>Close</button></>}>
      {q.error ? <ErrorState error={q.error} onRetry={q.reload} /> : !q.data ? <Loading /> : (
        <div className="stack">
          <ol className="journey-line">
            {q.data.map((s: JourneyStep, i) => (
              <li key={`${s.kind}-${i}`}>
                <span className="journey-dot" />
                <div className="grow" style={{ minWidth: 0 }}>
                  <b>{s.label}</b>{s.detail && <span className="muted"> · {s.detail}</span>}
                  <div className="small muted">{s.date ? dateOf(s.date) : 'Date not known'}{s.markId && ' · added by hand'}</div>
                </div>
                {s.markId && <button className="btn ghost icon sm danger" aria-label="Remove this step" disabled={remove.busy} onClick={() => void remove.run(s.markId!)}><Trash2 size={14} /></button>}
              </li>
            ))}
          </ol>
          {adding ? (
            <div className="card card-pad stack" style={{ gap: 8 }}>
              <div className="row wrap" style={{ gap: 8 }}>
                <select className="input" style={{ width: 'auto' }} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as 'faith' | 'custom' })} aria-label="Kind of step">
                  <option value="faith">Gave their life to Jesus</option>
                  <option value="custom">Something else</option>
                </select>
                <input className="input" style={{ width: 'auto' }} type="date" value={form.date} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setForm({ ...form, date: e.target.value })} aria-label="Date" />
              </div>
              {form.kind === 'custom' && <Field label="What happened"><input className="input" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="e.g. Finished the membership class" maxLength={80} /></Field>}
              <FormError error={add.error} />
              <div className="row" style={{ gap: 8 }}><button className="btn primary sm" disabled={!form.date || (form.kind === 'custom' && !form.label.trim()) || add.busy} onClick={() => void add.run()}>Add step</button><button className="btn sm" onClick={() => setAdding(false)}>Cancel</button></div>
            </div>
          ) : <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setAdding(true)}><Plus size={14} /> Add a step</button>}
          <span className="small muted row" style={{ gap: 6 }}><Footprints size={14} /> Most steps come from the records: check-ins, groups, the baptism register, courses, rotas and mentoring.</span>
        </div>
      )}
    </Modal>
  );
}
