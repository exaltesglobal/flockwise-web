// "Sunday in 60 seconds" drawn in the browser from the church's brand kit: a 1080 x 1920 card for
// WhatsApp status (headline, the numbers, the Word), one image per slide for a status sequence,
// and a short reel recorded from the same slides. Nothing is uploaded; the phone draws it all.
import type { BrandKit, MemberRecap, Recap, RecapSlide } from '@/api/admin-types';

import { DEFAULT_BRAND, fontStack, loadImage, mix, onColour } from './brand';
import { cardBlob, fitTitle, roundRect, wrap } from './invitation';

export const RW = 1080;
export const RH = 1920;
const M = 90;

export type RecapCardInput = {
  church: { name: string; logoUrl: string | null; brand: BrandKit | null | undefined; tagline?: string };
  recap: Pick<Recap | MemberRecap, 'headline' | 'date' | 'slides' | 'stats' | 'eventTitle'>;
  /** Printed small at the bottom of the card, e.g. the share link. */
  footer?: string;
};

type Paint = { c: CanvasRenderingContext2D; bg: [string, string]; text: string; soft: string; accent: string; card: string; head: string; body: string; logo: HTMLImageElement | null };

async function paint(input: RecapCardInput): Promise<{ canvas: HTMLCanvasElement; p: Paint }> {
  if (document.fonts?.ready) await document.fonts.ready;
  const brand = input.church.brand ?? DEFAULT_BRAND;
  const text = onColour(brand.primary);
  const dark = text === '#ffffff';
  const logo = input.church.logoUrl ? await loadImage(dark ? brand.logoDarkUrl || input.church.logoUrl : input.church.logoUrl).catch(() => null) : null;
  const canvas = document.createElement('canvas');
  canvas.width = RW;
  canvas.height = RH;
  const c = canvas.getContext('2d')!;
  return {
    canvas,
    p: { c, bg: [brand.primary, mix(brand.primary, dark ? '#0b1412' : '#ffffff', 0.45)], text, soft: mix(text, brand.primary, 0.3), accent: brand.accent, card: dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)', head: fontStack(brand.font), body: fontStack(brand.font === 'classic' || brand.font === 'elegant' ? 'classic' : 'modern'), logo },
  };
}

function background(p: Paint) {
  const { c } = p;
  const g = c.createLinearGradient(0, 0, RW * 0.4, RH);
  g.addColorStop(0, p.bg[0]);
  g.addColorStop(1, p.bg[1]);
  c.fillStyle = g;
  c.fillRect(0, 0, RW, RH);
  // A soft ring of light, so the card has depth without a photo.
  c.save();
  c.globalAlpha = 0.16;
  c.strokeStyle = p.accent;
  c.lineWidth = 90;
  c.beginPath();
  c.arc(RW - 120, 260, 420, 0, Math.PI * 2);
  c.stroke();
  c.restore();
}

/** Logo beside the church name at the top; returns the y below it. */
function header(p: Paint, input: RecapCardInput, y = M) {
  const { c } = p;
  let x = M;
  const size = 96;
  if (p.logo) {
    c.save();
    roundRect(c, x, y, size, size, 22);
    c.fillStyle = '#ffffff';
    c.fill();
    c.clip();
    const s = Math.min(size / p.logo.width, size / p.logo.height) * 0.86;
    c.drawImage(p.logo, x + (size - p.logo.width * s) / 2, y + (size - p.logo.height * s) / 2, p.logo.width * s, p.logo.height * s);
    c.restore();
    x += size + 26;
  }
  c.textAlign = 'left';
  c.textBaseline = 'alphabetic';
  c.fillStyle = p.text;
  c.font = `700 40px ${p.head}`;
  const lines = wrap(c, input.church.name, RW - x - M, 2);
  lines.forEach((l, i) => c.fillText(l, x, y + 44 + i * 44 + (lines.length === 1 ? 14 : 0)));
  return y + size + 40;
}

function footer(p: Paint, input: RecapCardInput, dateLabel: string) {
  const { c } = p;
  c.textAlign = 'center';
  c.fillStyle = p.soft;
  c.font = `500 28px ${p.body}`;
  c.fillText([dateLabel, input.footer].filter(Boolean).join('  ·  '), RW / 2, RH - M + 10);
}

const dateLabel = (iso: string) => { try { return new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${iso}T12:00:00`)); } catch { return iso; } };

function tile(p: Paint, x: number, y: number, w: number, h: number, big: string, small: string) {
  const { c } = p;
  roundRect(c, x, y, w, h, 28);
  c.fillStyle = p.card;
  c.fill();
  c.textAlign = 'center';
  c.fillStyle = p.text;
  c.font = `800 ${big.length > 4 ? 64 : 84}px ${p.head}`;
  c.fillText(big, x + w / 2, y + h / 2 + 10);
  c.fillStyle = p.soft;
  c.font = `500 26px ${p.body}`;
  c.fillText(small.toUpperCase().split('').join(' '), x + w / 2, y + h - 38);
}

/** The status card: headline, the numbers, the Word. */
export async function renderRecapCard(input: RecapCardInput): Promise<HTMLCanvasElement> {
  const { canvas, p } = await paint(input);
  const { c } = p;
  background(p);
  let y = header(p, input);

  y += 150;
  c.textAlign = 'left';
  c.fillStyle = p.accent;
  c.font = `600 30px ${p.body}`;
  c.fillText('S U N D A Y   I N   6 0   S E C O N D S', M, y);
  y += 110;
  const title = fitTitle(c, input.recap.headline, p.head, 112, 64, RW - 2 * M, 4);
  c.fillStyle = p.text;
  title.lines.forEach((l, i) => c.fillText(l, M, y + i * (title.size * 1.08)));
  y += title.lines.length * title.size * 1.08 + 70;

  const s = input.recap.stats;
  const tiles: [string, string][] = [];
  if (s.attendance) tiles.push([String(s.attendance), 'worshipped']);
  if (s.firstTimers) tiles.push([String(s.firstTimers), s.firstTimers === 1 ? 'new face' : 'new faces']);
  if (s.prayed) tiles.push([String(s.prayed), 'prayers']);
  if (tiles.length < 3 && s.songs) tiles.push([String(s.songs), 'songs']);
  if (tiles.length < 3 && s.children) tiles.push([String(s.children), 'children']);
  const gap = 24, w = (RW - 2 * M - gap * (tiles.length - 1)) / Math.max(tiles.length, 1);
  tiles.forEach(([big, small], i) => tile(p, M + i * (w + gap), y, w, 230, big, small));
  if (tiles.length) y += 230 + 80;

  const word = input.recap.slides[1] ?? input.recap.slides[0];
  if (word) {
    const boxTop = y;
    c.textAlign = 'left';
    c.fillStyle = p.accent;
    c.font = `600 28px ${p.body}`;
    c.fillText(word.title.toUpperCase(), M + 40, y + 70);
    c.fillStyle = p.text;
    c.font = `500 44px ${p.body}`;
    const lines = wrap(c, word.text, RW - 2 * M - 80, 5);
    lines.forEach((l, i) => c.fillText(l, M + 40, y + 140 + i * 58));
    let h = 140 + lines.length * 58 + 20;
    if (word.stat) {
      c.fillStyle = p.soft;
      c.font = `600 30px ${p.body}`;
      c.fillText(word.stat, M + 40, y + h + 14);
      h += 60;
    }
    c.save();
    c.globalCompositeOperation = 'destination-over';
    roundRect(c, M, boxTop, RW - 2 * M, h, 32);
    c.fillStyle = p.card;
    c.fill();
    c.restore();
  }
  footer(p, input, dateLabel(input.recap.date));
  return canvas;
}

/** One slide of the reel: progress marks, the title, the big stat, the words. */
export async function renderRecapSlide(input: RecapCardInput, index: number): Promise<HTMLCanvasElement> {
  const { canvas, p } = await paint(input);
  drawSlide(p, input, index, 1);
  return canvas;
}

function drawSlide(p: Paint, input: RecapCardInput, index: number, alpha: number) {
  const { c } = p;
  const slide: RecapSlide = input.recap.slides[index];
  background(p);
  // Progress marks like a status, one per slide.
  const n = input.recap.slides.length;
  const gap = 10, w = (RW - 2 * M - gap * (n - 1)) / n;
  for (let i = 0; i < n; i++) {
    roundRect(c, M + i * (w + gap), 40, w, 8, 4);
    c.fillStyle = i <= index ? p.accent : p.card;
    c.fill();
  }
  header(p, input, 90);
  c.save();
  c.globalAlpha = alpha;
  c.textAlign = 'left';
  c.fillStyle = p.accent;
  c.font = `600 30px ${p.body}`;
  c.fillText(`${index + 1} / ${n}   ·   ${dateLabel(input.recap.date).toUpperCase()}`, M, 560);
  const title = fitTitle(c, slide.title, p.head, 104, 60, RW - 2 * M, 3);
  c.fillStyle = p.text;
  let y = 700;
  title.lines.forEach((l, i) => c.fillText(l, M, y + i * title.size * 1.08));
  y += title.lines.length * title.size * 1.08 + 40;
  if (slide.stat) {
    const stat = fitTitle(c, slide.stat, p.head, 180, 72, RW - 2 * M, 2);
    c.fillStyle = p.accent;
    stat.lines.forEach((l, i) => c.fillText(l, M, y + stat.size * 0.9 + i * stat.size));
    y += stat.lines.length * stat.size + 50;
  }
  c.fillStyle = p.text;
  c.font = `500 52px ${p.body}`;
  wrap(c, slide.text, RW - 2 * M, 7).forEach((l, i) => c.fillText(l, M, y + 40 + i * 70));
  c.restore();
  footer(p, input, input.church.name);
}

/**
 * Records the slides as a short video (WebM) straight from the canvas: each slide fades in and
 * holds for `secondsPerSlide`. Returns null where the browser cannot record (older iPhones).
 */
export async function recordReel(input: RecapCardInput, secondsPerSlide = 10, onProgress?: (fraction: number) => void): Promise<Blob | null> {
  const { canvas, p } = await paint(input);
  const stream = (canvas as HTMLCanvasElement & { captureStream?: (fps: number) => MediaStream }).captureStream?.(30);
  const Rec = (window as Window & { MediaRecorder?: typeof MediaRecorder }).MediaRecorder;
  if (!stream || !Rec) return null;
  const type = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find((t) => Rec.isTypeSupported?.(t)) ?? '';
  const rec = new Rec(stream, type ? { mimeType: type, videoBitsPerSecond: 4_000_000 } : undefined);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const done = new Promise<Blob>((res) => { rec.onstop = () => res(new Blob(chunks, { type: type || 'video/webm' })); });
  rec.start(250);
  const n = input.recap.slides.length, hold = secondsPerSlide * 1000, fade = 450;
  const t0 = performance.now();
  await new Promise<void>((res) => {
    const frame = () => {
      const t = performance.now() - t0;
      const i = Math.min(n - 1, Math.floor(t / hold));
      const alpha = Math.min(1, (t - i * hold) / fade);
      drawSlide(p, input, i, alpha);
      onProgress?.(Math.min(1, t / (n * hold)));
      if (t < n * hold) requestAnimationFrame(frame); else res();
    };
    requestAnimationFrame(frame);
  });
  rec.stop();
  return done;
}

export const pngUrl = async (canvas: HTMLCanvasElement) => URL.createObjectURL(await cardBlob(canvas));

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
