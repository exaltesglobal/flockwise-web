import { ArrowDown, ArrowUp, ClipboardList, Copy, Download, ExternalLink, FileDown, FileText, FileUp, MonitorPlay, Music, Pencil, Plus, Printer, Radio, Search, Sparkles, Text, Trash2, Wand2, X } from 'lucide-react';
import { Link } from 'react-router';
import { useEffect, useRef, useState } from 'react';

import type { PlanItem, PlanItemKind, ServiceDetail, Song, SongAttachment, SongView } from '@/api/admin-types';
import { AdminApi } from '@/api/endpoints';
import type { SongColours } from '@/core/types';
import { ChordEditor } from '@/components/chord-editor';
import { Empty, ErrorState, Field, FormError, Loading, Modal, Segmented, useToast } from '@/components/ui';
import { downloadCsv, formatDay, formatRelative, formatTime } from '@/lib/format';
import { type ChartMode, ChordChart, transposeKey } from '@/lib/chords';
import { fileSafe, readSongFile, saveBlob, songsToPdf } from '@/lib/pdf-songs';
import { useCan } from '@/lib/perms';
import { COLOUR_PARTS, COLOUR_PRESETS, DEFAULT_COLOURS, hasColours } from '@/lib/song-colours';
import { chartToLyrics, stepsBetween, toChordPro, toChordsOverLyrics } from '@/lib/songfile';
import { printHtml } from '@/lib/print';
import { useAction, useApi } from '@/lib/use-api';

import { SetlistModal, useAi } from '../ai';
import { PageHeader } from '../layout';
import { SongDatabase } from './song-catalog';
import { ImportSongsModal } from './song-import';
import { RehearsalPlayer, SongStatsView } from './worship';

const KINDS: { value: PlanItemKind; label: string }[] = [
  { value: 'song', label: 'Song' },
  { value: 'reading', label: 'Scripture reading' },
  { value: 'sermon', label: 'Sermon' },
  { value: 'prayer', label: 'Prayer' },
  { value: 'announcement', label: 'Announcements' },
  { value: 'offering', label: 'Offering' },
  { value: 'video', label: 'Video' },
  { value: 'other', label: 'Other' },
];
const kindLabel = (k: PlanItemKind) => KINDS.find((x) => x.value === k)?.label ?? k;

type Draft = Partial<PlanItem> & { key_: string; open_?: boolean };

/** ISO time to the value a datetime-local input expects, in the browser's time zone. */
const toLocalInput = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const splitList = (v: string) => v.split(',').map((x) => x.trim()).filter(Boolean);
let seq = 0;
const draftKey = () => `d${++seq}`;

export function ServicesPage() {
  const [tab, setTab] = useState<'plans' | 'songs' | 'database' | 'stats' | 'ccli'>('plans');
  return (
    <>
      <PageHeader title="Service planning" subtitle="Order of service, songs and keys, timings and who is serving. Volunteers see the plan in the app once they accept." />
      <div className="tabs">
        <button className={tab === 'plans' ? 'on' : ''} onClick={() => setTab('plans')}>Plans</button>
        <button className={tab === 'songs' ? 'on' : ''} onClick={() => setTab('songs')}>Song library</button>
        <button className={tab === 'database' ? 'on' : ''} onClick={() => setTab('database')}>Song database</button>
        <button className={tab === 'stats' ? 'on' : ''} onClick={() => setTab('stats')}>Song stats</button>
        <button className={tab === 'ccli' ? 'on' : ''} onClick={() => setTab('ccli')}>CCLI report</button>
      </div>
      {tab === 'plans' ? <Plans /> : tab === 'songs' ? <Songs /> : tab === 'database' ? <SongDatabase /> : tab === 'stats' ? <SongStatsView /> : <CcliReport />}
    </>
  );
}

function Plans() {
  const [when, setWhen] = useState<'upcoming' | 'past'>('upcoming');
  const list = useApi(() => AdminApi.services.list(when), [when]);
  const [selected, setSelected] = useState<string | null>(null);
  const current = selected ?? list.data?.[0]?.event.id ?? null;
  return (
    <div className="split">
      <div className="card side-list">
        <div className="toolbar"><Segmented value={when} onChange={(v) => { setWhen(v); setSelected(null); }} options={[{ value: 'upcoming', label: 'Upcoming' }, { value: 'past', label: 'Past' }]} /></div>
        {list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : !list.data ? <Loading /> : list.data.length === 0 ? <Empty icon={<ClipboardList size={28} />} title="No services" /> : list.data.map((s) => (
          <div key={s.event.id} className={`list-row ${s.event.id === current ? 'on' : ''}`} onClick={() => setSelected(s.event.id)}>
            <div className="date-chip"><b>{new Date(s.event.startsAt).getDate()}</b><small>{new Date(s.event.startsAt).toLocaleDateString('en-IN', { month: 'short' })}</small></div>
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="ellipsis" style={{ fontWeight: 600 }}>{s.event.title}</div>
              <div className="small muted ellipsis">{s.items ? `${s.items} items · ${s.minutes} min${s.theme ? ` · ${s.theme}` : ''}` : 'No plan yet'}</div>
              <div className="small muted">{s.volunteers.filled}/{s.volunteers.needed} volunteers</div>
            </div>
          </div>
        ))}
      </div>
      {current && <PlanEditor key={current} eventId={current} onSaved={list.reload} />}
    </div>
  );
}

function PlanEditor({ eventId, onSaved }: { eventId: string; onSaved: () => void }) {
  const detail = useApi(() => AdminApi.services.get(eventId), [eventId]);
  const songs = useApi(() => AdminApi.services.songs());
  const past = useApi(() => AdminApi.services.list('past'));
  const [theme, setTheme] = useState('');
  const [notes, setNotes] = useState('');
  const [suggesting, setSuggesting] = useState(false);
  const ai = useAi();
  const [rehearsalAt, setRehearsalAt] = useState('');
  const [rehearsalNotes, setRehearsalNotes] = useState('');
  const [items, setItems] = useState<Draft[]>([]);
  const [dirty, setDirty] = useState(false);
  const save = useAction(() => AdminApi.services.save(eventId, { theme, notes, rehearsalAt: rehearsalAt ? new Date(rehearsalAt).toISOString() : null, rehearsalNotes, items: items.map(({ key_: _k, open_: _o, ...i }) => i) }));
  const toast = useToast();
  const can = useCan();
  const editable = can('services');
  const sheets = useAction(async () => {
    const list = items.filter((i) => i.songId).map((i, n) => {
      const sg = songs.data?.find((x) => x.id === i.songId);
      return sg ? { song: sg, label: `${n + 1}. ${detail.data!.event.title}`, options: { steps: i.key && sg.defaultKey ? stepsBetween(sg.defaultKey, i.key) : 0 } } : null;
    }).filter((x): x is NonNullable<typeof x> => !!x);
    const name = `${detail.data!.event.title} ${detail.data!.event.startsAt.slice(0, 10)}`;
    saveBlob(await songsToPdf(list, name), `${fileSafe(name)} chord sheets.pdf`);
    return true;
  });

  useEffect(() => {
    if (!detail.data) return;
    setTheme(detail.data.plan.theme);
    setNotes(detail.data.plan.notes);
    setRehearsalAt(toLocalInput(detail.data.plan.rehearsalAt));
    setRehearsalNotes(detail.data.plan.rehearsalNotes ?? '');
    setItems(detail.data.plan.items.map((i) => ({ ...i, key_: draftKey() })));
    setDirty(false);
  }, [detail.data]);

  if (detail.error) return <ErrorState error={detail.error} onRetry={detail.reload} />;
  if (!detail.data) return <Loading />;
  const ev = detail.data.event;
  const start = new Date(ev.startsAt).getTime();
  let clock = start;
  const total = items.reduce((s, i) => s + (i.minutes ?? 0), 0);
  const endMin = Math.round((new Date(ev.endsAt).getTime() - start) / 60000);

  const update = (k: string, patch: Partial<PlanItem>) => { setItems((xs) => xs.map((x) => (x.key_ === k ? { ...x, ...patch } : x))); setDirty(true); };
  const move = (i: number, d: -1 | 1) => { const xs = [...items]; [xs[i], xs[i + d]] = [xs[i + d], xs[i]]; setItems(xs); setDirty(true); };
  const add = (kind: PlanItemKind) => { setItems([...items, { key_: draftKey(), kind, title: kind === 'song' ? '' : kindLabel(kind), minutes: kind === 'sermon' ? 35 : kind === 'song' ? 5 : 3, notes: '', person: '', songId: null, key: null }]); setDirty(true); };

  const addSongs = (ids: string[]) => {
    const picked = ids.map((id) => songs.data!.find((x) => x.id === id)).filter((x): x is NonNullable<typeof x> => !!x);
    setItems((xs) => [...xs, ...picked.map((sg) => ({ key_: draftKey(), kind: 'song' as PlanItemKind, title: sg.title, minutes: 5, notes: '', person: '', songId: sg.id, key: sg.defaultKey || null }))]);
    setDirty(true);
    setSuggesting(false);
  };

  return (
    <div className="stack">
      {suggesting && <SetlistModal theme={theme} onAdd={addSongs} onClose={() => setSuggesting(false)} />}
      <div className="card card-pad row wrap between">
        <div>
          <h2>{ev.title}</h2>
          <div className="small muted">{formatDay(ev.startsAt)} · {formatTime(ev.startsAt)} · planned {total} of {endMin} min{total > endMin ? <span className="badge danger" style={{ marginLeft: 6 }}>{total - endMin} min over</span> : null}</div>
        </div>
        <div className="row wrap">
          {editable && past.data && past.data.some((p) => p.items) && (
            <select className="select" style={{ width: 210 }} value="" onChange={async (e) => {
              if (!e.target.value) return;
              if (items.length && !confirm('Replace this plan with a copy?')) return;
              await AdminApi.services.copy(eventId, e.target.value);
              toast('Plan copied');
              detail.reload();
              onSaved();
            }}>
              <option value="">Copy from a past service…</option>
              {past.data.filter((p) => p.items).map((p) => <option key={p.event.id} value={p.event.id}>{formatDay(p.event.startsAt)} · {p.event.title}</option>)}
            </select>
          )}
          <button className="btn" onClick={() => printPlan(detail.data!, theme, notes, items)}><Printer size={15} /> Print</button>
          {items.some((i) => i.songId) && <button className="btn" disabled={sheets.busy} title="Chord sheets for every song, in the keys set in this plan" onClick={() => void sheets.run()}><FileDown size={15} /> {sheets.busy ? 'Making PDF…' : 'Chord sheets PDF'}</button>}
          {items.length > 0 && <Link className="btn accent" to={`/admin/services/${eventId}/live`}><Radio size={15} /> Live</Link>}
          {items.length > 0 && <Link className="btn" to={`/present/${eventId}`} title={dirty ? 'Save the plan first so the screens show your changes' : 'Lyrics and slides on the projector'}><MonitorPlay size={15} /> Present</Link>}
          {editable && <button className="btn primary" disabled={!dirty || save.busy} onClick={async () => { if (await save.run()) { toast('Plan saved'); setDirty(false); onSaved(); } }}>{save.busy ? 'Saving…' : 'Save plan'}</button>}
        </div>
      </div>
      <FormError error={save.error} />
      <div className="service-plan-grid">
        <div className="stack">
          <div className="card card-pad grid cols-2">
            <Field label="Theme or sermon series"><input className="input" disabled={!editable} value={theme} onChange={(e) => { setTheme(e.target.value); setDirty(true); }} placeholder="The Good Shepherd · John 10" /></Field>
            <Field label="Notes for the team"><input className="input" disabled={!editable} value={notes} onChange={(e) => { setNotes(e.target.value); setDirty(true); }} placeholder="Communion this week" /></Field>
            <Field label="Rehearsal"><input className="input" type="datetime-local" disabled={!editable} value={rehearsalAt} onChange={(e) => { setRehearsalAt(e.target.value); setDirty(true); }} /></Field>
            <Field label="Rehearsal notes"><input className="input" disabled={!editable} value={rehearsalNotes} onChange={(e) => { setRehearsalNotes(e.target.value); setDirty(true); }} placeholder="Run the bridge twice, new intro on song 2" /></Field>
          </div>
          <div className="card">
            {items.length === 0 && <Empty icon={<ClipboardList size={28} />} title="Empty plan" body="Add songs, readings and the sermon below, or copy last week's plan." />}
            {items.map((it, i) => {
              const at = clock;
              clock += (it.minutes ?? 0) * 60000;
              return (
                <div key={it.key_} className="list-row" style={{ alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ width: 54, flexShrink: 0, paddingTop: 9 }} className="small muted mono">{new Date(at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</div>
                  <div className="grow stack" style={{ gap: 6 }}>
                    <div className="row" style={{ gap: 6 }}>
                      <select className="select" disabled={!editable} style={{ width: 150 }} value={it.kind} onChange={(e) => update(it.key_, { kind: e.target.value as PlanItemKind })}>
                        {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                      </select>
                      {it.kind === 'song' && songs.data ? (
                        <select className="select grow" disabled={!editable} value={it.songId ?? ''} onChange={(e) => { const s = songs.data!.find((x) => x.id === e.target.value); update(it.key_, { songId: s?.id ?? null, title: s?.title ?? '', key: s?.defaultKey ?? null }); }}>
                          <option value="">Choose a song…</option>
                          {songs.data.map((s) => <option key={s.id} value={s.id}>{s.title}{s.author ? ` · ${s.author}` : ''}</option>)}
                        </select>
                      ) : (
                        <input className="input grow" disabled={!editable} value={it.title ?? ''} onChange={(e) => update(it.key_, { title: e.target.value })} />
                      )}
                    </div>
                    <div className="row wrap" style={{ gap: 6 }}>
                      {it.kind === 'song' && <input className="input" disabled={!editable} style={{ width: 70 }} value={it.key ?? ''} onChange={(e) => update(it.key_, { key: e.target.value })} placeholder="Key" title="Key" />}
                      <input className="input" disabled={!editable} style={{ width: 160 }} value={it.person ?? ''} onChange={(e) => update(it.key_, { person: e.target.value })} placeholder="Who" />
                      <input className="input grow" style={{ minWidth: 120 }} disabled={!editable} value={it.notes ?? ''} onChange={(e) => update(it.key_, { notes: e.target.value })} placeholder="Notes" />
                      <div className="row" style={{ gap: 2 }}><input className="input" disabled={!editable} style={{ width: 64 }} type="number" min={0} value={it.minutes ?? 0} onChange={(e) => update(it.key_, { minutes: Number(e.target.value) })} /><span className="small muted">min</span></div>
                      <button className={`btn ghost icon sm ${it.open_ || it.text || it.arrangement?.length ? 'on' : ''}`} title={it.kind === 'song' ? 'Arrangement for this service' : 'Words for the projector'} aria-label="Projector words and arrangement" onClick={() => setItems((xs) => xs.map((x) => (x.key_ === it.key_ ? { ...x, open_: !x.open_ } : x)))}><Text size={15} /></button>
                    </div>
                    {it.open_ && (it.kind === 'song' ? (
                      <Field label="Arrangement for this service" hint={`Section order, separated by commas. Leave empty to use the song’s order${songs.data?.find((x) => x.id === it.songId)?.arrangement?.length ? ` (${songs.data!.find((x) => x.id === it.songId)!.arrangement!.join(', ')})` : ''}.`}>
                        <input className="input" disabled={!editable} value={(it.arrangement ?? []).join(', ')} onChange={(e) => update(it.key_, { arrangement: splitList(e.target.value) })} placeholder="Verse 1, Chorus, Verse 2, Chorus, Bridge, Chorus" />
                      </Field>
                    ) : (
                      <Field label="Words for the projector" hint="Scripture text, announcement points or sermon notes. A blank line starts a new slide.">
                        <textarea className="textarea" disabled={!editable} rows={4} value={it.text ?? ''} onChange={(e) => update(it.key_, { text: e.target.value })} />
                      </Field>
                    ))}
                  </div>
                  {editable && (
                    <div className="stack" style={{ gap: 0 }}>
                      <button className="btn ghost icon sm" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={14} /></button>
                      <button className="btn ghost icon sm" disabled={i === items.length - 1} onClick={() => move(i, 1)}><ArrowDown size={14} /></button>
                      <button className="btn ghost icon sm danger" onClick={() => { setItems(items.filter((x) => x.key_ !== it.key_)); setDirty(true); }}><X size={14} /></button>
                    </div>
                  )}
                </div>
              );
            })}
            {editable && (
              <div className="list-row row wrap" style={{ gap: 6 }}>
                <span className="small muted">Add:</span>
                {KINDS.map((k) => <button key={k.value} className="btn sm" onClick={() => add(k.value)}><Plus size={13} /> {k.label}</button>)}
                {ai && songs.data && <button className="btn sm ghost ai-btn" onClick={() => setSuggesting(true)}><Sparkles size={13} /> Suggest songs</button>}
              </div>
            )}
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h2>Serving</h2></div>
          {detail.data.team.length === 0 ? <p className="card-body small muted">No one scheduled yet. Use Volunteers to build the rota.</p> : detail.data.team.map((t, i) => (
            <div key={i} className="list-row small">
              <div className="grow"><b>{t.name}</b><div className="muted">{t.teamName} · {t.positionName}</div></div>
              {t.status === 'pending' && <span className="badge warn">Asked</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function printPlan(d: ServiceDetail, theme: string, notes: string, items: Draft[]) {
  const esc = (v: string) => v.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
  let t = new Date(d.event.startsAt).getTime();
  const rows = items.map((i) => {
    const at = new Date(t).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
    t += (i.minutes ?? 0) * 60000;
    return `<tr><td>${at}</td><td><b>${esc(i.title ?? '')}</b>${i.key ? ` <span class="muted">(${esc(i.key)})</span>` : ''}<div class="muted">${esc(kindLabel(i.kind!))}${i.notes ? ` · ${esc(i.notes)}` : ''}</div></td><td>${esc(i.person ?? '')}</td><td class="num">${i.minutes ?? 0}′</td></tr>`;
  });
  printHtml(`Plan ${d.event.title}`, `<h1>${esc(d.event.title)}</h1><div class="muted">${esc(formatDay(d.event.startsAt))} · ${esc(formatTime(d.event.startsAt))}${theme ? ` · ${esc(theme)}` : ''}</div>${notes ? `<p>${esc(notes)}</p>` : ''}
    <table><thead><tr><th>Time</th><th>Item</th><th>Who</th><th class="num">Min</th></tr></thead><tbody>${rows.join('')}</tbody></table>
    <h2>Team</h2><table><tbody>${d.team.map((m) => `<tr><td>${esc(m.teamName)} · ${esc(m.positionName)}</td><td>${esc(m.name)}</td></tr>`).join('')}</tbody></table>`);
}

function Songs() {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => { const t = setTimeout(() => setDebounced(q), 200); return () => clearTimeout(t); }, [q]);
  const list = useApi(() => AdminApi.services.songs(debounced), [debounced]);
  const [editing, setEditing] = useState<SongView | 'new' | null>(null);
  const [viewing, setViewing] = useState<SongView | null>(null);
  const [importing, setImporting] = useState(false);
  const toast = useToast();
  const can = useCan();
  return (
    <div className="card">
      <div className="toolbar">
        <div className="search"><Search size={16} /><input className="input" placeholder="Search title, author or tag" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="grow" />
        {can('services') && <button className="btn" onClick={() => setImporting(true)}><FileUp size={16} /> Import PDF or file</button>}
        {can('services') && <button className="btn primary" onClick={() => setEditing('new')}><Plus size={16} /> Add song</button>}
      </div>
      {importing && <ImportSongsModal existing={list.data ?? []} onClose={() => setImporting(false)} onDone={() => { setImporting(false); list.reload(); }} />}
      {list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : !list.data ? <Loading /> : list.data.length === 0 ? <Empty icon={<Music size={28} />} title="No songs" /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Title</th><th>Key</th><th>BPM</th><th>Tags</th><th className="num">Used</th><th>Last used</th><th /></tr></thead>
            <tbody>
              {list.data.map((s) => (
                <tr key={s.id} className="clickable" onClick={() => setViewing(s)}>
                  <td><b>{s.title}</b><div className="small muted">{s.author}{s.ccli ? ` · CCLI ${s.ccli}` : ''}</div></td>
                  <td className="mono">{s.defaultKey}</td>
                  <td className="small">{s.bpm ?? '—'}</td>
                  <td className="small">{s.tags.map((t) => <span key={t} className="badge gray" style={{ marginRight: 4 }}>{t}</span>)}</td>
                  <td className="num">{s.timesUsed}</td>
                  <td className="small muted">{s.lastUsedAt ? formatRelative(s.lastUsedAt) : 'Never'}</td>
                  <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                    {can('services') && <>
                      <button className="btn ghost icon sm" onClick={() => setEditing(s)}><Pencil size={15} /></button>
                      <button className="btn ghost icon sm danger" onClick={async () => { if (!confirm(`Delete ${s.title}?`)) return; await AdminApi.services.removeSong(s.id); toast('Deleted'); list.reload(); }}><Trash2 size={15} /></button>
                    </>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && <SongForm song={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); list.reload(); toast('Saved'); }} />}
      {viewing && <SongSheet song={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

function SongSheet({ song, onClose }: { song: SongView; onClose: () => void }) {
  const [steps, setSteps] = useState(0);
  const [capo, setCapo] = useState(0);
  const [mode, setMode] = useState<ChartMode>('chords');
  const toast = useToast();
  const hasChart = !!song.chordChart?.trim();
  const pdf = useAction(async () => {
    const key = transposeKey(song.defaultKey || '', steps);
    saveBlob(await songsToPdf([{ song, options: { steps, capo, mode } }], song.title), `${fileSafe(song.title)}${key ? ` (${key})` : ''}.pdf`);
    return true;
  });
  const audio = (song.attachments ?? []).filter((a) => a.kind === 'audio' && a.url);
  return (
    <Modal wide title={song.title} onClose={onClose} footer={<>
      <button className="btn" onClick={() => { navigator.clipboard?.writeText(hasChart ? toChordsOverLyrics(song.chordChart!, steps, song.defaultKey) : song.lyrics); toast(hasChart ? 'Chords and lyrics copied, ready for WhatsApp' : 'Lyrics copied'); }}><Copy size={15} /> Copy{hasChart ? ' with chords' : ' lyrics'}</button>
      <button className="btn" onClick={() => saveBlob(new Blob([toChordPro(song, steps)], { type: 'text/plain' }), `${fileSafe(song.title)}.cho`)}><FileText size={15} /> ChordPro</button>
      <button className="btn primary" disabled={pdf.busy} onClick={() => void pdf.run()}><FileDown size={15} /> {pdf.busy ? 'Making PDF…' : 'Download PDF'}</button>
    </>}>
      <div className="stack">
        <div className="row wrap" style={{ gap: 8 }}>
          <span className="small muted grow">{song.author}{song.ccli ? ` · CCLI ${song.ccli}` : ''}{song.bpm ? ` · ${song.bpm} bpm` : ''}{song.copyright ? ` · ${song.copyright}` : ''}</span>
          {hasChart && <>
            <span className="small">Key</span>
            <button className="btn sm icon" onClick={() => setSteps(steps - 1)} aria-label="Transpose down">−</button>
            <b className="mono" style={{ minWidth: 28, textAlign: 'center' }}>{transposeKey(song.defaultKey || 'C', steps)}</b>
            <button className="btn sm icon" onClick={() => setSteps(steps + 1)} aria-label="Transpose up">+</button>
            {steps !== 0 && <button className="btn sm ghost" onClick={() => setSteps(0)}>Reset</button>}
            <select className="select" style={{ width: 96 }} value={capo} onChange={(e) => setCapo(Number(e.target.value))} aria-label="Capo">
              {Array.from({ length: 8 }, (_, i) => <option key={i} value={i}>{i ? `Capo ${i}` : 'No capo'}</option>)}
            </select>
            <Segmented value={mode} onChange={setMode} options={[{ value: 'chords', label: 'Chords' }, { value: 'numbers', label: 'Numbers' }]} />
          </>}
        </div>
        {capo > 0 && mode === 'chords' && <div className="small muted">Shapes for capo {capo}. Sounds in {transposeKey(song.defaultKey || 'C', steps)}.</div>}
        {(song.arrangement?.length ?? 0) > 0 && <div className="small"><span className="muted">Arrangement:</span> {song.arrangement!.join(' → ')}</div>}
        {audio.map((a) => <RehearsalPlayer key={a.id} name={a.name} url={a.url} />)}
        {(song.attachments?.length ?? 0) > 0 && (
          <div className="row wrap" style={{ gap: 6 }}>
            {song.attachments!.map((a) => <a key={a.id} className="btn sm" href={a.url} target="_blank" rel="noreferrer"><ExternalLink size={13} /> {a.name}</a>)}
          </div>
        )}
        {hasChart ? <ChordChart text={song.chordChart!} steps={steps} capo={capo} mode={mode} songKey={song.defaultKey || 'C'} colours={song.colours} /> : <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 15 }}>{song.lyrics || 'No lyrics saved.'}</pre>}
        {song.lyricsAlt && <details><summary className="small muted">Second language</summary><pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 15 }}>{song.lyricsAlt}</pre></details>}
        {hasChart && song.lyrics && <details><summary className="small muted">Plain lyrics</summary><pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 15 }}>{song.lyrics}</pre></details>}
      </div>
    </Modal>
  );
}

function CcliReport() {
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10));
  const [to, setTo] = useState(today);
  const { data, error, reload } = useApi(() => AdminApi.ccli(from, to), [from, to]);
  return (
    <div className="card">
      <div className="toolbar">
        <label className="row small" style={{ gap: 6 }}>From <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="row small" style={{ gap: 6 }}>To <input type="date" className="input" value={to} max={today} onChange={(e) => setTo(e.target.value)} /></label>
        <div className="grow" />
        <button className="btn" disabled={!data?.rows.length} onClick={() => downloadCsv(`ccli-report-${from}-to-${to}.csv`, [['Song', 'Author', 'CCLI number', 'Times used', 'Dates'], ...data!.rows.map((r) => [r.title, r.author, r.ccli, r.uses, r.dates.join(' ')])])}><Download size={15} /> Export CSV</button>
      </div>
      <p className="small muted" style={{ padding: '0 16px' }}>Songs used in services in this period, for your CCLI Copyright Reporting. Songs without a CCLI number are flagged.</p>
      {error ? <ErrorState error={error} onRetry={reload} /> : !data ? <Loading /> : data.rows.length === 0 ? <Empty icon={<Music size={28} />} title="No songs used in this period" /> : (
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Song</th><th>CCLI #</th><th className="num">Uses</th><th>Dates</th></tr></thead>
          <tbody>{data.rows.map((r) => (
            <tr key={r.songId}><td><b>{r.title}</b><div className="small muted">{r.author}</div></td><td className="mono">{r.ccli || <span className="badge warn">Missing</span>}</td><td className="num">{r.uses}</td><td className="small muted">{r.dates.map((d) => formatDay(d)).join(', ')}</td></tr>
          ))}</tbody>
        </table></div>
      )}
    </div>
  );
}

function SongColourPicker({ value, onChange }: { value: SongColours; onChange: (c: SongColours) => void }) {
  return (
    <div className="song-colours">
      <span className="small"><b>Chart colours</b> <span className="muted">for the song sheet, PDF and musicians view</span></span>
      <div className="row wrap" style={{ gap: 12 }}>
        {COLOUR_PARTS.map((p) => (
          <label key={p.key} className="row small" style={{ gap: 6 }}>
            <input type="color" value={value[p.key] ?? DEFAULT_COLOURS[p.key]} onChange={(e) => onChange({ ...value, [p.key]: e.target.value })} aria-label={p.label} />
            {p.label}
          </label>
        ))}
      </div>
      <div className="colour-presets">
        {COLOUR_PRESETS.map((p) => (
          <button key={p.name} type="button" className="colour-preset" onClick={() => onChange({ ...p.colours })}>
            <i style={{ background: p.colours.background, color: p.colours.chords, borderColor: p.colours.lyrics }}>A</i>{p.name}
          </button>
        ))}
        {hasColours(value) && <button type="button" className="btn sm ghost" onClick={() => onChange({})}>Reset</button>}
      </div>
    </div>
  );
}

function SongForm({ song, onClose, onSaved }: { song: Song | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<Omit<Song, 'id'>>({ title: song?.title ?? '', author: song?.author ?? '', defaultKey: song?.defaultKey ?? '', bpm: song?.bpm ?? null, ccli: song?.ccli ?? '', tags: song?.tags ?? [], lyrics: song?.lyrics ?? '', lyricsAlt: song?.lyricsAlt ?? '', chordChart: song?.chordChart ?? '', attachments: song?.attachments ?? [], colours: song?.colours ?? {} });
  const [arrangement, setArrangement] = useState((song?.arrangement ?? []).join(', '));
  const atts = form.attachments ?? [];
  const setAtt = (i: number, patch: Partial<SongAttachment>) => set('attachments', atts.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  const [tags, setTags] = useState((song?.tags ?? []).join(', '));
  const save = useAction(() => {
    const input = { ...form, tags: splitList(tags), arrangement: splitList(arrangement) };
    return song ? AdminApi.services.updateSong(song.id, input) : AdminApi.services.createSong(input);
  });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const fileIn = useRef<HTMLInputElement>(null);
  const [fileNote, setFileNote] = useState('');
  async function fillFromFile(f: File) {
    try {
      const r = await readSongFile(f);
      const p = r.songs[0];
      if (!p) return setFileNote(r.scanned ? 'That PDF is a scanned picture with no text to read.' : 'No song found in that file.');
      setForm((x) => ({ ...x, title: x.title || p.title, author: x.author || p.author, defaultKey: p.key || x.defaultKey, bpm: x.bpm ?? p.bpm, ccli: x.ccli || p.ccli, chordChart: p.chordChart || x.chordChart, lyrics: p.lyrics || x.lyrics }));
      setFileNote([`Read ${f.name}.`, ...p.warnings].join(' '));
    } catch {
      setFileNote('That file could not be read.');
    }
  }
  return (
    <Modal xl title={song ? 'Edit song' : 'Add a song'} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={save.busy || !form.title.trim()} onClick={async () => { if (await save.run()) onSaved(); }}>Save</button></>}
    >
      <div className="stack">
        <FormError error={save.error} />
        <div className="row wrap" style={{ gap: 8 }}>
          <button className="btn sm" onClick={() => fileIn.current?.click()}><FileUp size={14} /> Fill from a PDF or ChordPro file</button>
          <input ref={fileIn} type="file" hidden accept=".pdf,.cho,.chopro,.chordpro,.crd,.pro,.onsong,.txt,application/pdf,text/plain" onChange={(e) => { const f = e.target.files?.[0]; if (f) void fillFromFile(f); e.target.value = ''; }} />
          {fileNote && <span className="small muted">{fileNote}</span>}
        </div>
        <div className="grid cols-3">
          <Field label="Title"><input className="input" autoFocus value={form.title} onChange={(e) => set('title', e.target.value)} /></Field>
          <Field label="Author"><input className="input" value={form.author} onChange={(e) => set('author', e.target.value)} /></Field>
          <Field label="Default key"><input className="input" value={form.defaultKey} onChange={(e) => set('defaultKey', e.target.value)} placeholder="G" /></Field>
          <Field label="BPM"><input className="input" type="number" value={form.bpm ?? ''} onChange={(e) => set('bpm', e.target.value ? Number(e.target.value) : null)} /></Field>
          <Field label="CCLI number"><input className="input" value={form.ccli} onChange={(e) => set('ccli', e.target.value)} /></Field>
          <Field label="Tags" hint="e.g. Telugu, Opening, Communion"><input className="input" value={tags} onChange={(e) => setTags(e.target.value)} /></Field>
        </div>
        <div className="stack" style={{ gap: 6 }}>
          <span className="section-title" style={{ margin: 0 }}>Chords and lyrics</span>
          <ChordEditor value={form.chordChart ?? ''} onChange={(v) => set('chordChart', v)} songKey={form.defaultKey} onKeyChange={(k) => set('defaultKey', k)} colours={form.colours} />
          <SongColourPicker value={form.colours ?? {}} onChange={(c) => set('colours', c)} />
          {!!form.chordChart?.trim() && (
            <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => { if (form.lyrics.trim() && !confirm('Replace the projector lyrics below with the words from the chord chart?')) return; set('lyrics', chartToLyrics(form.chordChart ?? '')); }}><Wand2 size={14} /> Make projector lyrics from the chart</button>
          )}
        </div>
        <Field label="Lyrics for the projector" hint="Put each section under a heading such as Verse 1, Chorus or Bridge. The projector makes slides from these."><textarea className="textarea" style={{ minHeight: 140 }} value={form.lyrics} onChange={(e) => set('lyrics', e.target.value)} placeholder={'Verse 1\nAmazing grace! How sweet the sound\n\nChorus\n…'} /></Field>
        <Field label="Lyrics in a second language" hint="Optional. Use the same headings and the projector shows both languages, e.g. English with Telugu or Hindi below."><textarea className="textarea" style={{ minHeight: 100 }} value={form.lyricsAlt ?? ''} onChange={(e) => set('lyricsAlt', e.target.value)} /></Field>
        <Field label="Arrangement" hint="The usual section order, separated by commas. Each service can change it."><input className="input" value={arrangement} onChange={(e) => setArrangement(e.target.value)} placeholder="Verse 1, Chorus, Verse 2, Chorus, Bridge, Chorus" /></Field>
        <span className="section-title">Attachments</span>
        <p className="small muted" style={{ marginTop: -8 }}>Links to lead sheets, MP3s or videos (Google Drive, Dropbox, YouTube).</p>
        {atts.map((a, i) => (
          <div key={a.id} className="row wrap" style={{ gap: 6 }}>
            <input className="input" style={{ width: 170 }} placeholder="Name" value={a.name} onChange={(e) => setAtt(i, { name: e.target.value })} />
            <input className="input grow" style={{ minWidth: 200 }} placeholder="https://" value={a.url} onChange={(e) => setAtt(i, { url: e.target.value })} />
            <select className="select" style={{ width: 120 }} value={a.kind} onChange={(e) => setAtt(i, { kind: e.target.value as SongAttachment['kind'] })}>{['chart', 'lyrics', 'audio', 'video', 'other'].map((k) => <option key={k} value={k}>{k[0].toUpperCase() + k.slice(1)}</option>)}</select>
            <button className="btn ghost icon sm danger" onClick={() => set('attachments', atts.filter((_, j) => j !== i))}><X size={15} /></button>
          </div>
        ))}
        <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => set('attachments', [...atts, { id: `sa${Date.now()}`, name: '', url: '', kind: 'chart' }])}><Plus size={14} /> Add a link</button>
      </div>
    </Modal>
  );
}
