// Presentation: the operator console (also the phone remote), the projector output and the
// stage display. Every screen polls the same presentation state, so they all follow the operator.
import { ArrowLeft, ChevronLeft, ChevronRight, Eye, EyeOff, Image, Maximize, MessageSquare, Monitor, Music2, Palette, Tv, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link, Navigate, useLocation, useParams } from 'react-router';

import type { PresentationTheme, PresentationView, Slide } from '@/api/admin-types';
import { adminSession } from '@/api/client';
import { AdminApi } from '@/api/endpoints';
import { ErrorState, Field, FormError, Loading, Modal, useToast } from '@/components/ui';
import { useCan } from '@/lib/perms';
import { useSession } from '@/lib/session';
import { useAction, useApi } from '@/lib/use-api';

import './present.css';

type Action = Parameters<typeof AdminApi.presentation.act>[1];

/** Loads the presentation and keeps it fresh. Screens poll every second; the operator a little slower. */
function usePresentation(eventId: string, everyMs: number) {
  const api = useApi(() => AdminApi.presentation.get(eventId), [eventId]);
  const { reload } = api;
  useEffect(() => {
    const t = setInterval(() => { if (!document.hidden) void reload(); }, everyMs);
    return () => clearInterval(t);
  }, [reload, everyMs]);
  return api;
}

function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

/** Keeps the projector from sleeping, where the browser allows it. */
function useWakeLock() {
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    const get = () => nav.wakeLock?.request('screen').then((l) => { lock = l; }).catch(() => undefined);
    void get();
    const onVis = () => { if (!document.hidden) void get(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { document.removeEventListener('visibilitychange', onVis); void lock?.release().catch(() => undefined); };
  }, []);
}

const fullscreen = () => {
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  else void document.documentElement.requestFullscreen?.().catch(() => undefined);
};

const countdown = (ms: number) => {
  const neg = ms < 0;
  const s = Math.floor(Math.abs(ms) / 1000);
  return `${neg ? '+' : ''}${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

function RequireStaff({ children }: { children: React.ReactNode }) {
  const session = useSession(adminSession);
  const location = useLocation();
  if (!session?.staff) return <Navigate to="/admin/sign-in" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

/** One slide drawn at any size: the frame is a container, so text scales with it. */
export function SlideFrame({ view, slide, mode = 'live', message, className = '' }: { view: Pick<PresentationView, 'theme' | 'churchName' | 'logoUrl'>; slide: Slide | undefined; mode?: string; message?: string; className?: string }) {
  const t = view.theme;
  const style = {
    '--pres-bg': t.background,
    '--pres-fg': t.textColor,
    '--pres-scale': t.fontScale,
    backgroundImage: t.imageUrl && mode !== 'blank' ? `linear-gradient(rgba(0,0,0,.45), rgba(0,0,0,.45)), url("${t.imageUrl}")` : undefined,
  } as CSSProperties;
  return (
    <div className={`pres-frame ${mode === 'blank' ? 'blank' : ''} ${t.uppercase ? 'upper' : ''} ${className}`} style={style}>
      {mode === 'blank' ? null : mode === 'logo' || !slide ? (
        <div className="pres-logo">{view.logoUrl ? <img src={view.logoUrl} alt="" /> : null}<div>{view.churchName}</div></div>
      ) : slide.kind === 'title' ? (
        <div className="pres-title"><div className="main">{slide.lines[0]}</div>{slide.lines[1] && <div className="sub">{slide.lines[1]}</div>}</div>
      ) : (
        <div className={`pres-lines ${slide.kind}`}>
          {slide.lines.map((l, i) => <div key={i} className="line">{l}</div>)}
          {t.showAlt && slide.alt.length > 0 && <div className="alt">{slide.alt.map((l, i) => <div key={i}>{l}</div>)}</div>}
        </div>
      )}
      {message && mode !== 'blank' && <div className="pres-message">{message}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- operator / remote

export function PresenterPage() {
  return <RequireStaff><Presenter /></RequireStaff>;
}

function Presenter() {
  const { eventId = '' } = useParams();
  const { data, error, reload, setData } = usePresentation(eventId, 2500);
  const can = useCan();
  const toast = useToast();
  const control = can('services') || can('checkin');
  const [message, setMessage] = useState('');
  const [themeOpen, setThemeOpen] = useState(false);
  const current = useRef<HTMLButtonElement>(null);

  const act = useCallback(async (action: Action, extra: { index?: number; message?: string } = {}) => {
    try { setData(await AdminApi.presentation.act(eventId, action, extra)); } catch (e) { toast((e as Error).message, 'error'); }
  }, [eventId, setData, toast]);

  useEffect(() => {
    if (!control) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); void act('next'); }
      else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) { e.preventDefault(); void act('prev'); }
      else if (e.key === 'b' || e.key === 'B' || e.key === '.') void act(data?.state.mode === 'blank' ? 'live' : 'blank');
      else if (e.key === 'l' || e.key === 'L') void act(data?.state.mode === 'logo' ? 'live' : 'logo');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [act, control, data?.state.mode]);

  useEffect(() => { current.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [data?.state.index]);
  useEffect(() => { if (data) setMessage(data.state.message); }, [data?.state.message]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <div className="pres-console"><ErrorState error={error} onRetry={reload} /></div>;
  if (!data) return <div className="pres-console"><Loading /></div>;
  const { slides, state } = data;
  const slide = slides[state.index];
  const next = slides[state.index + 1];
  const items = [...new Map(slides.map((s) => [s.itemIndex, s.itemTitle])).entries()];
  const open = (path: string) => window.open(`${import.meta.env.BASE_URL.replace(/\/$/, '')}/present/${eventId}/${path}`, `fw-${path}-${eventId}`, 'popup=yes,width=1280,height=720');

  return (
    <div className="pres-console">
      <header className="pres-bar">
        <Link className="btn ghost sm" to="/admin/services"><ArrowLeft size={15} /> <span className="hide-sm">Services</span></Link>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="ellipsis" style={{ fontWeight: 700 }}>{data.event.title}</div>
          <div className="small muted">{state.mode === 'live' ? `Slide ${state.index + 1} of ${slides.length}` : state.mode === 'blank' ? 'Screens blank' : 'Showing logo'}</div>
        </div>
        <button className="btn sm" onClick={() => open('screen')}><Tv size={15} /> <span className="hide-sm">Projector</span></button>
        <button className="btn sm" onClick={() => open('stage')}><Monitor size={15} /> <span className="hide-sm">Stage display</span></button>
        {can('services') && <button className="btn sm ghost icon" onClick={() => setThemeOpen(true)} aria-label="Slide style" title="Slide style"><Palette size={16} /></button>}
      </header>

      <div className="pres-main">
        <aside className="pres-items">
          {items.map(([i, title]) => (
            <button key={i} className={`pres-item ${slide?.itemIndex === i ? 'on' : ''}`} disabled={!control} onClick={() => void act('item', { index: i })}>{title}</button>
          ))}
        </aside>

        <section className="pres-grid">
          {slides.map((s, i) => (
            <button key={s.id} ref={i === state.index ? current : undefined} className={`pres-thumb ${i === state.index ? 'on' : ''} ${i === state.index && state.mode !== 'live' ? 'muted-out' : ''}`} disabled={!control} onClick={() => void act('goto', { index: i })}>
              <SlideFrame view={data} slide={s} />
              <span className="cap">{i + 1}. {s.itemTitle} · {s.label}</span>
            </button>
          ))}
          {slides.length === 0 && <p className="muted">This service has no plan yet. Add songs and items in Service planning.</p>}
        </section>

        <aside className="pres-side">
          <div className="small muted lbl-now">On screen</div>
          <SlideFrame view={data} slide={slide} mode={state.mode} message={state.message} />
          <div className="small muted lbl-next">Next</div>
          <SlideFrame view={data} slide={next} className="dim pres-next-frame" />
          {control && (
            <form className="row" style={{ gap: 6 }} onSubmit={(e) => { e.preventDefault(); void act('message', { message }); }}>
              <input className="input grow" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Message on screen, e.g. Parent of Aarav to kids room" maxLength={200} />
              <button className="btn sm" type="submit" title="Show message"><MessageSquare size={14} /></button>
              {state.message && <button className="btn sm ghost icon" type="button" aria-label="Clear message" onClick={() => { setMessage(''); void act('message', { message: '' }); }}><X size={14} /></button>}
            </form>
          )}
          <p className="small muted">Keys: → or space next, ← back, B blank, L logo.</p>
        </aside>
      </div>

      {control && (
        <footer className="pres-remote">
          <button className="btn big" onClick={() => void act('prev')} aria-label="Previous slide"><ChevronLeft size={26} /></button>
          <button className={`btn ${state.mode === 'blank' ? 'on' : ''}`} onClick={() => void act(state.mode === 'blank' ? 'live' : 'blank')}>{state.mode === 'blank' ? <Eye size={16} /> : <EyeOff size={16} />} {state.mode === 'blank' ? 'Show' : 'Blank'}</button>
          <button className={`btn ${state.mode === 'logo' ? 'on' : ''}`} onClick={() => void act(state.mode === 'logo' ? 'live' : 'logo')}><Image size={16} /> Logo</button>
          <button className="btn big primary" onClick={() => void act('next')} aria-label="Next slide"><ChevronRight size={26} /></button>
        </footer>
      )}
      {themeOpen && <ThemeModal theme={data.theme} onClose={() => setThemeOpen(false)} onSaved={() => { setThemeOpen(false); void reload(); toast('Slide style saved'); }} />}
    </div>
  );
}

function ThemeModal({ theme, onClose, onSaved }: { theme: PresentationTheme; onClose: () => void; onSaved: () => void }) {
  const [t, setT] = useState(theme);
  const set = <K extends keyof PresentationTheme>(k: K, v: PresentationTheme[K]) => setT((x) => ({ ...x, [k]: v }));
  const save = useAction(() => AdminApi.presentation.saveTheme(t));
  const sample: Slide = { id: 'x', itemIndex: 0, itemTitle: 'Amazing Grace', kind: 'lyrics', label: 'Verse 1', lines: ['Amazing grace! How sweet the sound', 'That saved a wretch like me!'], alt: ['अद्भुत अनुग्रह, कैसी मधुर ध्वनि'], chords: [] };
  return (
    <Modal title="Slide style" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={save.busy} onClick={async () => { if (await save.run()) onSaved(); }}>Save</button></>}>
      <div className="stack">
        <FormError error={save.error} />
        <SlideFrame view={{ theme: t, churchName: '', logoUrl: null }} slide={sample} />
        <div className="grid cols-2">
          <Field label="Background"><input type="color" className="input" value={t.background} onChange={(e) => set('background', e.target.value)} /></Field>
          <Field label="Text colour"><input type="color" className="input" value={t.textColor} onChange={(e) => set('textColor', e.target.value)} /></Field>
          <Field label="Lines per slide"><input type="number" min={1} max={8} className="input" value={t.linesPerSlide} onChange={(e) => set('linesPerSlide', Number(e.target.value))} /></Field>
          <Field label="Text size"><input type="range" min={0.6} max={1.6} step={0.05} value={t.fontScale} onChange={(e) => set('fontScale', Number(e.target.value))} /></Field>
        </div>
        <Field label="Background image" hint="Optional link to a JPG or PNG. The text gets a dark overlay so it stays readable."><input className="input" value={t.imageUrl} onChange={(e) => set('imageUrl', e.target.value)} placeholder="https://" /></Field>
        <label className="row small" style={{ gap: 8 }}><input type="checkbox" checked={t.showAlt} onChange={(e) => set('showAlt', e.target.checked)} /> Show second-language lyrics under the main lyrics</label>
        <label className="row small" style={{ gap: 8 }}><input type="checkbox" checked={t.titleSlides} onChange={(e) => set('titleSlides', e.target.checked)} /> Title slide before each song and item</label>
        <label className="row small" style={{ gap: 8 }}><input type="checkbox" checked={t.uppercase} onChange={(e) => set('uppercase', e.target.checked)} /> Capital letters</label>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- projector

export function ScreenPage() {
  return <RequireStaff><Screen /></RequireStaff>;
}

function Screen() {
  const { eventId = '' } = useParams();
  const { data, error, reload } = usePresentation(eventId, 1000);
  useWakeLock();
  useEffect(() => { document.title = 'Projector · Flockwise'; }, []);
  if (error && !data) return <div className="pres-screen"><ErrorState error={error} onRetry={reload} /></div>;
  if (!data) return <div className="pres-screen" />;
  return (
    <div className="pres-screen" onDoubleClick={fullscreen} title="Double-click for full screen">
      <SlideFrame view={data} slide={data.slides[data.state.index]} mode={data.state.mode} message={data.state.message} className="full" />
      {!document.fullscreenElement && <button className="pres-fs" onClick={fullscreen}><Maximize size={16} /> Full screen</button>}
    </div>
  );
}

// ---------------------------------------------------------------- stage display

export function StagePage() {
  return <RequireStaff><Stage /></RequireStaff>;
}

function Stage() {
  const { eventId = '' } = useParams();
  const { data, error, reload } = usePresentation(eventId, 1000);
  const [chords, setChords] = useState(true);
  const now = useNow(500);
  useWakeLock();
  useEffect(() => { document.title = 'Stage display · Flockwise'; }, []);
  if (error && !data) return <div className="pres-stage"><ErrorState error={error} onRetry={reload} /></div>;
  if (!data) return <div className="pres-stage" />;
  const { slides, state, timer } = data;
  const slide = slides[state.index];
  const next = slides[state.index + 1];
  const itemLeft = timer.itemEndsAt ? new Date(timer.itemEndsAt).getTime() - now : null;
  const showChords = chords && slide?.chords.some((c) => c.includes('['));
  return (
    <div className="pres-stage" onDoubleClick={fullscreen}>
      <div className="stage-top">
        <span className="clock">{new Date(now).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</span>
        {timer.itemTitle && <span className="item">{timer.itemTitle}</span>}
        {itemLeft !== null && <span className={`left ${itemLeft < 0 ? 'over' : itemLeft < 60_000 ? 'soon' : ''}`}>{countdown(itemLeft)}</span>}
        <span className="grow" />
        {state.mode !== 'live' && <span className="mode">{state.mode === 'blank' ? 'SCREEN BLANK' : 'LOGO'}</span>}
        <button className={`btn sm ${chords ? 'on' : ''}`} onClick={() => setChords(!chords)}><Music2 size={14} /> Chords</button>
      </div>
      {state.message && <div className="stage-msg">{state.message}</div>}
      <div className="stage-now">
        {slide && <div className="label">{slide.itemTitle} · {slide.label}</div>}
        {!slide ? null : slide.kind === 'title' ? <div className="line title">{slide.lines.join(' · ')}</div>
          : showChords ? slide.chords.map((c, i) => <ChordLine key={i} line={c} />)
          : slide.lines.map((l, i) => <div key={i} className="line">{l}</div>)}
      </div>
      <div className="stage-next">
        <div className="label">Next{next ? `: ${next.itemTitle} · ${next.label}` : ''}</div>
        {next ? next.lines.slice(0, 2).map((l, i) => <div key={i}>{l}</div>) : <div className="muted">End of service</div>}
      </div>
    </div>
  );
}

/** "[G]Amazing [C]grace" drawn as chords above the words. */
function ChordLine({ line }: { line: string }) {
  const parts = line.split(/(\[[^\]]+\])/).filter(Boolean);
  const out: { chord: string; text: string }[] = [];
  for (const p of parts) {
    const m = /^\[([^\]]+)\]$/.exec(p);
    if (m) out.push({ chord: m[1], text: '' });
    else if (out.length) out[out.length - 1].text += p;
    else out.push({ chord: '', text: p });
  }
  return <div className="line chorded">{out.map((o, i) => <span key={i} className="seg"><span className="ch">{o.chord || ' '}</span><span>{o.text || ' '}</span></span>)}</div>;
}
