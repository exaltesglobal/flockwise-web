// A verse as a picture for WhatsApp and Instagram, drawn in the browser in the church's colours
// with its logo and name. Square for posts, tall for status. Works in every script the phone has
// a font for; nothing is uploaded.
import type { BrandKit } from '@/api/admin-types';

import { DEFAULT_BRAND, fontStack, loadImage, mix, onColour } from './brand';
import { roundRect, wrap } from './invitation';

export type VerseCardStyle = 'brand' | 'light' | 'dark';
export type VerseCardInput = {
  church: { name: string; logoUrl: string | null; brand?: BrandKit | null };
  text: string;
  reference: string;
  translation: string;
  shape: 'square' | 'story';
  style: VerseCardStyle;
};

export async function renderVerseCard(input: VerseCardInput): Promise<HTMLCanvasElement> {
  if (document.fonts?.ready) await document.fonts.ready;
  const brand = input.church.brand ?? DEFAULT_BRAND;
  const W = 1080;
  const H = input.shape === 'square' ? 1080 : 1920;
  const M = 96;
  const bg = input.style === 'brand' ? brand.primary : input.style === 'dark' ? mix(brand.primary, '#060a09', 0.82) : mix(brand.primary, '#fffaf2', 0.92);
  const text = input.style === 'brand' ? onColour(brand.primary) : input.style === 'dark' ? '#ffffff' : mix(brand.primary, '#101816', 0.55);
  const soft = mix(text, bg, 0.35);
  const accent = input.style === 'light' ? brand.primary : brand.accent;
  const head = fontStack(brand.font);
  const body = fontStack(brand.font === 'classic' || brand.font === 'elegant' ? brand.font : 'classic');
  const darkBg = onColour(bg) === '#ffffff';
  const logo = input.church.logoUrl ? await loadImage(darkBg ? brand.logoDarkUrl || input.church.logoUrl : input.church.logoUrl).catch(() => null) : null;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const c = canvas.getContext('2d')!;
  const g = c.createLinearGradient(0, 0, W * 0.5, H);
  g.addColorStop(0, bg);
  g.addColorStop(1, mix(bg, darkBg ? '#000000' : '#ffffff', 0.22));
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  // A large quotation mark behind the words.
  c.save();
  c.globalAlpha = 0.12;
  c.fillStyle = accent;
  c.font = `700 ${Math.round(W * 0.6)}px Georgia, serif`;
  c.textBaseline = 'top';
  c.fillText('“', M - 40, input.shape === 'square' ? -60 : 160);
  c.restore();

  // The verse, as large as fits the space between the top and the reference.
  const top = input.shape === 'square' ? 170 : 420;
  const bottom = H - (input.shape === 'square' ? 300 : 560);
  const words = input.text.replace(/\s+/g, ' ').trim();
  let size = input.shape === 'square' ? 76 : 88;
  let lines: string[] = [];
  for (; size >= 34; size -= 4) {
    c.font = `500 ${size}px ${body}`;
    lines = wrap(c, words, W - 2 * M, 99);
    if (lines.length * size * 1.32 <= bottom - top) break;
  }
  c.font = `500 ${size}px ${body}`;
  lines = wrap(c, words, W - 2 * M, Math.max(1, Math.floor((bottom - top) / (size * 1.32))));
  const block = lines.length * size * 1.32;
  let y = top + (bottom - top - block) / 2 + size;
  c.fillStyle = text;
  c.textAlign = 'left';
  c.textBaseline = 'alphabetic';
  for (const l of lines) {
    c.fillText(l, M, y);
    y += size * 1.32;
  }

  // The reference with a short rule, then the Bible's name.
  y += 20;
  c.fillStyle = accent;
  c.fillRect(M, y - 10, 70, 6);
  c.font = `700 ${input.shape === 'square' ? 44 : 50}px ${head}`;
  c.fillText(input.reference, M + 92, y + 6);
  c.fillStyle = soft;
  c.font = `500 28px ${head}`;
  c.fillText(input.translation, M + 92, y + 50);

  // Logo and church name at the foot.
  const fy = H - (input.shape === 'square' ? 120 : 200);
  let x = M;
  if (logo) {
    const s = 72;
    c.save();
    roundRect(c, x, fy - s + 18, s, s, 16);
    c.fillStyle = '#ffffff';
    c.fill();
    c.clip();
    const k = Math.min(s / logo.width, s / logo.height) * 0.86;
    c.drawImage(logo, x + (s - logo.width * k) / 2, fy - s + 18 + (s - logo.height * k) / 2, logo.width * k, logo.height * k);
    c.restore();
    x += s + 22;
  }
  c.fillStyle = text;
  c.font = `700 34px ${head}`;
  c.fillText(wrap(c, input.church.name, W - x - M, 1)[0] ?? '', x, fy);
  return canvas;
}
