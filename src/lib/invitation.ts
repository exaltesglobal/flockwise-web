// Invitation cards drawn in the browser from the church's brand kit: logo and name on top, the
// occasion in the middle, a QR code to RSVP at the bottom. 1080 x 1350 (the WhatsApp and
// Instagram portrait size), saved as PNG or shared straight to WhatsApp.
import qrcode from 'qrcode-generator';

import type { BrandFont, BrandKit } from '@/api/admin-types';
import { DEFAULT_BRAND, fontStack, loadImage, luminance, mix } from './brand';

export type InvitationStyle = 'event' | 'christmas' | 'wedding' | 'baptism' | 'easter';
export type InvitationInput = {
  style: InvitationStyle;
  church: { name: string; logoUrl: string | null; brand: BrandKit | null | undefined; phone?: string; tagline?: string };
  /** Small line above the title: "You are warmly invited to". */
  headline: string;
  title: string;
  /** "Sunday, 25 December 2026" */
  date: string;
  /** "6:30 pm – 8:30 pm" */
  time: string;
  place: string;
  message: string;
  /** Closing line: "With love, the Varghese family" or the church office phone. */
  host: string;
  /** Link in the QR code (the event page); empty for no QR. */
  link: string;
  /** Label under the QR. */
  linkLabel: string;
};

export const INVITATION_STYLES: { id: InvitationStyle; label: string; headline: string }[] = [
  { id: 'event', label: 'Church colours', headline: 'You are warmly invited to' },
  { id: 'christmas', label: 'Christmas', headline: 'Join us this Christmas for' },
  { id: 'wedding', label: 'Wedding', headline: 'Together with their families' },
  { id: 'baptism', label: 'Baptism & dedication', headline: 'Rejoice with us at the' },
  { id: 'easter', label: 'Easter', headline: 'He is risen! Celebrate with us at' },
];

type Palette = { bg: [string, string]; text: string; soft: string; accent: string; card: string; font: BrandFont | 'inherit'; ornament: 'ribbon' | 'stars' | 'frame' | 'waves' | 'rays' };

function palette(input: InvitationInput): Palette {
  const b = input.church.brand ?? DEFAULT_BRAND;
  switch (input.style) {
    case 'christmas':
      return { bg: ['#0f3d2e', '#082318'], text: '#fdf6e3', soft: 'rgba(253,246,227,0.72)', accent: '#d4af37', card: '#ffffff', font: 'classic', ornament: 'stars' };
    case 'wedding':
      return { bg: ['#f8f1e4', '#efe3cf'], text: '#3a2f28', soft: 'rgba(58,47,40,0.66)', accent: '#b8923a', card: '#ffffff', font: 'elegant', ornament: 'frame' };
    case 'baptism':
      return { bg: ['#eaf4f9', '#ffffff'], text: '#1d3b4f', soft: 'rgba(29,59,79,0.66)', accent: '#4aa3c7', card: '#ffffff', font: 'rounded', ornament: 'waves' };
    case 'easter':
      return { bg: ['#fff7e6', '#ffe9c2'], text: '#4a2d10', soft: 'rgba(74,45,16,0.66)', accent: '#e07a2f', card: '#ffffff', font: 'modern', ornament: 'rays' };
    default: {
      const dark = luminance(b.primary) < 0.5;
      return {
        bg: [b.primary, mix(b.primary, '#000000', 0.35)],
        text: dark ? '#ffffff' : '#14211f',
        soft: dark ? 'rgba(255,255,255,0.74)' : 'rgba(20,33,31,0.7)',
        accent: b.accent,
        card: '#ffffff',
        font: 'inherit',
        ornament: 'ribbon',
      };
    }
  }
}

const W = 1080;
const H = 1350;
const M = 84;

function wrap(c: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (c.measureText(next).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    if (line || !para) lines.push(line);
  }
  if (lines.length > maxLines) {
    const cut = lines.slice(0, maxLines);
    cut[maxLines - 1] = cut[maxLines - 1].replace(/[\s,.;:]*$/, '') + '…';
    return cut;
  }
  return lines;
}

/** Fits a title: shrinks the font until it needs at most `maxLines`. */
function fitTitle(c: CanvasRenderingContext2D, text: string, font: string, start: number, min: number, maxWidth: number, maxLines: number) {
  for (let size = start; size >= min; size -= 4) {
    c.font = `700 ${size}px ${font}`;
    const lines = wrap(c, text, maxWidth, 99);
    if (lines.length <= maxLines) return { size, lines };
  }
  c.font = `700 ${min}px ${font}`;
  return { size: min, lines: wrap(c, text, maxWidth, maxLines) };
}

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function ornaments(c: CanvasRenderingContext2D, p: Palette) {
  c.save();
  switch (p.ornament) {
    case 'ribbon': {
      c.fillStyle = p.accent;
      c.fillRect(0, 0, W, 14);
      c.globalAlpha = 0.12;
      c.beginPath();
      c.arc(W - 120, H - 160, 330, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.arc(90, 420, 220, 0, Math.PI * 2);
      c.fill();
      break;
    }
    case 'stars': {
      c.fillStyle = p.accent;
      const pts = [[120, 140], [960, 110], [880, 300], [160, 330], [1000, 700], [70, 760], [940, 1120], [130, 1180], [540, 90]];
      pts.forEach(([x, y], i) => star(c, x, y, i % 3 === 0 ? 16 : 9));
      c.globalAlpha = 0.25;
      c.beginPath();
      c.arc(W / 2, 1190, 520, Math.PI, 0);
      c.fill();
      break;
    }
    case 'frame': {
      c.strokeStyle = p.accent;
      c.lineWidth = 3;
      c.strokeRect(40, 40, W - 80, H - 80);
      c.lineWidth = 1.5;
      c.strokeRect(54, 54, W - 108, H - 108);
      c.fillStyle = p.accent;
      [[40, 40], [W - 40, 40], [40, H - 40], [W - 40, H - 40]].forEach(([x, y]) => diamond(c, x, y, 14));
      break;
    }
    case 'waves': {
      c.strokeStyle = p.accent;
      c.globalAlpha = 0.35;
      c.lineWidth = 6;
      for (let k = 0; k < 4; k++) {
        c.beginPath();
        for (let x = 0; x <= W; x += 10) c.lineTo(x, H - 150 + k * 34 + Math.sin(x / 90 + k) * 14);
        c.stroke();
      }
      break;
    }
    case 'rays': {
      c.globalAlpha = 0.14;
      c.fillStyle = p.accent;
      for (let i = 0; i < 12; i++) {
        c.beginPath();
        c.moveTo(W / 2, 330);
        const a = (i / 12) * Math.PI * 2;
        c.lineTo(W / 2 + Math.cos(a) * 900, 330 + Math.sin(a) * 900);
        c.lineTo(W / 2 + Math.cos(a + 0.14) * 900, 330 + Math.sin(a + 0.14) * 900);
        c.fill();
      }
      break;
    }
  }
  c.restore();
}

function star(c: CanvasRenderingContext2D, x: number, y: number, r: number) {
  c.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const rr = i % 2 ? r * 0.38 : r;
    c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  c.closePath();
  c.fill();
}
function diamond(c: CanvasRenderingContext2D, x: number, y: number, r: number) {
  c.beginPath();
  c.moveTo(x, y - r);
  c.lineTo(x + r, y);
  c.lineTo(x, y + r);
  c.lineTo(x - r, y);
  c.closePath();
  c.fill();
}

function drawQr(c: CanvasRenderingContext2D, value: string, x: number, y: number, size: number, dark: string) {
  const qr = qrcode(0, 'M');
  qr.addData(value);
  qr.make();
  const n = qr.getModuleCount();
  const cell = size / n;
  c.fillStyle = dark;
  for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (qr.isDark(r, k)) c.fillRect(x + k * cell, y + r * cell, cell + 0.5, cell + 0.5);
}

/** Draws the card. Resolves once the logo (if any) has loaded. */
export async function renderInvitation(input: InvitationInput): Promise<HTMLCanvasElement> {
  if (document.fonts?.ready) await document.fonts.ready;
  const p = palette(input);
  const brand = input.church.brand ?? DEFAULT_BRAND;
  const font = fontStack(p.font === 'inherit' ? brand.font : p.font);
  const body = fontStack(p.font === 'inherit' ? brand.font : p.font === 'elegant' || p.font === 'classic' ? 'classic' : 'modern');
  const logo = input.church.logoUrl ? await loadImage(input.church.logoUrl).catch(() => null) : null;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const c = canvas.getContext('2d')!;
  const g = c.createLinearGradient(0, 0, W * 0.6, H);
  g.addColorStop(0, p.bg[0]);
  g.addColorStop(1, p.bg[1]);
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  ornaments(c, p);

  // Header: logo beside the church name.
  let y = M + 10;
  const logoSize = 96;
  let x = M;
  if (logo) {
    c.save();
    roundRect(c, x, y, logoSize, logoSize, 20);
    c.fillStyle = '#ffffff';
    c.fill();
    c.clip();
    const s = Math.min(logoSize / logo.width, logoSize / logo.height) * 0.86;
    c.drawImage(logo, x + (logoSize - logo.width * s) / 2, y + (logoSize - logo.height * s) / 2, logo.width * s, logo.height * s);
    c.restore();
    x += logoSize + 24;
  }
  c.fillStyle = p.text;
  c.textBaseline = 'alphabetic';
  c.font = `700 ${logo ? 38 : 44}px ${font}`;
  const nameLines = wrap(c, input.church.name, W - x - M, 2);
  const tag = input.church.tagline?.trim();
  const nameTop = y + (logo ? (nameLines.length === 1 && !tag ? 62 : 44) : 52);
  nameLines.forEach((l, i) => c.fillText(l, x, nameTop + i * 44));
  if (tag) {
    c.font = `400 24px ${body}`;
    c.fillStyle = p.soft;
    c.fillText(wrap(c, tag, W - x - M, 1)[0], x, nameTop + nameLines.length * 44 - 6);
  }

  // Middle: headline, title, rule, when and where.
  y = 360;
  c.textAlign = 'center';
  c.fillStyle = p.accent;
  c.font = `600 26px ${body}`;
  c.fillText(input.headline.toUpperCase().split('').join(' '), W / 2, y);
  y += 40;
  c.fillStyle = p.text;
  const t = fitTitle(c, input.title, font, 92, 52, W - M * 2, 3);
  t.lines.forEach((l, i) => c.fillText(l, W / 2, y + t.size * 0.95 + i * t.size * 1.1));
  y += t.lines.length * t.size * 1.1 + 36;
  c.fillStyle = p.accent;
  c.fillRect(W / 2 - 60, y, 120, 5);
  y += 70;
  c.fillStyle = p.text;
  c.font = `600 44px ${font}`;
  c.fillText(input.date, W / 2, y);
  y += 56;
  c.font = `400 34px ${body}`;
  c.fillStyle = p.soft;
  if (input.time) {
    c.fillText(input.time, W / 2, y);
    y += 50;
  }
  if (input.place) {
    c.fillStyle = p.text;
    c.font = `500 34px ${body}`;
    wrap(c, input.place, W - M * 2, 2).forEach((l) => {
      c.fillText(l, W / 2, y);
      y += 44;
    });
  }
  if (input.message.trim()) {
    y += 26;
    c.fillStyle = p.soft;
    c.font = `400 30px ${body}`;
    wrap(c, input.message.trim(), W - M * 2 - 60, 4).forEach((l) => {
      c.fillText(l, W / 2, y);
      y += 42;
    });
  }

  // Footer: QR card on the right, host line on the left.
  const qrSize = 190;
  const cardPad = 22;
  const cardW = qrSize + cardPad * 2;
  const cardH = qrSize + cardPad * 2 + 40;
  const cardX = W - M - cardW;
  const cardY = H - M - cardH;
  if (input.link) {
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.18)';
    c.shadowBlur = 24;
    c.shadowOffsetY = 8;
    roundRect(c, cardX, cardY, cardW, cardH, 22);
    c.fillStyle = p.card;
    c.fill();
    c.restore();
    drawQr(c, input.link, cardX + cardPad, cardY + cardPad, qrSize, '#14211f');
    c.fillStyle = '#5b6b68';
    c.font = `600 20px ${body}`;
    c.textAlign = 'center';
    c.fillText(input.linkLabel, cardX + cardW / 2, cardY + cardH - 18);
  }
  c.textAlign = 'left';
  const hostW = (input.link ? cardX : W - M) - M - 30;
  let hy = H - M - 20;
  c.font = `400 26px ${body}`;
  c.fillStyle = p.soft;
  const hostLines = wrap(c, input.host, hostW, 3).reverse();
  hostLines.forEach((l) => {
    c.fillText(l, M, hy);
    hy -= 36;
  });
  if (input.church.phone) {
    c.font = `400 24px ${body}`;
    c.fillText(input.church.phone, M, hy);
  }
  return canvas;
}

export const cardBlob = (canvas: HTMLCanvasElement) => new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Could not draw the card'))), 'image/png'));

/** Shares the card with the phone's share sheet (WhatsApp, etc.) when the browser can, else downloads it. */
export async function shareCard(canvas: HTMLCanvasElement, fileName: string, text: string): Promise<'shared' | 'downloaded'> {
  const blob = await cardBlob(canvas);
  const file = new File([blob], fileName, { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], text });
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'shared';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}

export const whatsappLink = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;
