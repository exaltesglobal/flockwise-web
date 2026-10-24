// Sundays › Family altar: the ten-minute devotion families do together at home each week. The
// office writes a week (or drafts one with AI from a passage) and publishes it; when nothing is
// published, a built-in week fills in. See how many families did it and who keeps a streak going.
import { Flame, Music2, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { AdminApi, type AltarInput } from '@/api/endpoints';
import type { AltarHub, AltarWeek, AltarWeekView } from '@/core/types';
import { LANGUAGES } from '@/core/languages';
import { Empty, ErrorState, Field, FormError, Loading, Modal, useHiddenRows, useUndoableDelete } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { useAction, useApi } from '@/lib/use-api';

import { useAi } from '../ai';
import { PageHeader } from '../layout';

const DAY = 86_400_000;
const weekOf = (monday: string) => `Week of ${formatDate(`${monday}T12:00:00`)}`;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
/** This Monday and the next seven, for choosing which week to write. */
function mondays(current: string) {
  const start = Date.parse(`${current}T12:00:00Z`);
  return Array.from({ length: 8 }, (_, i) => iso(start + i * 7 * DAY));
}
const LANGS = LANGUAGES.filter((l) => ['en', 'hi', 'te', 'ta', 'ml', 'kn', 'mr', 'bn', 'gu', 'pa', 'or'].includes(l.code));

export function AltarPage() {
  const q = useApi(AdminApi.altar.get);
  const rows = useHiddenRows();
  const undoable = useUndoableDelete();
  const [editing, setEditing] = useState<AltarWeek | 'new' | null>(null);
  const title = 'Family altar';
  if (q.error) return <><PageHeader title={title} /><ErrorState error={q.error} onRetry={q.reload} /></>;
  if (!q.data) return <><PageHeader title={title} /><Loading /></>;
  const d = q.data;
  const cur = d.current;
  const weeks = d.weeks.filter((w) => !rows.hidden.has(w.id));
  const remove = (w: AltarWeekView) => undoable({ text: 'Week removed.', hide: () => rows.hide(w.id), show: () => rows.show(w.id), run: () => AdminApi.altar.remove(w.id), done: q.reload });
  return (
    <>
      <PageHeader
        title={title}
        subtitle="Ten minutes a week for families at home: a Bible story told for the children, a song, one question to talk about and a prayer to say together. Families tick it done in the app and build a streak, and parents see what their children are learning in Sunday school. Every Monday, families get a reminder."
        actions={<button className="btn primary" onClick={() => setEditing('new')}><Plus size={15} /> Write a week</button>}
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))', gap: 16, alignItems: 'start' }}>
        <section className="card card-pad stack" style={{ gap: 10 }}>
          <div className="row between wrap" style={{ gap: 8 }}>
            <span className="eyebrow">This week · {weekOf(cur.id)}</span>
            {cur.builtIn ? <span className="badge gray">Built-in</span> : <span className="badge green">Yours</span>}
          </div>
          <h3 style={{ margin: 0 }}>{cur.title}{cur.passage && <span className="muted" style={{ fontWeight: 400 }}> · {cur.passage}</span>}</h3>
          <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{cur.story}</p>
          {cur.songTitle && <span className="row small" style={{ gap: 6 }}><Music2 size={14} /> {cur.songUrl ? <a href={cur.songUrl} target="_blank" rel="noreferrer">{cur.songTitle}</a> : cur.songTitle}</span>}
          <div className="small"><b>Talk about:</b> {cur.question}</div>
          <div className="small"><b>Pray:</b> {cur.prayer}</div>
          <div className="row wrap" style={{ gap: 8 }}>
            <span className="small muted">{cur.families} {cur.families === 1 ? 'family has' : 'families have'} done it so far.</span>
            <span style={{ flex: 1 }} />
            <button className="btn sm" onClick={() => setEditing(cur.builtIn ? { ...cur, status: 'draft' } : cur)}><Pencil size={14} /> {cur.builtIn ? 'Use your own for this week' : 'Edit'}</button>
          </div>
        </section>
        <section className="card card-pad stack" style={{ gap: 10 }}>
          <h3 style={{ margin: 0 }}>Families keeping it going</h3>
          <span className="small muted">{d.activeFamilies} {d.activeFamilies === 1 ? 'family' : 'families'} did the family altar in the last four weeks.</span>
          {d.streaks.length ? d.streaks.map((s) => (
            <div key={s.household} className="row between">
              <span>{s.household}</span>
              <span className="row" style={{ gap: 4, color: 'var(--primary)' }}><Flame size={15} /> {s.weeks} weeks</span>
            </div>
          )) : <span className="small muted">Streaks show here once a family has done it two weeks in a row.</span>}
        </section>
      </div>
      <h3 style={{ margin: '20px 0 8px' }}>Your weeks</h3>
      {!weeks.length ? <Empty title="No weeks written yet" body="Built-in weeks are used until you write your own. Write one from this Sunday's sermon passage so homes follow the same story." /> : (
        <div className="card table-wrap">
          <table className="table">
            <thead><tr><th>Week</th><th>Title</th><th>Status</th><th>Families</th><th /></tr></thead>
            <tbody>
              {weeks.map((w) => (
                <tr key={w.id}>
                  <td>{weekOf(w.id)}</td>
                  <td>{w.title || <span className="muted">Untitled</span>}{w.passage && <span className="small muted"> · {w.passage}</span>}</td>
                  <td>{w.status === 'published' ? <span className="badge green">Published</span> : <span className="badge gray">Draft</span>}</td>
                  <td>{w.families}</td>
                  <td className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
                    <button className="btn ghost icon sm" aria-label="Edit" onClick={() => setEditing(w)}><Pencil size={14} /></button>
                    <button className="btn ghost icon sm danger" aria-label="Remove" onClick={() => remove(w)}><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && <WeekModal hub={d} week={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={(h) => { q.setData(h); setEditing(null); }} />}
    </>
  );
}

const EMPTY: AltarInput = { title: '', passage: '', story: '', songTitle: '', songUrl: '', question: '', prayer: '', status: 'draft' };

function WeekModal({ hub, week, onClose, onSaved }: { hub: AltarHub; week: AltarWeek | null; onClose: () => void; onSaved: (h: AltarHub) => void }) {
  const ai = useAi();
  const taken = new Set(hub.weeks.map((w) => w.id));
  const options = mondays(hub.current.id);
  const [monday, setMonday] = useState(week?.id ?? options.find((m) => !taken.has(m)) ?? options[0]);
  const [form, setForm] = useState<AltarInput>(week ? { title: week.title, passage: week.passage, story: week.story, songTitle: week.songTitle, songUrl: week.songUrl, question: week.question, prayer: week.prayer, status: week.status } : EMPTY);
  const [lang, setLang] = useState('en');
  const set = (k: keyof AltarInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });
  const draft = useAction(async () => { const out = await AdminApi.altar.draft(form.passage, lang); setForm({ ...form, ...out }); });
  const save = useAction(async (status: 'draft' | 'published') => onSaved(await AdminApi.altar.save(monday, { ...form, status })));
  const editingSaved = !!week && taken.has(week.id);
  return (
    <Modal
      title={editingSaved ? weekOf(monday) : 'Write a week'}
      onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>Cancel</button>
        <span style={{ flex: 1 }} />
        <button className="btn" disabled={save.busy} onClick={() => void save.run('draft')}>Save draft</button>
        <button className="btn primary" disabled={save.busy} onClick={() => void save.run('published')}>Publish</button>
      </>}
    >
      <div className="stack">
        {!editingSaved && (
          <Field label="Week">
            <select className="input" value={monday} onChange={(e) => setMonday(e.target.value)}>
              {options.map((m) => <option key={m} value={m}>{weekOf(m)}{taken.has(m) ? ' (already written)' : ''}</option>)}
            </select>
          </Field>
        )}
        <Field label="Bible passage" hint="The story the family reads, e.g. Luke 15:1–7. Using this Sunday's sermon passage helps homes follow along.">
          <input className="input" value={form.passage} onChange={set('passage')} maxLength={80} />
        </Field>
        {ai && (
          <div className="row wrap" style={{ gap: 8 }}>
            <button className="btn sm" disabled={!form.passage.trim() || draft.busy} onClick={() => void draft.run()}><Sparkles size={14} /> {draft.busy ? 'Writing…' : 'Draft it with AI'}</button>
            <select className="input sm" style={{ width: 'auto' }} value={lang} onChange={(e) => setLang(e.target.value)} aria-label="Language">{LANGS.map((l) => <option key={l.code} value={l.code}>{l.english}</option>)}</select>
            <span className="small muted">Read it through and change anything before publishing.</span>
          </div>
        )}
        <FormError error={draft.error} />
        <Field label="Title"><input className="input" value={form.title} onChange={set('title')} maxLength={120} placeholder="e.g. The lost sheep" /></Field>
        <Field label="Story for the children" hint="About two minutes read aloud. Tell it simply, as you would to a seven-year-old."><textarea className="input" rows={8} value={form.story} onChange={set('story')} maxLength={3000} /></Field>
        <div className="row wrap" style={{ gap: 8 }}>
          <div className="grow" style={{ minWidth: 200 }}><Field label="Song"><input className="input" value={form.songTitle} onChange={set('songTitle')} maxLength={120} placeholder="e.g. Jesus Loves Me" /></Field></div>
          <div className="grow" style={{ minWidth: 200 }}><Field label="Song link (optional)" hint="Left empty, families get a search link."><input className="input" value={form.songUrl} onChange={set('songUrl')} maxLength={500} placeholder="https://" /></Field></div>
        </div>
        <Field label="Question to talk about"><input className="input" value={form.question} onChange={set('question')} maxLength={400} /></Field>
        <Field label="Prayer to say together"><textarea className="input" rows={3} value={form.prayer} onChange={set('prayer')} maxLength={600} /></Field>
        <FormError error={save.error} />
      </div>
    </Modal>
  );
}
