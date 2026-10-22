// Songs and PDFs, both ways, all in the browser.
//  - readSongPdf: pulls the text out of a PDF with pdf.js, keeping each word's column so chords stay
//    over the right syllable, then songfile.ts turns it into the app's chart.
//  - songsToPdf: draws chord sheets on a canvas (so Telugu, Hindi, Tamil and every other script prints
//    exactly as on screen) and wraps the pages in a PDF. The song itself is saved inside the PDF too,
//    so importing a Flockwise PDF gives back the exact song.
import { flatKey, transposeChord, toNashville, transposeKey } from './chords';
import { isChord, parseSongText, sectionName, type ParsedSong } from './songfile';
import type { SongColours } from '@/core/types';
import { DEFAULT_COLOURS, hasColours } from './song-colours';

export type SheetSong = { title: string; author?: string; defaultKey?: string; bpm?: number | null; ccli?: string; chordChart?: string; lyrics?: string; lyricsAlt?: string; colours?: SongColours };
export type SheetOptions = { steps?: number; capo?: number; mode?: 'chords' | 'numbers' | 'lyrics'; church?: string };
export type SheetItem = { song: SheetSong; options?: SheetOptions; label?: string };

const MARK = 'FlockwiseSongs';

// ---------- reading ----------

type TextItem = { str: string; transform: number[]; width: number; height: number };

/** Lines of a PDF page, with words placed at their columns. */
function pageLines(items: TextItem[]): string[] {
  const words = items.filter((i) => i.str.trim()).map((i) => ({ s: i.str, x: i.transform[4], y: i.transform[5], w: i.width, size: Math.abs(i.transform[3]) || i.height || 10 }));
  if (!words.length) return [];
  // One column's width: the average character width of the longer runs of text on the page.
  const long = words.filter((w) => w.s.trim().length >= 4 && w.w > 0);
  const charW = (long.length ? long : words).reduce((n, w) => n + w.w, 0) / Math.max(1, (long.length ? long : words).reduce((n, w) => n + w.s.length, 0)) || 5;
  const minX = Math.min(...words.map((w) => w.x));
  const rows: { y: number; size: number; items: typeof words }[] = [];
  for (const w of words.sort((a, b) => b.y - a.y || a.x - b.x)) {
    const row = rows.find((r) => Math.abs(r.y - w.y) <= Math.max(2, r.size * 0.35));
    if (row) row.items.push(w);
    else rows.push({ y: w.y, size: w.size, items: [w] });
  }
  rows.sort((a, b) => b.y - a.y);
  const out: string[] = [];
  let lastY: number | null = null;
  let lastSize = 10;
  for (const r of rows) {
    // A bigger gap than usual between rows is a blank line (a new section).
    if (lastY !== null && lastY - r.y > Math.max(r.size, lastSize) * 2.1) out.push('');
    let line = '';
    for (const w of r.items.sort((a, b) => a.x - b.x)) {
      const col = Math.round((w.x - minX) / charW);
      if (col > line.length) line = line.padEnd(col, ' ');
      else if (line && !line.endsWith(' ') && !w.s.startsWith(' ')) line += w.s.length > 1 || /\w/.test(line.at(-1)!) ? '' : ' ';
      line += w.s;
    }
    out.push(line.replace(/\s+$/, ''));
    lastY = r.y;
    lastSize = r.size;
  }
  return out;
}

async function pdfjs() {
  const lib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const worker = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default;
  lib.GlobalWorkerOptions.workerSrc = worker;
  return lib;
}

export type PdfImport = { songs: ParsedSong[]; fromFlockwise: boolean; scanned: boolean; pages: number };

/** Reads a song PDF. A PDF made by Flockwise gives back its songs exactly; any other is read as text. */
export async function readSongPdf(file: File): Promise<PdfImport> {
  const lib = await pdfjs();
  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  try {
    const meta = await doc.getMetadata().catch(() => null);
    const custom = (meta?.info as { Custom?: Record<string, unknown> } | undefined)?.Custom?.[MARK];
    if (typeof custom === 'string') {
      try {
        const songs = JSON.parse(custom) as SheetSong[];
        return { songs: songs.map((s) => ({ ...parseSongText(''), title: s.title, author: s.author ?? '', key: s.defaultKey ?? '', bpm: s.bpm ?? null, ccli: s.ccli ?? '', chordChart: s.chordChart ?? '', lyrics: s.lyrics ?? '', warnings: [] })), fromFlockwise: true, scanned: false, pages: doc.numPages };
      } catch {
        /* fall back to reading the text */
      }
    }
    const lines: string[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      const pl = pageLines(tc.items as TextItem[]);
      // Drop a footer that repeats a page number, e.g. "Page 2 of 3" or "2".
      while (pl.length && /^\s*(page\s*)?\d+(\s*(of|\/)\s*\d+)?\s*$/i.test(pl.at(-1)!)) pl.pop();
      if (p > 1) lines.push('');
      lines.push(...pl);
    }
    const text = lines.join('\n');
    if (text.replace(/\s/g, '').length < 20) return { songs: [], fromFlockwise: false, scanned: true, pages: doc.numPages };
    return { songs: [parseSongText(text, file.name)], fromFlockwise: false, scanned: false, pages: doc.numPages };
  } finally {
    void doc.destroy();
  }
}

/** Any song file: PDF, ChordPro (.cho, .chopro, .pro, .chordpro, .crd), OnSong or plain text. */
export async function readSongFile(file: File): Promise<PdfImport> {
  if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') return readSongPdf(file);
  const text = await file.text();
  return { songs: [parseSongText(text, file.name)], fromFlockwise: false, scanned: false, pages: 1 };
}

// ---------- drawing ----------

const PAGE_W = 1240; // A4 at 150 dpi
const PAGE_H = 1754;
const MARGIN = 96;
const FONT = '"Noto Sans", "Segoe UI", system-ui, -apple-system, Roboto, sans-serif';
// The song's own chart colours, set by drawSong before a song's pages are drawn.
let PAPER = '#ffffff';
let INK = '#14211f';
let MUTED = '#5b6b68';
let ACCENT = '#1f6b5c';
let CHORD = '#b5650d';
let TINT = '#e3efec';
let RULE = '#dde5e3';
function usePalette(c?: SongColours) {
  const has = hasColours(c);
  PAPER = c?.background || DEFAULT_COLOURS.background;
  INK = c?.lyrics || DEFAULT_COLOURS.lyrics;
  ACCENT = c?.headings || DEFAULT_COLOURS.headings;
  CHORD = c?.chords || DEFAULT_COLOURS.chords;
  MUTED = has ? `${INK}b3` : '#5b6b68';
  TINT = has ? `${ACCENT}26` : '#e3efec';
  RULE = has ? `${INK}33` : '#dde5e3';
}

type Seg = { chord: string | null; text: string };
type Row = { kind: 'section'; text: string } | { kind: 'line'; segs: Seg[]; chords: boolean } | { kind: 'gap' };

function rowsFor(song: SheetSong, o: SheetOptions): Row[] {
  const key = song.defaultKey || 'C';
  const chart = o.mode !== 'lyrics' && song.chordChart?.trim() ? song.chordChart : null;
  const source = chart ?? song.lyrics ?? '';
  const rows: Row[] = [];
  for (const raw of source.split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (/^\s*\{(title|t|artist|key|tempo|ccli|capo|time)\b/i.test(line)) continue;
    const bracket = /^\s*\[([^\]]+)\]\s*$/.exec(line);
    const section = bracket && !isChord(bracket[1]) ? bracket[1] : !chart || !line.includes('[') ? sectionName(line) : null;
    if (section || (bracket && !isChord(bracket[1]))) {
      rows.push({ kind: 'section', text: section ?? bracket![1] });
      continue;
    }
    if (/^\s*\{.*\}\s*$/.test(line)) {
      const d = /^\s*\{\s*\w+\s*:?\s*(.*?)\s*\}\s*$/.exec(line);
      if (d?.[1]) rows.push({ kind: 'section', text: d[1] });
      continue;
    }
    if (!line.trim()) {
      rows.push({ kind: 'gap' });
      continue;
    }
    const segs: Seg[] = [];
    let pending: string | null = null;
    for (const part of (chart ? line.split(/(\[[^\]]+\])/) : [line])) {
      const m = /^\[([^\]]+)\]$/.exec(part);
      if (m && isChord(m[1])) {
        if (pending !== null) segs.push({ chord: pending, text: '' });
        pending = o.mode === 'numbers' ? toNashville(m[1], key) : transposeChord(m[1], (o.steps ?? 0) - (o.capo ?? 0), (o.steps ?? 0) - (o.capo ?? 0) ? flatKey(transposeKey(key, (o.steps ?? 0) - (o.capo ?? 0))) : undefined);
      } else if (part) {
        segs.push({ chord: pending, text: part });
        pending = null;
      }
    }
    if (pending !== null) segs.push({ chord: pending, text: '' });
    rows.push({ kind: 'line', segs, chords: segs.some((s) => s.chord) });
  }
  while (rows.length && rows.at(-1)!.kind === 'gap') rows.pop();
  while (rows.length && rows[0].kind === 'gap') rows.shift();
  return rows;
}

type Placed = { draw: (ctx: CanvasRenderingContext2D, y: number) => void; h: number; keepWithNext?: boolean };

function layout(ctx: CanvasRenderingContext2D, rows: Row[], scale: number): Placed[] {
  const lyric = Math.round(30 * scale);
  const chordSize = Math.round(26 * scale);
  const width = PAGE_W - MARGIN * 2;
  const out: Placed[] = [];
  for (const r of rows) {
    if (r.kind === 'gap') {
      out.push({ h: Math.round(lyric * 0.7), draw: () => undefined });
      continue;
    }
    if (r.kind === 'section') {
      const size = Math.round(24 * scale);
      out.push({
        h: size + Math.round(16 * scale),
        keepWithNext: true,
        draw: (c, y) => {
          c.font = `700 ${size}px ${FONT}`;
          c.fillStyle = ACCENT;
          c.fillText(r.text.toUpperCase(), MARGIN, y + size);
        },
      });
      continue;
    }
    // Place chords above their syllables; when a chord is wider than its words, open a gap in the words.
    const place = (fit: number) => {
      ctx.font = `600 ${Math.round(chordSize * fit)}px ${FONT}`;
      const cw = (s: string) => ctx.measureText(s).width;
      ctx.font = `400 ${Math.round(lyric * fit)}px ${FONT}`;
      const lw = (s: string) => ctx.measureText(s).width;
      let x = 0;
      let chordEnd = -Infinity;
      const items: { x: number; chord: string | null; cx: number; text: string }[] = [];
      for (const s of r.segs) {
        let cx = x;
        if (s.chord) {
          if (cx < chordEnd + 14 * fit) {
            cx = chordEnd + 14 * fit;
            x = cx;
          }
          chordEnd = cx + cw(s.chord);
        }
        items.push({ x, chord: s.chord, cx, text: s.text });
        x += lw(s.text);
      }
      return { items, w: Math.max(x, chordEnd) };
    };
    let fit = 1;
    let p = place(1);
    while (p.w > width && fit > 0.6) {
      fit -= 0.05;
      p = place(fit);
    }
    const ls = Math.round(lyric * fit);
    const cs = Math.round(chordSize * fit);
    const chordRow = r.chords ? Math.round(cs * 1.15) : 0;
    const placed = p;
    out.push({
      h: chordRow + Math.round(ls * 1.35),
      draw: (c, y) => {
        if (r.chords) {
          c.font = `600 ${cs}px ${FONT}`;
          c.fillStyle = CHORD;
          for (const it of placed.items) if (it.chord) c.fillText(it.chord, MARGIN + it.cx, y + cs);
        }
        c.font = `400 ${ls}px ${FONT}`;
        c.fillStyle = INK;
        for (const it of placed.items) if (it.text) c.fillText(it.text, MARGIN + it.x, y + chordRow + ls);
      },
    });
  }
  return out;
}

function header(c: CanvasRenderingContext2D, song: SheetSong, o: SheetOptions, label: string | undefined, first: boolean) {
  const key = transposeKey(song.defaultKey || '', o.steps ?? 0);
  if (!first) {
    c.font = `600 22px ${FONT}`;
    c.fillStyle = MUTED;
    c.fillText(`${song.title} (continued)`, MARGIN, MARGIN + 22);
    return MARGIN + 52;
  }
  let y = MARGIN;
  if (label) {
    c.font = `600 20px ${FONT}`;
    c.fillStyle = ACCENT;
    c.fillText(label.toUpperCase(), MARGIN, y + 20);
    y += 34;
  }
  c.font = `700 52px ${FONT}`;
  c.fillStyle = INK;
  c.fillText(song.title, MARGIN, y + 50);
  // Key box on the right.
  if (key && o.mode !== 'lyrics') {
    const text = o.capo ? `Key ${key} · Capo ${o.capo}` : `Key ${key}`;
    c.font = `700 26px ${FONT}`;
    const w = c.measureText(text).width + 32;
    c.fillStyle = TINT;
    c.beginPath();
    c.roundRect(PAGE_W - MARGIN - w, y + 10, w, 48, 10);
    c.fill();
    c.fillStyle = ACCENT;
    c.fillText(text, PAGE_W - MARGIN - w + 16, y + 44);
  }
  y += 70;
  const sub = [song.author, song.bpm ? `${song.bpm} bpm` : '', o.mode === 'numbers' ? 'Nashville numbers' : ''].filter(Boolean).join('  ·  ');
  if (sub) {
    c.font = `400 24px ${FONT}`;
    c.fillStyle = MUTED;
    c.fillText(sub, MARGIN, y + 22);
    y += 36;
  }
  c.fillStyle = RULE;
  c.fillRect(MARGIN, y + 12, PAGE_W - MARGIN * 2, 2);
  return y + 40;
}

function footer(c: CanvasRenderingContext2D, song: SheetSong, o: SheetOptions, page: number, pages: number) {
  c.font = `400 18px ${FONT}`;
  c.fillStyle = MUTED;
  const left = [song.ccli ? `CCLI Song # ${song.ccli}` : '', o.church].filter(Boolean).join('  ·  ');
  c.fillText(left, MARGIN, PAGE_H - 56);
  const right = pages > 1 ? `Page ${page} of ${pages}  ·  Flockwise` : 'Flockwise';
  c.fillText(right, PAGE_W - MARGIN - c.measureText(right).width, PAGE_H - 56);
}

/** Draws one song onto as few A4 pages as it fits, shrinking the text a little before adding a page. */
function drawSong(item: SheetItem): HTMLCanvasElement[] {
  const o = item.options ?? {};
  usePalette(item.song.colours);
  const probe = document.createElement('canvas').getContext('2d')!;
  const rows = rowsFor(item.song, o);
  const top = MARGIN + (item.label ? 34 : 0) + 70 + 36 + 40;
  const room = PAGE_H - top - 110;
  let placed = layout(probe, rows, 1);
  for (const s of [0.92, 0.85, 0.78]) {
    if (placed.reduce((n, p) => n + p.h, 0) <= room) break;
    placed = layout(probe, rows, s);
  }
  // Break into pages, keeping a section heading with its first line.
  const pages: Placed[][] = [[]];
  let used = 0;
  let limit = room;
  placed.forEach((p, i) => {
    const need = p.h + (p.keepWithNext && placed[i + 1] ? placed[i + 1].h : 0);
    if (used + need > limit && pages.at(-1)!.length) {
      pages.push([]);
      used = 0;
      limit = PAGE_H - (MARGIN + 52) - 110;
    }
    if (!pages.at(-1)!.length && p.h < 40 && !p.keepWithNext && p.draw.length === 0) return; // no blank gap at a page top
    pages.at(-1)!.push(p);
    used += p.h;
  });
  return pages.map((rowsOnPage, i) => {
    const canvas = document.createElement('canvas');
    canvas.width = PAGE_W;
    canvas.height = PAGE_H;
    const c = canvas.getContext('2d')!;
    c.fillStyle = PAPER;
    c.fillRect(0, 0, PAGE_W, PAGE_H);
    let y = header(c, item.song, o, item.label, i === 0);
    if (!rows.length) {
      c.font = `400 26px ${FONT}`;
      c.fillStyle = MUTED;
      c.fillText('No chords or lyrics saved for this song yet.', MARGIN, y + 30);
    }
    for (const p of rowsOnPage) {
      p.draw(c, y);
      y += p.h;
    }
    footer(c, item.song, o, i + 1, pages.length);
    return canvas;
  });
}

/** Pages for a preview on screen. */
export const songPages = (item: SheetItem) => drawSong(item);

// ---------- writing the PDF ----------

const enc = new TextEncoder();
const hexUtf16 = (s: string) => {
  let h = 'FEFF';
  for (let i = 0; i < s.length; i++) h += s.charCodeAt(i).toString(16).padStart(4, '0').toUpperCase();
  return `<${h}>`;
};

/** A PDF of JPEG pages, A4, with the songs saved in the document info for re-import. */
async function buildPdf(canvases: HTMLCanvasElement[], title: string, songs: SheetSong[]): Promise<Blob> {
  const images = await Promise.all(canvases.map((cv) => new Promise<Uint8Array>((res, rej) => cv.toBlob((b) => (b ? b.arrayBuffer().then((a) => res(new Uint8Array(a)), rej) : rej(new Error('Could not draw the page'))), 'image/jpeg', 0.86))));
  const chunks: (string | Uint8Array)[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (p: string | Uint8Array) => {
    chunks.push(p);
    length += typeof p === 'string' ? enc.encode(p).length : p.length;
  };
  const obj = (n: number, body: string | (string | Uint8Array)[]) => {
    offsets[n] = length;
    push(`${n} 0 obj\n`);
    for (const p of Array.isArray(body) ? body : [body]) push(p);
    push('\nendobj\n');
  };
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  const n = images.length;
  // 1 catalog, 2 pages, 3 info; then per page: page, content, image.
  const pageIds = images.map((_, i) => 4 + i * 3);
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Count ${n} /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] >>`);
  const data = JSON.stringify(songs.map((s) => ({ title: s.title, author: s.author ?? '', defaultKey: s.defaultKey ?? '', bpm: s.bpm ?? null, ccli: s.ccli ?? '', chordChart: s.chordChart ?? '', lyrics: s.lyrics ?? '' })));
  obj(3, `<< /Title ${hexUtf16(title)} /Producer (Flockwise) /Creator (Flockwise) /${MARK} ${hexUtf16(data)} >>`);
  const W = 595.28;
  const H = 841.89;
  images.forEach((img, i) => {
    const id = pageIds[i];
    const content = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;
    obj(id, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 ${id + 2} 0 R >> >> /Contents ${id + 1} 0 R >>`);
    obj(id + 1, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    obj(id + 2, [`<< /Type /XObject /Subtype /Image /Width ${PAGE_W} /Height ${PAGE_H} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.length} >>\nstream\n`, img, '\nendstream']);
  });
  const xref = length;
  const count = 4 + n * 3;
  let table = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let i = 1; i < count; i++) table += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  push(`${table}trailer\n<< /Size ${count} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(chunks.map((c) => (typeof c === 'string' ? enc.encode(c) : c)) as BlobPart[], { type: 'application/pdf' });
}

/** Chord sheets as one PDF: a single song, or a whole service's songs in their keys. */
export async function songsToPdf(items: SheetItem[], title: string): Promise<Blob> {
  if (document.fonts?.ready) await document.fonts.ready;
  const pages = items.flatMap((it) => drawSong(it));
  return buildPdf(pages, title, items.map((it) => ({ ...it.song, defaultKey: transposeKey(it.song.defaultKey ?? '', it.options?.steps ?? 0), chordChart: it.song.chordChart ? it.song.chordChart.replace(/\[([^\]]+)\]/g, (all, c: string) => (isChord(c) && it.options?.steps ? `[${transposeChord(c, it.options.steps, flatKey(transposeKey(it.song.defaultKey ?? 'C', it.options.steps)))}]` : all)) : '' })));
}

export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export const fileSafe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'song';
