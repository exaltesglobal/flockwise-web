// The preaching view: the sermon from the workspace on a phone or tablet at the pulpit. One point
// at a time in large type, swipe or tap the arrows for the next, verses open when tapped, the clock,
// and a timer that says whether you are on time against the minutes planned for each point.
import { ArrowLeft, ArrowRight, Minus, Pause, Play, Plus, RotateCcw, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router';

import { AdminApi } from '@/api/endpoints';
import type { SermonPreach } from '@/core/types';
import { ErrorState, Loading } from '@/components/ui';
import { useApi } from '@/lib/use-api';

import { RequireStaff, useNow, useWakeLock } from './present';

type Slide = { kind: 'open' | 'point' | 'close'; heading: string; body: string; refs: string[]; minutes: number; label: string };

export function slidesOf(p: SermonPreach['prep']): Slide[] {
  const out: Slide[] = [{ kind: 'open', heading: p.title, body: [p.bigIdea, p.intro].filter(Boolean).join('\n\n'), refs: p.passage ? [p.passage] : [], minutes: 0, label: 'Opening' }];
  p.points.forEach((x, i) => out.push({ kind: 'point', heading: x.heading || `Point ${i + 1}`, body: x.body, refs: x.refs, minutes: x.minutes, label: `${i + 1} of ${p.points.length}` }));
  if (p.close) out.push({ kind: 'close', heading: 'In closing', body: p.close, refs: [], minutes: 0, label: 'Closing' });
  return out;
}

const mmss = (ms: number) => { const s = Math.floor(Math.abs(ms) / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const load = (k: string, fallback: number) => { try { return Number(localStorage.getItem(k)) || fallback; } catch { return fallback; } };

export function PreachPage() {
  return <RequireStaff><Preach /></RequireStaff>;
}

function Preach() {
  const { id = '' } = useParams();
  const q = useApi(() => AdminApi.sermonPrep.preach(id), [id]);
  const [i, setI] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const [size, setSize] = useState(() => load('fw.preach.size', 30));
  const [started, setStarted] = useState<number | null>(null);
  const [banked, setBanked] = useState(0);
  const now = useNow(500);
  const touch = useRef<number | null>(null);
  useWakeLock();
  const slides = useMemo(() => (q.data ? slidesOf(q.data.prep) : []), [q.data]);
  const go = (by: number) => { setOpen(null); setI((n) => Math.max(0, Math.min(slides.length - 1, n + by))); };
  useEffect(() => { try { localStorage.setItem('fw.preach.size', String(size)); } catch { /* private window */ } }, [size]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (['ArrowRight', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); go(1); }
      if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); go(-1); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  if (q.error) return <div className="preach"><ErrorState error={q.error} onRetry={q.reload} /></div>;
  if (!q.data) return <div className="preach"><Loading /></div>;
  const s = slides[i];
  const elapsed = banked + (started ? Math.max(0, now - started) : 0);
  // Where you should be: the planned minutes of every point before this one, and this one's end.
  const planned = slides.slice(0, i + 1).reduce((n, x) => n + x.minutes, 0) * 60_000;
  const before = slides.slice(0, i).reduce((n, x) => n + x.minutes, 0) * 60_000;
  const total = slides.reduce((n, x) => n + x.minutes, 0) * 60_000;
  const over = elapsed - planned;
  const pace = !total || (!started && !banked) ? null : over > 30_000 ? { cls: 'late', text: `${mmss(over)} over` } : before - elapsed > 30_000 ? { cls: 'early', text: `${mmss(before - elapsed)} ahead` } : { cls: 'ok', text: 'On time' };

  return (
    <div className="preach" onTouchStart={(e) => { touch.current = e.touches[0].clientX; }} onTouchEnd={(e) => { if (touch.current === null) return; const dx = e.changedTouches[0].clientX - touch.current; touch.current = null; if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1); }}>
      <header className="preach-bar">
        <span className="preach-clock">{new Date(now).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
        <span className="preach-timer">
          <b>{mmss(elapsed)}</b>{total > 0 && <span className="muted"> / {mmss(total)}</span>}
          {pace && <span className={`preach-pace ${pace.cls}`}>{pace.text}</span>}
        </span>
        <span className="row" style={{ gap: 4 }}>
          {started ? <button className="preach-btn" onClick={() => { setBanked(elapsed); setStarted(null); }} aria-label="Pause the timer"><Pause size={18} /></button>
            : <button className="preach-btn" onClick={() => setStarted(Date.now())} aria-label="Start the timer"><Play size={18} /></button>}
          <button className="preach-btn" onClick={() => { setStarted(null); setBanked(0); }} aria-label="Reset the timer"><RotateCcw size={16} /></button>
          <button className="preach-btn" onClick={() => setSize((n) => Math.max(18, n - 3))} aria-label="Smaller text"><Minus size={16} /></button>
          <button className="preach-btn" onClick={() => setSize((n) => Math.min(60, n + 3))} aria-label="Larger text"><Plus size={16} /></button>
          <button className="preach-btn" onClick={() => window.close()} aria-label="Close"><X size={18} /></button>
        </span>
      </header>
      <div className="preach-progress">{slides.map((x, n) => <button key={n} className={n === i ? 'on' : n < i ? 'done' : ''} onClick={() => { setOpen(null); setI(n); }} aria-label={x.label} />)}</div>

      <main className="preach-main" style={{ fontSize: size }}>
        <div className="preach-label">{s.label}{s.minutes ? ` · ${s.minutes} min` : ''}</div>
        <h1 className="preach-head">{s.heading}</h1>
        {s.body && <div className="preach-body">{s.body}</div>}
        {s.refs.length > 0 && (
          <div className="preach-refs">
            {s.refs.map((r) => {
              const v = q.data!.verses[r];
              return (
                <div key={r} className={`preach-ref ${open === r ? 'on' : ''}`}>
                  <button onClick={() => setOpen(open === r ? null : r)}>{v?.reference ?? r}</button>
                  {open === r && <p>{v ? v.text : 'This verse could not be loaded. Check the reference in the workspace.'}</p>}
                </div>
              );
            })}
          </div>
        )}
      </main>

      <footer className="preach-nav">
        <button className="preach-btn big" disabled={i === 0} onClick={() => go(-1)}><ArrowLeft size={22} /> {i > 0 ? slides[i - 1].heading : ''}</button>
        <button className="preach-btn big next" disabled={i === slides.length - 1} onClick={() => go(1)}>{i < slides.length - 1 ? slides[i + 1].heading : 'The end'} <ArrowRight size={22} /></button>
      </footer>
    </div>
  );
}
