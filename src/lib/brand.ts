// The church's brand kit on screen: its colours become the theme variables of the member app,
// the public page and invitations, and its logo sits beside the name everywhere. Colours are
// adjusted for dark mode so a deep maroon button still reads on a dark background.
import type { CSSProperties } from 'react';

import type { BrandFont, BrandKit, Church } from '@/api/admin-types';

export const DEFAULT_BRAND: BrandKit = { primary: '#1f6b5c', accent: '#f2a93b', font: 'modern', logoDarkUrl: null, tagline: '' };

export const BRAND_FONTS: { id: BrandFont; label: string; stack: string; sample: string }[] = [
  { id: 'modern', label: 'Modern', stack: "'Outfit', system-ui, sans-serif", sample: 'Clean and friendly' },
  { id: 'classic', label: 'Classic', stack: "Georgia, 'Times New Roman', 'Noto Serif', serif", sample: 'Traditional and warm' },
  { id: 'rounded', label: 'Rounded', stack: "ui-rounded, 'Varela Round', 'Nunito', 'Arial Rounded MT Bold', system-ui, sans-serif", sample: 'Soft and welcoming' },
  { id: 'elegant', label: 'Elegant', stack: "'Cormorant Garamond', 'Playfair Display', 'Palatino Linotype', Palatino, Georgia, serif", sample: 'Weddings and celebrations' },
];

export const fontStack = (font: BrandFont | undefined) => BRAND_FONTS.find((f) => f.id === font)?.stack ?? BRAND_FONTS[0].stack;

// ---------- colour maths ----------

export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [31, 107, 92];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const toHex = (rgb: number[]) => '#' + rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
/** Mixes `a` towards `b`; t = 0 keeps a, t = 1 gives b. */
export function mix(a: string, b: string, t: number) {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return toHex(x.map((v, i) => v + (y[i] - v) * t));
}
/** Relative luminance (0 dark, 1 light). */
export function luminance(hex: string) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** White or ink, whichever reads better on the colour. */
export const onColour = (hex: string) => (luminance(hex) > 0.4 ? '#14211f' : '#ffffff');
/** A version of the colour that reads on dark backgrounds. */
export function forDark(hex: string) {
  let c = hex;
  for (let i = 0; i < 6 && luminance(c) < 0.35; i++) c = mix(c, '#ffffff', 0.18);
  return c;
}

/** Theme variables for a surface in the church's colours; `dark` for the dark theme. */
export function brandVars(brand: BrandKit | null | undefined, dark: boolean): CSSProperties {
  const b = brand ?? DEFAULT_BRAND;
  const primary = dark ? forDark(b.primary) : b.primary;
  const accent = dark ? forDark(b.accent) : b.accent;
  return {
    // The colour as chosen, for big painted areas (hero cards) that keep white text in dark mode too.
    '--brand-primary': b.primary,
    '--primary': primary,
    '--primary-hover': dark ? mix(primary, '#ffffff', 0.12) : mix(primary, '#000000', 0.14),
    '--on-primary': onColour(primary),
    '--accent': accent,
    '--on-accent': onColour(accent),
    '--tint': dark ? mix(primary, '#182624', 0.78) : mix(primary, '#ffffff', 0.88),
    '--font-heading': fontStack(b.font),
  } as CSSProperties;
}

/** Whether the page is showing its dark theme right now. */
export function isDark() {
  if (typeof document === 'undefined') return false;
  const forced = document.documentElement.dataset.theme;
  if (forced === 'dark') return true;
  if (forced === 'light') return false;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

/** The logo to show on a dark surface (projector, dark mode), falling back to the main one. */
export const logoFor = (church: Pick<Church, 'logoUrl' | 'brand'> | null | undefined, dark: boolean) =>
  (dark ? church?.brand?.logoDarkUrl : null) || church?.logoUrl || null;

// ---------- logo uploads ----------

const LOGO_LIMIT = 400_000;

/** Reads a logo file as a data URL small enough to store with the settings (SVG kept as is, bitmaps shrunk to 512 px). */
export async function readLogo(file: File): Promise<string> {
  if (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')) {
    const text = await file.text();
    if (/<script|on\w+=/i.test(text)) throw new Error('This SVG has scripts in it. Export a plain SVG or a PNG.');
    const url = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(text)))}`;
    if (url.length > LOGO_LIMIT) throw new Error('The SVG is too big. Keep it under 300 KB or use a PNG.');
    return url;
  }
  if (!file.type.startsWith('image/')) throw new Error('Choose a PNG, JPG or SVG image.');
  const img = await loadImage(URL.createObjectURL(file));
  for (const [max, type, q] of [[512, 'image/png', undefined], [512, 'image/jpeg', 0.86], [320, 'image/jpeg', 0.8]] as const) {
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.width * scale));
    c.height = Math.max(1, Math.round(img.height * scale));
    const g = c.getContext('2d')!;
    if (type === 'image/jpeg') {
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, c.width, c.height);
    }
    g.drawImage(img, 0, 0, c.width, c.height);
    const url = c.toDataURL(type, q);
    if (url.length <= LOGO_LIMIT) return url;
  }
  throw new Error('The image is too detailed to store. Use a simpler PNG or an SVG.');
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    if (!src.startsWith('data:') && !src.startsWith('blob:')) img.crossOrigin = 'anonymous';
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('Could not read the image'));
    img.src = src;
  });
}
