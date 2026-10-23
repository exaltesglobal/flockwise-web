// Bible reading plans: start one from a template (or paste your own), watch the church-wide bar,
// see who is reading, and archive it when it ends. Members join and tick days in the app.
import { BookOpenCheck, Plus } from 'lucide-react';
import { useState } from 'react';

import type { ReadingPlanView, ReadingTemplate } from '@/api/admin-types';
import { AdminApi } from '@/api/endpoints';
import { Empty, ErrorState, Field, FormError, Loading, Modal, Segmented, useToast } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { useCan } from '@/lib/perms';
import { useAction, useApi } from '@/lib/use-api';

import { PageHeader } from '../layout';

type Status = 'active' | 'archived' | 'all';

export function ReadingPlansPage() {
  const toast = useToast();
  const canEdit = useCan()('comms', 'settings');
  const [status, setStatus] = useState<Status>('active');
  const { data, error, reload } = useApi(() => AdminApi.reading.hub(status), [status]);
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const current = open ? data.plans.find((p) => p.id === open) ?? null : null;
  return (
    <>
      <PageHeader title="Bible reading plan" subtitle="Read through the Bible together. Start a plan, and members join in the app, see each day’s passage in their own language, tick it off, and watch the church-wide bar fill."
        actions={canEdit && <button className="btn primary" onClick={() => setCreating(true)}><Plus size={16} /> Start a plan</button>} />
      <Segmented value={status} onChange={(s) => { setStatus(s); setOpen(null); }} options={[{ value: 'active', label: 'Running' }, { value: 'archived', label: 'Archived' }, { value: 'all', label: 'All' }]} />
      <div className="card">
        {data.plans.length === 0 ? <Empty icon={<BookOpenCheck size={26} />} title={status === 'active' ? 'No plan running' : 'Nothing here'} body="Pick a template: the whole Bible in a year, the New Testament in 90 days, the Gospels in 30, or Psalms and Proverbs in a month. Or paste your own list." action={canEdit && status === 'active' ? <button className="btn primary" onClick={() => setCreating(true)}><Plus size={16} /> Start a plan</button> : undefined} /> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Plan</th><th>Dates</th><th>Today</th><th className="num">Readers</th><th>Read today</th><th>Together</th></tr></thead>
            <tbody>{data.plans.map((p) => {
              const bar = p.participants ? Math.round((100 * p.readToday) / p.participants) : 0;
              return (
                <tr key={p.id} className="clickable" onClick={() => setOpen(p.id)}>
                  <td><b>{p.name}</b>{p.status === 'archived' && <span className="badge gray" style={{ marginLeft: 6 }}>Archived</span>}<div className="small muted">{data.templates.find((t) => t.id === p.template)?.name ?? 'Custom'} · {p.totalDays} days</div></td>
                  <td className="small">{formatDate(p.startsOn)} – {formatDate(p.endsOn)}</td>
                  <td className="small">{p.today ? <>Day {p.today}<div className="muted ellipsis" style={{ maxWidth: 220 }}>{p.readings[p.today - 1]}</div></> : Date.parse(p.startsOn) > Date.now() ? <span className="muted">Not started</span> : <span className="muted">Finished</span>}</td>
                  <td className="num">{p.participants}</td>
                  <td style={{ minWidth: 140 }}><div className="small">{p.readToday} of {p.participants}</div><div className="meter"><i style={{ width: `${bar}%` }} /></div></td>
                  <td className="small">{p.percent}%</td>
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
      </div>
      {current && <Detail p={current} canEdit={canEdit} templateName={data.templates.find((t) => t.id === current.template)?.name ?? 'Custom'} onClose={() => setOpen(null)} onChanged={reload} />}
      {creating && <StartPlan templates={data.templates} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); toast('Plan started; members can join in the app'); reload(); }} />}
    </>
  );
}

function Detail({ p, canEdit, templateName, onClose, onChanged }: { p: ReadingPlanView; canEdit: boolean; templateName: string; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const readers = useApi(() => AdminApi.reading.readers(p.id), [p.id, p.readToday, p.participants]);
  const update = useAction((input: { status?: 'active' | 'archived'; name?: string; description?: string }) => AdminApi.reading.update(p.id, input));
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(p.name);
  const [description, setDescription] = useState(p.description);
  const bar = p.participants ? Math.round((100 * p.readToday) / p.participants) : 0;
  return (
    <Modal side title={p.name} onClose={onClose}>
      <div className="stack">
        <div className="small muted">{templateName} · {p.totalDays} days · {formatDate(p.startsOn)} to {formatDate(p.endsOn)} · started by {p.createdBy}</div>
        {p.description && <p style={{ margin: 0 }}>{p.description}</p>}
        {p.today && <div className="card card-pad stack" style={{ gap: 4 }}><span className="small muted">Today, day {p.today}</span><b style={{ fontSize: 18 }}>{p.readings[p.today - 1]}</b></div>}
        <div className="stack" style={{ gap: 6 }}>
          <div className="small"><b>{p.readToday}</b> of <b>{p.participants}</b> readers have read today · together {p.percent}% of the plan so far</div>
          <div className="meter"><i style={{ width: `${bar}%` }} /></div>
        </div>
        <FormError error={update.error} />
        {canEdit && !editing && (
          <div className="row wrap" style={{ gap: 8 }}>
            <button className="btn" onClick={() => setEditing(true)}>Rename</button>
            {p.status === 'active' ? <button className="btn ghost" disabled={update.busy} onClick={async () => { if (await update.run({ status: 'archived' })) { toast('Archived; it leaves the app'); onChanged(); } }}>Archive</button>
              : <button className="btn" disabled={update.busy} onClick={async () => { if (await update.run({ status: 'active' })) { toast('Running again'); onChanged(); } }}>Put back in the app</button>}
          </div>
        )}
        {editing && (
          <div className="card card-pad stack">
            <Field label="Name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="A line for members"><input className="input" value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
            <div className="row" style={{ gap: 8 }}><button className="btn primary" disabled={update.busy || !name.trim()} onClick={async () => { if (await update.run({ name, description })) { toast('Saved'); setEditing(false); onChanged(); } }}>Save</button><button className="btn ghost" onClick={() => setEditing(false)}>Cancel</button></div>
          </div>
        )}
        <div className="stack" style={{ gap: 6 }}>
          <b className="small">Who is reading</b>
          {!readers.data ? <Loading /> : readers.data.length === 0 ? <span className="small muted">No one has joined yet. It is under “Bible reading plan” on the app home.</span> : readers.data.map((r) => (
            <div key={r.personId} className="row small" style={{ gap: 8, justifyContent: 'space-between' }}>
              <span><b>{r.name}</b> <span className="muted">· {r.doneCount} day{r.doneCount === 1 ? '' : 's'}{r.streak > 1 ? ` · ${r.streak} in a row` : ''}</span></span>
              <span className={`badge ${r.todayDone ? 'ok' : 'gray'}`}>{r.todayDone ? 'Read today' : 'Not yet'}</span>
            </div>
          ))}
        </div>
        <div className="stack" style={{ gap: 4 }}>
          <b className="small">The readings</b>
          <div className="small muted" style={{ maxHeight: 220, overflowY: 'auto' }}>{p.readings.map((r, i) => <div key={i}><span className="mono" style={{ display: 'inline-block', width: 34 }}>{i + 1}</span>{r}</div>)}</div>
        </div>
      </div>
    </Modal>
  );
}

function StartPlan({ templates, onClose, onSaved }: { templates: { id: ReadingTemplate; name: string; days: number; description: string }[]; onClose: () => void; onSaved: () => void }) {
  const [template, setTemplate] = useState<ReadingTemplate>('nt90');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [startsOn, setStartsOn] = useState(new Date(Date.now() + 86_400_000).toISOString().slice(0, 10));
  const [readings, setReadings] = useState('');
  const tpl = templates.find((t) => t.id === template)!;
  const lines = readings.split('\n').map((l) => l.trim()).filter(Boolean).length;
  const save = useAction(() => AdminApi.reading.create({ template, name: name.trim() || undefined, description, startsOn, readings: template === 'custom' ? readings : undefined }));
  return (
    <Modal title="Start a reading plan" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={save.busy || !startsOn || (template === 'custom' && lines < 2)} onClick={async () => { if (await save.run()) onSaved(); }}>Start</button></>}>
      <div className="stack">
        <FormError error={save.error} />
        <Field label="Plan">
          <select className="select" value={template} onChange={(e) => setTemplate(e.target.value as ReadingTemplate)}>{templates.map((t) => <option key={t.id} value={t.id}>{t.name}{t.days ? ` (${t.days} days)` : ''}</option>)}</select>
        </Field>
        <p className="small muted" style={{ margin: 0 }}>{tpl.description}</p>
        {template === 'custom' && <Field label="One day per line" hint={`${lines} day${lines === 1 ? '' : 's'} so far`}><textarea className="input mono" rows={8} value={readings} onChange={(e) => setReadings(e.target.value)} placeholder={'Luke 1-2\nLuke 3-4\nIsaiah 53; Psalms 22'} /></Field>}
        <div className="grid cols-2">
          <Field label="Starts on"><input className="input" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} /></Field>
          <Field label="Name" hint="Blank keeps the template’s name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={tpl.name} /></Field>
        </div>
        <Field label="A line for members (optional)"><input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Let’s read the Gospels together this Advent." /></Field>
      </div>
    </Modal>
  );
}
