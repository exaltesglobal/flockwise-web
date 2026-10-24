// Presentation: the operator console (also the phone remote), the projector output and the
// stage display and the OBS overlay. Every screen polls the same presentation state, so they all
// follow the operator. Screens opened with ?key= (the church's screen key) need no sign-in.
import { LANGUAGES } from '@/core/languages';
import { ArrowLeft, BookOpen, Smartphone, Captions, ChevronLeft, ChevronRight, Circle, Clock, Copy, Eraser, Eye, EyeOff, Image, Link2, Maximize, MessageSquare, Mic, Monitor, Music2, Palette, Plus, Radio, Send, Square, Timer, Trash2, Tv, Type, Video, Wallpaper, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link, Navigate, useLocation, useParams } from 'react-router';

import type { BiblePassage, CaptionsView, LanguageCode, LowerThird, ObsMoment, PresentationTheme, PresentationView, Slide, SongView } from '@/api/admin-types';
import { canDictate, useDictation } from '@/admin/components/dictate';
import { adminSession } from '@/api/client';
import { FEATURED_BIBLES } from '@/core/bible-texts';
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
/** The last caption line as the screen shows it: the translation, with the original under it when asked. */
export function captionText(c: CaptionsView | undefined): { main: string; sub: string | null } | null {
  if (!c?.on || !c.lines.length) return null;
  const last = c.lines[c.lines.length - 1]!;
  if (c.show === 'original' || !last.translated) return { main: last.text, sub: null };
  return { main: last.translated, sub: c.show === 'both' ? last.text : null };
}

const isVideo = (url: string) => /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(url);

/** The picture or moving loop behind the words. Thumbnails show a still frame so the grid stays light. */
function Backdrop({ url, still }: { url: string; still?: boolean }) {
  if (isVideo(url)) return <video key={url} className="pres-bg" src={url} muted loop playsInline autoPlay={!still} preload={still ? 'metadata' : 'auto'} />;
  return <div className="pres-bg" style={{ backgroundImage: `url("${url}")` }} />;
}

export function SlideFrame({ view, slide, mode = 'live', message, className = '', countdownTo, captions, still }: { view: Pick<PresentationView, 'theme' | 'churchName' | 'logoUrl'> & Partial<Pick<PresentationView, 'announcements' | 'event'>>; slide: Slide | undefined; mode?: string; message?: string; className?: string; countdownTo?: string | null; captions?: CaptionsView; still?: boolean }) {
  const cap = mode === 'blank' ? null : captionText(captions);
  const t = view.theme;
  const bg = mode === 'blank' ? '' : (slide?.bg || t.imageUrl || '');
  const style = { '--pres-bg': t.background, '--pres-fg': t.textColor, '--pres-scale': t.fontScale } as CSSProperties;
  const fade = t.transition !== 'cut';
  return (
    <div className={`pres-frame ${mode === 'blank' ? 'blank' : ''} ${t.uppercase ? 'upper' : ''} ${bg ? 'has-bg' : ''} ${className}`} style={style}>
      {bg && <Backdrop url={bg} still={still} />}
      <div key={mode === 'live' ? slide?.id ?? 'none' : mode} className={`pres-content ${fade ? 'fade' : ''}`}>
      {mode === 'blank' || mode === 'clear' ? null : mode === 'countdown' ? (
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
      </div>
      {message && mode !== 'blank' && <div className="pres-message">{message}</div>}
      {cap && <div className="pres-captions" key={cap.main}><div className="tr">{cap.main}</div>{cap.sub && <div className="og">{cap.sub}</div>}</div>}
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
  const [bgItem, setBgItem] = useState<{ id: string; title: string; url: string } | null>(null);
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
      else if (e.key === 'c' || e.key === 'C') void act(data?.state.mode === 'clear' ? 'live' : 'clear');
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
  const addedIds = new Set((state.added ?? []).map((a) => a.id));
  const bgs = state.backgrounds ?? {};
  const open = (path: string) => window.open(screenUrl(eventId, path, data.screenKey), `fw-${path}-${eventId}`, 'popup=yes,width=1280,height=720');

  return (
    <div className="pres-console">
      <header className="pres-bar">
        <Link className="btn ghost sm" to="/admin/services"><ArrowLeft size={15} /> <span className="hide-sm">Services</span></Link>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="ellipsis" style={{ fontWeight: 700 }}>{data.event.title}</div>
          <div className="small muted">{state.mode === 'live' ? `Slide ${state.index + 1} of ${slides.length}` : state.mode === 'blank' ? 'Screens blank' : state.mode === 'clear' ? 'Words cleared' : state.mode === 'countdown' ? 'Countdown showing' : 'Showing logo'}</div>
        </div>
        <button className="btn sm" onClick={() => open('screen')}><Tv size={15} /> <span className="hide-sm">Projector</span></button>
        <button className="btn sm" onClick={() => open('stage')}><Monitor size={15} /> <span className="hide-sm">Stage display</span></button>
        {control && <Link className="btn sm hide-sm" to={`/present/${eventId}/studio`}><Video size={15} /> Studio</Link>}
        <button className="btn sm ghost icon" onClick={() => setLinksOpen(true)} aria-label="Screen links and OBS" title="Screen links and OBS"><Link2 size={16} /></button>
        {can('services') && <button className="btn sm ghost icon" onClick={() => setThemeOpen(true)} aria-label="Slide style" title="Slide style"><Palette size={16} /></button>}
      </header>

      <div className="pres-main">
        <aside className="pres-items">
          {items.map(([i, title]) => {
            const id = data.charts[i]?.id ?? '';
            const added = addedIds.has(id);
            return (
              <div key={i} className={`pres-item-row ${slide?.itemIndex === i ? 'on' : ''}`}>
                <button className="pres-item" disabled={!control} onClick={() => void act('item', { index: i })}>{added && <span className="pres-added">Live</span>}{title}</button>
                {control && <button className={`pres-item-tool ${bgs[id] ? 'set' : ''}`} title="Background for this item" aria-label={`Background for ${title}`} onClick={() => setBgItem({ id, title, url: bgs[id] ?? '' })}><Wallpaper size={13} /></button>}
                {control && added && <button className="pres-item-tool" title="Remove" aria-label={`Remove ${title}`} onClick={() => void act('removeAdded', { id })}><X size={13} /></button>}
              </div>
            );
          })}
        </aside>

        <section className="pres-grid">
          {slides.map((s, i) => (
            <button key={s.id} ref={i === state.index ? current : undefined} className={`pres-thumb ${i === state.index ? 'on' : ''} ${i === state.index && state.mode !== 'live' ? 'muted-out' : ''}`} disabled={!control} onClick={() => void act('goto', { index: i })}>
              <SlideFrame view={data} slide={s} still />
              <span className="cap">{i + 1}. {s.itemTitle} · {s.label}</span>
            </button>
          ))}
          {slides.length === 0 && <p className="muted">This service has no plan yet. Add songs and items in Service planning.</p>}
        </section>

        <aside className="pres-side">
          <div className="small muted lbl-now">On screen</div>
          <SlideFrame view={data} slide={slide} mode={state.mode} message={state.message} countdownTo={state.countdownTo} captions={data.captions} />
          <div className="small muted lbl-next">Next</div>
          <SlideFrame view={data} slide={next} className="dim pres-next-frame" still />
          {control && (
            <form className="row" style={{ gap: 6 }} onSubmit={(e) => { e.preventDefault(); void act('message', { message }); }}>
              <input className="input grow" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Message on screen, e.g. Parent of Aarav to kids room" maxLength={200} />
              <button className="btn sm" type="submit" title="Show message"><MessageSquare size={14} /></button>
              {state.message && <button className="btn sm ghost icon" type="button" aria-label="Clear message" onClick={() => { setMessage(''); void act('message', { message: '' }); }}><X size={14} /></button>}
            </form>
          )}
          <p className="small muted">Keys: → or space next, ← back, C clear words, B blank, L logo.</p>
          {control && <AddLivePanel act={act} />}
          {control && <StagePanel view={data} act={act} />}
          {control && <PhonesPanel view={data} act={act} />}
          {control && <CaptionsPanel view={data} act={act} eventId={eventId} onChanged={() => void reload()} />}
          {control && <MediaPanel view={data} act={act} />}
          {control && <ObsPanel view={data} act={act} />}
        </aside>
      </div>

      {control && (
        <footer className="pres-remote">
          <button className="btn big" onClick={() => void act('prev')} aria-label="Previous slide"><ChevronLeft size={26} /></button>
          <button className={`btn ${state.mode === 'blank' ? 'on' : ''}`} onClick={() => void act(state.mode === 'blank' ? 'live' : 'blank')}>{state.mode === 'blank' ? <Eye size={16} /> : <EyeOff size={16} />} {state.mode === 'blank' ? 'Show' : 'Blank'}</button>
          <button className={`btn ${state.mode === 'clear' ? 'on' : ''}`} onClick={() => void act(state.mode === 'clear' ? 'live' : 'clear')} title="Clear the words, keep the background (C)"><Eraser size={16} /> {state.mode === 'clear' ? 'Words' : 'Clear'}</button>
          <button className={`btn ${state.mode === 'logo' ? 'on' : ''}`} onClick={() => void act(state.mode === 'logo' ? 'live' : 'logo')}><Image size={16} /> Logo</button>
          <button className={`btn hide-sm ${state.mode === 'countdown' ? 'on' : ''}`} onClick={() => void act(state.mode === 'countdown' ? 'live' : 'countdown')}><Clock size={16} /> Countdown</button>
          <button className="btn big primary" onClick={() => void act('next')} aria-label="Next slide"><ChevronRight size={26} /></button>
        </footer>
      )}
      {linksOpen && <LinksModal eventId={eventId} screenKey={data.screenKey ?? ''} canReset={can('services', 'settings')} onClose={() => setLinksOpen(false)} onReset={() => void reload()} />}
      {bgItem && <BackgroundModal item={bgItem} onClose={() => setBgItem(null)} onSave={async (url) => { await act('background', { itemId: bgItem.id, url }); setBgItem(null); }} />}
      {themeOpen && <ThemeModal theme={data.theme} onClose={() => setThemeOpen(false)} onSaved={() => { setThemeOpen(false); void reload(); toast('Slide style saved'); }} />}
    </div>
  );
}

// ---------------------------------------------------------------- live additions, stage tools, backgrounds

type Act = (a: Action, extra?: ActExtra) => Promise<void>;

/** Put something up that is not in the plan: a Bible passage, a song from the library, or a few lines. */
function AddLivePanel({ act }: { act: Act }) {
  const [tab, setTab] = useState<'bible' | 'song' | 'text'>('bible');
  const [ref, setRef] = useState('');
  const [tr, setTrState] = useState(() => { try { return localStorage.getItem('fw.present.tr') || 'eng-kjv2006'; } catch { return 'eng-kjv2006'; } });
  const setTr = (v: string) => { setTrState(v); try { localStorage.setItem('fw.present.tr', v); } catch { /* private window */ } };
  const [passage, setPassage] = useState<BiblePassage | null>(null);
  const [q, setQ] = useState('');
  const [songs, setSongs] = useState<SongView[] | null>(null);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (f: () => Promise<unknown>) => { setBusy(true); setErr(null); try { await f(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } };
  const find = () => run(async () => setPassage(await AdminApi.bible(ref, tr)));
  useEffect(() => {
    if (tab !== 'song') return;
    const t = setTimeout(() => { void AdminApi.services.songs(q || undefined).then(setSongs).catch(() => setSongs([])); }, 250);
    return () => clearTimeout(t);
  }, [q, tab]);
  const passageText = (p: BiblePassage) => p.verses.map((v) => `${v.verse} ${v.text}`).join('\n\n');
  const addPassage = (live: boolean) => passage && run(async () => { await act('add', { added: { kind: 'reading', title: `${passage.reference} (${passage.translation})`, text: passageText(passage) }, live }); setPassage(null); setRef(''); });
  const addText = (live: boolean) => run(async () => { await act('add', { added: { kind: 'announcement', title: title.trim() || 'Text', text }, live }); setTitle(''); setText(''); });
  return (
    <div className="pres-panel stack" style={{ gap: 8 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}><b className="small">Add during the service</b></div>
      <div className="pres-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'bible'} className={tab === 'bible' ? 'on' : ''} onClick={() => setTab('bible')}><BookOpen size={13} /> Bible</button>
        <button role="tab" aria-selected={tab === 'song'} className={tab === 'song' ? 'on' : ''} onClick={() => setTab('song')}><Music2 size={13} /> Song</button>
        <button role="tab" aria-selected={tab === 'text'} className={tab === 'text' ? 'on' : ''} onClick={() => setTab('text')}><Type size={13} /> Text</button>
      </div>
      {tab === 'bible' && (
        <>
          <form className="row" style={{ gap: 6 }} onSubmit={(e) => { e.preventDefault(); void find(); }}>
            <input className="input grow" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="John 3:16-18 or Ps 23" aria-label="Bible reference" />
            <select className="input" style={{ width: 'auto', maxWidth: 170 }} value={tr} onChange={(e) => setTr(e.target.value)} aria-label="Translation">{FEATURED_BIBLES.map((b) => <option key={b.id} value={b.id}>{b.language} · {b.name.replace('Indian Revised Version (IRV)', 'IRV')}</option>)}</select>
            <button className="btn sm" disabled={busy || !ref.trim()}>Find</button>
          </form>
          {passage && (
            <div className="stack" style={{ gap: 6 }}>
              <div className="pres-passage"><b>{passage.reference}</b> <span className="muted">· {passage.translation}</span>{passage.verses.slice(0, 3).map((v) => <div key={v.verse}><sup>{v.verse}</sup> {v.text}</div>)}{passage.verses.length > 3 && <div className="muted">and {passage.verses.length - 3} more verses</div>}</div>
              <div className="row" style={{ gap: 6 }}><button className="btn sm primary" disabled={busy} onClick={() => void addPassage(true)}>Show now</button><button className="btn sm" disabled={busy} onClick={() => void addPassage(false)}><Plus size={13} /> Add to end</button></div>
            </div>
          )}
          <p className="small muted" style={{ margin: 0 }}>Type the book in English or in the Bible's language, like యోహాను 3:16.</p>
        </>
      )}
      {tab === 'song' && (
        <>
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your songs" aria-label="Search songs" />
          <div className="pres-songs">
            {songs?.slice(0, 8).map((sg) => (
              <div key={sg.id} className="row" style={{ gap: 6, justifyContent: 'space-between' }}>
                <span className="ellipsis small" style={{ minWidth: 0 }}>{sg.title}</span>
                <span className="row" style={{ gap: 4, flex: 'none' }}>
                  <button className="btn sm primary" disabled={busy} onClick={() => void run(() => act('add', { added: { kind: 'song', songId: sg.id }, live: true }))}>Show</button>
                  <button className="btn sm ghost icon" disabled={busy} title="Add to end" aria-label={`Add ${sg.title} to the end`} onClick={() => void run(() => act('add', { added: { kind: 'song', songId: sg.id } }))}><Plus size={13} /></button>
                </span>
              </div>
            ))}
            {songs && !songs.length && <p className="small muted" style={{ margin: 0 }}>No songs found.</p>}
          </div>
        </>
      )}
      {tab === 'text' && (
        <>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (only you see it)" maxLength={120} aria-label="Title" />
          <textarea className="input" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Words to show. A blank line starts a new slide.'} aria-label="Words to show" />
          <div className="row" style={{ gap: 6 }}><button className="btn sm primary" disabled={busy || !text.trim()} onClick={() => void addText(true)}>Show now</button><button className="btn sm" disabled={busy || !text.trim()} onClick={() => void addText(false)}><Plus size={13} /> Add to end</button></div>
        </>
      )}
      {err && <p className="small" style={{ color: 'var(--danger, #c0392b)', margin: 0 }}>{err}</p>}
    </div>
  );
}

/** Scripture on the screen also shows on members' phones, in their own Bible. */
function PhonesPanel({ view, act }: { view: PresentationView; act: Act }) {
  const on = view.state.phones !== false;
  return (
    <div className="pres-panel stack" style={{ gap: 6 }}>
      <label className="row small" style={{ gap: 8 }}><input type="checkbox" checked={on} onChange={(e) => void act('phones', { on: e.target.checked })} /> <Smartphone size={14} /> Bible readings on members' phones</label>
      <span className="small muted">{!on ? 'Off for this service.' : view.phoneVerse ? `Showing now: ${view.phoneVerse}` : 'When a reading is on the screen, members see it in their own Bible.'}</span>
    </div>
  );
}

/** Notes and timers only the stage display shows: for the preacher and the band, never the congregation. */
function StagePanel({ view, act }: { view: PresentationView; act: Act }) {
  const [msg, setMsg] = useState(view.state.stageMessage ?? '');
  const [mins, setMins] = useState('');
  useEffect(() => { setMsg(view.state.stageMessage ?? ''); }, [view.state.stageMessage]);
  const t = view.state.stageTimer;
  const now = useNow(1000);
  const shown = t ? (t.endsAt ? countdown(new Date(t.endsAt).getTime() - now) : countdown(-(now - new Date(t.startedAt ?? now).getTime())).replace('+', '')) : null;
  return (
    <div className="pres-panel stack" style={{ gap: 8 }}>
      <b className="small">Stage display only</b>
      <form className="row" style={{ gap: 6 }} onSubmit={(e) => { e.preventDefault(); void act('stageMessage', { message: msg }); }}>
        <input className="input grow" value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Note for the preacher, e.g. 5 minutes" maxLength={200} aria-label="Stage note" />
        <button className="btn sm" type="submit" title="Show on stage"><Send size={14} /></button>
        {view.state.stageMessage && <button className="btn sm ghost icon" type="button" aria-label="Clear stage note" onClick={() => { setMsg(''); void act('stageMessage', { message: '' }); }}><X size={14} /></button>}
      </form>
      <div className="row wrap" style={{ gap: 6 }}>
        {[5, 10, 30].map((m) => <button key={m} className="btn sm" onClick={() => void act('timer', { minutes: m })}><Timer size={13} /> {m} min</button>)}
        <form className="row" style={{ gap: 4 }} onSubmit={(e) => { e.preventDefault(); if (Number(mins) > 0) void act('timer', { minutes: Number(mins) }); setMins(''); }}>
          <input className="input" style={{ width: 64 }} inputMode="numeric" value={mins} onChange={(e) => setMins(e.target.value.replace(/\D/g, ''))} placeholder="min" aria-label="Timer minutes" />
        </form>
        <button className="btn sm" onClick={() => void act('timer', { stopwatch: true })}><Clock size={13} /> Stopwatch</button>
        {t && <button className="btn sm ghost" onClick={() => void act('timer', { clear: true })}><X size={13} /> {shown}</button>}
      </div>
    </div>
  );
}

function BackgroundModal({ item, onClose, onSave }: { item: { id: string; title: string; url: string }; onClose: () => void; onSave: (url: string) => Promise<void> }) {
  const [url, setUrl] = useState(item.url);
  const [busy, setBusy] = useState(false);
  const save = async (u: string) => { setBusy(true); try { await onSave(u.trim()); } finally { setBusy(false); } };
  return (
    <Modal title={`Background · ${item.title}`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button>{item.url && <button className="btn ghost" disabled={busy} onClick={() => void save('')}>Use the slide style</button>}<button className="btn primary" disabled={busy} onClick={() => void save(url)}>Save</button></>}>
      <div className="stack">
        <Field label="Picture or video link" hint="A JPG or PNG, or an MP4 or WebM loop that plays silently behind the words. Upload to the media library and paste the link here.">
          <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
        </Field>
        {url.trim().startsWith('https://') && <SlideFrame view={{ theme: { background: '#0f1f1c', textColor: '#fff', imageUrl: '', fontScale: 1, linesPerSlide: 4, showAlt: false, titleSlides: false, uppercase: false }, churchName: '', logoUrl: null }} slide={{ id: 'p', itemIndex: 0, itemTitle: item.title, kind: 'lyrics', label: '', lines: [item.title], alt: [], chords: [], roman: [], bg: url.trim() }} />}
      </div>
    </Modal>
  );
}

const screenUrl = (eventId: string, path: string, key?: string) =>
  `${location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}/present/${eventId}/${path}${key ? `?key=${key}` : ''}`;

const SPEECH_LANG = Object.fromEntries(LANGUAGES.map((l) => [l.code, l.locale])) as Record<LanguageCode, string>;
const LANG_NAME = Object.fromEntries(LANGUAGES.map((l) => [l.code, l.code === 'en' ? l.english : `${l.label} ${l.english}`])) as Record<LanguageCode, string>;
const CAPTION_LANGS = LANGUAGES.map((l) => l.code) as LanguageCode[];

/**
 * Live sermon captions. The media desk's browser listens to the preacher (the same browser speech
 * recognition the office dictates with; nothing is recorded), each finished phrase goes to the
 * server to be translated, and the projector shows it on its next poll. Typing a line works too.
 */
function CaptionsPanel({ view, act, eventId, onChanged }: { view: PresentationView; act: (a: Action, extra?: ActExtra) => Promise<void>; eventId: string; onChanged: () => void }) {
  const c = view.captions;
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const buffer = useRef('');
  const timer = useRef<number | null>(null);
  const post = useCallback(async (text: string) => {
    if (!text.trim()) return;
    setBusy((n) => n + 1);
    try { await AdminApi.presentation.caption(eventId, text); setErr(null); onChanged(); } catch (e) { setErr((e as Error).message); } finally { setBusy((n) => n - 1); }
  }, [eventId, onChanged]);
  const flush = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const t = buffer.current.trim();
    buffer.current = '';
    void post(t);
  }, [post]);
  // Phrases end at a full stop or after three seconds, so the screen keeps pace with the preacher.
  const d = useDictation(SPEECH_LANG[c.from], (t) => {
    buffer.current += t;
    if (buffer.current.length > 160 || /[.!?।]\s*$/.test(buffer.current)) flush();
    else if (!timer.current) timer.current = window.setTimeout(flush, 3000);
  });
  useEffect(() => { if (!c.on && d.listening) d.stop(); }, [c.on]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (captions: Partial<CaptionsView>) => void act('captions', { captions });
  const last = c.lines.slice(-4).reverse();
  return (
    <div className="card media-card cap-panel">
      <div className="row between">
        <b><Captions size={15} /> Live captions</b>
        <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={c.on} onChange={(e) => set({ on: e.target.checked })} /> On screen</label>
      </div>
      <div className="row" style={{ gap: 6 }}>
        <select className="select grow" value={c.from} disabled={d.listening} onChange={(e) => set({ from: e.target.value as LanguageCode })} aria-label="Preaching in">{CAPTION_LANGS.map((l) => <option key={l} value={l}>{LANG_NAME[l]}</option>)}</select>
        <span className="small muted">→</span>
        <select className="select grow" value={c.to} onChange={(e) => set({ to: e.target.value as LanguageCode })} aria-label="Show in">{CAPTION_LANGS.map((l) => <option key={l} value={l}>{LANG_NAME[l]}</option>)}</select>
      </div>
      <select className="select" value={c.show} onChange={(e) => set({ show: e.target.value as CaptionsView['show'] })} aria-label="Show">
        <option value="both">Translation with the original under it</option>
        <option value="translated">Translation only</option>
        <option value="original">Original only</option>
      </select>
      {c.on && (
        <>
          {canDictate() ? (
            <button type="button" className={`btn sm ${d.listening ? 'danger' : 'primary'}`} onClick={d.toggle} aria-pressed={d.listening}>{d.listening ? <><Square size={14} /> Stop listening</> : <><Mic size={14} /> Listen to the preacher</>}</button>
          ) : (
            <span className="small muted">Listening needs Chrome or Edge on this PC. You can still type lines below.</span>
          )}
          {d.listening && <div className="small muted cap-interim">{d.interim || 'Listening…'}{busy > 0 ? ' · translating' : ''}</div>}
          {d.error && <div className="small danger-text">{d.error}</div>}
          <form className="row" style={{ gap: 6 }} onSubmit={(e) => { e.preventDefault(); const t = typed; setTyped(''); void post(t); }}>
            <input className="input grow" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Or type a line and press Enter" maxLength={600} />
            <button className="btn sm" type="submit" disabled={!typed.trim() || busy > 0}><Send size={14} /></button>
          </form>
          {err && <div className="small danger-text">{err}</div>}
          {last.length > 0 && (
            <div className="cap-lines">
              {last.map((l) => <div key={l.id} className="cap-line"><div>{l.translated ?? l.text}</div>{l.translated && <div className="small muted">{l.text}</div>}</div>)}
              <div className="row between small muted"><span>{c.count} lines this service</span><button className="btn ghost sm" type="button" onClick={async () => { await AdminApi.presentation.clearCaptions(eventId); onChanged(); }}><Trash2 size={13} /> Clear</button></div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

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
        <Field label="Background picture or video" hint="Optional https link to a JPG, PNG, or an MP4 or WebM loop. The words get a dark overlay so they stay readable. Each item can have its own background in the presenter."><input className="input" value={t.imageUrl} onChange={(e) => set('imageUrl', e.target.value)} placeholder="https://" /></Field>
        <Field label="Between slides"><select className="input" value={t.transition ?? 'fade'} onChange={(e) => set('transition', e.target.value as 'fade' | 'cut')}><option value="fade">Fade</option><option value="cut">Cut (instant)</option></select></Field>
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
      <SlideFrame view={data} slide={data.slides[data.state.index]} mode={data.state.mode} message={data.state.message} countdownTo={data.state.countdownTo} className="full" captions={data.captions} />
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
  const st = state.stageTimer;
  const stLeft = st ? (st.endsAt ? new Date(st.endsAt).getTime() - now : now - new Date(st.startedAt ?? now).getTime()) : null;
  return (
    <div className="pres-stage" onDoubleClick={fullscreen}>
      <div className="stage-top">
        <span className="clock">{new Date(now).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</span>
        {timer.itemTitle && <span className="item">{timer.itemTitle}</span>}
        {itemLeft !== null && <span className={`left ${itemLeft < 0 ? 'over' : itemLeft < 60_000 ? 'soon' : ''}`}>{countdown(itemLeft)}</span>}
        <span className="grow" />
        {st && stLeft !== null && <span className={`left big-timer ${st.endsAt && stLeft < 0 ? 'over' : st.endsAt && stLeft < 60_000 ? 'soon' : ''}`} title={st.label}>{st.label} {st.endsAt ? countdown(stLeft) : countdown(-stLeft).replace('+', '')}</span>}
        {state.mode !== 'live' && <span className="mode">{state.mode === 'blank' ? 'SCREEN BLANK' : state.mode === 'clear' ? 'WORDS CLEARED' : state.mode === 'countdown' ? 'COUNTDOWN' : 'LOGO'}</span>}
        <button className={`btn sm ${chords ? 'on' : ''}`} onClick={() => setChords(!chords)}><Music2 size={14} /> Chords</button>
      </div>
      {state.stageMessage && <div className="stage-msg stage-note">{state.stageMessage}</div>}
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
      {!lyrics && (() => { const cap = captionText(data.captions); return cap ? <div key={cap.main} className="ov-lyrics ov-captions"><div>{cap.main}</div>{cap.sub && <div className="alt">{cap.sub}</div>}</div> : null; })()}
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
