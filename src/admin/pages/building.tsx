// Giving › Building project: a new church building open to the members. Set the budget and the
// stages, post progress with photos, list each contractor bill as it comes in and is paid, and see
// money raised from the project's fund and the pledges behind. Members see the same figures in the
// app under Church building, and get a gentle reminder on the 1st when their pledge is behind.
import { Building2, Check, Eye, EyeOff, ImagePlus, Pencil, Plus, Send, Trash2, X } from 'lucide-react';
import { useState } from 'react';

import { AdminApi, type BuildingBillInput, type BuildingInput } from '@/api/endpoints';
import type { BuildingBill, BuildingHub, BuildingPhoto, BuildingProjectView, BuildingStage, Currency } from '@/core/types';
import { Empty, ErrorState, Field, FormError, Loading, Modal, useHiddenRows, useToast, useUndoableDelete } from '@/components/ui';
import { formatDate, formatMoney } from '@/lib/format';
import { useAction, useApi } from '@/lib/use-api';

import { PageHeader } from '../layout';
import { uploadMedia } from './media';

const STATUS: Record<BuildingProjectView['status'], string> = { planning: 'Planning', building: 'Under construction', paused: 'On hold', done: 'Completed' };
const day = (d: string) => formatDate(`${d}T12:00:00`);
const today = () => new Date().toISOString().slice(0, 10);
const rupees = (paise: number) => (paise ? String(paise / 100) : '');
const toPaise = (s: string) => Math.round((Number(s) || 0) * 100);

export function BuildingPage() {
  const q = useApi(AdminApi.building.get);
  const [hubData, setHub] = useState<BuildingHub | null>(null);
  const [editing, setEditing] = useState<BuildingProjectView | 'new' | null>(null);
  const toast = useToast();
  const d = hubData ?? q.data;
  const title = 'Building project';
  if (q.error) return <><PageHeader title={title} /><ErrorState error={q.error} onRetry={q.reload} /></>;
  if (!d) return <><PageHeader title={title} /><Loading /></>;
  const replace = (p: BuildingProjectView) => setHub({ ...d, projects: d.projects.some((x) => x.id === p.id) ? d.projects.map((x) => (x.id === p.id ? p : x)) : [p, ...d.projects] });
  return (
    <>
      <PageHeader
        title={title}
        subtitle="Show members where the building work has reached and where every rupee has gone: progress photos, money raised against the budget, each contractor bill, and reminders for pledges that are behind. Members see it in the app once you publish it."
        actions={<button className="btn primary" onClick={() => setEditing('new')}><Plus size={15} /> New project</button>}
      />
      {!d.projects.length ? (
        <Empty title="No building project yet" body="Start one for a new sanctuary, a hall, a roof or a parsonage. Choose the fund the gifts go to and set the budget." action={<button className="btn primary" onClick={() => setEditing('new')}><Plus size={15} /> New project</button>} />
      ) : (
        <div className="stack" style={{ gap: 20 }}>
          {d.projects.map((p) => <ProjectCard key={p.id} p={p} currency={d.currency} onChange={replace} onEdit={() => setEditing(p)} onRemoved={(h) => { setHub(h); toast('Project removed'); }} />)}
        </div>
      )}
      {editing && <ProjectModal hub={d} prev={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={(p) => { setEditing(null); replace(p); toast('Saved'); }} />}
    </>
  );
}

function ProjectCard({ p, currency, onChange, onEdit, onRemoved }: { p: BuildingProjectView; currency: Currency; onChange: (p: BuildingProjectView) => void; onEdit: () => void; onRemoved: (h: BuildingHub) => void }) {
  const m = (n: number) => formatMoney(n, currency);
  const [posting, setPosting] = useState(false);
  const [bill, setBill] = useState<BuildingBill | 'new' | null>(null);
  const [showBehind, setShowBehind] = useState(false);
  const [sureDelete, setSureDelete] = useState(false);
  const toast = useToast();
  const rows = useHiddenRows();
  const undoable = useUndoableDelete();
  const publish = useAction(async () => onChange(await AdminApi.building.update(p.id, { published: !p.published })));
  const remind = useAction(async () => { const r = await AdminApi.building.remind(p.id); toast(r.sent ? `Reminder sent to ${r.sent} member${r.sent === 1 ? '' : 's'}` : 'No pledges are behind'); });
  const del = useAction(async () => onRemoved(await AdminApi.building.remove(p.id)));
  const pay = useAction(async (b: BuildingBill) => { onChange(await AdminApi.building.updateBill(p.id, b.id, { status: 'paid', paidAt: today() })); toast('Marked paid'); });
  const pct = p.budget ? Math.round((p.money.raised / p.budget) * 100) : 0;
  const removeUpdate = (id: string) => undoable({ text: 'Update removed.', hide: () => rows.hide(id), show: () => rows.show(id), run: () => AdminApi.building.removeUpdate(p.id, id), done: () => void AdminApi.building.get().then((h) => { const next = h.projects.find((x) => x.id === p.id); if (next) onChange(next); }) });
  const removeBill = (id: string) => undoable({ text: 'Bill removed.', hide: () => rows.hide(id), show: () => rows.show(id), run: () => AdminApi.building.removeBill(p.id, id), done: () => void AdminApi.building.get().then((h) => { const next = h.projects.find((x) => x.id === p.id); if (next) onChange(next); }) });
  const stageName = (id: string | null) => p.stages.find((s) => s.id === id)?.name;

  return (
    <article className="stack" style={{ gap: 12 }}>
      <div className="card" style={{ overflow: 'hidden' }}>
        {p.coverUrl && <img src={p.coverUrl} alt="" style={{ width: '100%', maxHeight: 220, objectFit: 'cover', display: 'block' }} />}
        <div className="card-pad stack" style={{ gap: 10 }}>
          <div className="row between wrap" style={{ gap: 8 }}>
            <div className="row wrap" style={{ gap: 8 }}>
              <Building2 size={20} className="muted" />
              <h2 style={{ margin: 0 }}>{p.title}</h2>
              <span className="badge">{STATUS[p.status]}</span>
              {p.published ? <span className="badge ok">Members can see it</span> : <span className="badge gray">Office only</span>}
            </div>
            <div className="row wrap" style={{ gap: 6 }}>
              <button className="btn sm" disabled={publish.busy} onClick={() => publish.run()}>{p.published ? <><EyeOff size={14} /> Hide from members</> : <><Eye size={14} /> Publish to members</>}</button>
              <button className="btn sm" onClick={onEdit}><Pencil size={14} /> Edit</button>
            </div>
          </div>
          <FormError error={publish.error ?? remind.error ?? pay.error ?? del.error} />
          <div className="row between wrap" style={{ gap: 6, alignItems: 'baseline' }}>
            <span><b style={{ fontSize: '1.4rem' }}>{m(p.money.raised)}</b> <span className="muted">raised of {m(p.budget)} ({pct}%) in {p.fundName}</span></span>
            <span className="small muted">{day(p.startDate)}{p.targetDate ? ` to ${day(p.targetDate)}` : ''}</span>
          </div>
          <div style={{ height: 12, borderRadius: 6, background: 'var(--border)', overflow: 'hidden', position: 'relative' }}>
            <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: 'var(--primary)' }} />
            {p.budget > 0 && <div title="Spent" style={{ position: 'absolute', left: 0, top: 8, height: 4, width: `${Math.min(100, Math.round((p.money.spent / p.budget) * 100))}%`, background: 'var(--accent, #e0a800)' }} />}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
            <Figure label="Spent (bills paid)" value={m(p.money.spent)} />
            <Figure label="In hand" value={m(p.money.balance)} warn={p.money.balance < 0} />
            <Figure label="Bills due" value={m(p.money.due)} warn={p.money.due > p.money.balance} />
            <Figure label="Givers" value={`${p.money.givers} · ${p.money.gifts} gifts`} />
            <Figure label="Pledged" value={`${m(p.money.pledged)} · ${p.money.pledgers}`} sub={`${m(p.money.pledgeGiven)} in`} />
          </div>
          {p.money.pledgers > 0 && (
            <div className="row wrap" style={{ gap: 8 }}>
              <span className="small">{p.money.behind ? `${p.money.behind} pledge${p.money.behind === 1 ? ' is' : 's are'} behind.` : 'Every pledge is on track.'} {p.pledgeReminders ? 'A gentle reminder goes on the 1st of each month.' : 'Monthly reminders are off.'}</span>
              {p.money.behind > 0 && <button className="btn sm ghost" onClick={() => setShowBehind(!showBehind)}>{showBehind ? 'Hide' : 'Who?'}</button>}
              {p.money.behind > 0 && <button className="btn sm" disabled={remind.busy} onClick={() => remind.run()}><Send size={14} /> Remind now</button>}
            </div>
          )}
          {showBehind && <Behind id={p.id} currency={currency} />}
        </div>
      </div>

      {p.stages.length > 0 && (
        <div className="card">
          {p.stages.map((s, i) => (
            <div key={s.id} className="row wrap" style={{ gap: 10, padding: '10px 14px', borderTop: i ? '1px solid var(--border)' : 0 }}>
              <span style={{ width: 12, height: 12, borderRadius: 6, flex: 'none', background: s.status === 'done' ? 'var(--ok, green)' : s.status === 'doing' ? 'var(--warn, orange)' : 'var(--border)' }} />
              <span className="grow">{s.name}</span>
              <span className="small muted">{s.budget ? m(s.budget) : ''} · {s.status === 'done' ? `Done${s.doneAt ? ` ${day(s.doneAt)}` : ''}` : s.status === 'doing' ? 'Under way' : 'Coming'}</span>
              <span className="small">{m(p.bills.filter((b) => b.stageId === s.id && b.status === 'paid').reduce((t, b) => t + b.amount, 0))} paid</span>
            </div>
          ))}
        </div>
      )}

      <section className="stack" style={{ gap: 8 }}>
        <div className="row between wrap" style={{ gap: 8 }}>
          <h3 style={{ margin: 0 }}>Progress</h3>
          <button className="btn sm" onClick={() => setPosting(true)}><ImagePlus size={14} /> Post an update</button>
        </div>
        {!p.updates.length ? <div className="card card-pad small muted">Post a photo of the site every few weeks. Members trust what they can see.</div> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
            {p.updates.filter((u) => !rows.hidden.has(u.id)).map((u) => (
              <div key={u.id} className="card" style={{ overflow: 'hidden' }}>
                {u.photos[0] && <img src={u.photos[0].url} alt={u.photos[0].caption} style={{ width: '100%', aspectRatio: '16 / 9', objectFit: 'cover', display: 'block' }} />}
                <div className="card-pad stack" style={{ gap: 4 }}>
                  <div className="row between" style={{ gap: 6 }}><b>{u.title}</b><button className="btn ghost icon sm" title="Remove" onClick={() => removeUpdate(u.id)}><Trash2 size={14} /></button></div>
                  <span className="small muted">{day(u.date)}{stageName(u.stageId) ? ` · ${stageName(u.stageId)}` : ''}{u.photos.length > 1 ? ` · ${u.photos.length} photos` : ''}</span>
                  {u.body && <span className="small">{u.body}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="stack" style={{ gap: 8 }}>
        <div className="row between wrap" style={{ gap: 8 }}>
          <h3 style={{ margin: 0 }}>Contractor bills</h3>
          <button className="btn sm" onClick={() => setBill('new')}><Plus size={14} /> Add a bill</button>
        </div>
        {!p.bills.length ? <div className="card card-pad small muted">Add each bill as it comes in, and mark it paid with the cheque or voucher number.{p.showBills ? ' Members see the contractor, the work and the amount.' : ''}</div> : (
          <div className="card" style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead><tr><th>Bill</th><th>Contractor and work</th><th style={{ textAlign: 'right' }}>Amount</th><th>Status</th><th /></tr></thead>
              <tbody>
                {p.bills.filter((b) => !rows.hidden.has(b.id)).map((b) => (
                  <tr key={b.id}>
                    <td className="small">{day(b.billDate)}{b.billNumber && <div className="muted">{b.billNumber}</div>}</td>
                    <td><b>{b.contractor}</b><div className="small muted">{b.work}{stageName(b.stageId) ? ` · ${stageName(b.stageId)}` : ''}</div></td>
                    <td style={{ textAlign: 'right' }}>{m(b.amount)}</td>
                    <td>{b.status === 'paid' ? <><span className="badge ok">Paid</span><div className="small muted">{b.paidAt ? day(b.paidAt) : ''}{b.voucher ? ` · ${b.voucher}` : ''}</div></> : <span className="badge warn">Due</span>}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {b.billUrl && <a className="btn ghost sm" href={b.billUrl} target="_blank" rel="noreferrer">Bill</a>}
                      {b.status === 'due' && <button className="btn sm" disabled={pay.busy} onClick={() => pay.run(b)}><Check size={14} /> Paid</button>}
                      <button className="btn ghost icon sm" title="Edit" onClick={() => setBill(b)}><Pencil size={14} /></button>
                      <button className="btn ghost icon sm" title="Remove" onClick={() => removeBill(b.id)}><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
        {!sureDelete ? <button className="btn sm ghost" onClick={() => setSureDelete(true)}><Trash2 size={14} /> Remove project</button> : (
          <>
            <span className="small">This removes its updates and bills. Gifts and pledges stay in Giving.</span>
            <button className="btn sm danger" disabled={del.busy} onClick={() => del.run()}>Remove</button>
            <button className="btn sm ghost" onClick={() => setSureDelete(false)}>Keep</button>
          </>
        )}
      </div>
      {posting && <UpdateModal p={p} onClose={() => setPosting(false)} onSaved={(next) => { setPosting(false); onChange(next); toast(p.published ? 'Posted. Members have been told.' : 'Posted'); }} />}
      {bill && <BillModal p={p} prev={bill === 'new' ? null : bill} currency={currency} onClose={() => setBill(null)} onSaved={(next) => { setBill(null); onChange(next); toast('Bill saved'); }} />}
    </article>
  );
}

function Figure({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div className="card" style={{ padding: 10 }}>
      <div className="small muted">{label}</div>
      <b style={{ color: warn ? 'var(--danger)' : undefined }}>{value}</b>
      {sub && <div className="small muted">{sub}</div>}
    </div>
  );
}

function Behind({ id, currency }: { id: string; currency: Currency }) {
  const q = useApi(() => AdminApi.building.behind(id), [id]);
  if (q.error) return <ErrorState error={q.error} onRetry={q.reload} />;
  if (!q.data) return <Loading />;
  return (
    <div className="card" style={{ overflowX: 'auto' }}>
      <table className="table">
        <thead><tr><th>Member</th><th style={{ textAlign: 'right' }}>Pledged</th><th style={{ textAlign: 'right' }}>Given</th><th style={{ textAlign: 'right' }}>Behind by</th></tr></thead>
        <tbody>{q.data.map((x) => <tr key={x.personId}><td>{x.name}{x.phone && <div className="small muted">{x.phone}</div>}</td><td style={{ textAlign: 'right' }}>{formatMoney(x.amount, currency)}</td><td style={{ textAlign: 'right' }}>{formatMoney(x.given, currency)}</td><td style={{ textAlign: 'right' }}>{formatMoney(x.short, currency)}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

function ProjectModal({ hub, prev, onClose, onSaved }: { hub: BuildingHub; prev: BuildingProjectView | null; onClose: () => void; onSaved: (p: BuildingProjectView) => void }) {
  const [d, setD] = useState({
    title: prev?.title ?? '',
    fundId: prev?.fundId ?? hub.funds.find((f) => /build/i.test(f.name))?.id ?? hub.funds[0]?.id ?? '',
    budget: rupees(prev?.budget ?? 0),
    startDate: prev?.startDate ?? today(),
    targetDate: prev?.targetDate ?? '',
    status: prev?.status ?? 'planning',
    description: prev?.description ?? '',
    coverUrl: prev?.coverUrl ?? '',
    showBills: prev?.showBills ?? true,
    showBillFiles: prev?.showBillFiles ?? false,
    pledgeReminders: prev?.pledgeReminders ?? true,
  });
  const [stages, setStages] = useState<(Partial<BuildingStage> & { name: string; budgetText: string })[]>((prev?.stages ?? []).map((s) => ({ ...s, budgetText: rupees(s.budget) })));
  const [uploading, setUploading] = useState<number | null>(null);
  const cover = useAction(async (f: File | undefined) => { if (!f) return; const item = await uploadMedia(f, 'events', setUploading); setUploading(null); setD((x) => ({ ...x, coverUrl: item.url })); });
  const save = useAction(async () => {
    const body: BuildingInput = { ...d, budget: toPaise(d.budget), targetDate: d.targetDate || null, coverUrl: d.coverUrl || null, stages: stages.filter((s) => s.name.trim()).map((s) => ({ id: s.id, name: s.name.trim(), budget: toPaise(s.budgetText), status: s.status ?? 'todo' })) };
    onSaved(prev ? await AdminApi.building.update(prev.id, body) : await AdminApi.building.create(body));
  });
  const set = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => setD((x) => ({ ...x, [k]: v }));
  return (
    <Modal title={prev ? `Edit ${prev.title}` : 'New building project'} onClose={onClose} wide footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={save.busy || !d.title.trim() || !d.fundId} onClick={() => save.run()}>Save</button></>}>
      <div className="stack">
        <FormError error={save.error ?? cover.error} />
        <Field label="Name"><input className="input" value={d.title} onChange={(e) => set('title', e.target.value)} placeholder="New sanctuary" autoFocus /></Field>
        <div className="grid cols-2">
          <Field label="Gifts come from" hint="Money raised is counted from this fund">
            <select className="select" value={d.fundId} onChange={(e) => set('fundId', e.target.value)}>{hub.funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
          </Field>
          <Field label={`Budget (${hub.currency})`}><input className="input" type="number" min={0} value={d.budget} onChange={(e) => set('budget', e.target.value)} placeholder="24000000" /></Field>
          <Field label="Start"><input className="input" type="date" value={d.startDate} onChange={(e) => set('startDate', e.target.value)} /></Field>
          <Field label="Target completion" hint="Optional"><input className="input" type="date" value={d.targetDate} onChange={(e) => set('targetDate', e.target.value)} /></Field>
          <Field label="Status">
            <select className="select" value={d.status} onChange={(e) => set('status', e.target.value as typeof d.status)}>{(Object.keys(STATUS) as (keyof typeof STATUS)[]).map((k) => <option key={k} value={k}>{STATUS[k]}</option>)}</select>
          </Field>
          <Field label="Cover picture" hint={uploading !== null ? `Uploading ${uploading}%` : 'The architect\'s drawing or a site photo'}>
            <div className="row" style={{ gap: 6 }}>
              {d.coverUrl && <img src={d.coverUrl} alt="" style={{ width: 54, height: 36, objectFit: 'cover', borderRadius: 4 }} />}
              <label className="btn sm"><ImagePlus size={14} /> Upload<input type="file" accept="image/*" hidden onChange={(e) => cover.run(e.target.files?.[0])} /></label>
              {d.coverUrl && <button className="btn sm ghost" onClick={() => set('coverUrl', '')}><X size={14} /></button>}
            </div>
          </Field>
        </div>
        <Field label="About the project" hint="What is being built, who designed it, who is building it"><textarea className="input" rows={3} value={d.description} onChange={(e) => set('description', e.target.value)} /></Field>
        <Field label="Stages" hint="For example: approvals, foundation, columns and slab, walls and roof, finishing">
          <div className="stack" style={{ gap: 6 }}>
            {stages.map((s, i) => (
              <div key={s.id ?? i} className="row wrap" style={{ gap: 6 }}>
                <input className="input grow" style={{ minWidth: 160 }} value={s.name} onChange={(e) => setStages(stages.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="Stage name" />
                <input className="input" style={{ width: 130 }} type="number" min={0} value={s.budgetText} onChange={(e) => setStages(stages.map((x, j) => (j === i ? { ...x, budgetText: e.target.value } : x)))} placeholder="Budget" />
                <select className="select" style={{ width: 130 }} value={s.status ?? 'todo'} onChange={(e) => setStages(stages.map((x, j) => (j === i ? { ...x, status: e.target.value as BuildingStage['status'] } : x)))}>
                  <option value="todo">Coming</option><option value="doing">Under way</option><option value="done">Done</option>
                </select>
                <button className="btn ghost icon sm" title="Remove stage" onClick={() => setStages(stages.filter((_, j) => j !== i))}><X size={14} /></button>
              </div>
            ))}
            <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setStages([...stages, { name: '', budgetText: '', status: 'todo' }])}><Plus size={14} /> Add a stage</button>
          </div>
        </Field>
        <label className="check"><input type="checkbox" checked={d.showBills} onChange={(e) => set('showBills', e.target.checked)} /><span>Members see each contractor bill (contractor, work, amount, paid or due)</span></label>
        {d.showBills && <label className="check"><input type="checkbox" checked={d.showBillFiles} onChange={(e) => set('showBillFiles', e.target.checked)} /><span>Members can open the scanned bills too <span className="small muted">(check they carry no bank details)</span></span></label>}
        <label className="check"><input type="checkbox" checked={d.pledgeReminders} onChange={(e) => set('pledgeReminders', e.target.checked)} /><span>Remind members on the 1st when their pledge to this fund is behind</span></label>
      </div>
    </Modal>
  );
}

function UpdateModal({ p, onClose, onSaved }: { p: BuildingProjectView; onClose: () => void; onSaved: (p: BuildingProjectView) => void }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [date, setDate] = useState(today());
  const [stageId, setStageId] = useState(p.stages.find((s) => s.status === 'doing')?.id ?? '');
  const [photos, setPhotos] = useState<BuildingPhoto[]>([]);
  const [notify, setNotify] = useState(true);
  const [uploading, setUploading] = useState<number | null>(null);
  const upload = useAction(async (files: FileList | null) => {
    for (const f of Array.from(files ?? []).slice(0, 12 - photos.length)) {
      const item = await uploadMedia(f, 'events', setUploading);
      setPhotos((x) => [...x, { url: item.url, caption: '' }]);
    }
    setUploading(null);
  });
  const save = useAction(async () => onSaved(await AdminApi.building.addUpdate(p.id, { title: title.trim(), body: body.trim(), date, stageId: stageId || null, photos, notify })));
  return (
    <Modal title="Post a progress update" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={save.busy || !title.trim() || uploading !== null} onClick={() => save.run()}>Post</button></>}>
      <div className="stack">
        <FormError error={save.error ?? upload.error} />
        <Field label="Heading"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="First slab cast" autoFocus /></Field>
        <div className="grid cols-2">
          <Field label="Date"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Stage">
            <select className="select" value={stageId} onChange={(e) => setStageId(e.target.value)}><option value="">None</option>{p.stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          </Field>
        </div>
        <Field label="What happened" hint="Two or three sentences"><textarea className="input" rows={3} value={body} onChange={(e) => setBody(e.target.value)} /></Field>
        <Field label="Photos" hint={uploading !== null ? `Uploading ${uploading}%` : 'Up to 12'}>
          <div className="stack" style={{ gap: 6 }}>
            {photos.map((ph, i) => (
              <div key={ph.url} className="row" style={{ gap: 6 }}>
                <img src={ph.url} alt="" style={{ width: 64, height: 48, objectFit: 'cover', borderRadius: 4 }} />
                <input className="input grow" value={ph.caption} onChange={(e) => setPhotos(photos.map((x, j) => (j === i ? { ...x, caption: e.target.value } : x)))} placeholder="Caption" />
                <button className="btn ghost icon sm" onClick={() => setPhotos(photos.filter((_, j) => j !== i))}><X size={14} /></button>
              </div>
            ))}
            <label className="btn sm" style={{ alignSelf: 'flex-start' }}><ImagePlus size={14} /> Add photos<input type="file" accept="image/*" multiple hidden onChange={(e) => upload.run(e.target.files)} /></label>
          </div>
        </Field>
        {p.published && <label className="check"><input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /><span>Tell the members in the app</span></label>}
      </div>
    </Modal>
  );
}

function BillModal({ p, prev, currency, onClose, onSaved }: { p: BuildingProjectView; prev: BuildingBill | null; currency: Currency; onClose: () => void; onSaved: (p: BuildingProjectView) => void }) {
  const [d, setD] = useState({
    contractor: prev?.contractor ?? '',
    work: prev?.work ?? '',
    amount: rupees(prev?.amount ?? 0),
    billDate: prev?.billDate ?? today(),
    billNumber: prev?.billNumber ?? '',
    stageId: prev?.stageId ?? p.stages.find((s) => s.status === 'doing')?.id ?? '',
    status: prev?.status ?? 'due',
    paidAt: prev?.paidAt ?? today(),
    voucher: prev?.voucher ?? '',
    billUrl: prev?.billUrl ?? '',
  });
  const [uploading, setUploading] = useState<number | null>(null);
  const contractors = [...new Set(p.bills.map((b) => b.contractor))];
  const file = useAction(async (f: File | undefined) => { if (!f) return; const item = await uploadMedia(f, 'general', setUploading); setUploading(null); setD((x) => ({ ...x, billUrl: item.url })); });
  const save = useAction(async () => {
    const body: BuildingBillInput = { ...d, amount: toPaise(d.amount), stageId: d.stageId || null, billUrl: d.billUrl || null, paidAt: d.status === 'paid' ? d.paidAt : null };
    onSaved(prev ? await AdminApi.building.updateBill(p.id, prev.id, body) : await AdminApi.building.addBill(p.id, body));
  });
  const set = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => setD((x) => ({ ...x, [k]: v }));
  return (
    <Modal title={prev ? 'Edit bill' : 'Add a contractor bill'} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={save.busy || !d.contractor.trim() || !d.work.trim() || !Number(d.amount) || uploading !== null} onClick={() => save.run()}>Save</button></>}>
      <div className="stack">
        <FormError error={save.error ?? file.error} />
        <Field label="Contractor or supplier">
          <input className="input" list="bld-contractors" value={d.contractor} onChange={(e) => set('contractor', e.target.value)} autoFocus />
          <datalist id="bld-contractors">{contractors.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
        <Field label="Work or goods"><input className="input" value={d.work} onChange={(e) => set('work', e.target.value)} placeholder="Columns and first slab, running bill 3" /></Field>
        <div className="grid cols-2">
          <Field label={`Amount (${currency})`}><input className="input" type="number" min={1} step="0.01" value={d.amount} onChange={(e) => set('amount', e.target.value)} /></Field>
          <Field label="Bill date"><input className="input" type="date" value={d.billDate} onChange={(e) => set('billDate', e.target.value)} /></Field>
          <Field label="Bill number" hint="Optional"><input className="input" value={d.billNumber} onChange={(e) => set('billNumber', e.target.value)} /></Field>
          <Field label="Stage">
            <select className="select" value={d.stageId} onChange={(e) => set('stageId', e.target.value)}><option value="">None</option>{p.stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          </Field>
          <Field label="Status">
            <select className="select" value={d.status} onChange={(e) => set('status', e.target.value as 'due' | 'paid')}><option value="due">Due</option><option value="paid">Paid</option></select>
          </Field>
          {d.status === 'paid' && <Field label="Paid on"><input className="input" type="date" value={d.paidAt} onChange={(e) => set('paidAt', e.target.value)} /></Field>}
          {d.status === 'paid' && <Field label="Cheque or voucher number" hint="Office only"><input className="input" value={d.voucher} onChange={(e) => set('voucher', e.target.value)} /></Field>}
        </div>
        <Field label="Scanned bill" hint={uploading !== null ? `Uploading ${uploading}%` : 'Optional. Members see it only if you allow it.'}>
          <div className="row" style={{ gap: 6 }}>
            {d.billUrl && <a className="small" href={d.billUrl} target="_blank" rel="noreferrer">Attached</a>}
            <label className="btn sm"><Plus size={14} /> Upload<input type="file" accept="image/*,application/pdf" hidden onChange={(e) => file.run(e.target.files?.[0])} /></label>
            {d.billUrl && <button className="btn sm ghost" onClick={() => set('billUrl', '')}><X size={14} /></button>}
          </div>
        </Field>
      </div>
    </Modal>
  );
}
