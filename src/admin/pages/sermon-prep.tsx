// Sundays › Sermon workspace: one page per sermon, from the first study notes to the pulpit.
// Passage, big idea, an outline of points with verses and planned minutes, private study notes and
// a Bible beside it. Saves as you type; "Preach" opens the preaching view; "Put in the library"
// makes the sermon members see.
import { ArrowDown, ArrowLeft, ArrowUp, BookOpen, Copy, MessagesSquare, MonitorPlay, ExternalLink, Languages, Library, Lightbulb, NotebookPen, Plus, Presentation, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';

import { AdminApi } from '@/api/endpoints';
import { FEATURED_BIBLES } from '@/core/bible-texts';
import type { BiblePassage, SermonPoint, SermonPrep, SermonPrepStatus } from '@/core/types';
import { Empty, ErrorState, Field, FormError, Loading, Segmented, useToast, useUndoableDelete } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { useOpenParam } from '@/lib/use-new-param';
import { useAction, useApi } from '@/lib/use-api';

import { PageHeader } from '../layout';
import { CommentsPanel, HistoryTab, IllustrationPicker, IllustrationsTab, KitModal, StudyHelper, PreachedBefore, SeriesTab, SlidesModal, TranslationCheckModal } from './sermon-planning';

const STATUS: Record<SermonPrepStatus, string> = { draft: 'Draft', ready: 'Ready', preached: 'Preached' };
const BADGE: Record<SermonPrepStatus, string> = { draft: 'gray', ready: 'ok', preached: '' };
const day = (d: string) => (d ? formatDate(`${d}T12:00:00`) : '');
const newPoint = (): SermonPoint => ({ id: `new-${Math.random().toString(36).slice(2, 10)}`, heading: '', body: '', refs: [], minutes: 5 });

type Tab = 'sermons' | 'series' | 'illustrations' | 'history';
const TABS: { value: Tab; label: string }[] = [{ value: 'sermons', label: 'Sermons' }, { value: 'series', label: 'Series' }, { value: 'illustrations', label: 'Illustrations' }, { value: 'history', label: 'History' }];

export function SermonPrepPage() {
  const [tab, setTab] = useState<Tab>('sermons');
  const q = useApi(AdminApi.sermonPrep.list);
  const [editing, setEditing] = useState<string | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const undoable = useUndoableDelete();
  useOpenParam('open', (id) => { setEditing(id); return true; });
  const start = useAction(async () => setEditing((await AdminApi.sermonPrep.create({})).id));

  if (editing) return <Editor id={editing} onBack={() => { setEditing(null); q.reload(); }} onDelete={(p) => { setEditing(null); undoable({ text: `Deleted “${p.title}”.`, hide: () => setHidden((h) => [...h, p.id]), show: () => setHidden((h) => h.filter((x) => x !== p.id)), run: () => AdminApi.sermonPrep.remove(p.id), done: q.reload }); q.reload(); }} />;
  const rows = (q.data ?? []).filter((p) => !hidden.includes(p.id));
  return (
    <>
      <PageHeader
        title="Sermon workspace"
        subtitle="Prepare each sermon in one place: the passage, the big idea, your points with their verses and minutes, and private study notes. Preach from your phone or tablet, then put it in the sermon library in one click."
        actions={tab === 'sermons' && <button className="btn primary" onClick={() => void start.run()} disabled={start.busy}><Plus size={16} /> New sermon</button>}
      />
      <div style={{ marginBottom: 14 }}><Segmented value={tab} options={TABS} onChange={setTab} /></div>
      {tab === 'series' ? <SeriesTab onOpenSermon={(id) => { setTab('sermons'); setEditing(id); }} /> : tab === 'illustrations' ? <IllustrationsTab /> : tab === 'history' ? <HistoryTab /> : <>
      <FormError error={start.error} />
      {q.error ? <ErrorState error={q.error} onRetry={q.reload} /> : !q.data ? <Loading /> : !rows.length ? (
        <Empty icon={<NotebookPen size={28} />} title="No sermons in preparation" body="Start with a passage. Add your points as they come, with the verses for each, and the minutes you plan to spend." action={<button className="btn primary" onClick={() => void start.run()}>Start a sermon</button>} />
      ) : (
        <div className="card table-wrap">
          <table className="table">
            <thead><tr><th>Sunday</th><th>Sermon</th><th>Preacher</th><th>Outline</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} onClick={() => setEditing(p.id)} style={{ cursor: 'pointer' }}>
                  <td className="small">{day(p.date) || <span className="muted">No date</span>}</td>
                  <td><b>{p.title}</b><div className="small muted">{[p.passage, p.series].filter(Boolean).join(' · ')}</div></td>
                  <td className="small">{p.preacher}</td>
                  <td className="small">{p.points} point{p.points === 1 ? '' : 's'}{p.minutes ? ` · ${p.minutes} min` : ''}</td>
                  <td><span className={`badge ${BADGE[p.status]}`}>{STATUS[p.status]}</span>{p.sermonId && <div className="small muted">In the library</div>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </>}
    </>
  );
}

type Editable = Pick<SermonPrep, 'title' | 'preacher' | 'date' | 'series' | 'passage' | 'bigIdea' | 'intro' | 'points' | 'close' | 'study' | 'translation' | 'status'>;
const editable = (p: SermonPrep): Editable => ({ title: p.title, preacher: p.preacher, date: p.date, series: p.series, passage: p.passage, bigIdea: p.bigIdea, intro: p.intro, points: p.points, close: p.close, study: p.study, translation: p.translation, status: p.status });

function Editor({ id, onBack, onDelete }: { id: string; onBack: () => void; onDelete: (p: SermonPrep) => void }) {
  const q = useApi(() => AdminApi.sermonPrep.get(id), [id]);
  const toast = useToast();
  const [d, setD] = useState<Editable | null>(null);
  const [prep, setPrep] = useState<SermonPrep | null>(null);
  const [state, setState] = useState<'saved' | 'saving' | 'dirty' | 'error'>('saved');
  const pending = useRef<Editable | null>(null);
  useEffect(() => { if (q.data) { setPrep(q.data); setD(editable(q.data)); } }, [q.data]);

  // Saves a second after typing stops, and before leaving the page.
  const flush = async () => {
    const next = pending.current;
    if (!next) return;
    pending.current = null;
    setState('saving');
    try {
      const saved = await AdminApi.sermonPrep.save(id, next);
      setPrep(saved);
      // New points get their server ids; keep what the pastor is typing.
      setD((cur) => (cur ? { ...cur, points: cur.points.map((pt, i) => (pt.id.startsWith('new-') && saved.points[i] ? { ...pt, id: saved.points[i].id } : pt)) } : cur));
      setState(pending.current ? 'dirty' : 'saved');
    } catch {
      pending.current = pending.current ?? next;
      setState('error');
    }
  };
  useEffect(() => {
    if (state !== 'dirty') return;
    const t = setTimeout(() => void flush(), 900);
    return () => clearTimeout(t);
  }, [d, state]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => void flush(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (patch: Partial<Editable>) => setD((cur) => { if (!cur) return cur; const next = { ...cur, ...patch }; pending.current = next; setState('dirty'); return next; });
  const setPoint = (i: number, patch: Partial<SermonPoint>) => d && set({ points: d.points.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  const move = (i: number, by: number) => { if (!d) return; const pts = [...d.points]; const [p] = pts.splice(i, 1); pts.splice(i + by, 0, p); set({ points: pts }); };
  const publish = useAction(async () => { await flush(); const r = await AdminApi.sermonPrep.publish(id); setPrep(r.prep); toast(prep?.sermonId ? 'Updated in the sermon library.' : 'Added to the sermon library.'); });
  const copy = useAction(async () => { await flush(); const c = await AdminApi.sermonPrep.copy(id); toast(`Made a copy: “${c.title}”.`); });
  const [picking, setPicking] = useState<number | null>(null);
  const [langs, setLangs] = useState(false);
  const [lookup, setLookup] = useState<{ ref: string; at: number } | null>(null);
  const [slides, setSlides] = useState(false);
  const [kit, setKit] = useState(false);

  if (q.error) return <><PageHeader title="Sermon workspace" /><ErrorState error={q.error} onRetry={q.reload} /></>;
  if (!d || !prep) return <><PageHeader title="Sermon workspace" /><Loading /></>;
  const minutes = d.points.reduce((n, p) => n + (p.minutes || 0), 0);

  return (
    <>
      <div className="row wrap sp-top">
        <button className="btn ghost sm" onClick={() => { void flush(); onBack(); }}><ArrowLeft size={15} /> All sermons</button>
        <span className={`small sp-save ${state}`}>{state === 'saving' ? 'Saving…' : state === 'dirty' ? 'Editing' : state === 'error' ? 'Not saved. Check your connection.' : 'Saved'}</span>
        <span className="grow" />
        <Link className="btn sm primary" to={`/preach/${id}`} target="_blank" onClick={() => void flush()}><Presentation size={15} /> Preach</Link>
        <button className="btn sm" onClick={() => void publish.run()} disabled={publish.busy}><Library size={15} /> {prep.sermonId ? 'Update the library' : 'Put in the library'}</button>
        <button className="btn sm" onClick={() => { void flush(); setSlides(true); }} title="Put the passage and points into the service as projector slides"><MonitorPlay size={15} /> Slides</button>
        <button className="btn sm" onClick={() => { void flush(); setKit(true); }} title="This week's discussion kit for cell groups"><MessagesSquare size={15} /> Cell kit</button>
        <button className="btn sm ghost" onClick={() => setLangs(true)} title="See the key verse in each language your people speak"><Languages size={15} /> Languages</button>
        <button className="btn sm ghost" onClick={() => void copy.run()} disabled={copy.busy} title="Start a new sermon from this one"><Copy size={15} /></button>
        <button className="btn sm ghost" onClick={() => onDelete(prep)} aria-label="Delete"><Trash2 size={15} /></button>
      </div>
      <FormError error={publish.error ?? copy.error} />
      <input className="sp-title" value={d.title} onChange={(e) => set({ title: e.target.value })} placeholder="Sermon title" maxLength={160} aria-label="Sermon title" />
      <div className="sp-grid">
        <div className="stack">
          <div className="sp-meta">
            <Field label="Preacher"><input value={d.preacher} onChange={(e) => set({ preacher: e.target.value })} maxLength={120} /></Field>
            <Field label="Sunday"><input type="date" value={d.date} onChange={(e) => set({ date: e.target.value })} /></Field>
            <Field label="Series"><input value={d.series} onChange={(e) => set({ series: e.target.value })} maxLength={120} placeholder="Optional" /></Field>
            <Field label="Status"><select value={d.status} onChange={(e) => set({ status: e.target.value as SermonPrepStatus })}>{(Object.keys(STATUS) as SermonPrepStatus[]).map((k) => <option key={k} value={k}>{STATUS[k]}</option>)}</select></Field>
          </div>
          <Field label="Passage" hint="The main reading, like John 3:1-21."><input value={d.passage} onChange={(e) => set({ passage: e.target.value })} maxLength={80} placeholder="John 3:1-21" /></Field>
          <PreachedBefore passage={d.passage} except={id} />
          <Field label="The big idea" hint="The whole sermon in one sentence. Everything else serves it."><textarea rows={2} value={d.bigIdea} onChange={(e) => set({ bigIdea: e.target.value })} maxLength={400} /></Field>
          <Field label="Opening"><textarea rows={3} value={d.intro} onChange={(e) => set({ intro: e.target.value })} placeholder="A story, a question, why this matters today" /></Field>

          <div className="row between"><b>Points <span className="small muted" style={{ fontWeight: 400 }}>· put [brackets] round a word to make it a blank in members' notes</span></b><span className="small muted">{d.points.length} point{d.points.length === 1 ? '' : 's'} · {minutes} min planned</span></div>
          {d.points.map((p, i) => (
            <div key={p.id} className="card card-pad stack sp-point" style={{ gap: 8 }}>
              <div className="row" style={{ gap: 6 }}>
                <span className="sp-num">{i + 1}</span>
                <input className="grow" value={p.heading} onChange={(e) => setPoint(i, { heading: e.target.value })} placeholder="The point in a few words" maxLength={200} aria-label={`Point ${i + 1}`} />
                <label className="row small muted" style={{ gap: 4 }}><input type="number" min={0} max={90} value={p.minutes} onChange={(e) => setPoint(i, { minutes: Number(e.target.value) })} style={{ width: 64 }} aria-label="Minutes" /> min</label>
              </div>
              <textarea rows={4} value={p.body} onChange={(e) => setPoint(i, { body: e.target.value })} placeholder="Explain, illustrate, apply" />
              <button className="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setPicking(i)}><Lightbulb size={14} /> Add an illustration</button>
              <div className="row" style={{ gap: 6 }}>
                <BookOpen size={15} className="muted" />
                <input className="grow" value={p.refs.join('; ')} onChange={(e) => setPoint(i, { refs: e.target.value.split(';').map((r) => r.trimStart()) })} placeholder="Verses, like Romans 5:8; 1 John 4:9-10" aria-label="Verses" />
                <button className="btn sm ghost icon" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up"><ArrowUp size={14} /></button>
                <button className="btn sm ghost icon" disabled={i === d.points.length - 1} onClick={() => move(i, 1)} aria-label="Move down"><ArrowDown size={14} /></button>
                <button className="btn sm ghost icon" onClick={() => set({ points: d.points.filter((_, j) => j !== i) })} aria-label="Remove point"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
          <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => set({ points: [...d.points, newPoint()] })} disabled={d.points.length >= 20}><Plus size={15} /> Add a point</button>
          <Field label="Closing" hint="The response you are asking for, and the prayer."><textarea rows={3} value={d.close} onChange={(e) => set({ close: e.target.value })} /></Field>
        </div>

        <div className="stack">
          <BiblePane lookup={lookup} passage={d.passage} translation={d.translation} onTranslation={(t) => set({ translation: t })} onAdd={d.points.length ? (ref) => setPoint(d.points.length - 1, { refs: [...d.points[d.points.length - 1].refs.filter(Boolean), ref] }) : undefined} />
          <CommentsPanel prep={prep} onChange={setPrep} />
          {d.passage.trim() && <StudyHelper passage={d.passage} translation={d.translation} onRef={(r) => setLookup({ ref: r, at: Date.now() })} />}
          <Field label="Study notes" hint="Only for you and the office. Never shown to members."><textarea rows={12} value={d.study} onChange={(e) => set({ study: e.target.value })} placeholder="Background, word studies, commentary quotes, questions" /></Field>
          {prep.sermonId && <Link className="small" to={`/admin/sermons?open=${prep.sermonId}`}><ExternalLink size={13} /> Open it in the sermon library</Link>}
        </div>
      </div>
      {picking !== null && <IllustrationPicker prepId={id} onClose={() => setPicking(null)} onPick={(text) => { const pt = d.points[picking]; if (pt) setPoint(picking, { body: pt.body ? `${pt.body.trimEnd()}\n\n${text}` : text }); setPicking(null); toast('Added. The bank will remember this sermon used it.'); }} />}
      {slides && <SlidesModal prepId={id} onClose={() => setSlides(false)} />}
      {kit && <KitModal prep={prep} onChange={setPrep} onClose={() => setKit(false)} />}
      {langs && <TranslationCheckModal initial={d.passage} onClose={() => setLangs(false)} />}
    </>
  );
}

/** The passage (or any verse looked up) in the sermon's translation, with a button to add it to the last point. */
function BiblePane({ lookup, passage, translation, onTranslation, onAdd }: { lookup: { ref: string; at: number } | null; passage: string; translation: string; onTranslation: (t: string) => void; onAdd?: (ref: string) => void }) {
  const [ref, setRef] = useState('');
  const [shown, setShown] = useState<string>(passage);
  useEffect(() => { if (!ref) setShown(passage); }, [passage, ref]);
  useEffect(() => { if (lookup) { setRef(lookup.ref); setShown(lookup.ref); } }, [lookup]);
  const q = useApi(() => (shown.trim() ? AdminApi.bible(shown, translation) : Promise.resolve(null as BiblePassage | null)), [shown, translation]);
  return (
    <div className="card card-pad stack sp-bible" style={{ gap: 8 }}>
      <div className="row" style={{ gap: 6 }}>
        <BookOpen size={16} />
        <select className="grow" value={translation} onChange={(e) => onTranslation(e.target.value)} aria-label="Bible">
          {FEATURED_BIBLES.map((b) => <option key={b.id} value={b.id}>{b.native} · {b.name}</option>)}
        </select>
      </div>
      <form className="row" style={{ gap: 6 }} onSubmit={(e) => { e.preventDefault(); setShown(ref.trim() || passage); }}>
        <input className="grow" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Look up a verse" aria-label="Look up a verse" />
        <button className="btn sm">Show</button>
      </form>
      {!shown.trim() ? <p className="small muted" style={{ margin: 0 }}>Type the passage on the left, or look up any verse here.</p> : q.error ? <p className="small muted" style={{ margin: 0 }}>{q.error.message}</p> : !q.data ? <Loading /> : (
        <>
          <div className="row between"><b>{q.data.reference}</b>{onAdd && ref.trim() && <button className="btn sm ghost" onClick={() => onAdd(q.data!.reference)}><Plus size={13} /> Add to last point</button>}</div>
          <div className="sp-verses">{q.data.verses.map((v) => <p key={v.verse}><sup>{v.verse}</sup> {v.text}</p>)}</div>
          <span className="small muted">{q.data.translation}</span>
        </>
      )}
    </div>
  );
}
