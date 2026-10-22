// The built-in studio: a small vision mixer that runs in the browser for churches without OBS.
// Cameras, screen share, pictures and videos are drawn into a 1280x720 canvas together with the
// slides, lyrics bar and name straps from the presentation. The canvas and the audio mixer make
// one stream that is recorded to disk or sent live over WHIP (WebRTC ingest).
import type { PresentationView, Slide } from '@/api/admin-types';

export const W = 1280;
export const H = 720;
const PW = 640;
const PH = 360;
const FONT = "'Inter', system-ui, sans-serif";
const SAFFRON = '#f2a93b';

export type SourceKind = 'camera' | 'screen' | 'image' | 'video';
export type Source = { id: string; kind: SourceKind; label: string; deviceId?: string; el: HTMLVideoElement | HTMLImageElement; stream?: MediaStream; url?: string };
export type AudioIn = { id: string; kind: 'mic' | 'screen' | 'video'; label: string; deviceId?: string; volume: number; muted: boolean; gain: GainNode; analyser: AnalyserNode; stream?: MediaStream };
/** "slides" follows the presenter (lyrics, countdown, logo, blank); "logo" always shows the logo. */
export type Scene = { id: string; name: string; main: string; pip: string | null; pipPos: 'br' | 'bl' | 'tr' | 'tl'; lyrics: boolean; lowerThird: boolean };
export type Transition = 'cut' | 'fade';
export type Recording = { name: string; url: string | null; size: number; savedToDisk: boolean };
export type LiveState = 'off' | 'connecting' | 'live' | 'error';

type Saved = {
  scenes: Scene[];
  cameras: { id: string; deviceId: string; label: string }[];
  mics: { id: string; deviceId: string; label: string; volume: number; muted: boolean }[];
  program?: string;
  previewFirst?: boolean;
  transition?: Transition;
};
const STORE = 'fw.studio.v1';
const load = (): Saved | null => { try { return JSON.parse(localStorage.getItem(STORE) || 'null') as Saved | null; } catch { return null; } };

const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 9)}`;

/** Ticks from a worker, so the picture keeps moving when the studio tab is in the background. */
function makeTicker(fps: number, onTick: () => void) {
  try {
    const src = 'let t;onmessage=e=>{clearInterval(t);if(e.data)t=setInterval(()=>postMessage(0),e.data)}';
    const w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    w.onmessage = onTick;
    w.postMessage(Math.round(1000 / fps));
    return () => { w.postMessage(0); w.terminate(); };
  } catch {
    const t = setInterval(onTick, Math.round(1000 / fps));
    return () => clearInterval(t);
  }
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let line = '';
  for (const w of words) {
    const tryLine = line ? `${line} ${w}` : w;
    if (line && ctx.measureText(tryLine).width > maxW) { out.push(line); line = w; } else line = tryLine;
  }
  if (line) out.push(line);
  return out.length ? out : [''];
}

function cover(ctx: CanvasRenderingContext2D, el: CanvasImageSource, sw: number, sh: number, x: number, y: number, w: number, h: number) {
  if (!sw || !sh) return false;
  const s = Math.max(w / sw, h / sh);
  const cw = w / s, ch = h / s;
  ctx.drawImage(el, (sw - cw) / 2, (sh - ch) / 2, cw, ch, x, y, w, h);
  return true;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

export function countdownText(ms: number) {
  const s = Math.floor(Math.max(0, ms) / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  return `${d ? `${d}d ` : ''}${d || h ? `${h}:` : ''}${String(Math.floor((s % 3600) / 60)).padStart(d || h ? 2 : 1, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export class StudioEngine {
  program = document.createElement('canvas');
  preview = document.createElement('canvas');
  private pctx: CanvasRenderingContext2D;
  private vctx: CanvasRenderingContext2D;
  private fadeCanvas = document.createElement('canvas');
  private holder = document.createElement('div');
  private audio = new AudioContext();
  private dest = this.audio.createMediaStreamDestination();
  private out: MediaStream | null = null;
  private stopTicker: () => void = () => undefined;
  private listeners = new Set<() => void>();
  private images = new Map<string, HTMLImageElement | null>();
  private lt = { key: '', at: 0 };
  private fade: { from: string; start: number; ms: number } | null = null;
  private recorder: MediaRecorder | null = null;
  private pc: RTCPeerConnection | null = null;
  private whipResource: string | null = null;
  private whipToken = '';
  /** Saving waits until the saved set-up is loaded, and stops while the studio closes. */
  private ready = false;

  view: PresentationView | null = null;
  sources: Source[] = [];
  audios: AudioIn[] = [];
  scenes: Scene[] = [];
  programId = '';
  previewId = '';
  previewFirst = true;
  transition: Transition = 'fade';
  recording: { since: number; disk: boolean } | null = null;
  recordings: Recording[] = [];
  live: LiveState = 'off';
  liveSince = 0;
  liveError = '';
  /** Bumped on every change, so React can tell a new snapshot from the last one. */
  version = 0;

  constructor() {
    this.program.width = W; this.program.height = H;
    this.preview.width = PW; this.preview.height = PH;
    this.fadeCanvas.width = W; this.fadeCanvas.height = H;
    this.pctx = this.program.getContext('2d')!;
    this.vctx = this.preview.getContext('2d')!;
    // Video elements must be in the page and playing for their frames to reach the canvas.
    Object.assign(this.holder.style, { position: 'fixed', left: '0', bottom: '0', width: '2px', height: '2px', opacity: '0.01', overflow: 'hidden', pointerEvents: 'none' });
    document.body.appendChild(this.holder);
  }

  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  getVersion = () => this.version;
  private emit(save = true) {
    this.version++;
    if (save) this.save();
    for (const fn of this.listeners) fn();
  }

  private save() {
    if (!this.ready) return;
    const data: Saved = {
      scenes: this.scenes,
      cameras: this.sources.filter((s) => s.kind === 'camera' && s.deviceId).map((s) => ({ id: s.id, deviceId: s.deviceId!, label: s.label })),
      mics: this.audios.filter((a) => a.kind === 'mic' && a.deviceId).map((a) => ({ id: a.id, deviceId: a.deviceId!, label: a.label, volume: a.volume, muted: a.muted })),
      program: this.programId,
      previewFirst: this.previewFirst,
      transition: this.transition,
    };
    try { localStorage.setItem(STORE, JSON.stringify(data)); } catch { /* storage blocked */ }
  }

  /** Asks for the camera and microphone, then opens the saved set-up (or a first one). */
  async start() {
    await this.audio.resume().catch(() => undefined);
    let probe: MediaStream | null = null;
    for (const c of [{ video: true, audio: true }, { video: true }, { audio: true }]) {
      try { probe = await navigator.mediaDevices.getUserMedia(c); break; } catch { /* try the next */ }
    }
    probe?.getTracks().forEach((t) => t.stop());
    const devices = await this.devices();
    const saved = load();
    if (saved?.scenes?.length) {
      this.scenes = saved.scenes;
      this.previewFirst = saved.previewFirst ?? true;
      this.transition = saved.transition ?? 'fade';
      // Device ids can change (a new browser profile, cleared site data), so fall back to the
      // device's name and then to any unused device, keeping the saved id so scenes still match.
      const match = (list: MediaDeviceInfo[], used: Set<string>, id: string, label: string) =>
        list.find((d) => d.deviceId === id) ?? list.find((d) => !used.has(d.deviceId) && d.label === label) ?? list.find((d) => !used.has(d.deviceId) && d.deviceId !== 'default');
      const usedV = new Set<string>();
      for (const c of saved.cameras ?? []) {
        const d = match(devices.video, usedV, c.deviceId, c.label);
        if (d) { usedV.add(d.deviceId); await this.addCamera(d.deviceId, d.label || c.label, c.id).catch(() => undefined); }
      }
      const usedA = new Set<string>();
      for (const m of saved.mics ?? []) {
        const d = match(devices.audio, usedA, m.deviceId, m.label);
        if (d) { usedA.add(d.deviceId); await this.addMic(d.deviceId, d.label || m.label, m.id, m.volume, m.muted).catch(() => undefined); }
      }
      this.programId = this.scenes.some((s) => s.id === saved.program) ? saved.program! : this.scenes[0].id;
    } else {
      const cam = devices.video[0] ? await this.addCamera(devices.video[0].deviceId, devices.video[0].label || 'Camera 1').catch(() => null) : null;
      if (devices.audio[0]) await this.addMic(devices.audio[0].deviceId, devices.audio[0].label || 'Microphone').catch(() => undefined);
      const main = cam?.id ?? 'slides';
      this.scenes = [
        { id: uid('sc'), name: 'Camera + lyrics', main, pip: null, pipPos: 'br', lyrics: true, lowerThird: true },
        { id: uid('sc'), name: 'Slides', main: 'slides', pip: null, pipPos: 'br', lyrics: false, lowerThird: true },
        { id: uid('sc'), name: 'Camera + slides', main, pip: 'slides', pipPos: 'br', lyrics: false, lowerThird: true },
        { id: uid('sc'), name: 'Welcome', main: 'logo', pip: null, pipPos: 'br', lyrics: false, lowerThird: false },
      ];
      this.programId = this.scenes[3].id;
    }
    this.previewId = this.scenes.find((s) => s.id !== this.programId)?.id ?? this.programId;
    this.stopTicker = makeTicker(30, () => this.tick());
    this.ready = true;
    this.emit();
  }

  async devices() {
    const all = await navigator.mediaDevices.enumerateDevices().catch(() => [] as MediaDeviceInfo[]);
    return { video: all.filter((d) => d.kind === 'videoinput'), audio: all.filter((d) => d.kind === 'audioinput') };
  }

  private playVideo(stream: MediaStream | null, src?: string) {
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    if (stream) v.srcObject = stream; else if (src) { v.src = src; v.loop = true; }
    this.holder.appendChild(v);
    void v.play().catch(() => undefined);
    return v;
  }

  async addCamera(deviceId: string, label: string, id = uid('cam')) {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } } });
    const src: Source = { id, kind: 'camera', label, deviceId, el: this.playVideo(stream), stream };
    this.sources.push(src);
    this.emit();
    return src;
  }

  async addScreen() {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true });
    const id = uid('scr');
    this.sources.push({ id, kind: 'screen', label: 'Screen share', el: this.playVideo(stream), stream });
    if (stream.getAudioTracks().length) this.connectAudio({ id, kind: 'screen', label: 'Screen sound', stream, node: this.audio.createMediaStreamSource(stream) });
    stream.getVideoTracks()[0]?.addEventListener('ended', () => this.removeSource(id));
    this.emit();
    return id;
  }

  addFile(file: File) {
    const url = URL.createObjectURL(file);
    const id = uid(file.type.startsWith('video') ? 'vid' : 'img');
    if (file.type.startsWith('video')) {
      const el = this.playVideo(null, url);
      el.muted = false;
      this.sources.push({ id, kind: 'video', label: file.name, el, url });
      this.connectAudio({ id, kind: 'video', label: file.name, node: this.audio.createMediaElementSource(el) });
    } else {
      const el = new Image();
      el.src = url;
      this.sources.push({ id, kind: 'image', label: file.name, el, url });
    }
    this.emit();
    return id;
  }

  async addMic(deviceId: string, label: string, id = uid('mic'), volume = 1, muted = false) {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: deviceId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    this.connectAudio({ id, kind: 'mic', label, deviceId, stream, node: this.audio.createMediaStreamSource(stream), volume, muted });
  }

  private connectAudio(a: { id: string; kind: AudioIn['kind']; label: string; deviceId?: string; stream?: MediaStream; node: AudioNode; volume?: number; muted?: boolean }) {
    const gain = this.audio.createGain();
    const analyser = this.audio.createAnalyser();
    analyser.fftSize = 1024;
    a.node.connect(gain);
    gain.connect(analyser);
    gain.connect(this.dest);
    const input: AudioIn = { id: a.id, kind: a.kind, label: a.label, deviceId: a.deviceId, stream: a.stream, volume: a.volume ?? 1, muted: a.muted ?? false, gain, analyser };
    gain.gain.value = input.muted ? 0 : input.volume;
    this.audios.push(input);
    this.emit();
  }

  setAudio(id: string, patch: { volume?: number; muted?: boolean }) {
    const a = this.audios.find((x) => x.id === id);
    if (!a) return;
    Object.assign(a, patch);
    a.gain.gain.setTargetAtTime(a.muted ? 0 : a.volume, this.audio.currentTime, 0.02);
    this.emit();
  }

  /** Peak level of an input, 0 to 1, for the meters. */
  level(id: string) {
    const a = this.audios.find((x) => x.id === id);
    if (!a) return 0;
    const buf = new Float32Array(a.analyser.fftSize);
    a.analyser.getFloatTimeDomainData(buf);
    let peak = 0;
    for (const v of buf) peak = Math.max(peak, Math.abs(v));
    return Math.min(1, peak);
  }

  removeAudio(id: string) {
    const a = this.audios.find((x) => x.id === id);
    if (!a) return;
    a.gain.disconnect();
    a.stream?.getAudioTracks().forEach((t) => t.stop());
    this.audios = this.audios.filter((x) => x.id !== id);
    this.emit();
  }

  removeSource(id: string) {
    const s = this.sources.find((x) => x.id === id);
    if (!s) return;
    s.stream?.getTracks().forEach((t) => t.stop());
    if (s.el instanceof HTMLVideoElement) { s.el.pause(); s.el.remove(); }
    if (s.url) URL.revokeObjectURL(s.url);
    this.sources = this.sources.filter((x) => x.id !== id);
    if (this.audios.some((a) => a.id === id)) this.removeAudio(id);
    this.emit();
  }

  toggleVideo(id: string) {
    const s = this.sources.find((x) => x.id === id);
    if (!(s?.el instanceof HTMLVideoElement)) return;
    if (s.el.paused) void s.el.play().catch(() => undefined); else s.el.pause();
    this.emit(false);
  }

  restartVideo(id: string) {
    const s = this.sources.find((x) => x.id === id);
    if (!(s?.el instanceof HTMLVideoElement)) return;
    s.el.currentTime = 0;
    void s.el.play().catch(() => undefined);
    this.emit(false);
  }

  // ------------------------------------------------------------ scenes

  saveScene(scene: Scene) {
    const i = this.scenes.findIndex((s) => s.id === scene.id);
    if (i >= 0) this.scenes[i] = scene; else this.scenes.push(scene);
    this.scenes = [...this.scenes];
    this.emit();
  }

  newScene(): Scene {
    const cam = this.sources.find((s) => s.kind === 'camera');
    return { id: uid('sc'), name: `Scene ${this.scenes.length + 1}`, main: cam?.id ?? 'slides', pip: null, pipPos: 'br', lyrics: false, lowerThird: true };
  }

  deleteScene(id: string) {
    if (this.scenes.length <= 1) return;
    this.scenes = this.scenes.filter((s) => s.id !== id);
    if (this.programId === id) this.programId = this.scenes[0].id;
    if (this.previewId === id) this.previewId = this.scenes[0].id;
    this.emit();
  }

  /** Clicking a scene: into preview when "preview first" is on, otherwise straight to the stream. */
  pick(id: string) {
    if (this.previewFirst) { this.previewId = id; this.emit(false); } else this.take(id);
  }

  /** Puts a scene on the stream with the chosen transition. */
  take(id = this.previewId, how: Transition = this.transition) {
    if (!this.scenes.some((s) => s.id === id) || id === this.programId) return;
    if (how === 'fade') this.fade = { from: this.programId, start: performance.now(), ms: 700 };
    const was = this.programId;
    this.programId = id;
    // Like a vision mixer, the scene that just left the stream waits in preview.
    if (this.previewFirst) this.previewId = was;
    this.emit();
  }

  setOptions(p: { previewFirst?: boolean; transition?: Transition }) {
    Object.assign(this, p);
    this.emit();
  }

  // ------------------------------------------------------------ drawing

  private image(url: string | null | undefined) {
    if (!url) return null;
    if (this.images.has(url)) return this.images.get(url) ?? null;
    this.images.set(url, null);
    const img = new Image();
    // Pictures from another site would lock the canvas and stop recording, so only CORS-clean ones are drawn.
    img.crossOrigin = 'anonymous';
    img.onload = () => this.images.set(url, img);
    img.src = url;
    return null;
  }

  private tick() {
    const now = performance.now();
    // The strap slides in once each time a new one is fired, whichever scene shows it.
    const lt = this.view?.state.lowerThird;
    const key = lt ? lt.title + lt.subtitle : '';
    if (key !== this.lt.key) this.lt = { key, at: now };
    const prog = this.scenes.find((s) => s.id === this.programId);
    if (this.fade && now - this.fade.start < this.fade.ms) {
      const from = this.scenes.find((s) => s.id === this.fade!.from);
      const fctx = this.fadeCanvas.getContext('2d')!;
      this.drawScene(this.pctx, W, H, from, now);
      this.drawScene(fctx, W, H, prog, now);
      this.pctx.globalAlpha = (now - this.fade.start) / this.fade.ms;
      this.pctx.drawImage(this.fadeCanvas, 0, 0);
      this.pctx.globalAlpha = 1;
    } else {
      this.fade = null;
      this.drawScene(this.pctx, W, H, prog, now);
    }
    this.vctx.save();
    this.vctx.scale(PW / W, PH / H);
    this.drawScene(this.vctx, W, H, this.scenes.find((s) => s.id === this.previewId), now);
    this.vctx.restore();
  }

  private drawScene(ctx: CanvasRenderingContext2D, w: number, h: number, scene: Scene | undefined, now: number) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    if (!scene) return;
    this.drawLayer(ctx, scene.main, 0, 0, w, h);
    const v = this.view;
    let bottom = h * 0.95;
    const slide = v?.slides[v.state.index];
    if (v && scene.lyrics && scene.main !== 'slides' && v.state.mode === 'live' && slide && slide.kind !== 'title') bottom = this.drawLyricsBar(ctx, w, h, slide, bottom);
    if (scene.pip) {
      const pw = w * 0.32, ph = h * 0.32, m = h * 0.05;
      const x = scene.pipPos.endsWith('r') ? w - pw - m : m;
      // A bottom corner box sits above the lyrics bar rather than over it.
      const y = scene.pipPos.startsWith('b') ? (bottom < h * 0.95 ? bottom - ph - h * 0.02 : h - ph - m) : m;
      ctx.save();
      roundRect(ctx, x, y, pw, ph, h * 0.012);
      ctx.clip();
      this.drawLayer(ctx, scene.pip, x, y, pw, ph);
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = h * 0.004;
      roundRect(ctx, x, y, pw, ph, h * 0.012);
      ctx.stroke();
    }
    const lt = v?.state.lowerThird;
    if (scene.lowerThird && lt) this.drawLowerThird(ctx, w, h, lt.title, lt.subtitle, bottom - (bottom < h * 0.95 ? h * 0.02 : 0), Math.min(1, (now - this.lt.at) / 450));
  }

  private drawLayer(ctx: CanvasRenderingContext2D, id: string, x: number, y: number, w: number, h: number) {
    if (id === 'slides' || id === 'logo') {
      ctx.save();
      ctx.translate(x, y);
      ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
      if (this.view) this.drawSlide(ctx, w, h, id === 'logo' ? 'logo' : this.view.state.mode);
      ctx.restore();
      return;
    }
    const s = this.sources.find((x) => x.id === id);
    let drawn = false;
    if (s?.el instanceof HTMLVideoElement) drawn = s.el.readyState >= 2 && cover(ctx, s.el, s.el.videoWidth, s.el.videoHeight, x, y, w, h);
    else if (s?.el instanceof HTMLImageElement) drawn = s.el.complete && cover(ctx, s.el, s.el.naturalWidth, s.el.naturalHeight, x, y, w, h);
    if (!drawn) {
      ctx.fillStyle = '#16211f';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = `600 ${h * 0.05}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(s ? `Waiting for ${s.label}` : 'No source', x + w / 2, y + h / 2);
    }
  }

  /** The projector slide, drawn the way SlideFrame lays it out. */
  private drawSlide(ctx: CanvasRenderingContext2D, w: number, h: number, mode: string) {
    const v = this.view!;
    const t = v.theme;
    const up = (s: string) => (t.uppercase ? s.toUpperCase() : s);
    ctx.fillStyle = mode === 'blank' ? '#000' : t.background || '#0f1f1c';
    ctx.fillRect(0, 0, w, h);
    if (mode === 'blank') return;
    const bg = this.image(t.imageUrl);
    if (bg) { cover(ctx, bg, bg.naturalWidth, bg.naturalHeight, 0, 0, w, h); ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, 0, w, h); }
    ctx.fillStyle = t.textColor || '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const scale = t.fontScale || 1;
    // Each block is [text lines, font, line height, alpha]; the stack is centred as a whole.
    type Block = { lines: string[]; font: string; lh: number; alpha: number; gapBefore: number };
    const blocks: Block[] = [];
    const add = (texts: string[], size: number, weight: number, alpha = 1, gapBefore = 0, lh = 1.18, maxW = w * 0.86) => {
      const font = `${weight} ${size}px ${FONT}`;
      ctx.font = font;
      blocks.push({ lines: texts.flatMap((s) => wrap(ctx, up(s), maxW)), font, lh: size * lh, alpha, gapBefore });
    };
    const slide: Slide | undefined = v.slides[v.state.index];
    if (mode === 'countdown') {
      const until = new Date(v.state.countdownTo || v.event.startsAt).getTime();
      const left = until - Date.now();
      add([left > 0 ? 'SERVICE STARTS IN' : 'WELCOME'], h * 0.044, 500, 0.75);
      if (left > 0) add([countdownText(left)], h * 0.22 * scale, 800, 1, h * 0.03, 1);
      const anns = v.announcements ?? [];
      const a = anns.length ? anns[Math.floor(Date.now() / 9000) % anns.length] : null;
      if (a) { add([a.title], h * 0.052, 700, 1, h * 0.06); add([a.body], h * 0.034, 400, 0.8, h * 0.01, 1.35, w * 0.7); }
    } else if (mode === 'logo' || !slide) {
      const logo = this.image(v.logoUrl);
      let y = h / 2;
      if (logo) {
        const lh = h * 0.3, lw = Math.min(w * 0.5, (logo.naturalWidth / logo.naturalHeight) * lh);
        const lhh = lw / (logo.naturalWidth / logo.naturalHeight);
        ctx.drawImage(logo, (w - lw) / 2, h / 2 - lhh - h * 0.02, lw, lhh);
        y = h / 2 + h * 0.06;
      }
      ctx.font = `700 ${h * 0.06}px ${FONT}`;
      ctx.globalAlpha = 0.92;
      ctx.fillText(up(v.churchName), w / 2, y);
      ctx.globalAlpha = 1;
    } else if (slide.kind === 'title') {
      add([slide.lines[0] ?? ''], h * 0.1 * scale, 800, 1, 0, 1.1, w * 0.88);
      if (slide.lines[1]) add([slide.lines[1]], h * 0.046 * scale, 400, 0.75, h * 0.025);
    } else {
      const text = slide.kind === 'text';
      add(slide.lines, h * (text ? 0.056 : 0.074) * scale, text ? 600 : 700);
      if (t.showAlt && slide.alt.length) add(slide.alt, h * 0.052 * scale, 500, 0.82, h * 0.024, 1.25);
    }
    if (blocks.length) {
      const total = blocks.reduce((n, b) => n + b.gapBefore + b.lines.length * b.lh, 0);
      let y = (h - total) / 2;
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = h * 0.012;
      ctx.shadowOffsetY = h * 0.003;
      for (const b of blocks) {
        y += b.gapBefore;
        ctx.font = b.font;
        ctx.globalAlpha = b.alpha;
        for (const l of b.lines) { ctx.fillText(l, w / 2, y + b.lh / 2); y += b.lh; }
      }
      ctx.globalAlpha = 1;
      ctx.shadowColor = 'transparent';
    }
    if (v.state.message) {
      ctx.font = `600 ${h * 0.044}px ${FONT}`;
      const lines = wrap(ctx, v.state.message, w * 0.92);
      const lh = h * 0.055;
      const bh = lines.length * lh + h * 0.04;
      ctx.fillStyle = 'rgba(0,0,0,0.72)';
      ctx.fillRect(0, h - bh, w, bh);
      ctx.fillStyle = '#fff';
      lines.forEach((l, i) => ctx.fillText(l, w / 2, h - bh + h * 0.02 + lh * (i + 0.5)));
    }
  }

  /** Lyrics bar over a camera shot. Returns the top of the bar, so a name strap can sit above it. */
  private drawLyricsBar(ctx: CanvasRenderingContext2D, w: number, h: number, slide: Slide, bottom: number) {
    const t = this.view!.theme;
    const up = (s: string) => (t.uppercase ? s.toUpperCase() : s);
    const pad = h * 0.016, maxW = w * 0.9 - w * 0.04;
    ctx.font = `700 ${h * 0.038}px ${FONT}`;
    const lines = slide.lines.flatMap((l) => wrap(ctx, up(l), maxW));
    const lh = h * 0.0475;
    const alt = t.showAlt && slide.alt.length ? up(slide.alt.join(' / ')) : '';
    ctx.font = `500 ${h * 0.028}px ${FONT}`;
    const altLines = alt ? wrap(ctx, alt, maxW) : [];
    const alh = h * 0.036;
    const bh = pad * 2 + lines.length * lh + (altLines.length ? h * 0.006 + altLines.length * alh : 0);
    const top = bottom - bh;
    ctx.fillStyle = 'rgba(0,0,0,0.62)';
    roundRect(ctx, w * 0.05, top, w * 0.9, bh, w * 0.008);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.font = `700 ${h * 0.038}px ${FONT}`;
    let y = top + pad;
    for (const l of lines) { ctx.fillText(l, w / 2, y + lh / 2); y += lh; }
    if (altLines.length) {
      y += h * 0.006;
      ctx.font = `500 ${h * 0.028}px ${FONT}`;
      ctx.globalAlpha = 0.85;
      for (const l of altLines) { ctx.fillText(l, w / 2, y + alh / 2); y += alh; }
      ctx.globalAlpha = 1;
    }
    return top;
  }

  private drawLowerThird(ctx: CanvasRenderingContext2D, w: number, h: number, title: string, subtitle: string, bottom: number, p: number) {
    const ease = 1 - Math.pow(1 - p, 3);
    ctx.font = `800 ${h * 0.042}px ${FONT}`;
    const tw = ctx.measureText(title).width;
    ctx.font = `400 ${h * 0.026}px ${FONT}`;
    const sw = subtitle ? ctx.measureText(subtitle).width : 0;
    const bw = Math.min(w * 0.6, Math.max(tw, sw) + w * 0.04 + w * 0.006);
    const bh = h * 0.014 + h * 0.05 + (subtitle ? h * 0.034 : 0) + h * 0.016;
    const x = w * 0.05 - (1 - ease) * w * 0.03;
    const y = bottom - bh;
    ctx.globalAlpha = ease;
    ctx.fillStyle = 'rgba(15,31,28,0.88)';
    roundRect(ctx, x, y, bw, bh, w * 0.006);
    ctx.fill();
    ctx.fillStyle = SAFFRON;
    ctx.fillRect(x, y, w * 0.006, bh);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `800 ${h * 0.042}px ${FONT}`;
    ctx.fillText(title, x + w * 0.026, y + h * 0.014 + h * 0.025, bw - w * 0.036);
    if (subtitle) {
      ctx.font = `400 ${h * 0.026}px ${FONT}`;
      ctx.globalAlpha = ease * 0.85;
      ctx.fillText(subtitle, x + w * 0.026, y + h * 0.014 + h * 0.05 + h * 0.017, bw - w * 0.036);
    }
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------ output

  /** The mixed picture and sound as one stream (made once, shared by recording and going live). */
  private output() {
    if (!this.out) this.out = new MediaStream([...this.program.captureStream(30).getVideoTracks(), ...this.dest.stream.getAudioTracks()]);
    return this.out;
  }

  /**
   * Starts recording. Where the browser can write files (Chrome, Edge) the recording goes straight
   * to a file the operator picks, so a two-hour service never sits in memory.
   */
  async startRecording() {
    if (this.recording) return;
    const mime = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
    const ext = mime.startsWith('video/mp4') ? 'mp4' : 'webm';
    const name = `${(this.view?.event.title || 'Service').replace(/[^\w\- ]+/g, '').trim() || 'Service'} ${new Date().toISOString().slice(0, 16).replace('T', ' ').replace(':', '-')}.${ext}`;
    type Writable = { write: (b: Blob) => Promise<void>; close: () => Promise<void> };
    const picker = (window as Window & { showSaveFilePicker?: (o: unknown) => Promise<{ createWritable: () => Promise<Writable> }> }).showSaveFilePicker;
    let file: Writable | null = null;
    if (picker) {
      try {
        const handle = await picker({ suggestedName: name, types: [{ description: 'Video', accept: { [mime.split(';')[0] || 'video/webm']: [`.${ext}`] } }] });
        file = await handle.createWritable();
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
        file = null;
      }
    }
    const rec = new MediaRecorder(this.output(), { mimeType: mime || undefined, videoBitsPerSecond: 4_000_000, audioBitsPerSecond: 160_000 });
    const chunks: Blob[] = [];
    let size = 0;
    let writing = Promise.resolve();
    rec.ondataavailable = (e) => {
      if (!e.data.size) return;
      size += e.data.size;
      if (file) { const f = file; writing = writing.then(() => f.write(e.data)); } else chunks.push(e.data);
    };
    rec.onstop = () => {
      void writing.then(async () => {
        if (file) await file.close();
        this.recordings.unshift({ name, url: file ? null : URL.createObjectURL(new Blob(chunks, { type: mime || 'video/webm' })), size, savedToDisk: !!file });
        this.emit(false);
      });
    };
    rec.start(1000);
    this.recorder = rec;
    this.recording = { since: Date.now(), disk: !!file };
    this.emit(false);
  }

  stopRecording() {
    this.recorder?.stop();
    this.recorder = null;
    this.recording = null;
    this.emit(false);
  }

  /** Sends the stream to a WHIP endpoint (Cloudflare Stream and other WebRTC ingest services). */
  async goLive(url: string, token: string) {
    if (this.pc) return;
    this.live = 'connecting';
    this.liveError = '';
    this.emit(false);
    const pc = new RTCPeerConnection({ bundlePolicy: 'max-bundle' });
    this.pc = pc;
    try {
      const stream = this.output();
      for (const track of stream.getTracks()) {
        const tr = pc.addTransceiver(track, { direction: 'sendonly', streams: [stream] });
        // H.264 lets the service pass the stream on to YouTube or Facebook without re-encoding.
        if (track.kind === 'video') {
          const codecs = RTCRtpSender.getCapabilities('video')?.codecs ?? [];
          const h264 = codecs.filter((c) => c.mimeType === 'video/H264');
          if (h264.length && tr.setCodecPreferences) tr.setCodecPreferences([...h264, ...codecs.filter((c) => c.mimeType !== 'video/H264')]);
          const p = tr.sender.getParameters();
          p.encodings = [{ ...(p.encodings?.[0] ?? {}), maxBitrate: 4_000_000, maxFramerate: 30 }];
          void tr.sender.setParameters(p).catch(() => undefined);
        }
      }
      await pc.setLocalDescription(await pc.createOffer());
      await new Promise<void>((resolve) => {
        if (pc.iceGatheringState === 'complete') return resolve();
        const done = () => { if (pc.iceGatheringState === 'complete') { pc.removeEventListener('icegatheringstatechange', done); resolve(); } };
        pc.addEventListener('icegatheringstatechange', done);
        setTimeout(resolve, 2500);
      });
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/sdp', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: pc.localDescription!.sdp });
      if (!res.ok) throw new Error(res.status === 401 || res.status === 403 ? 'The streaming service refused the key. Check the WHIP link and token.' : `The streaming service answered ${res.status}.`);
      const loc = res.headers.get('Location');
      this.whipResource = loc ? new URL(loc, url).href : null;
      this.whipToken = token;
      await pc.setRemoteDescription({ type: 'answer', sdp: await res.text() });
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') { this.live = 'live'; this.liveSince = Date.now(); this.emit(false); }
        else if (pc.connectionState === 'failed') { this.liveError = 'The connection to the streaming service dropped.'; this.stopLive('error'); }
      };
    } catch (e) {
      this.liveError = e instanceof TypeError ? 'Could not reach the streaming service. Check the WHIP link.' : (e as Error).message;
      this.stopLive('error');
    }
  }

  stopLive(next: LiveState = 'off') {
    if (this.whipResource) void fetch(this.whipResource, { method: 'DELETE', headers: this.whipToken ? { Authorization: `Bearer ${this.whipToken}` } : {} }).catch(() => undefined);
    this.whipResource = null;
    this.pc?.close();
    this.pc = null;
    this.live = next;
    this.emit(false);
  }

  destroy() {
    this.ready = false;
    this.stopTicker();
    if (this.recorder) this.stopRecording();
    if (this.pc) this.stopLive();
    for (const s of [...this.sources]) this.removeSource(s.id);
    for (const a of [...this.audios]) this.removeAudio(a.id);
    this.holder.remove();
    void this.audio.close().catch(() => undefined);
    this.listeners.clear();
  }
}
