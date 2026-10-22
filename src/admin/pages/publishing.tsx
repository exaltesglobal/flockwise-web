import { ArrowDown, ArrowUp, BookOpen, Copy, ExternalLink, Globe, ListPlus, Pencil, Plus, Search, Sparkles, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import type { CustomField, CustomFieldType, PublicPage, Sermon } from '@/api/admin-types';
import { AdminApi } from '@/api/endpoints';
import { Empty, ErrorState, Field, FormError, Loading, Modal, useToast } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { useAction, useApi } from '@/lib/use-api';

import { SermonAiModal, useAi } from '../ai';
import { PageHeader } from '../layout';

// ---------- sermon library ----------

const blankSermon = (): Partial<Sermon> => ({
  title: '', speaker: '', date: new Date().toISOString().slice(0, 10), series: '', scripture: '', description: '',
  videoUrl: '', audioUrl: '', notesUrl: '', imageUrl: '', published: true, eventId: null,
});

/** Sermon library: every message with its video, audio and notes, shown to members and on the public church page. */
export function SermonsPage() {
  const list = useApi(AdminApi.sermons.list);
  const [editing, setEditing] = useState<Sermon | 'new' | null>(null);
  const [followUp, setFollowUp] = useState<Sermon | null>(null);
  const ai = useAi();
  const [q, setQ] = useState('');
  const [series, setSeries] = useState('');
  const toast = useToast();

  const allSeries = useMemo(() => [...new Set((list.data ?? []).map((s) => s.series).filter(Boolean))].sort(), [list.data]);
  const shown = (list.data ?? []).filter((s) =>
    (!series || s.series === series) &&
    (!q || `${s.title} ${s.speaker} ${s.scripture} ${s.series}`.toLowerCase().includes(q.toLowerCase())));

  return (
    <>
      <PageHeader title="Sermons" subtitle="Your message library. Published sermons appear in the member app and on your public church page."
        actions={<button className="btn primary" onClick={() => setEditing('new')}><Plus size={16} /> Add sermon</button>} />
      <div className="row wrap" style={{ gap: 8, marginBottom: 14 }}>
        <div className="search grow" style={{ minWidth: 200 }}>
          <Search size={16} className="muted" />
          <input className="input" placeholder="Search title, speaker or passage" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {allSeries.length > 0 && (
          <select className="input" style={{ width: 'auto' }} value={series} onChange={(e) => setSeries(e.target.value)}>
            <option value="">All series</option>
            {allSeries.map((s) => <option key={s}>{s}</option>)}
          </select>
        )}
      </div>
      <div className="card">
        {list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : !list.data ? <Loading /> : shown.length === 0 ? (
          <Empty icon={<BookOpen size={28} />} title={list.data.length ? 'No matches' : 'No sermons yet'}
            body={list.data.length ? 'Try a different search.' : 'Add last Sunday’s message with a YouTube link, audio and notes. Members can catch up during the week.'} />
        ) : shown.map((s) => (
          <div key={s.id} className="list-row">
            <div className="sermon-thumb">{s.imageUrl ? <img src={s.imageUrl} alt="" /> : <BookOpen size={18} />}</div>
            <div className="grow" style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>{s.title} {!s.published && <span className="badge gray">Draft</span>}</div>
              <div className="small muted">{[formatDate(s.date), s.speaker, s.scripture, s.series].filter(Boolean).join(' · ')}</div>
            </div>
            <div className="row small" style={{ gap: 6 }}>
              {s.videoUrl && <a className="chip" href={s.videoUrl} target="_blank" rel="noreferrer">Video</a>}
              {s.audioUrl && <a className="chip" href={s.audioUrl} target="_blank" rel="noreferrer">Audio</a>}
              {s.notesUrl && <a className="chip" href={s.notesUrl} target="_blank" rel="noreferrer">Notes</a>}
            </div>
            {ai && <button className="btn ghost icon sm" onClick={() => setFollowUp(s)} aria-label="Follow-up material with AI" title="Small-group questions, summary, social posts"><Sparkles size={15} /></button>}
            <button className="btn ghost icon sm" onClick={() => setEditing(s)} aria-label="Edit"><Pencil size={15} /></button>
            <button className="btn ghost icon sm danger" aria-label="Delete" onClick={async () => {
              if (!confirm(`Delete “${s.title}”?`)) return;
              await AdminApi.sermons.remove(s.id);
              toast('Deleted');
              list.reload();
            }}><Trash2 size={15} /></button>
          </div>
        ))}
      </div>
      {followUp && <SermonAiModal sermon={followUp} onClose={() => setFollowUp(null)} />}
      {editing && <SermonForm sermon={editing === 'new' ? null : editing} series={allSeries} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); list.reload(); toast('Saved'); }} />}
    </>
  );
}

function SermonForm({ sermon, series, onClose, onSaved }: { sermon: Sermon | null; series: string[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<Partial<Sermon>>(sermon ?? blankSermon());
  const set = (patch: Partial<Sermon>) => setForm((f) => ({ ...f, ...patch }));
  const save = useAction(() => (sermon ? AdminApi.sermons.update(sermon.id, form) : AdminApi.sermons.create(form)));
  return (
    <Modal wide title={sermon ? 'Edit sermon' : 'New sermon'} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={save.busy || !form.title?.trim()} onClick={async () => { if (await save.run()) onSaved(); }}>Save</button></>}>
      <div className="stack">
        <FormError error={save.error} />
        <Field label="Title"><input className="input" autoFocus value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder="The Good Shepherd" /></Field>
        <div className="grid cols-3">
          <Field label="Speaker"><input className="input" value={form.speaker} onChange={(e) => set({ speaker: e.target.value })} placeholder="Ps. Samuel" /></Field>
          <Field label="Date"><input className="input" type="date" value={form.date?.slice(0, 10)} onChange={(e) => set({ date: e.target.value })} /></Field>
          <Field label="Passage"><input className="input" value={form.scripture} onChange={(e) => set({ scripture: e.target.value })} placeholder="John 10:1-18" /></Field>
        </div>
        <Field label="Series" hint="Group messages into a series so people can follow along.">
          <input className="input" list="sermon-series" value={form.series} onChange={(e) => set({ series: e.target.value })} />
          <datalist id="sermon-series">{series.map((s) => <option key={s} value={s} />)}</datalist>
        </Field>
        <Field label="Summary"><textarea className="input" rows={3} value={form.description} onChange={(e) => set({ description: e.target.value })} /></Field>
        <div className="grid cols-2">
          <Field label="Video link" hint="YouTube, Facebook or Vimeo"><input className="input" value={form.videoUrl} onChange={(e) => set({ videoUrl: e.target.value })} placeholder="https://youtube.com/watch?v=…" /></Field>
          <Field label="Audio link"><input className="input" value={form.audioUrl} onChange={(e) => set({ audioUrl: e.target.value })} placeholder="https://…mp3" /></Field>
          <Field label="Notes or slides link"><input className="input" value={form.notesUrl} onChange={(e) => set({ notesUrl: e.target.value })} placeholder="Google Drive or PDF link" /></Field>
          <Field label="Cover image link"><input className="input" value={form.imageUrl} onChange={(e) => set({ imageUrl: e.target.value })} /></Field>
        </div>
        <label className="row" style={{ gap: 8 }}>
          <input type="checkbox" checked={!!form.published} onChange={(e) => set({ published: e.target.checked })} />
          Published (visible to members and on your public page)
        </label>
      </div>
    </Modal>
  );
}

// ---------- custom people fields (Settings) ----------

const FIELD_TYPES: { value: CustomFieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'select', label: 'Choice list' },
  { value: 'checkbox', label: 'Yes / no' },
];

export function CustomFieldsSettings() {
  const list = useApi(AdminApi.fields.list);
  const [editing, setEditing] = useState<CustomField | 'new' | null>(null);
  const toast = useToast();

  async function move(f: CustomField, dir: -1 | 1) {
    const all = list.data ?? [];
    const i = all.findIndex((x) => x.id === f.id);
    const other = all[i + dir];
    if (!other) return;
    await Promise.all([AdminApi.fields.update(f.id, { order: other.order }), AdminApi.fields.update(other.id, { order: f.order })]);
    list.reload();
  }

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Custom fields</h2>
          <p className="small muted">Extra details you keep on each person, like profession, blood group or baptism date. They appear on profiles, in smart lists and in exports.</p>
        </div>
        <button className="btn sm" onClick={() => setEditing('new')}><Plus size={15} /> Add field</button>
      </div>
      {list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : !list.data ? <Loading /> : list.data.length === 0 ? (
        <Empty icon={<ListPlus size={28} />} title="No custom fields" body="Add the details your church tracks that Flockwise doesn’t have built in." />
      ) : list.data.map((f, i) => (
        <div key={f.id} className="list-row">
          <div className="grow">
            <div style={{ fontWeight: 600 }}>{f.label}</div>
            <div className="small muted">{FIELD_TYPES.find((t) => t.value === f.type)?.label}{f.options.length ? ` · ${f.options.join(', ')}` : ''}</div>
          </div>
          <button className="btn ghost icon sm" disabled={i === 0} onClick={() => move(f, -1)} aria-label="Move up"><ArrowUp size={15} /></button>
          <button className="btn ghost icon sm" disabled={i === list.data!.length - 1} onClick={() => move(f, 1)} aria-label="Move down"><ArrowDown size={15} /></button>
          <button className="btn ghost icon sm" onClick={() => setEditing(f)} aria-label="Edit"><Pencil size={15} /></button>
          <button className="btn ghost icon sm danger" aria-label="Delete" onClick={async () => {
            if (!confirm(`Remove “${f.label}”? The values saved on people are deleted too.`)) return;
            await AdminApi.fields.remove(f.id);
            toast('Removed');
            list.reload();
          }}><Trash2 size={15} /></button>
        </div>
      ))}
      {editing && <CustomFieldForm field={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); list.reload(); toast('Saved'); }} />}
    </div>
  );
}

function CustomFieldForm({ field, onClose, onSaved }: { field: CustomField | null; onClose: () => void; onSaved: () => void }) {
  const [label, setLabel] = useState(field?.label ?? '');
  const [type, setType] = useState<CustomFieldType>(field?.type ?? 'text');
  const [options, setOptions] = useState((field?.options ?? []).join('\n'));
  const opts = options.split('\n').map((s) => s.trim()).filter(Boolean);
  const save = useAction(() => (field ? AdminApi.fields.update(field.id, { label, options: opts }) : AdminApi.fields.create({ label, type, options: opts })));
  return (
    <Modal title={field ? 'Edit field' : 'New field'} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={save.busy || !label.trim() || (type === 'select' && opts.length < 2)} onClick={async () => { if (await save.run()) onSaved(); }}>Save</button></>}>
      <div className="stack">
        <FormError error={save.error} />
        <Field label="Label"><input className="input" autoFocus value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Profession" /></Field>
        <Field label="Type" hint={field ? 'The type can’t change once people have values saved.' : undefined}>
          <select className="input" value={type} disabled={!!field} onChange={(e) => setType(e.target.value as CustomFieldType)}>
            {FIELD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </Field>
        {type === 'select' && (
          <Field label="Choices" hint="One per line"><textarea className="input" rows={5} value={options} onChange={(e) => setOptions(e.target.value)} placeholder={'A+\nA-\nB+\nO+'} /></Field>
        )}
      </div>
    </Modal>
  );
}

// ---------- public church page (Settings) ----------

export const publicChurchUrl = () => `${window.location.origin}/church`;

export function PublicPageSettings() {
  const page = useApi(AdminApi.publicPage.get);
  const [form, setForm] = useState<PublicPage | null>(null);
  const save = useAction((p: PublicPage) => AdminApi.publicPage.save(p));
  const toast = useToast();
  useEffect(() => { if (page.data) setForm(page.data); }, [page.data]);
  if (page.error) return <ErrorState error={page.error} onRetry={page.reload} />;
  if (!form) return <Loading />;
  const set = (patch: Partial<PublicPage>) => setForm({ ...form, ...patch });
  const url = publicChurchUrl();

  return (
    <div className="card card-pad stack">
      <div className="row between wrap" style={{ gap: 10 }}>
        <div>
          <h2 className="row" style={{ gap: 8 }}><Globe size={18} /> Public church page</h2>
          <p className="small muted">A simple web page anyone can visit: service times, upcoming events with registration, sermons, and a group finder where visitors can ask to join.</p>
        </div>
        <label className="row" style={{ gap: 8, fontWeight: 600 }}>
          <input type="checkbox" checked={form.enabled} onChange={(e) => set({ enabled: e.target.checked })} /> Published
        </label>
      </div>
      {form.enabled && (
        <div className="alert info row wrap" style={{ gap: 8 }}>
          <span className="grow" style={{ wordBreak: 'break-all' }}>{url}</span>
          <button className="btn sm" onClick={() => navigator.clipboard?.writeText(url).then(() => toast('Link copied'), () => undefined)}><Copy size={14} /> Copy</button>
          <a className="btn sm" href={url} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Open</a>
        </div>
      )}
      <FormError error={save.error} />
      <Field label="Tagline"><input className="input" value={form.tagline} onChange={(e) => set({ tagline: e.target.value })} placeholder="A family that loves God and loves Hyderabad" /></Field>
      <Field label="About us"><textarea className="input" rows={4} value={form.about} onChange={(e) => set({ about: e.target.value })} /></Field>
      <div className="grid cols-2">
        <Field label="Service times"><textarea className="input" rows={3} value={form.serviceTimes} onChange={(e) => set({ serviceTimes: e.target.value })} placeholder={'Sunday 8:00 am Telugu\nSunday 10:30 am English'} /></Field>
        <Field label="Banner image link"><input className="input" value={form.heroImageUrl} onChange={(e) => set({ heroImageUrl: e.target.value })} placeholder="https://…jpg" /></Field>
      </div>
      <div className="row wrap" style={{ gap: 18 }}>
        {([['showEvents', 'Upcoming events'], ['showSermons', 'Sermons'], ['showGroups', 'Group finder'], ['showGiving', 'Give button']] as const).map(([k, l]) => (
          <label key={k} className="row" style={{ gap: 6 }}><input type="checkbox" checked={form[k]} onChange={(e) => set({ [k]: e.target.checked })} /> {l}</label>
        ))}
      </div>
      <div><button className="btn primary" disabled={save.busy} onClick={async () => { const r = await save.run(form); if (r) { setForm(r); toast('Saved'); } }}>Save page</button></div>
    </div>
  );
}
