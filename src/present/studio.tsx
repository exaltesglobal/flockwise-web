// Studio: a browser vision mixer for churches without OBS. Pick cameras and other sources, build
// scenes with the slides, lyrics bar and name straps, then record or go live from the same page.
import { ArrowLeft, ChevronLeft, ChevronRight, Circle, Download, Eye, EyeOff, Image as ImageIcon, Maximize, Mic, MicOff, Monitor, Pause, Pencil, Play, Plus, Radio, RotateCcw, Trash2, Video, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Link, useParams } from 'react-router';

import { AdminApi } from '@/api/endpoints';
import { ErrorState, Field, Loading, Modal, Segmented, useToast } from '@/components/ui';
import { useCan } from '@/lib/perms';

import { MediaPanel, RequireStaff, usePresentation, type Action, type ActExtra } from './present';
import { StudioEngine, type Scene, type Source, type Transition } from './studio-engine';

const WHIP_KEY = 'fw.studio.whip';
const readWhip = (): { url: string; token: string } | null => { try { return JSON.parse(localStorage.getItem(WHIP_KEY) || 'null'); } catch { return null; } };

const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  return `${h ? `${h}:` : ''}${String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, '0')}:${String(s % 60).padStart(2, '0')}`;
};
const mb = (n: number) => (n > 1e9 ? `${(n / 1e9).toFixed(2)} GB` : `${Math.max(0.1, n / 1e6).toFixed(1)} MB`);

function useTick(ms = 1000) {
  const [, set] = useState(0);
  useEffect(() => { const t = setInterval(() => set((n) => n + 1), ms); return () => clearInterval(t); }, [ms]);
}

export function StudioPage() {
  return <RequireStaff><Studio /></RequireStaff>;
}

function Studio() {
  const { eventId = '' } = useParams();
  const { data, error, reload, setData } = usePresentation(eventId, 1000);
  const can = useCan();
  const toast = useToast();
  const control = can('services') || can('checkin');
  const [engine, setEngine] = useState<StudioEngine | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState('');

  useEffect(() => { document.title = 'Studio · Flockwise'; }, []);
  useEffect(() => () => engine?.destroy(), [engine]);
  useEffect(() => { if (engine) engine.view = data ?? null; }, [engine, data]);

  const act = useCallback(async (action: Action, extra: ActExtra = {}) => {
    try { setData(await AdminApi.presentation.act(eventId, action, extra)); } catch (e) { toast((e as Error).message, 'error'); }
  }, [eventId, setData, toast]);

  const start = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setStartError('This browser cannot use cameras here. Open Flockwise in Chrome or Edge on the streaming computer.');
      return;
    }
    setStarting(true);
    setStartError('');
    const e = new StudioEngine();
    e.view = data ?? null;
    try { await e.start(); setEngine(e); } catch (err) { e.destroy(); setStartError((err as Error).message || 'The studio could not start.'); }
    setStarting(false);
  };

  if (error) return <div className="pres-console"><ErrorState error={error} onRetry={reload} /></div>;
  if (!data) return <div className="pres-console"><Loading /></div>;

  return (
    <div className="pres-console studio">
      <header className="pres-bar">
        <Link className="btn ghost sm" to={`/present/${eventId}`}><ArrowLeft size={15} /> <span className="hide-sm">Presenter</span></Link>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="ellipsis" style={{ fontWeight: 700 }}>Studio · {data.event.title}</div>
          <div className="small muted">Cameras, scenes, recording and going live, all in this browser</div>
        </div>
        {engine && <OnAir engine={engine} />}
      </header>
      {!control ? (
        <div className="studio-start card"><p>The studio is for the media team. Ask an admin for service planning or check-in access.</p></div>
      ) : !engine ? (
        <div className="studio-start card stack">
          <h2 style={{ margin: 0 }}>Run your livestream from this browser</h2>
          <p className="muted" style={{ margin: 0 }}>No OBS needed. Plug in a webcam, an HDMI capture card from your camera or video mixer, and a USB audio interface from the sound desk. Flockwise mixes them with your slides, lyrics and name straps, records the service and can send it live.</p>
          <ul className="muted small" style={{ margin: 0, paddingLeft: 18 }}>
            <li>Use Chrome or Edge on a laptop or desktop. Keep this tab open during the service.</li>
            <li>The browser will ask to use your camera and microphone. Choose Allow.</li>
            <li>Already using OBS? Keep using it: the Presenter has an OBS overlay and remote.</li>
          </ul>
          {startError && <div className="alert warn">{startError}</div>}
          <div><button className="btn primary" onClick={() => void start()} disabled={starting}><Video size={16} /> {starting ? 'Starting…' : 'Start the studio'}</button></div>
        </div>
      ) : (
        <StudioDesk engine={engine} view={data} act={act} />
      )}
    </div>
  );
}

function useEngine(engine: StudioEngine) {
  useSyncExternalStore(engine.subscribe, engine.getVersion);
  return engine;
}

function OnAir({ engine }: { engine: StudioEngine }) {
  const e = useEngine(engine);
  useTick(1000);
  return (
    <div className="row" style={{ gap: 6 }}>
      {e.live === 'live' && <span className="onair live">LIVE {clock(Date.now() - e.liveSince)}</span>}
      {e.recording && <span className="onair rec">REC {clock(Date.now() - e.recording.since)}</span>}
    </div>
  );
}

/** Puts an engine-owned canvas into the page. */
function Monitor_({ canvas, label, tone }: { canvas: HTMLCanvasElement; label: string; tone: 'preview' | 'program' }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.appendChild(canvas); }, [canvas]);
  return (
    <div className={`studio-mon ${tone}`}>
      <div className="studio-mon-label">{label}</div>
      <div ref={ref} className="studio-canvas" />
    </div>
  );
}

function StudioDesk({ engine, view, act }: { engine: StudioEngine; view: NonNullable<ReturnType<typeof usePresentation>['data']>; act: (a: Action, extra?: ActExtra) => Promise<void> }) {
  const e = useEngine(engine);
  const toast = useToast();
  const [editing, setEditing] = useState<Scene | null>(null);
  const [picker, setPicker] = useState<'video' | 'audio' | null>(null);
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const tag = (ev.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || editing || picker) return;
      const n = Number(ev.key);
      if (n >= 1 && n <= 9 && e.scenes[n - 1]) { ev.preventDefault(); e.pick(e.scenes[n - 1].id); }
      else if (ev.key === 'Enter' && e.previewFirst) { ev.preventDefault(); e.take(e.previewId, 'cut'); }
      else if ((ev.key === 't' || ev.key === 'T') && e.previewFirst) { ev.preventDefault(); e.take(e.previewId, 'fade'); }
      else if (ev.key === 'ArrowRight' || ev.key === 'PageDown') { ev.preventDefault(); void act('next'); }
      else if (ev.key === 'ArrowLeft' || ev.key === 'PageUp') { ev.preventDefault(); void act('prev'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [e, act, editing, picker]);

  useEffect(() => {
    if (!e.recording && e.live !== 'live') return;
    const warn = (ev: BeforeUnloadEvent) => { ev.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [e.recording, e.live]);

  const run = (p: Promise<unknown>) => void p.catch((err: Error) => { if (err.name !== 'NotAllowedError' && err.name !== 'AbortError') toast(err.message, 'error'); });
  const slide = view.slides[view.state.index];
  const { mode } = view.state;

  return (
    <div className="studio-main">
      <section className="stack" style={{ gap: 12, minWidth: 0 }}>
        <div className={`studio-monitors ${e.previewFirst ? '' : 'single'}`}>
          {e.previewFirst && <Monitor_ canvas={e.preview} label="Preview (next)" tone="preview" />}
          <Monitor_ canvas={e.program} label={e.live === 'live' ? 'Program · on air' : 'Program'} tone="program" />
        </div>

        <div className="studio-transport card">
          {e.previewFirst ? (
            <>
              <button className="btn primary" onClick={() => e.take(e.previewId, 'cut')} title="Enter">Cut</button>
              <button className="btn" onClick={() => e.take(e.previewId, 'fade')} title="T">Fade</button>
            </>
          ) : (
            <Segmented<Transition> value={e.transition} options={[{ value: 'cut', label: 'Cut' }, { value: 'fade', label: 'Fade' }]} onChange={(t) => e.setOptions({ transition: t })} />
          )}
          <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={e.previewFirst} onChange={(ev) => e.setOptions({ previewFirst: ev.target.checked })} /> Preview before going on air</label>
          <span className="grow" />
          <button className="btn sm ghost" onClick={() => void e.program.requestFullscreen?.().catch(() => undefined)} title="Show the program full screen, e.g. on a second monitor or an HDMI output"><Maximize size={14} /> Full screen</button>
        </div>

        <div className="studio-scenes">
          {e.scenes.map((s, i) => (
            <div key={s.id} className={`studio-scene ${s.id === e.programId ? 'program' : ''} ${e.previewFirst && s.id === e.previewId && s.id !== e.programId ? 'preview' : ''}`}>
              <button className="studio-scene-main" onClick={() => e.pick(s.id)} onDoubleClick={() => e.take(s.id)}>
                <span className="num">{i + 1}</span>
                <span className="name">{s.name}</span>
              </button>
              <button className="btn ghost icon sm" aria-label={`Edit ${s.name}`} onClick={() => setEditing({ ...s })}><Pencil size={13} /></button>
            </div>
          ))}
          <button className="btn sm ghost" onClick={() => setEditing(e.newScene())}><Plus size={14} /> Scene</button>
        </div>
        <p className="small muted" style={{ margin: 0 }}>Keys: 1 to 9 pick a scene{e.previewFirst ? ', Enter cuts, T fades' : ''}, → and ← move the slides. Double-click a scene to put it straight on air.</p>

        <div className="card studio-slides">
          <button className="btn" onClick={() => void act('prev')} aria-label="Previous slide"><ChevronLeft size={18} /></button>
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="small muted">{mode === 'live' ? `Slide ${view.state.index + 1} of ${view.slides.length}${slide ? ` · ${slide.itemTitle}` : ''}` : mode === 'blank' ? 'Slides blank' : mode === 'countdown' ? 'Countdown showing' : 'Logo showing'}</div>
            <div className="ellipsis">{slide?.lines.join(' / ') || '—'}</div>
          </div>
          <button className={`btn sm ${mode === 'blank' ? 'on' : ''}`} onClick={() => void act(mode === 'blank' ? 'live' : 'blank')}>{mode === 'blank' ? <Eye size={14} /> : <EyeOff size={14} />} {mode === 'blank' ? 'Show' : 'Blank'}</button>
          <button className="btn primary" onClick={() => void act('next')} aria-label="Next slide"><ChevronRight size={18} /></button>
        </div>
      </section>

      <aside className="studio-side">
        <div className="card media-card">
          <b>Sources</b>
          {e.sources.length === 0 && <div className="small muted">No cameras yet. Slides and the logo are always available.</div>}
          {e.sources.map((s) => <SourceRow key={s.id} engine={e} source={s} />)}
          <div className="row wrap" style={{ gap: 6 }}>
            <button className="btn sm" onClick={() => setPicker('video')}><Video size={14} /> Camera</button>
            <button className="btn sm" onClick={() => run(e.addScreen())}><Monitor size={14} /> Screen</button>
            <button className="btn sm" onClick={() => file.current?.click()}><ImageIcon size={14} /> Picture or video</button>
            <input ref={file} type="file" accept="image/*,video/*" hidden onChange={(ev) => { const f = ev.target.files?.[0]; if (f) e.addFile(f); ev.target.value = ''; }} />
          </div>
        </div>

        <div className="card media-card">
          <b>Sound</b>
          {e.audios.length === 0 && <div className="small muted">No sound yet. Add the sound desk feed or a microphone.</div>}
          {e.audios.map((a) => (
            <div key={a.id} className="studio-audio">
              <div className="row" style={{ gap: 6 }}>
                <span className="grow ellipsis small" style={{ fontWeight: 600 }}>{a.label}</span>
                <button className={`btn ghost icon sm ${a.muted ? 'danger' : ''}`} aria-label={a.muted ? 'Unmute' : 'Mute'} onClick={() => e.setAudio(a.id, { muted: !a.muted })}>{a.muted ? <MicOff size={14} /> : <Mic size={14} />}</button>
                {a.kind === 'mic' && <button className="btn ghost icon sm" aria-label="Remove" onClick={() => e.removeAudio(a.id)}><X size={13} /></button>}
              </div>
              <Meter engine={e} id={a.id} muted={a.muted} />
              <input type="range" min={0} max={1.5} step={0.01} value={a.volume} onChange={(ev) => e.setAudio(a.id, { volume: Number(ev.target.value) })} aria-label={`${a.label} volume`} />
            </div>
          ))}
          <div><button className="btn sm" onClick={() => setPicker('audio')}><Mic size={14} /> Microphone or sound desk</button></div>
        </div>

        <OutputCard engine={e} />
        <MediaPanel view={view} act={act} lyricsToggle={false} />
      </aside>

      {editing && <SceneModal engine={e} scene={editing} onClose={() => setEditing(null)} />}
      {picker && <DeviceModal engine={e} kind={picker} onClose={() => setPicker(null)} />}
    </div>
  );
}

function SourceRow({ engine, source: s }: { engine: StudioEngine; source: Source }) {
  const video = s.el instanceof HTMLVideoElement && s.kind === 'video' ? s.el : null;
  const icon = s.kind === 'camera' ? <Video size={14} /> : s.kind === 'screen' ? <Monitor size={14} /> : s.kind === 'video' ? <Play size={14} /> : <ImageIcon size={14} />;
  return (
    <div className="lt-row">
      {icon}
      <span className="grow ellipsis small" style={{ fontWeight: 600 }}>{s.label}</span>
      {video && <button className="btn ghost icon sm" aria-label={video.paused ? 'Play' : 'Pause'} onClick={() => engine.toggleVideo(s.id)}>{video.paused ? <Play size={13} /> : <Pause size={13} />}</button>}
      {video && <button className="btn ghost icon sm" aria-label="Start again" onClick={() => engine.restartVideo(s.id)}><RotateCcw size={13} /></button>}
      <button className="btn ghost icon sm" aria-label={`Remove ${s.label}`} onClick={() => engine.removeSource(s.id)}><Trash2 size={13} /></button>
    </div>
  );
}

/** Level meter, drawn every frame without re-rendering React. */
function Meter({ engine, id, muted }: { engine: StudioEngine; id: string; muted: boolean }) {
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    let shown = 0;
    const loop = () => {
      const v = engine.level(id);
      shown = Math.max(v, shown * 0.9);
      if (bar.current) {
        bar.current.style.width = `${Math.round(shown * 100)}%`;
        bar.current.style.background = shown > 0.95 ? 'var(--danger)' : shown > 0.7 ? 'var(--fw-saffron)' : 'var(--primary)';
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [engine, id]);
  return <div className={`studio-meter ${muted ? 'muted' : ''}`}><div ref={bar} /></div>;
}

function OutputCard({ engine: e }: { engine: StudioEngine }) {
  const saved = readWhip();
  const [url, setUrl] = useState(saved?.url ?? '');
  const [token, setToken] = useState(saved?.token ?? '');
  const [remember, setRemember] = useState(!!saved);
  const [setup, setSetup] = useState(false);
  const toast = useToast();
  const goLive = () => {
    // http is only allowed for a media server on this computer (browsers block other plain-http calls).
    if (!/^(https:\/\/|http:\/\/(localhost|127\.0\.0\.1)[:/])/.test(url.trim())) { toast('Paste the WHIP link from your streaming service. It starts with https://', 'error'); return; }
    try { if (remember) localStorage.setItem(WHIP_KEY, JSON.stringify({ url: url.trim(), token: token.trim() })); else localStorage.removeItem(WHIP_KEY); } catch { /* storage blocked */ }
    void e.goLive(url.trim(), token.trim());
  };
  return (
    <div className="card media-card">
      <b>Record and go live</b>
      <div className="row" style={{ gap: 6 }}>
        <button className={`btn sm grow ${e.recording ? 'danger' : ''}`} onClick={() => (e.recording ? e.stopRecording() : void e.startRecording().catch((err: Error) => toast(err.message, 'error')))}><Circle size={14} /> {e.recording ? 'Stop recording' : 'Record'}</button>
        <button className={`btn sm grow ${e.live === 'live' || e.live === 'connecting' ? 'danger' : ''}`} onClick={() => (e.live === 'live' || e.live === 'connecting' ? e.stopLive() : url ? goLive() : setSetup(true))}><Radio size={14} /> {e.live === 'live' ? 'End stream' : e.live === 'connecting' ? 'Connecting… (stop)' : 'Go live'}</button>
      </div>
      {e.recording && <div className="small muted">{e.recording.disk ? 'Saving to the file you chose as it records.' : 'Recording in this tab. Download it when you stop.'}</div>}
      {e.live === 'error' && <div className="small" style={{ color: 'var(--danger)' }}>{e.liveError}</div>}
      {e.recordings.map((r) => (
        <div key={r.name} className="lt-row">
          <span className="grow ellipsis small">{r.name} · {mb(r.size)}</span>
          {r.url ? <a className="btn sm" href={r.url} download={r.name}><Download size={13} /> Save</a> : <span className="small muted">Saved</span>}
        </div>
      ))}
      <button className="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setSetup((v) => !v)}>{setup ? 'Hide stream settings' : 'Stream settings'}</button>
      {setup && (
        <div className="stack" style={{ gap: 6 }}>
          <p className="small muted" style={{ margin: 0 }}>Browsers send live video over WebRTC (WHIP), not the RTMP key YouTube shows. Create a live input in a WHIP service such as Cloudflare Stream, paste its WHIP link here, and add YouTube or Facebook as an output there to restream.</p>
          <input className="input mono small" value={url} onChange={(ev) => setUrl(ev.target.value)} placeholder="https://…/whip" aria-label="WHIP link" disabled={e.live !== 'off' && e.live !== 'error'} />
          <input className="input" type="password" value={token} onChange={(ev) => setToken(ev.target.value)} placeholder="Token (if your service gives one)" aria-label="WHIP token" autoComplete="off" disabled={e.live !== 'off' && e.live !== 'error'} />
          <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={remember} onChange={(ev) => setRemember(ev.target.checked)} /> Remember on this computer</label>
        </div>
      )}
    </div>
  );
}

const SPECIAL = [{ id: 'slides', label: 'Slides (follows the presenter)' }, { id: 'logo', label: 'Church logo' }];

function SceneModal({ engine: e, scene, onClose }: { engine: StudioEngine; scene: Scene; onClose: () => void }) {
  const [s, setS] = useState(scene);
  const set = <K extends keyof Scene>(k: K, v: Scene[K]) => setS((x) => ({ ...x, [k]: v }));
  const options = [...SPECIAL, ...e.sources.map((x) => ({ id: x.id, label: x.label }))];
  // A scene can point at a camera that is not plugged in today; keep it selectable.
  const withMissing = (id: string | null) => (id && !options.some((o) => o.id === id) ? [...options, { id, label: 'Missing source' }] : options);
  const exists = e.scenes.some((x) => x.id === s.id);
  return (
    <Modal title={exists ? 'Edit scene' : 'New scene'} onClose={onClose} footer={
      <>
        {exists && e.scenes.length > 1 && <button className="btn danger ghost" onClick={() => { e.deleteScene(s.id); onClose(); }}><Trash2 size={14} /> Delete</button>}
        <span className="grow" />
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={() => { e.saveScene({ ...s, name: s.name.trim() || 'Scene' }); onClose(); }}>Save scene</button>
      </>
    }>
      <div className="stack">
        <Field label="Name"><input className="input" value={s.name} onChange={(ev) => set('name', ev.target.value)} maxLength={40} /></Field>
        <Field label="Main picture">
          <select className="input" value={s.main} onChange={(ev) => set('main', ev.target.value)}>
            {withMissing(s.main).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </Field>
        <Field label="Picture in picture" hint="A small box in a corner, e.g. the slides beside the preacher.">
          <div className="row" style={{ gap: 6 }}>
            <select className="input grow" value={s.pip ?? ''} onChange={(ev) => set('pip', ev.target.value || null)}>
              <option value="">None</option>
              {withMissing(s.pip).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
            {s.pip && (
              <select className="input" value={s.pipPos} onChange={(ev) => set('pipPos', ev.target.value as Scene['pipPos'])} aria-label="Corner">
                <option value="br">Bottom right</option><option value="bl">Bottom left</option><option value="tr">Top right</option><option value="tl">Top left</option>
              </select>
            )}
          </div>
        </Field>
        <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={s.lyrics} onChange={(ev) => set('lyrics', ev.target.checked)} /> Lyrics bar at the bottom (follows the presenter)</label>
        <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={s.lowerThird} onChange={(ev) => set('lowerThird', ev.target.checked)} /> Show name straps</label>
      </div>
    </Modal>
  );
}

function DeviceModal({ engine: e, kind, onClose }: { engine: StudioEngine; kind: 'video' | 'audio'; onClose: () => void }) {
  const [list, setList] = useState<MediaDeviceInfo[] | null>(null);
  const [busy, setBusy] = useState('');
  const toast = useToast();
  useEffect(() => { void e.devices().then((d) => setList(kind === 'video' ? d.video : d.audio)); }, [e, kind]);
  const used = new Set(kind === 'video' ? e.sources.map((s) => s.deviceId) : e.audios.map((a) => a.deviceId));
  const add = async (d: MediaDeviceInfo, i: number) => {
    setBusy(d.deviceId);
    try {
      const label = d.label || (kind === 'video' ? `Camera ${i + 1}` : `Microphone ${i + 1}`);
      if (kind === 'video') await e.addCamera(d.deviceId, label); else await e.addMic(d.deviceId, label);
      onClose();
    } catch (err) {
      toast((err as Error).name === 'NotReadableError' ? 'That device is busy in another app. Close the other app and try again.' : (err as Error).message, 'error');
    }
    setBusy('');
  };
  return (
    <Modal title={kind === 'video' ? 'Add a camera' : 'Add a microphone or sound desk'} onClose={onClose}>
      {!list ? <Loading /> : list.length === 0 ? (
        <p className="muted">No {kind === 'video' ? 'cameras' : 'microphones'} found. Plug one in, then open this again.</p>
      ) : (
        <div className="stack" style={{ gap: 6 }}>
          {list.map((d, i) => (
            <div key={d.deviceId || i} className="lt-row">
              {kind === 'video' ? <Video size={14} /> : <Mic size={14} />}
              <span className="grow ellipsis">{d.label || (kind === 'video' ? `Camera ${i + 1}` : `Microphone ${i + 1}`)}</span>
              {used.has(d.deviceId) ? <span className="small muted">Added</span> : <button className="btn sm" disabled={!!busy} onClick={() => void add(d, i)}>{busy === d.deviceId ? 'Opening…' : 'Add'}</button>}
            </div>
          ))}
          {kind === 'audio' && <p className="small muted" style={{ margin: 0 }}>For the cleanest sound, take a feed from the sound desk into a USB audio interface and pick it here.</p>}
        </div>
      )}
    </Modal>
  );
}
