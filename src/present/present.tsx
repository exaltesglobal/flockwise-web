// Presentation: the operator console (also the phone remote), the projector output and the
// stage display and the OBS overlay. Every screen polls the same presentation state, so they all
// follow the operator. Screens opened with ?key= (the church's screen key) need no sign-in.
import { ArrowLeft, ChevronLeft, ChevronRight, Circle, Clock, Copy, Eye, EyeOff, Image, Link2, Maximize, MessageSquare, Monitor, Music2, Palette, Plus, Radio, Send, Tv, Video, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link, Navigate, useLocation, useParams } from 'react-router';

import type { LowerThird, ObsMoment, PresentationTheme, PresentationView, Slide } from '@/api/admin-types';
import { adminSession } from '@/api/client';
import { AdminApi, PublicApi } from '@/api/endpoints';
import { ErrorState, Field, FormError, Loading, Modal, useToast } from '@/components/ui';
import { transliterateLines } from '@/core/transliterate';
import { useCan } from '@/lib/perms';
import { useSession } from '@/lib/session';
import { useAction, useApi } from '@/lib/use-api';

import { useObs } from './obs';
import './present.css';

export type Action = Parameters<typeof AdminApi.presentation.act>[1];
export type ActExtra = Parameters<typeof AdminApi.presentation.act>[2];

/** Loads the presentation and keeps it fresh. Screens poll every second; the operator a little slower. */
export function usePresentation(eventId: string, everyMs: number, key?: string | null) {
  const api = useApi(() => (key ? PublicApi.screen(eventId, key) : AdminApi.presentation.get(eventId)), [eventId, key]);
  const { reload } = api;
  useEffect(() => {
    const t = setInterval(() => { if (!document.hidden) void reload(); }, everyMs);
    return () => clearInterval(t);
  }, [reload, everyMs]);
  return api;
}

export function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

/** Keeps the projector from sleeping, where the browser allows it. */
export function useWakeLock() {
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

export function RequireStaff({ children }: { children: React.ReactNode }) {
  const session = useSession(adminSession);
  const location = useLocation();
  if (!session?.staff) return <Navigate to="/admin/sign-in" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

export const useScreenKey = () => new URLSearchParams(useLocation().search).get('key');

/** Countdown to the service with announcements rotating underneath. */
function CountdownFace({ until, announcements }: { until: string; announcements: { title: string; body: string }[] }) {
  const now = useNow(500);
  const left = Math.max(0, new Date(until).getTime() - now);
  const a = announcements.length ? announcements[Math.floor(now / 9000) % announcements.length] : null;
  const s = Math.floor(left / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const clock = `${d ? `${d}d ` : ''}${d || h ? `${h}:` : ''}${String(Math.floor((s % 3600) / 60)).padStart(d || h ? 2 : 1, '0')}:${String(s % 60).padStart(2, '0')}`;
  return (
    <div className="pres-countdown">
      <div className="lbl">{left ? 'Service starts in' : 'Welcome'}</div>
      {left > 0 && <div className="clock">{clock}</div>}
      {a && <div key={a.title} className="ann"><div className="t">{a.title}</div><div className="b">{a.body}</div></div>}
    </div>
  );
}

/** One slide drawn at any size: the frame is a container, so text scales with it. */
export function SlideFrame({ view, slide, mode = 'live', message, className = '', countdownTo }: { view: Pick<PresentationView, 'theme' | 'churchName' | 'logoUrl'> & Partial<Pick<PresentationView, 'announcements' | 'event'>>; slide: Slide | undefined; mode?: string; message?: string; className?: string; countdownTo?: string | null }) {
  const t = view.theme;
  const style = {
    '--pres-bg': t.background,
    '--pres-fg': t.textColor,
    '--pres-scale': t.fontScale,
    backgroundImage: t.imageUrl && mode !== 'blank' ? `linear-gradient(rgba(0,0,0,.45), rgba(0,0,0,.45)), url("${t.imageUrl}")` : undefined,
  } as CSSProperties;
  return (
    <div className={`pres-frame ${mode === 'blank' ? 'blank' : ''} ${t.uppercase ? 'upper' : ''} ${className}`} style={style}>
      {mode === 'blank' ? null : mode === 'countdown' ? (
        <CountdownFace until={countdownTo || view.event?.startsAt || new Date().toISOString()} announcements={view.announcements ?? []} />
      ) : mode === 'logo' || !slide ? (
        <div className="pres-logo">{view.logoUrl ? <img src={view.logoUrl} alt="" /> : null}<div>{view.churchName}</div></div>
      ) : slide.kind === 'title' ? (
        <div className="pres-title"><div className="main">{slide.lines[0]}</div>{slide.lines[1] && <div className="sub">{slide.lines[1]}</div>}</div>
      ) : (
        <div className={`pres-lines ${slide.kind}`}>
          {slide.lines.map((l, i) => <div key={i} className="line">{l}{slide.roman?.[i] && slide.roman[i] !== l && <div className="roman">{slide.roman[i]}</div>}</div>)}
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
  const [linksOpen, setLinksOpen] = useState(false);
  const current = useRef<HTMLButtonElement>(null);

  const act = useCallback(async (action: Action, extra: ActExtra = {}) => {
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
  const open = (path: string) => window.open(screenUrl(eventId, path, data.screenKey), `fw-${path}-${eventId}`, 'popup=yes,width=1280,height=720');

  return (
    <div className="pres-console">
      <header className="pres-bar">
        <Link className="btn ghost sm" to="/admin/services"><ArrowLeft size={15} /> <span className="hide-sm">Services</span></Link>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="ellipsis" style={{ fontWeight: 700 }}>{data.event.title}</div>
          <div className="small muted">{state.mode === 'live' ? `Slide ${state.index + 1} of ${slides.length}` : state.mode === 'blank' ? 'Screens blank' : state.mode === 'countdown' ? 'Countdown showing' : 'Showing logo'}</div>
        </div>
        <button className="btn sm" onClick={() => open('screen')}><Tv size={15} /> <span className="hide-sm">Projector</span></button>
        <button className="btn sm" onClick={() => open('stage')}><Monitor size={15} /> <span className="hide-sm">Stage display</span></button>
        {control && <Link className="btn sm hide-sm" to={`/present/${eventId}/studio`}><Video size={15} /> Studio</Link>}
        <button className="btn sm ghost icon" onClick={() => setLinksOpen(true)} aria-label="Screen links and OBS" title="Screen links and OBS"><Link2 size={16} /></button>
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
          <SlideFrame view={data} slide={slide} mode={state.mode} message={state.message} countdownTo={state.countdownTo} />
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
          {control && <MediaPanel view={data} act={act} />}
          {control && <ObsPanel view={data} act={act} />}
        </aside>
      </div>

      {control && (
        <footer className="pres-remote">
          <button className="btn big" onClick={() => void act('prev')} aria-label="Previous slide"><ChevronLeft size={26} /></button>
          <button className={`btn ${state.mode === 'blank' ? 'on' : ''}`} onClick={() => void act(state.mode === 'blank' ? 'live' : 'blank')}>{state.mode === 'blank' ? <Eye size={16} /> : <EyeOff size={16} />} {state.mode === 'blank' ? 'Show' : 'Blank'}</button>
          <button className={`btn ${state.mode === 'logo' ? 'on' : ''}`} onClick={() => void act(state.mode === 'logo' ? 'live' : 'logo')}><Image size={16} /> Logo</button>
          <button className={`btn hide-sm ${state.mode === 'countdown' ? 'on' : ''}`} onClick={() => void act(state.mode === 'countdown' ? 'live' : 'countdown')}><Clock size={16} /> Countdown</button>
          <button className="btn big primary" onClick={() => void act('next')} aria-label="Next slide"><ChevronRight size={26} /></button>
        </footer>
      )}
      {linksOpen && <LinksModal eventId={eventId} screenKey={data.screenKey ?? ''} canReset={can('services', 'settings')} onClose={() => setLinksOpen(false)} onReset={() => void reload()} />}
      {themeOpen && <ThemeModal theme={data.theme} onClose={() => setThemeOpen(false)} onSaved={() => { setThemeOpen(false); void reload(); toast('Slide style saved'); }} />}
    </div>
  );
}

const screenUrl = (eventId: string, path: string, key?: string) =>
  `${location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}/present/${eventId}/${path}${key ? `?key=${key}` : ''}`;

/** Livestream graphics: lyrics bar on the stream, and name straps fired with one tap. */
export function MediaPanel({ view, act, lyricsToggle = true }: { view: PresentationView; act: (a: Action, extra?: ActExtra) => Promise<void>; lyricsToggle?: boolean }) {
  const { state } = view;
  const queue = state.lowerThirds ?? [];
  const extra = view.suggestedLowerThirds.filter((l) => !queue.some((q) => q.title === l.title && q.subtitle === l.subtitle));
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const live = state.lowerThird;
  const row = (l: LowerThird, suggested: boolean) => {
    const on = !!live && live.title === l.title && live.subtitle === l.subtitle;
    return (
      <div key={`${suggested ? 's' : 'q'}${l.id}`} className={`lt-row ${on ? 'on' : ''}`}>
        <div className="grow" style={{ minWidth: 0 }}><div className="ellipsis" style={{ fontWeight: 600 }}>{l.title}</div>{l.subtitle && <div className="small muted ellipsis">{l.subtitle}</div>}</div>
        {!suggested && <button className="btn ghost icon sm" aria-label="Remove" onClick={() => void act('queue', { lowerThirds: queue.filter((q) => q !== l) })}><X size={13} /></button>}
        <button className={`btn sm ${on ? 'on' : ''}`} onClick={() => void act(on ? 'lowerClear' : 'lower', on ? {} : { lowerThird: l })}>{on ? 'Hide' : <><Send size={13} /> Show</>}</button>
      </div>
    );
  };
  return (
    <div className="card media-card">
      <div className="row between"><b>Livestream graphics</b>{live && <button className="btn sm ghost" onClick={() => void act('lowerClear')}>Clear strap</button>}</div>
      {lyricsToggle && <label className="row small" style={{ gap: 8 }}><input type="checkbox" checked={!!state.overlayLyrics} onChange={(e) => void act('overlay', { on: e.target.checked })} /> Lyrics bar on the stream</label>}
      <div className="small muted">Name straps</div>
      {queue.map((l) => row(l, false))}
      {extra.map((l) => row(l, true))}
      <form className="stack" style={{ gap: 6 }} onSubmit={(e) => { e.preventDefault(); if (!title.trim()) return; void act('queue', { lowerThirds: [...queue, { title, subtitle }] }); setTitle(''); setSubtitle(''); }}>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Name or reference, e.g. Rev. Daniel Kumar" maxLength={80} />
        <div className="row" style={{ gap: 6 }}>
          <input className="input grow" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="Second line, e.g. Guest speaker" maxLength={120} />
          <button className="btn sm" type="submit" disabled={!title.trim()}><Plus size={14} /> Add</button>
        </div>
      </form>
    </div>
  );
}

function LinksModal({ eventId, screenKey, canReset, onClose, onReset }: { eventId: string; screenKey: string; canReset: boolean; onClose: () => void; onReset: () => void }) {
  const toast = useToast();
  const [confirmReset, setConfirmReset] = useState(false);
  const links = [
    { path: 'screen', label: 'Projector', hint: 'Open on the computer connected to the projector, then double-click for full screen.' },
    { path: 'stage', label: 'Stage display', hint: 'For a TV facing the platform: current and next lines, chords and the clock.' },
    { path: 'band', label: 'Musician view', hint: 'For the band’s phones and tablets: the whole chart in today’s key, turning pages with the leader. Each player can transpose, add a capo or switch to numbers for themselves.' },
    { path: 'overlay', label: 'OBS overlay', hint: 'In OBS add a Browser Source, paste this link, set 1920 × 1080. The background is transparent: lyrics bar and name straps appear over your camera.' },
  ];
  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast('Link copied'); } catch { toast('Select the link and copy it', 'error'); }
  };
  return (
    <Modal wide title="Screen links" onClose={onClose} footer={<button className="btn" onClick={onClose}>Done</button>}>
      <div className="stack">
        <p className="small muted">These links work without signing in, so you can open them on the projector PC or in OBS. Anyone with a link can see the slides, so share them only with your media team.</p>
        {links.map((l) => {
          const url = screenUrl(eventId, l.path, screenKey);
          return (
            <div key={l.path} className="stack" style={{ gap: 4 }}>
              <b>{l.label}</b>
              <div className="row" style={{ gap: 6 }}>
                <input className="input grow mono small" readOnly value={url} onFocus={(e) => e.target.select()} />
                <button className="btn sm" onClick={() => void copy(url)}><Copy size={14} /> Copy</button>
              </div>
              <div className="small muted">{l.hint}</div>
            </div>
          );
        })}
        {canReset && (confirmReset ? (
          <div className="alert warn row wrap between">Old links will stop working on every screen.
            <span className="row" style={{ gap: 6 }}><button className="btn sm" onClick={() => setConfirmReset(false)}>Cancel</button>
              <button className="btn sm danger" onClick={async () => { await AdminApi.presentation.resetKey(); setConfirmReset(false); toast('New links created'); onReset(); }}>Make new links</button></span>
          </div>
        ) : <button className="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setConfirmReset(true)}>Make new links (stops the old ones)</button>)}
      </div>
    </Modal>
  );
}

/** Which moment of the service the screens are in, for the OBS scene plan. */
function momentOf(view: PresentationView): ObsMoment | null {
  const { state, slides, charts } = view;
  if (state.mode === 'countdown') return 'countdown';
  if (state.mode === 'blank') return 'blank';
  if (state.mode !== 'live') return null;
  const slide = slides[state.index];
  return slide ? charts.find((c) => c.itemIndex === slide.itemIndex)?.kind ?? null : null;
}

/** Switch OBS scenes and start or stop the stream from the presentation desk. Follows the church's scene plan (Settings › Integrations › OBS). */
function ObsPanel({ view, act }: { view: PresentationView; act: (a: Action, extra?: ActExtra) => Promise<void> }) {
  const obs = useObs();
  const toast = useToast();
  const [url, setUrl] = useState(obs.host);
  const [password, setPassword] = useState('');
  const [auto, setAuto] = useState(view.obs.autoSwitch);
  const { state } = obs;
  const run = (p: Promise<unknown>) => void p.catch((e) => toast((e as Error).message, 'error'));
  const moment = momentOf(view);
  const planned = moment ? view.obs.scenes[moment] : undefined;
  const missing = state.status === 'connected' ? Object.values(view.obs.scenes).filter((sc): sc is string => !!sc && !state.scenes.includes(sc)) : [];
  // Scenes follow the plan: when the moment changes (or OBS connects), go to its scene. Manual picks stay until the next moment.
  const current = useRef(state.current);
  current.current = state.current;
  useEffect(() => {
    if (!auto || state.status !== 'connected' || !planned || !state.scenes.includes(planned) || planned === current.current) return;
    run(obs.setScene(planned));
  }, [moment, planned, auto, state.status, state.scenes.length]); // eslint-disable-line react-hooks/exhaustive-deps
  // Lyrics bar on for songs, off after, if the church wants that. Works without OBS connected (it is the overlay link).
  const last = useRef<ObsMoment | null | undefined>(undefined);
  useEffect(() => {
    if (!view.obs.lyricsOnSongs || last.current === moment) return;
    const was = last.current;
    last.current = moment;
    if (moment === 'song' && !view.state.overlayLyrics) void act('overlay', { on: true });
    else if (was === 'song' && moment !== 'song' && view.state.overlayLyrics) void act('overlay', { on: false });
  }, [moment]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="card media-card">
      <div className="row between"><b>OBS</b>{state.status === 'connected' && <button className="btn sm ghost" onClick={obs.disconnect}>Disconnect</button>}</div>
      {state.status !== 'connected' ? (
        <form className="stack" style={{ gap: 6 }} onSubmit={(e) => { e.preventDefault(); obs.connect(url.trim(), password); }}>
          <p className="small muted">On the streaming computer, open OBS, go to Tools › WebSocket Server Settings and turn it on. Then connect from this computer.</p>
          <input className="input mono small" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="ws://localhost:4455" aria-label="OBS address" />
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="OBS WebSocket password" aria-label="OBS password" autoComplete="off" />
          {state.status === 'error' && <div className="small" style={{ color: 'var(--danger)' }}>{state.error}</div>}
          <button className="btn sm" type="submit" disabled={state.status === 'connecting'}>{state.status === 'connecting' ? 'Connecting…' : 'Connect to OBS'}</button>
        </form>
      ) : (
        <>
          <div className="row" style={{ gap: 6 }}>
            <button className={`btn sm grow ${state.streaming ? 'danger' : ''}`} onClick={() => run(obs.toggleStream())}><Radio size={14} /> {state.streaming ? 'Stop stream' : 'Go live'}</button>
            <button className={`btn sm grow ${state.recording ? 'danger' : ''}`} onClick={() => run(obs.toggleRecord())}><Circle size={14} /> {state.recording ? 'Stop recording' : 'Record'}</button>
          </div>
          {(state.streaming || state.recording) && <div className="small" style={{ color: 'var(--danger)', fontWeight: 600 }}>● {state.streaming ? 'Live' : ''}{state.streaming && state.recording ? ' and ' : ''}{state.recording ? 'Recording' : ''}</div>}
          <div className="small muted">Scenes</div>
          <div className="scene-grid">
            {state.scenes.map((sc) => <button key={sc} className={`btn sm ${sc === state.current ? 'on' : ''}`} onClick={() => run(obs.setScene(sc))}>{sc}</button>)}
          </div>
          {Object.values(view.obs.scenes).some(Boolean) ? (
            <label className="row small" style={{ gap: 8 }}><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Scenes follow the plan{planned ? <span className="muted"> · now: {planned}</span> : null}</label>
          ) : <p className="small muted" style={{ margin: 0 }}>Plan a scene for songs, sermon and the rest in <Link to="/admin/settings#integrations">Settings › Integrations › OBS</Link> and they will switch on their own.</p>}
          {missing.length > 0 && <div className="small" style={{ color: 'var(--warn, #b7791f)' }}>Not found in OBS: {missing.join(', ')}. Check the spelling in Settings › Integrations.</div>}
        </>
      )}
    </div>
  );
}

function ThemeModal({ theme, onClose, onSaved }: { theme: PresentationTheme; onClose: () => void; onSaved: () => void }) {
  const [t, setT] = useState(theme);
  const set = <K extends keyof PresentationTheme>(k: K, v: PresentationTheme[K]) => setT((x) => ({ ...x, [k]: v }));
  const save = useAction(() => AdminApi.presentation.saveTheme(t));
  const lines = ['Amazing grace! How sweet the sound', 'యేసు నన్ను ప్రేమించెను'];
  const sample: Slide = { id: 'x', itemIndex: 0, itemTitle: 'Amazing Grace', kind: 'lyrics', label: 'Verse 1', lines, alt: ['अद्भुत अनुग्रह, कैसी मधुर ध्वनि'], chords: [], roman: t.transliterate ? transliterateLines(lines) : [] };
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
        <label className="row small" style={{ gap: 8 }}><input type="checkbox" checked={!!t.transliterate} onChange={(e) => set('transliterate', e.target.checked)} /> Telugu, Hindi, Tamil and other Indian-script words also in English letters, so everyone can sing along</label>
        <label className="row small" style={{ gap: 8 }}><input type="checkbox" checked={t.titleSlides} onChange={(e) => set('titleSlides', e.target.checked)} /> Title slide before each song and item</label>
        <label className="row small" style={{ gap: 8 }}><input type="checkbox" checked={t.uppercase} onChange={(e) => set('uppercase', e.target.checked)} /> Capital letters</label>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- projector

export function ScreenPage() {
  const key = useScreenKey();
  return key ? <Screen screenKey={key} /> : <RequireStaff><Screen /></RequireStaff>;
}

function Screen({ screenKey }: { screenKey?: string }) {
  const { eventId = '' } = useParams();
  const { data, error, reload } = usePresentation(eventId, 1000, screenKey);
  useWakeLock();
  useEffect(() => { document.title = 'Projector · Flockwise'; }, []);
  if (error && !data) return <div className="pres-screen"><ErrorState error={error} onRetry={reload} /></div>;
  if (!data) return <div className="pres-screen" />;
  return (
    <div className="pres-screen" onDoubleClick={fullscreen} title="Double-click for full screen">
      <SlideFrame view={data} slide={data.slides[data.state.index]} mode={data.state.mode} message={data.state.message} countdownTo={data.state.countdownTo} className="full" />
      {!document.fullscreenElement && <button className="pres-fs" onClick={fullscreen}><Maximize size={16} /> Full screen</button>}
    </div>
  );
}

// ---------------------------------------------------------------- stage display

export function StagePage() {
  const key = useScreenKey();
  return key ? <Stage screenKey={key} /> : <RequireStaff><Stage /></RequireStaff>;
}

function Stage({ screenKey }: { screenKey?: string }) {
  const { eventId = '' } = useParams();
  const { data, error, reload } = usePresentation(eventId, 1000, screenKey);
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
        {state.mode !== 'live' && <span className="mode">{state.mode === 'blank' ? 'SCREEN BLANK' : state.mode === 'countdown' ? 'COUNTDOWN' : 'LOGO'}</span>}
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

// ---------------------------------------------------------------- OBS overlay

/** Transparent page for an OBS Browser Source: lyrics bar and name straps over the camera. */
export function OverlayPage() {
  const key = useScreenKey();
  return key ? <Overlay screenKey={key} /> : <RequireStaff><Overlay /></RequireStaff>;
}

function Overlay({ screenKey }: { screenKey?: string }) {
  const { eventId = '' } = useParams();
  const { data } = usePresentation(eventId, 1000, screenKey);
  useEffect(() => {
    document.title = 'Livestream overlay · Flockwise';
    // OBS composites the page over the camera, so nothing here may paint a background.
    document.documentElement.classList.add('pres-transparent');
    return () => document.documentElement.classList.remove('pres-transparent');
  }, []);
  if (!data) return null;
  const { state } = data;
  const slide = data.slides[state.index];
  const lyrics = state.overlayLyrics && state.mode === 'live' && slide && slide.kind !== 'title' ? slide : null;
  return (
    <div className={`pres-overlay ${data.theme.uppercase ? 'upper' : ''}`}>
      {state.lowerThird && (
        <div key={state.lowerThird.title + state.lowerThird.subtitle} className="ov-lower">
          <div className="t">{state.lowerThird.title}</div>
          {state.lowerThird.subtitle && <div className="s">{state.lowerThird.subtitle}</div>}
        </div>
      )}
      {lyrics && (
        <div key={lyrics.id} className="ov-lyrics">
          {lyrics.lines.map((l, i) => <div key={i}>{l}</div>)}
          {lyrics.roman?.length > 0 && <div className="alt">{lyrics.roman.join(' / ')}</div>}
          {data.theme.showAlt && lyrics.alt.length > 0 && <div className="alt">{lyrics.alt.join(' / ')}</div>}
        </div>
      )}
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
