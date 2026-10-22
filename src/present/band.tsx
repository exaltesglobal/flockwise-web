// Musician view: the whole chart of the current item on a phone or tablet, in today's key,
// with the page turning as the leader moves the slides. Each player sets their own transpose,
// capo, numbers and text size; those stay on the device.
import { colourVars, hasColours } from '@/lib/song-colours';
import { ChevronLeft, ChevronRight, ListMusic, Minus, Music2, Plus, Radio, Type, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router';

import type { BandItem } from '@/api/admin-types';
import { ErrorState } from '@/components/ui';
import { parseSections } from '@/core/modules/present';
import { flatKey, toNashville, transposeChord, transposeKey } from '@/lib/chords';
import { stepsBetween } from '@/lib/songfile';

import { RequireStaff, usePresentation, useNow, useScreenKey, useWakeLock } from './present';

type Prefs = { font: number; show: 'chords' | 'words' | 'numbers'; capo: number };
const PREFS_KEY = 'fw.band.v1';

function useLocal<T>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try { const raw = localStorage.getItem(key); return raw ? { ...initial, ...(JSON.parse(raw) as T) } : initial; } catch { return initial; }
  });
  return [v, (next) => { setV(next); try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* private mode */ } }];
}

const norm = (label: string) => label.toLowerCase().replace(/\s+/g, ' ').trim();
/** "Chorus (2/3)" on a slide is the "Chorus" section. */
const baseLabel = (label: string) => label.replace(/\s*\(\d+\/\d+\)$/, '');
/** Which repeat of a section a slide is: the deck numbers repeats in the slide id (…:chorus#0:2). */
const occurrence = (slideId: string) => Number(/:(\d+)$/.exec(slideId)?.[1] ?? 1);

/** Sections in the order they are sung today; a repeated section appears each time. */
function arranged(chart: string, order: string[]) {
  const sections = parseSections(chart);
  if (!order.length) return sections;
  const out: typeof sections = [];
  for (const want of order) {
    const exact = sections.filter((s) => norm(s.label) === norm(want));
    out.push(...(exact.length ? exact : sections.filter((s) => norm(s.label).startsWith(norm(want)))));
  }
  return out.length ? out : sections;
}

export function BandPage() {
  const key = useScreenKey();
  return key ? <Band screenKey={key} /> : <RequireStaff><Band /></RequireStaff>;
}

function Band({ screenKey }: { screenKey?: string }) {
  const { eventId = '' } = useParams();
  const { data, error, reload } = usePresentation(eventId, 1000, screenKey);
  const now = useNow(1000);
  useWakeLock();
  const [prefs, setPrefs] = useLocal<Prefs>(PREFS_KEY, { font: 1, show: 'chords', capo: 0 });
  // Extra transpose per item, for a player who wants their own key today.
  const [steps, setSteps] = useLocal<Record<string, number>>(`fw.band.steps.${eventId}`, {});
  const [follow, setFollow] = useState(true);
  const [viewing, setViewing] = useState(0);
  const [setlist, setSetlist] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => { document.title = 'Musician view · Flockwise'; }, []);

  const liveSlide = data?.slides[data.state.index];
  const liveIndex = liveSlide?.itemIndex ?? 0;
  const index = follow ? liveIndex : viewing;
  const item = data?.charts[index];
  const liveHere = !!liveSlide && liveSlide.itemIndex === index;
  const liveSection = liveHere ? `${norm(baseLabel(liveSlide.label))}#${occurrence(liveSlide.id)}` : null;

  // The synced page turn: scroll the section the leader is on to the top.
  useEffect(() => {
    if (!follow || !body.current) return;
    const target = liveSection ? body.current.querySelector<HTMLElement>(`[data-sec="${liveSection}"]`) : null;
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else if (!liveSection) body.current.scrollTo({ top: 0, behavior: 'smooth' });
  }, [follow, liveSection, index]);

  // Arrow keys and a foot pedal (page up/down) move between items.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!data) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') { setFollow(false); setViewing(Math.min(data.charts.length - 1, index + 1)); }
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') { setFollow(false); setViewing(Math.max(0, index - 1)); }
      if (e.key === 'l' || e.key === 'L') setFollow(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [data, index]);

  if (error && !data) return <div className="band"><ErrorState error={error} onRetry={reload} /></div>;
  if (!data) return <div className="band" />;

  const go = (i: number) => { setFollow(i === liveIndex); setViewing(i); setSetlist(false); };
  const next = data.charts[index + 1];
  const extra = item ? steps[item.id] ?? 0 : 0;

  return (
    <div className="band" style={{ '--band-font': prefs.font } as React.CSSProperties}>
      <header className="band-top">
        <button className="band-ic" title="Setlist" onClick={() => setSetlist(true)}><ListMusic size={20} /></button>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="ellipsis t">{item?.title ?? data.event.title}</div>
          <div className="ellipsis s">{[item?.person, item?.bpm ? `${item.bpm} bpm` : '', item?.minutes ? `${item.minutes} min` : ''].filter(Boolean).join(' · ') || data.event.title}</div>
        </div>
        <span className="clock">{new Date(now).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</span>
        {follow ? <span className="live"><Radio size={12} /> Live</span> : <button className="btn sm primary" onClick={() => setFollow(true)}>Back to live</button>}
      </header>
      {item && <Controls item={item} prefs={prefs} setPrefs={setPrefs} extra={extra} setExtra={(n) => setSteps({ ...steps, [item.id]: n })} />}
      {data.state.message && <div className="band-msg">{data.state.message}</div>}
      <div className={`band-body ${hasColours(item?.colours) ? 'coloured' : ''}`} style={colourVars(item?.colours)} ref={body}>
        {!item ? <p className="muted" style={{ padding: 20 }}>Nothing is planned for this service yet.</p> : <Chart item={item} prefs={prefs} extra={extra} liveSection={liveSection} />}
        {item?.notes && <div className="band-notes"><b>Notes:</b> {item.notes}</div>}
        <div className="band-end">
          <button className="btn" disabled={index === 0} onClick={() => go(index - 1)}><ChevronLeft size={16} /> Previous</button>
          <span className="small muted">{index + 1} / {data.charts.length}</span>
          <button className="btn" disabled={!next} onClick={() => go(index + 1)}>Next <ChevronRight size={16} /></button>
        </div>
      </div>
      {next && <div className="band-next" onClick={() => go(index + 1)}>Next: <b>{next.title}</b>{next.key ? ` · ${next.key}` : ''}{next.person ? ` · ${next.person}` : ''}</div>}
      {setlist && (
        <div className="band-drawer" onClick={() => setSetlist(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="row between" style={{ padding: '12px 16px' }}><b>{data.event.title}</b><button className="band-ic" onClick={() => setSetlist(false)}><X size={18} /></button></div>
            {data.charts.map((c, i) => (
              <button key={c.id} className={`band-set ${i === index ? 'on' : ''} ${i === liveIndex ? 'live' : ''}`} onClick={() => go(i)}>
                <span className="n">{i + 1}</span>
                <span className="grow" style={{ minWidth: 0 }}><span className="ellipsis">{c.title}</span><span className="small muted">{[c.kind === 'song' ? c.author : c.kind, c.person].filter(Boolean).join(' · ')}</span></span>
                {c.key && <span className="key">{c.key}</span>}
                {i === liveIndex && <Radio size={14} />}
              </button>
            ))}
            <p className="small muted" style={{ padding: '10px 16px 16px' }}>Tap a song to look ahead; “Back to live” follows the leader again. ← → keys or a page-turn pedal also move between songs.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function Controls({ item, prefs, setPrefs, extra, setExtra }: { item: BandItem; prefs: Prefs; setPrefs: (p: Prefs) => void; extra: number; setExtra: (n: number) => void }) {
  const base = item.songKey && item.key ? stepsBetween(item.songKey, item.key) : 0;
  const played = item.key ? transposeKey(item.key, extra) : null;
  const sounding = played && prefs.capo ? transposeKey(played, -prefs.capo) : null;
  if (item.kind !== 'song' && !item.hasChords) {
    return (
      <div className="band-ctl">
        <span className="small muted">{item.kind[0].toUpperCase() + item.kind.slice(1)}</span>
        <span className="grow" />
        <FontButtons prefs={prefs} setPrefs={setPrefs} />
      </div>
    );
  }
  return (
    <div className="band-ctl">
      <span className="keyctl" title={base ? `Chart written in ${item.songKey}` : undefined}>
        <button className="band-ic" onClick={() => setExtra(extra - 1)} title="Down a semitone"><Minus size={16} /></button>
        <span className="k">{played ?? '—'}{extra ? <small> ({extra > 0 ? '+' : ''}{extra})</small> : null}</span>
        <button className="band-ic" onClick={() => setExtra(extra + 1)} title="Up a semitone"><Plus size={16} /></button>
      </span>
      <label className="small capo">Capo
        <select value={prefs.capo} onChange={(e) => setPrefs({ ...prefs, capo: Number(e.target.value) })}>
          {[0, 1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        {sounding && <span className="muted">play {sounding} shapes</span>}
      </label>
      <span className="seg">
        {(['chords', 'words', 'numbers'] as const).map((m) => <button key={m} className={prefs.show === m ? 'on' : ''} onClick={() => setPrefs({ ...prefs, show: m })}>{m === 'chords' ? <Music2 size={14} /> : m === 'words' ? <Type size={14} /> : '1·4·5'}</button>)}
      </span>
      <span className="grow" />
      <FontButtons prefs={prefs} setPrefs={setPrefs} />
    </div>
  );
}

function FontButtons({ prefs, setPrefs }: { prefs: Prefs; setPrefs: (p: Prefs) => void }) {
  return (
    <span className="seg">
      <button onClick={() => setPrefs({ ...prefs, font: Math.max(0.7, +(prefs.font - 0.1).toFixed(1)) })} title="Smaller text">A-</button>
      <button onClick={() => setPrefs({ ...prefs, font: Math.min(1.8, +(prefs.font + 0.1).toFixed(1)) })} title="Bigger text">A+</button>
    </span>
  );
}

/** The chart, section by section, with the chords moved to today's key (and the player's own capo or transpose). */
function Chart({ item, prefs, extra, liveSection }: { item: BandItem; prefs: Prefs; extra: number; liveSection: string | null }) {
  const sections = useMemo(() => arranged(item.chart, item.arrangement), [item.chart, item.arrangement]);
  const songKey = item.songKey || 'C';
  const shift = (item.songKey && item.key ? stepsBetween(item.songKey, item.key) : 0) + extra - prefs.capo;
  const flats = shift ? flatKey(transposeKey(songKey, shift)) : undefined;
  const chord = (c: string) => (prefs.show === 'numbers' ? toNashville(c, songKey) : transposeChord(c, shift, flats));
  const seen = new Map<string, number>();
  if (!sections.length) return <p className="muted" style={{ padding: 20 }}>No words or chords for this item yet. Add them to the song in Service planning.</p>;
  return (
    <>
      {sections.map((sec, i) => {
        const n = (seen.get(norm(sec.label)) ?? 0) + 1;
        seen.set(norm(sec.label), n);
        const id = `${norm(sec.label)}#${n}`;
        return (
          <section key={i} data-sec={id} className={`band-sec ${liveSection === id ? 'on' : ''}`}>
            <h3>{sec.label}{n > 1 ? <small> ×{n}</small> : null}</h3>
            {(prefs.show === 'words' || !item.hasChords ? sec.lines : sec.chords).map((line, j) => <Line key={j} line={line} chord={chord} words={prefs.show === 'words' || !item.hasChords} />)}
          </section>
        );
      })}
    </>
  );
}

function Line({ line, chord, words }: { line: string; chord: (c: string) => string; words: boolean }) {
  if (words || !line.includes('[')) return <div className="band-line">{line.replace(/\[[^\]]*\]/g, '') || ' '}</div>;
  const parts = line.split(/(\[[^\]]+\])/).filter(Boolean);
  const segs: { chord: string; text: string }[] = [];
  for (const p of parts) {
    const m = /^\[([^\]]+)\]$/.exec(p);
    if (m) segs.push({ chord: chord(m[1]), text: '' });
    else if (segs.length) segs[segs.length - 1].text += p;
    else segs.push({ chord: '', text: p });
  }
  return <div className="band-line chorded">{segs.map((s, i) => <span key={i} className="seg"><span className="ch">{s.chord || ' '}</span><span>{s.text || ' '}</span></span>)}</div>;
}
