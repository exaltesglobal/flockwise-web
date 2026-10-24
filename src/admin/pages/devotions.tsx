// Grow › Leaders' devotionals: a short morning devotional for the leadership team. A pastor plans
// the days ahead (with an AI draft if they like); each morning it goes to the office staff, and each
// leader checks in with a line of response or a prayer need the team can see.
import { BookHeart, Check, Flame, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { AdminApi } from '@/api/endpoints';
import type { DevotionView } from '@/core/types';
import { Empty, ErrorState, Field, FormError, Loading, Modal, useHiddenRows, useToast, useUndoableDelete } from '@/components/ui';
import { formatDate, formatTime } from '@/lib/format';
import { useCan } from '@/lib/perms';
import { useAction, useApi } from '@/lib/use-api';
import { useNewParam } from '@/lib/use-new-param';

import { PageHeader } from '../layout';

const day = (d: string) => formatDate(`${d}T12:00:00`);
const today = () => new Date().toISOString().slice(0, 10);

function Passage({ reference }: { reference: string }) {
  const q = useApi(() => AdminApi.bible(reference), [reference]);
  if (!reference) return null;
  if (q.error) return null;
  if (!q.data) return <p className="small muted">Loading {reference}…</p>;
  return (
    <blockquote className="dv-passage">
      {q.data.verses.map((v) => <span key={v.verse}><sup>{v.verse}</sup>{v.text} </span>)}
      <footer className="small muted">{q.data.reference} · {q.data.translation}</footer>
    </blockquote>
  );
}

function DevotionBody({ d }: { d: DevotionView }) {
  return (
    <div className="stack" style={{ gap: 10 }}>
      <Passage reference={d.passage} />
      {d.thought && <div className="dv-thought">{d.thought.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}</div>}
      {d.question && <p className="dv-question"><b>For today:</b> {d.question}</p>}
      {d.prayer && <p className="dv-prayer"><b>Pray:</b> {d.prayer}</p>}
    </div>
  );
}

export function DevotionsPage() {
  const q = useApi(AdminApi.devotions.hub);
  const can = useCan();
  const editable = can('care');
  const toast = useToast();
  const [editing, setEditing] = useState<DevotionView | null | undefined>(undefined);
  const [note, setNote] = useState('');
  const rows = useHiddenRows();
  const undoable = useUndoableDelete();
  useNewParam(() => setEditing(null));
  const check = useAction(async (d: DevotionView) => { await (d.mine ? AdminApi.devotions.uncheck(d.id) : AdminApi.devotions.checkin(d.id, note)); if (!d.mine) toast('Thank you. The team can see you have read it.'); setNote(''); q.reload(); });

  if (q.error) return <><PageHeader title="Leaders' devotionals" /><ErrorState error={q.error} onRetry={q.reload} /></>;
  if (!q.data) return <><PageHeader title="Leaders' devotionals" /><Loading /></>;
  const { today: t, upcoming, past, streak } = q.data;
  const remove = (d: DevotionView) => undoable({ text: 'Devotional deleted.', hide: () => rows.hide(d.id), show: () => rows.show(d.id), run: () => AdminApi.devotions.remove(d.id), done: q.reload });

  return (
    <>
      <PageHeader
        title="Leaders' devotionals"
        subtitle="A short devotional each morning for the leadership team. Read it, then check in with a line or a prayer need the team can see."
        actions={editable && <button className="btn primary" onClick={() => setEditing(null)}><Plus size={16} /> Plan a devotional</button>}
      />
      <div className="stack">
        {t ? (
          <article className="card card-pad stack dv-today">
            <div className="row between wrap" style={{ gap: 8 }}>
              <div>
                <span className="small muted">Today · {t.passage}</span>
                <h2 style={{ margin: '2px 0 0' }}>{t.title || t.passage}</h2>
              </div>
              <div className="row" style={{ gap: 8 }}>
                {streak > 1 && <span className="badge"><Flame size={13} /> {streak} days in a row</span>}
                {editable && <button className="btn sm ghost icon" onClick={() => setEditing(t)} aria-label="Edit"><Pencil size={14} /></button>}
              </div>
            </div>
            <DevotionBody d={t} />
            <div className="dv-checkin stack" style={{ gap: 8 }}>
              <FormError error={check.error} />
              {t.mine ? (
                <div className="row wrap" style={{ gap: 8 }}><span className="badge ok"><Check size={13} /> You have read today's devotional</span><button className="btn sm ghost" onClick={() => void check.run(t)} disabled={check.busy}>Undo</button></div>
              ) : (
                <div className="row wrap" style={{ gap: 8 }}>
                  <input className="grow" value={note} onChange={(e) => setNote(e.target.value)} placeholder="A line of response or a prayer need (optional)" maxLength={500} aria-label="Your response" />
                  <button className="btn primary" onClick={() => void check.run(t)} disabled={check.busy}><Check size={15} /> I have read it</button>
                </div>
              )}
              <div className="small muted">{t.checkins.length} of {t.team} on the team {t.checkins.length === 1 ? 'has' : 'have'} read it</div>
              {t.checkins.filter((c) => c.note).map((c) => <div key={c.id} className="dv-note"><b>{c.name}</b> <span className="muted small">{formatTime(c.at)}</span><div>{c.note}</div></div>)}
            </div>
          </article>
        ) : (
          <Empty icon={<BookHeart size={28} />} title="No devotional for today" body={editable ? 'Plan a few days ahead: give the passage, write a short thought or let AI draft one, and it goes to the team each morning.' : 'Your pastor has not planned one for today.'} action={editable && <button className="btn primary" onClick={() => setEditing(null)}>Plan today's devotional</button>} />
        )}

        {upcoming.filter((d) => !rows.hidden.has(d.id)).length > 0 && (
          <div className="card">
            <div className="card-head"><h2>Coming up</h2></div>
            {upcoming.filter((d) => !rows.hidden.has(d.id)).map((d) => (
              <div key={d.id} className="dv-row">
                <span className="dv-date">{day(d.date)}</span>
                <span className="grow"><b>{d.title || d.passage}</b>{d.title && <span className="small muted"> · {d.passage}</span>}</span>
                {editable && <><button className="btn sm ghost icon" onClick={() => setEditing(d)} aria-label="Edit"><Pencil size={14} /></button><button className="btn sm ghost icon" onClick={() => remove(d)} aria-label="Delete"><Trash2 size={14} /></button></>}
              </div>
            ))}
          </div>
        )}

        {past.filter((d) => !rows.hidden.has(d.id)).length > 0 && (
          <div className="card">
            <div className="card-head"><h2>Earlier</h2></div>
            {past.filter((d) => !rows.hidden.has(d.id)).map((d) => (
              <details key={d.id} className="dv-past">
                <summary className="dv-row">
                  <span className="dv-date">{day(d.date)}</span>
                  <span className="grow"><b>{d.title || d.passage}</b>{d.title && <span className="small muted"> · {d.passage}</span>}</span>
                  <span className="small muted">{d.checkins.length} read</span>
                </summary>
                <div className="card-pad"><DevotionBody d={d} /></div>
              </details>
            ))}
          </div>
        )}
      </div>
      {editing !== undefined && <DevotionEditor d={editing} onClose={() => setEditing(undefined)} onSaved={() => { setEditing(undefined); q.reload(); }} />}
    </>
  );
}

function DevotionEditor({ d, onClose, onSaved }: { d: DevotionView | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ date: d?.date ?? today(), passage: d?.passage ?? '', title: d?.title ?? '', thought: d?.thought ?? '', question: d?.question ?? '', prayer: d?.prayer ?? '' });
  const set = (patch: Partial<typeof f>) => setF({ ...f, ...patch });
  const draft = useAction(async () => {
    const text = await AdminApi.bible(f.passage).then((p) => p.verses.map((v) => v.text).join(' ')).catch(() => '');
    const out = await AdminApi.devotions.draft(f.passage, text);
    setF((x) => ({ ...x, title: out.title, thought: out.thought, question: out.question, prayer: out.prayer }));
  });
  const save = useAction(async () => { await (d ? AdminApi.devotions.update(d.id, f) : AdminApi.devotions.create(f)); onSaved(); });
  return (
    <Modal title={d ? 'Edit devotional' : 'Plan a devotional'} onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => void save.run()} disabled={save.busy || (!f.passage.trim() && !f.thought.trim())}>Save</button></>}>
      <div className="stack">
        <div className="row" style={{ gap: 10 }}>
          <Field label="Day"><input type="date" value={f.date} onChange={(e) => set({ date: e.target.value })} /></Field>
          <Field label="Passage"><input value={f.passage} onChange={(e) => set({ passage: e.target.value })} placeholder="John 10:11-18" maxLength={120} /></Field>
        </div>
        <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => void draft.run()} disabled={draft.busy || !f.passage.trim()}><Sparkles size={14} /> {draft.busy ? 'Writing…' : f.thought ? 'Draft again with AI' : 'Draft with AI'}</button>
        <FormError error={draft.error} />
        <Field label="Title"><input value={f.title} onChange={(e) => set({ title: e.target.value })} maxLength={120} /></Field>
        <Field label="Reflection" hint="A few short paragraphs. Leave a blank line between them."><textarea rows={7} value={f.thought} onChange={(e) => set({ thought: e.target.value })} maxLength={5000} /></Field>
        <Field label="A question for leaders"><input value={f.question} onChange={(e) => set({ question: e.target.value })} maxLength={400} /></Field>
        <Field label="Prayer"><input value={f.prayer} onChange={(e) => set({ prayer: e.target.value })} maxLength={600} /></Field>
        <FormError error={save.error} />
      </div>
    </Modal>
  );
}
