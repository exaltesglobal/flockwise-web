// Sundays › Sermon workspace, the planning tabs: series laid out Sunday by Sunday, the illustration
// bank, and the preaching history. Also the pieces the sermon editor borrows: "preached before",
// the illustration picker and the translation check.
import { CalendarRange, Check, History, Languages, Lightbulb, MessageCircle, Plus, Sparkles, Trash2, UserPlus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { AdminApi } from '@/api/endpoints';
import { BOOKS } from '@/core/bible';
import { BOOK_CODES, FEATURED_BIBLES } from '@/core/bible-texts';
import { LANGUAGES } from '@/core/languages';
import type { GroupKit, Illustration, IllustrationKind, SermonPrep, SermonPrepStatus, SermonSeriesView, SermonSeriesWeek } from '@/core/types';
import { Empty, ErrorState, Field, FormError, Loading, Modal, useToast, useUndoableDelete } from '@/components/ui';
import { LightMarkdown } from '@/components/markdown';
import { formatDate } from '@/lib/format';
import { useAction, useApi } from '@/lib/use-api';

const day = (d: string) => (d ? formatDate(`${d}T12:00:00`) : '');
const STATUS: Record<SermonPrepStatus, string> = { draft: 'Being prepared', ready: 'Ready', preached: 'Preached' };
const BADGE: Record<SermonPrepStatus, string> = { draft: 'gray', ready: 'ok', preached: '' };
const KINDS: Record<IllustrationKind, string> = { story: 'Story', quote: 'Quote', example: 'Example', fact: 'Fact or number', humour: 'Humour' };
const nextSunday = () => { const d = new Date(); d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7)); return d.toISOString().slice(0, 10); };

// ---------- Series ----------

export function SeriesTab({ onOpenSermon }: { onOpenSermon: (id: string) => void }) {
  const q = useApi(AdminApi.sermonSeries.list);
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const undoable = useUndoableDelete();
  const rows = (q.data ?? []).filter((s) => !hidden.includes(s.id));
  const current = rows.find((s) => s.id === open);
  if (current) return <SeriesEditor series={current} onBack={() => setOpen(null)} onSaved={(s) => q.setData((q.data ?? []).map((x) => (x.id === s.id ? s : x)))} onOpenSermon={onOpenSermon}
    onDelete={() => { setOpen(null); undoable({ text: `Deleted the series “${current.title}”. Its sermons are kept.`, hide: () => setHidden((h) => [...h, current.id]), show: () => setHidden((h) => h.filter((x) => x !== current.id)), run: () => AdminApi.sermonSeries.remove(current.id), done: q.reload }); }} />;
  return (
    <>
      <div className="row between" style={{ marginBottom: 12 }}>
        <p className="muted small" style={{ margin: 0 }}>Plan a series Sunday by Sunday: the passage, the title and who preaches. Start each sermon from the plan when you are ready.</p>
        <button className="btn primary" onClick={() => setAdding(true)}><Plus size={16} /> New series</button>
      </div>
      {q.error ? <ErrorState error={q.error} onRetry={q.reload} /> : !q.data ? <Loading /> : !rows.length ? (
        <Empty icon={<CalendarRange size={28} />} title="No series planned" body="Pick a book and the number of weeks. Flockwise spreads the chapters across the Sundays for you to adjust." action={<button className="btn primary" onClick={() => setAdding(true)}>Plan a series</button>} />
      ) : (
        <div className="sp-series-list">
          {rows.map((s) => {
            const started = s.weeks.filter((w) => w.status).length;
            const dates = s.weeks.filter((w) => w.date);
            return (
              <button key={s.id} className="card card-pad sp-series" onClick={() => setOpen(s.id)}>
                <b>{s.title}</b>
                <span className="small muted">{dates.length ? `${day(dates[0].date)} to ${day(dates[dates.length - 1].date)}` : 'No dates yet'}</span>
                <span className="small">{s.weeks.length} week{s.weeks.length === 1 ? '' : 's'} · {started} started</span>
                <span className="sp-progress"><i style={{ width: `${s.weeks.length ? (started / s.weeks.length) * 100 : 0}%` }} /></span>
              </button>
            );
          })}
        </div>
      )}
      {adding && <NewSeries onClose={() => setAdding(false)} onCreated={(s) => { setAdding(false); q.setData([s, ...(q.data ?? [])]); setOpen(s.id); }} />}
    </>
  );
}

function NewSeries({ onClose, onCreated }: { onClose: () => void; onCreated: (s: SermonSeriesView) => void }) {
  const [f, setF] = useState({ title: '', book: '', weeks: 4, startDate: nextSunday(), preacher: '' });
  const save = useAction(async () => onCreated(await AdminApi.sermonSeries.create({ ...f, book: f.book || undefined })));
  const chapters = f.book ? BOOKS[BOOK_CODES.indexOf(f.book as (typeof BOOK_CODES)[number])]?.chapters : 0;
  return (
    <Modal title="New sermon series" onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => void save.run()} disabled={save.busy || !f.title.trim()}>Plan it</button></>}>
      <div className="stack">
        <FormError error={save.error} />
        <Field label="Series name"><input autoFocus value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={120} placeholder="Joy in Christ" /></Field>
        <Field label="Book of the Bible" hint={f.book ? `${chapters} chapters, spread across the weeks.` : 'Optional. Leave empty for a topical series.'}>
          <select value={f.book} onChange={(e) => setF({ ...f, book: e.target.value })}>
            <option value="">No book (topical)</option>
            {BOOK_CODES.map((c, i) => <option key={c} value={c}>{BOOKS[i].en}</option>)}
          </select>
        </Field>
        <div className="sp-meta">
          <Field label="Weeks"><input type="number" min={1} max={52} value={f.weeks} onChange={(e) => setF({ ...f, weeks: Number(e.target.value) })} /></Field>
          <Field label="First Sunday"><input type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} /></Field>
        </div>
        <Field label="Preacher" hint="Optional. You can change it for each week."><input value={f.preacher} onChange={(e) => setF({ ...f, preacher: e.target.value })} maxLength={120} /></Field>
      </div>
    </Modal>
  );
}

function SeriesEditor({ series, onBack, onSaved, onDelete, onOpenSermon }: { series: SermonSeriesView; onBack: () => void; onSaved: (s: SermonSeriesView) => void; onDelete: () => void; onOpenSermon: (id: string) => void }) {
  const toast = useToast();
  const [title, setTitle] = useState(series.title);
  const [weeks, setWeeks] = useState<(Partial<SermonSeriesWeek> & { status?: SermonPrepStatus | null })[]>(series.weeks);
  const [dirty, setDirty] = useState(false);
  const edit = (i: number, patch: Partial<SermonSeriesWeek>) => { setWeeks((w) => w.map((x, j) => (j === i ? { ...x, ...patch } : x))); setDirty(true); };
  const save = useAction(async () => { const s = await AdminApi.sermonSeries.save(series.id, { title, weeks }); onSaved(s); setWeeks(s.weeks); setDirty(false); toast('Series saved.'); });
  const start = useAction(async (week: string) => onOpenSermon((await AdminApi.sermonSeries.start(series.id, week)).id));
  const addWeek = () => {
    const last = weeks[weeks.length - 1]?.date;
    const date = last ? new Date(new Date(`${last}T12:00:00`).getTime() + 7 * 86400000).toISOString().slice(0, 10) : nextSunday();
    setWeeks([...weeks, { date, title: '', passage: '', preacher: weeks[weeks.length - 1]?.preacher ?? '', prepId: null }]);
    setDirty(true);
  };
  return (
    <>
      <div className="row wrap sp-top">
        <button className="btn ghost sm" onClick={onBack}>All series</button>
        <span className="grow" />
        <button className="btn sm primary" onClick={() => void save.run()} disabled={!dirty || save.busy}>{dirty ? 'Save changes' : 'Saved'}</button>
        <button className="btn sm ghost" onClick={onDelete} aria-label="Delete series"><Trash2 size={15} /></button>
      </div>
      <FormError error={save.error ?? start.error} />
      <input className="sp-title" value={title} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} maxLength={120} aria-label="Series name" />
      <div className="card table-wrap">
        <table className="table sp-weeks">
          <thead><tr><th>Sunday</th><th>Passage</th><th>Title</th><th>Preacher</th><th>Sermon</th><th /></tr></thead>
          <tbody>
            {weeks.map((w, i) => (
              <tr key={w.id ?? `new-${i}`}>
                <td><input type="date" value={w.date ?? ''} onChange={(e) => edit(i, { date: e.target.value })} aria-label="Sunday" /></td>
                <td><input value={w.passage ?? ''} onChange={(e) => edit(i, { passage: e.target.value })} placeholder="Philippians 1" maxLength={80} aria-label="Passage" /></td>
                <td><input value={w.title ?? ''} onChange={(e) => edit(i, { title: e.target.value })} placeholder="Sermon title" maxLength={160} aria-label="Title" /></td>
                <td><input value={w.preacher ?? ''} onChange={(e) => edit(i, { preacher: e.target.value })} maxLength={120} aria-label="Preacher" /></td>
                <td>{w.prepId ? (
                  <button className="btn sm ghost" onClick={() => onOpenSermon(w.prepId!)}>Open {w.status && <span className={`badge ${BADGE[w.status]}`}>{STATUS[w.status]}</span>}</button>
                ) : <button className="btn sm" onClick={() => w.id && void start.run(w.id)} disabled={start.busy || dirty || !w.id} title={dirty ? 'Save your changes first' : undefined}>Start sermon</button>}</td>
                <td><button className="btn sm ghost icon" onClick={() => { setWeeks(weeks.filter((_, j) => j !== i)); setDirty(true); }} aria-label="Remove week" disabled={!!w.prepId}><Trash2 size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className="btn" style={{ marginTop: 10 }} onClick={addWeek}><Plus size={15} /> Add a week</button>
    </>
  );
}

// ---------- Illustrations ----------

export function IllustrationsTab() {
  const [q, setQ] = useState('');
  const [theme, setTheme] = useState('');
  const list = useApi(() => AdminApi.illustrations.list(), []);
  const [edit, setEdit] = useState<Illustration | 'new' | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const undoable = useUndoableDelete();
  const themes = useMemo(() => [...new Set((list.data ?? []).flatMap((i) => i.themes))].sort(), [list.data]);
  const rows = (list.data ?? []).filter((i) => !hidden.includes(i.id) && (!theme || i.themes.includes(theme)) && (!q.trim() || `${i.title} ${i.text} ${i.themes.join(' ')} ${i.refs.join(' ')} ${i.source}`.toLowerCase().includes(q.trim().toLowerCase())));
  return (
    <>
      <div className="row wrap" style={{ gap: 8, marginBottom: 12 }}>
        <input className="grow" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search stories, quotes and themes" aria-label="Search illustrations" style={{ minWidth: 200 }} />
        <button className="btn primary" onClick={() => setEdit('new')}><Plus size={16} /> Save an illustration</button>
      </div>
      {themes.length > 0 && <div className="chips" style={{ marginBottom: 12 }}>{themes.map((t) => <button key={t} className={`chip ${theme === t ? '' : 'off'}`} style={{ padding: '4px 10px', cursor: 'pointer' }} onClick={() => setTheme(theme === t ? '' : t)}>{t}</button>)}</div>}
      {list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : !list.data ? <Loading /> : !rows.length ? (
        <Empty icon={<Lightbulb size={28} />} title={list.data.length ? 'Nothing matches' : 'No illustrations saved'} body="Keep the stories, quotes and examples you come across, tagged by theme. When you use one in a sermon, Flockwise remembers, so you never tell the same story twice to the same church." />
      ) : (
        <div className="sp-ill-list">
          {rows.map((i) => (
            <button key={i.id} className="card card-pad sp-ill" onClick={() => setEdit(i)}>
              <div className="row between" style={{ gap: 8 }}><b>{i.title}</b><span className="badge gray">{KINDS[i.kind]}</span></div>
              <span className="small sp-clamp">{i.text}</span>
              <span className="small muted">{i.uses[0] ? `Last used ${day(i.uses[0].date)} in “${i.uses[0].title}”${i.uses.length > 1 ? ` · ${i.uses.length} times` : ''}` : 'Not used yet'}</span>
              {i.themes.length > 0 && <span className="small" style={{ color: 'var(--primary)' }}>{i.themes.join(' · ')}</span>}
            </button>
          ))}
        </div>
      )}
      {edit && <IllustrationForm item={edit === 'new' ? null : edit} onClose={() => setEdit(null)}
        onSaved={(i) => { setEdit(null); list.setData([i, ...(list.data ?? []).filter((x) => x.id !== i.id)]); }}
        onDelete={(i) => { setEdit(null); undoable({ text: `Deleted “${i.title}”.`, hide: () => setHidden((h) => [...h, i.id]), show: () => setHidden((h) => h.filter((x) => x !== i.id)), run: () => AdminApi.illustrations.remove(i.id), done: list.reload }); }} />}
    </>
  );
}

function IllustrationForm({ item, onClose, onSaved, onDelete }: { item: Illustration | null; onClose: () => void; onSaved: (i: Illustration) => void; onDelete: (i: Illustration) => void }) {
  const [f, setF] = useState({ title: item?.title ?? '', text: item?.text ?? '', kind: item?.kind ?? ('story' as IllustrationKind), themes: item?.themes.join(', ') ?? '', refs: item?.refs.join('; ') ?? '', source: item?.source ?? '' });
  const save = useAction(async () => onSaved(item ? await AdminApi.illustrations.save(item.id, f as never) : await AdminApi.illustrations.create(f as never)));
  return (
    <Modal title={item ? 'Illustration' : 'Save an illustration'} onClose={onClose} wide footer={<>
      {item && <button className="btn ghost" onClick={() => onDelete(item)} style={{ marginRight: 'auto' }}><Trash2 size={15} /> Delete</button>}
      <button className="btn ghost" onClick={onClose}>Cancel</button>
      <button className="btn primary" onClick={() => void save.run()} disabled={save.busy || !f.text.trim()}>Save</button>
    </>}>
      <div className="stack">
        <FormError error={save.error} />
        <div className="sp-meta">
          <Field label="Title" hint="Optional. The first line is used if empty."><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={160} /></Field>
          <Field label="Kind"><select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as IllustrationKind })}>{(Object.keys(KINDS) as IllustrationKind[]).map((k) => <option key={k} value={k}>{KINDS[k]}</option>)}</select></Field>
        </div>
        <Field label="The illustration"><textarea rows={8} autoFocus={!item} value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} maxLength={8000} /></Field>
        <Field label="Themes" hint="Separate with commas: grace, forgiveness, prayer."><input value={f.themes} onChange={(e) => setF({ ...f, themes: e.target.value })} /></Field>
        <div className="sp-meta">
          <Field label="Verses it fits"><input value={f.refs} onChange={(e) => setF({ ...f, refs: e.target.value })} placeholder="Luke 15:4; Psalm 23:1" /></Field>
          <Field label="Source"><input value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} maxLength={200} placeholder="Book, website or person" /></Field>
        </div>
        {item && item.uses.length > 0 && (
          <div className="small"><b>Used in</b>{item.uses.map((u) => <div key={u.prepId} className="muted">{day(u.date)} · {u.title}</div>)}</div>
        )}
      </div>
    </Modal>
  );
}

/** Picks an illustration for a sermon point; the sermon is recorded as using it. */
export function IllustrationPicker({ prepId, onPick, onClose }: { prepId: string; onPick: (text: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const list = useApi(() => AdminApi.illustrations.list(), []);
  const use = useAction(async (i: Illustration) => { await AdminApi.illustrations.use(i.id, prepId); onPick(i.text); });
  const rows = (list.data ?? []).filter((i) => !q.trim() || `${i.title} ${i.text} ${i.themes.join(' ')}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <Modal title="Add an illustration" onClose={onClose} wide>
      <div className="stack">
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by word or theme" aria-label="Search illustrations" />
        <FormError error={use.error} />
        {list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : !list.data ? <Loading /> : !rows.length ? <p className="muted small">{list.data.length ? 'Nothing matches.' : 'The illustration bank is empty. Save stories and quotes in the Illustrations tab.'}</p> : rows.map((i) => (
          <div key={i.id} className="card card-pad stack" style={{ gap: 4 }}>
            <div className="row between" style={{ gap: 8 }}><b>{i.title}</b><button className="btn sm primary" onClick={() => void use.run(i)} disabled={use.busy}>Add to this point</button></div>
            <span className="small sp-clamp">{i.text}</span>
            <span className={`small ${i.uses.some((u) => u.prepId !== prepId) ? '' : 'muted'}`} style={i.uses.some((u) => u.prepId !== prepId) ? { color: 'var(--warn, #9a5b00)' } : undefined}>
              {i.uses.length ? `Used ${day(i.uses[0].date)} in “${i.uses[0].title}”` : 'Not used yet'}
            </span>
          </div>
        ))}
      </div>
    </Modal>
  );
}

// ---------- History ----------

export function HistoryTab() {
  const q = useApi(AdminApi.preachingHistory);
  if (q.error) return <ErrorState error={q.error} onRetry={q.reload} />;
  if (!q.data) return <Loading />;
  const { books, sermons, preachers } = q.data;
  const done = books.filter((b) => b.count).length;
  const max = Math.max(1, ...books.map((b) => b.count));
  return (
    <div className="stack">
      <p className="muted small" style={{ margin: 0 }}>{sermons.length} sermon{sermons.length === 1 ? '' : 's'} from {done} of the 66 books. Books not preached yet are shown with a dashed border.</p>
      {(['ot', 'nt'] as const).map((t) => (
        <div key={t}>
          <b className="small">{t === 'ot' ? 'Old Testament' : 'New Testament'}</b>
          <div className="sp-books">
            {books.filter((b) => b.testament === t).map((b) => (
              <span key={b.code} className={`sp-book ${b.count ? '' : 'none'}`} style={b.count ? { background: `color-mix(in srgb, var(--primary) ${12 + (b.count / max) * 50}%, transparent)` } : undefined} title={b.count ? `${b.count} sermon${b.count === 1 ? '' : 's'}, last ${day(b.last ?? '')}` : 'Not preached yet'}>
                {b.name}{b.count > 0 && <b> {b.count}</b>}
              </span>
            ))}
          </div>
        </div>
      ))}
      {preachers.length > 0 && (
        <div className="chips">{preachers.map((p) => <span key={p.name} className="chip" style={{ padding: '4px 10px' }}>{p.name} · {p.count}</span>)}</div>
      )}
      {!sermons.length ? <Empty icon={<History size={28} />} title="No sermons yet" body="Sermons in the library, and those marked preached in the workspace, appear here." /> : (
        <div className="card table-wrap">
          <table className="table">
            <thead><tr><th>Date</th><th>Sermon</th><th>Passage</th><th>Preacher</th></tr></thead>
            <tbody>{sermons.map((s) => <tr key={`${s.from}${s.id}`}><td className="small">{day(s.date)}</td><td><b>{s.title}</b>{s.series && <div className="small muted">{s.series}</div>}</td><td className="small">{s.passage}</td><td className="small">{s.preacher}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** A line under the passage when the church has heard this chapter (or book) before. */
export function PreachedBefore({ passage, except }: { passage: string; except: string }) {
  const [asked, setAsked] = useState(passage);
  useEffect(() => { const t = setTimeout(() => setAsked(passage), 700); return () => clearTimeout(t); }, [passage]);
  const q = useApi(() => (asked.trim() ? AdminApi.preachedBefore(asked, except) : Promise.resolve(null)), [asked, except]);
  const hit = q.data?.chapter[0];
  const book = q.data?.book.length ?? 0;
  if (!hit && !book) return null;
  return (
    <p className="small sp-before">
      <History size={13} /> {hit ? <>Preached before: “{hit.title}” ({hit.passage}) by {hit.preacher || 'someone'} on {day(hit.date)}{q.data!.chapter.length > 1 ? `, and ${q.data!.chapter.length - 1} more` : ''}.</> : <>This chapter is new, but the book has {book} earlier sermon{book === 1 ? '' : 's'}.</>}
    </p>
  );
}

/** The key verse in each language the congregation speaks. */
export function TranslationCheckModal({ initial, onClose }: { initial: string; onClose: () => void }) {
  const [ref, setRef] = useState(initial);
  const [asked, setAsked] = useState(initial);
  const q = useApi(() => (asked.trim() ? AdminApi.translationCheck(asked) : Promise.resolve(null)), [asked]);
  return (
    <Modal title={<><Languages size={18} /> Translation check</>} onClose={onClose} wide>
      <div className="stack">
        <p className="small muted" style={{ margin: 0 }}>The verse in the Bible of each language your people speak, most spoken first, to read before Sunday.</p>
        <form className="row" style={{ gap: 6 }} onSubmit={(e) => { e.preventDefault(); setAsked(ref); }}>
          <input className="grow" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="John 3:16" aria-label="Verse" />
          <button className="btn">Show</button>
        </form>
        {!asked.trim() ? null : q.error ? <ErrorState error={q.error} onRetry={q.reload} /> : !q.data ? <Loading /> : q.data.rows.map((r) => (
          <div key={r.language} className="card card-pad stack" style={{ gap: 4 }}>
            <div className="row between" style={{ gap: 8 }}><b>{r.native} <span className="muted small">{r.english !== r.native ? r.english : ''}</span></b><span className="small muted">{r.people} {r.people === 1 ? 'person' : 'people'}</span></div>
            {r.text ? <p style={{ margin: 0, lineHeight: 1.6 }}>{r.text}</p> : <p className="small muted" style={{ margin: 0 }}>{r.translation ? 'Could not load this Bible just now.' : 'No Bible in this language yet.'}</p>}
            {r.name && <span className="small muted">{r.reference} · {r.name}</span>}
          </div>
        ))}
      </div>
    </Modal>
  );
}

// ---------- Sunday ----------

/** Puts the outline into a service's plan as projector slides, optionally with a second Bible under each verse. */
export function SlidesModal({ prepId, onClose }: { prepId: string; onClose: () => void }) {
  const toast = useToast();
  const services = useApi(() => AdminApi.sermonPrep.services(prepId), [prepId]);
  const [eventId, setEventId] = useState('');
  const [second, setSecond] = useState('');
  useEffect(() => { if (!eventId && services.data?.[0]) setEventId(services.data[0].eventId); }, [services.data, eventId]);
  const add = useAction(async () => { const r = await AdminApi.sermonPrep.slides(prepId, eventId, second || undefined); toast(`Added ${r.added} item${r.added === 1 ? '' : 's'} to the service. Open Presenter to see the slides.`); onClose(); });
  const pick = services.data?.find((s) => s.eventId === eventId);
  return (
    <Modal title="Sermon slides" onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => void add.run()} disabled={add.busy || !eventId}>{pick?.hasSlides ? 'Replace the slides' : 'Add to the service'}</button></>}>
      <div className="stack">
        <p className="small muted" style={{ margin: 0 }}>The passage becomes a reading, one verse per slide, and each point becomes slides with its verses. Blanks show their words on screen.</p>
        <FormError error={add.error} />
        {services.error ? <ErrorState error={services.error} onRetry={services.reload} /> : !services.data ? <Loading /> : !services.data.length ? (
          <p className="small muted">No service near this sermon's Sunday. Set the Sunday on the sermon, or add the service in the calendar first.</p>
        ) : (
          <Field label="Service"><select value={eventId} onChange={(e) => setEventId(e.target.value)}>{services.data.map((s) => <option key={s.eventId} value={s.eventId}>{s.title} · {formatDate(s.startsAt)}{s.hasSlides ? ' (has slides)' : ''}</option>)}</select></Field>
        )}
        <Field label="Second language" hint="Optional. Its words show under each verse.">
          <select value={second} onChange={(e) => setSecond(e.target.value)}>
            <option value="">Only the sermon's Bible</option>
            {FEATURED_BIBLES.map((b) => <option key={b.id} value={b.id}>{b.native} · {b.name}</option>)}
          </select>
        </Field>
      </div>
    </Modal>
  );
}

const KIT_LANGS = LANGUAGES.filter((l) => l.region === 'india' || l.code === 'en');

/** The week's cell-group kit from the sermon, and sending it to every cell leader. */
export function KitModal({ prep, onChange, onClose }: { prep: SermonPrep; onChange: (p: SermonPrep) => void; onClose: () => void }) {
  const toast = useToast();
  const kits = Object.values(prep.kits ?? {});
  const [lang, setLang] = useState(kits[0]?.language ?? 'en');
  const kit = prep.kits?.[lang] ?? kits[0];
  const make = useAction(async () => { const r = await AdminApi.sermonPrep.kit(prep.id, lang); onChange(r.prep); setLang(r.kit.language); if (r.kit.madeBy === 'outline') toast('Made from your outline, in English. AI was not available.'); });
  const send = useAction(async () => { const r = await AdminApi.sermonPrep.sendKit(prep.id); onChange(r.prep); toast(`Sent to ${r.leaders} cell leader${r.leaders === 1 ? '' : 's'}.`); });
  return (
    <Modal title="Cell-group kit" onClose={onClose} wide footer={<>
      <span className="small muted" style={{ marginRight: 'auto' }}>{prep.kitSentAt ? `Last sent ${formatDate(prep.kitSentAt)}` : prep.sermonId ? 'Not sent yet' : 'Put the sermon in the library before sending.'}</span>
      <button className="btn" onClick={() => void send.run()} disabled={send.busy || !kits.length || !prep.sermonId}>Send to cell leaders</button>
    </>}>
      <div className="stack">
        <p className="small muted" style={{ margin: 0 }}>For this week's home groups: a short summary, an icebreaker, four questions, the memory verse and a prayer focus. Leaders open it on the sermon in the app.</p>
        <div className="row wrap" style={{ gap: 8 }}>
          <select value={lang} onChange={(e) => setLang(e.target.value)} aria-label="Language">{KIT_LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}{prep.kits?.[l.code] ? ' ✓' : ''}</option>)}</select>
          <button className="btn primary" onClick={() => void make.run()} disabled={make.busy}>{make.busy ? 'Writing…' : prep.kits?.[lang] ? 'Write it again' : 'Make the kit'}</button>
        </div>
        <FormError error={make.error ?? send.error} />
        {kit ? <KitView kit={kit} /> : <p className="small muted">No kit yet. Pick the language your groups use and make it.</p>}
      </div>
    </Modal>
  );
}

export function KitView({ kit }: { kit: GroupKit }) {
  return (
    <div className="card card-pad stack sp-kit" style={{ gap: 10 }}>
      {kit.summary && <p style={{ margin: 0 }}>{kit.summary}</p>}
      <div><b className="small">To start</b><p style={{ margin: '2px 0 0' }}>{kit.icebreaker}</p></div>
      <div><b className="small">Questions</b><ol style={{ margin: '2px 0 0', paddingLeft: 20 }}>{kit.questions.map((q, i) => <li key={i}>{q}</li>)}</ol></div>
      {kit.memoryVerse.reference && <div><b className="small">Memory verse · {kit.memoryVerse.reference}</b>{kit.memoryVerse.text && <p style={{ margin: '2px 0 0', fontStyle: 'italic' }}>{kit.memoryVerse.text}</p>}</div>}
      <div><b className="small">Pray together</b><p style={{ margin: '2px 0 0' }}>{kit.prayer}</p></div>
    </div>
  );
}

/** Questions about the passage, answered by AI with the verses each point rests on; tap a verse to read it. */
export function StudyHelper({ passage, translation, onRef }: { passage: string; translation: string; onRef: (ref: string) => void }) {
  const [q, setQ] = useState('');
  const [turns, setTurns] = useState<{ q: string; answer: string; refs: string[] }[]>([]);
  useEffect(() => setTurns([]), [passage]);
  const ask = useAction(async (question: string) => {
    const history = turns.flatMap((x) => [{ role: 'user' as const, content: x.q }, { role: 'assistant' as const, content: x.answer }]);
    const r = await AdminApi.studyAsk({ passage, translation, question, history });
    setTurns((t) => [...t, { q: question, ...r }]);
    setQ('');
  });
  const starters = ['What is the background to this passage?', 'Which words matter most here, in the Greek or Hebrew?', 'How does this fit the whole book?', 'How could this land with people in our church this week?'];
  return (
    <details className="card card-pad sp-study">
      <summary><Sparkles size={15} /> <b>Study helper</b> <span className="small muted">Ask about {passage}</span></summary>
      <div className="stack" style={{ gap: 10, marginTop: 10 }}>
        {turns.map((x, i) => (
          <div key={i} className="stack" style={{ gap: 6 }}>
            <b className="small">{x.q}</b>
            <LightMarkdown text={x.answer} />
            {x.refs.length > 0 && <div className="chips">{x.refs.map((r) => <button key={r} className="chip" style={{ padding: '3px 10px', cursor: 'pointer' }} onClick={() => onRef(r)}>{r}</button>)}</div>}
          </div>
        ))}
        {!turns.length && <div className="chips">{starters.map((s) => <button key={s} className="chip off" style={{ padding: '3px 10px', cursor: 'pointer' }} onClick={() => void ask.run(s)} disabled={ask.busy}>{s}</button>)}</div>}
        <FormError error={ask.error} />
        <form className="row" style={{ gap: 6 }} onSubmit={(e) => { e.preventDefault(); if (q.trim()) void ask.run(q.trim()); }}>
          <input className="grow" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask a question about the passage" aria-label="Question" disabled={ask.busy} />
          <button className="btn sm primary" disabled={ask.busy || !q.trim()}>{ask.busy ? 'Thinking…' : 'Ask'}</button>
        </form>
        <span className="small muted">Answers come from AI. Check every verse it gives before you preach it.</span>
      </div>
    </details>
  );
}

// ---------- Preparing together ----------

/** Comments from other pastors and elders beside the draft, and asking them for feedback. */
export function CommentsPanel({ prep, onChange }: { prep: SermonPrep; onChange: (p: SermonPrep) => void }) {
  const me = useMe();
  const [text, setText] = useState('');
  const [pointId, setPointId] = useState('');
  const [asking, setAsking] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const add = useAction(async () => { onChange(await AdminApi.sermonPrep.comment(prep.id, text, pointId || null)); setText(''); });
  const act = useAction(async (fn: () => Promise<SermonPrep>) => onChange(await fn()));
  const all = prep.comments ?? [];
  const shown = all.filter((c) => showDone || !c.resolved);
  const pointName = (id: string | null) => { const i = prep.points.findIndex((x) => x.id === id); return i >= 0 ? `Point ${i + 1}` : 'Whole sermon'; };
  return (
    <div className="card card-pad stack" style={{ gap: 8 }}>
      <div className="row between"><b><MessageCircle size={15} /> Comments</b><button className="btn sm ghost" onClick={() => setAsking(true)}><UserPlus size={14} /> Ask for feedback</button></div>
      {!all.length && <p className="small muted" style={{ margin: 0 }}>Ask another pastor or an elder to read the draft. Their comments appear here, beside your notes.</p>}
      {shown.map((c) => (
        <div key={c.id} className={`sp-comment ${c.resolved ? 'done' : ''}`}>
          <div className="row between small"><span><b>{c.by}</b> <span className="muted">· {pointName(c.pointId)} · {formatDate(c.at)}</span></span>
            <span className="row" style={{ gap: 2 }}>
              <button className="btn sm ghost icon" onClick={() => void act.run(() => AdminApi.sermonPrep.resolveComment(prep.id, c.id, !c.resolved))} aria-label={c.resolved ? 'Reopen' : 'Done'} title={c.resolved ? 'Reopen' : 'Mark done'}><Check size={14} /></button>
              {(!c.staffId || c.staffId === me) && <button className="btn sm ghost icon" onClick={() => void act.run(() => AdminApi.sermonPrep.removeComment(prep.id, c.id))} aria-label="Delete comment"><Trash2 size={13} /></button>}
            </span>
          </div>
          <div className="small" style={{ whiteSpace: 'pre-wrap' }}>{c.text}</div>
        </div>
      ))}
      {all.some((c) => c.resolved) && <button className="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setShowDone((x) => !x)}>{showDone ? 'Hide done' : `Show done (${all.filter((c) => c.resolved).length})`}</button>}
      <FormError error={add.error ?? act.error} />
      <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a comment" maxLength={2000} />
      <div className="row" style={{ gap: 6 }}>
        <select className="grow" value={pointId} onChange={(e) => setPointId(e.target.value)} aria-label="About">
          <option value="">About the whole sermon</option>
          {prep.points.map((x, i) => <option key={x.id} value={x.id}>Point {i + 1}{x.heading ? `: ${x.heading.slice(0, 40)}` : ''}</option>)}
        </select>
        <button className="btn sm primary" onClick={() => void add.run()} disabled={add.busy || !text.trim()}>Comment</button>
      </div>
      {asking && <AskFeedback prep={prep} onClose={() => setAsking(false)} />}
    </div>
  );
}

function AskFeedback({ prep, onClose }: { prep: SermonPrep; onClose: () => void }) {
  const toast = useToast();
  const me = useMe();
  const staff = useApi(AdminApi.staff.list);
  const [ids, setIds] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const send = useAction(async () => { const r = await AdminApi.sermonPrep.share(prep.id, ids, message); toast(`Asked ${r.asked} ${r.asked === 1 ? 'person' : 'people'}.`); onClose(); });
  const rows = (staff.data ?? []).filter((s) => s.status === 'active' && s.id !== me);
  return (
    <Modal title="Ask for feedback" onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => void send.run()} disabled={send.busy || !ids.length}>Send</button></>}>
      <div className="stack">
        <p className="small muted" style={{ margin: 0 }}>They get a message with a link to the draft, and can comment beside it. They need the sermon or communications permission to open it.</p>
        <FormError error={send.error} />
        {staff.error ? <ErrorState error={staff.error} onRetry={staff.reload} /> : !staff.data ? <Loading /> : !rows.length ? <p className="small muted">No one else has office access yet.</p> : (
          <div className="stack" style={{ gap: 4 }}>{rows.map((s) => (
            <label key={s.id} className="row" style={{ gap: 8 }}><input type="checkbox" checked={ids.includes(s.id)} onChange={(e) => setIds(e.target.checked ? [...ids, s.id] : ids.filter((x) => x !== s.id))} /> {s.name} <span className="small muted">{s.roleName}</span></label>
          ))}</div>
        )}
        <Field label="Message" hint="Optional."><textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={600} placeholder="Could you check whether point 2 is clear?" /></Field>
      </div>
    </Modal>
  );
}

// Who is signed in, to show their own delete buttons and leave them out of the share list.
function useMe(): string | undefined {
  return useApi(() => AdminApi.me(), []).data?.staff.id;
}
