// Song files in and out of Flockwise. Reads ChordPro, "chords over lyrics" text (the usual PDF and
// WhatsApp format) and plain lyrics, and turns them into the app's chart: chords in [brackets] before
// the syllable, sections as [Verse 1] lines. Also writes ChordPro back out. No browser APIs here, so
// it can be tested on its own; PDF reading and writing live in pdf-songs.ts.
import { flatKey, transposeChord, transposeKey } from './chords';

export type ParsedSong = { title: string; author: string; key: string; bpm: number | null; ccli: string; chordChart: string; lyrics: string; warnings: string[] };

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NOTES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const FLAT_KEYS = new Set(['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Dm', 'Gm', 'Cm', 'Fm', 'Bbm', 'Ebm']);
const noteIndex = (n: string) => (NOTES.indexOf(n) >= 0 ? NOTES.indexOf(n) : FLAT_NOTES.indexOf(n));

/** A chord symbol such as G, F#m7, Cmaj7, Dsus4, Bb/D, Em7(add11), A2, C#dim. */
export const CHORD_RE = /^[A-G][#b♯♭]?(?:m(?!aj)|min|maj|M|dim|aug|sus|add|°|ø|\+|-)?(?:\d{1,2})?(?:(?:sus|add|maj|M|b|#|no)\d{1,2}|sus)*(?:\([^)]{1,8}\))?(?:\/[A-G][#b♯♭]?)?$/;
const FILLER_RE = /^(?:\||\|\||\/|-|–|x\d+|\(x?\d+x?\)|N\.?C\.?|\.{2,}|%|:\|\|?|\|\|?:)$/i;
const SECTION_WORDS = 'verse|chorus|refrain|bridge|pre-?chorus|intro|outro|tag|interlude|ending|instrumental|vamp|coda|turnaround|hook|breakdown|post-?chorus|stanza|pallavi|anupallavi|charanam|charanams';
const SECTION_RE = new RegExp(`^(?:(?:${SECTION_WORDS})(?:\\s*\\d+[a-z]?)?(?:\\s*\\(.*\\))?|\\d+\\.?)$`, 'i');
const META_RE = /^(title|artist|author|writer|words(?: and music)?(?: by)?|music(?: by)?|key|tempo|bpm|time|ccli(?: song)?(?: #| no\.?| number)?|capo|copyright)\s*[:#.-]\s*(.+)$/i;

const normChord = (c: string) => c.replace(/♯/g, '#').replace(/♭/g, 'b');
export const isChord = (t: string) => CHORD_RE.test(normChord(t));
const isFiller = (t: string) => FILLER_RE.test(t);

/** A line made only of chords (and bar lines, repeat marks), with at least one chord. */
export function isChordLine(line: string) {
  const tokens = line.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return false;
  let chords = 0;
  for (const t of tokens) {
    const bare = t.replace(/^[([]+|[)\],]+$/g, '');
    if (isChord(bare)) chords++;
    else if (!isFiller(t) && !isFiller(bare)) return false;
  }
  // "A" alone could be a word; a single short token counts only if it clearly is a chord.
  if (chords === 1 && tokens.length === 1 && /^(A|I)$/.test(tokens[0])) return false;
  return chords > 0;
}

/** "Verse 1", "CHORUS:", "[Bridge]", "{c: Chorus}", "{soc}" become a clean section name. */
export function sectionName(line: string): string | null {
  const t = line.trim();
  const directive = /^\{\s*(comment_italic|comment_box|comment|ci|cb|c|start_of_(\w+)|so(c|v|b|t))\s*:?\s*(.*?)\s*\}$/i.exec(t);
  if (directive) {
    if (directive[4]) return tidySection(directive[4]);
    const kind = (directive[2] ?? { c: 'chorus', v: 'verse', b: 'bridge', t: 'tab' }[directive[3]?.toLowerCase() ?? ''] ?? '').toLowerCase();
    return kind && kind !== 'tab' ? tidySection(kind) : null;
  }
  const bare = t.replace(/^\[|\]$/g, '').replace(/[:.]$/, '').trim();
  if (bare.length > 40) return null;
  if (SECTION_RE.test(bare) && !/^\d+\.?$/.test(bare)) return tidySection(bare);
  return null;
}

function tidySection(s: string) {
  const t = s.trim().replace(/[:.]$/, '').toLowerCase().replace(/\s+/g, ' ');
  return t.replace(/(^|[\s-])([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase()).replace(/^Pre-?chorus/i, 'Pre-Chorus');
}

/** Puts the chords of a chord line into the lyric line below it, at the same columns. */
export function mergeChordLine(chordLine: string, lyric: string) {
  const marks: { col: number; chord: string }[] = [];
  const re = /\S+/g;
  for (let m = re.exec(chordLine); m; m = re.exec(chordLine)) {
    const bare = m[0].replace(/^[([]+|[)\],]+$/g, '');
    if (isChord(bare)) marks.push({ col: m.index + m[0].indexOf(bare), chord: normChord(bare) });
  }
  if (!lyric.trim()) return marks.map((x) => `[${x.chord}]`).join(' ');
  let out = '';
  let pos = 0;
  let vis = 0;
  const text = lyric.replace(/\s+$/, '');
  for (const { col, chord } of marks) {
    if (col >= text.length && pos >= text.length) {
      // Past the end of the words: keep the gap so the chord still lands after them.
      out += ' '.repeat(Math.max(1, col - vis)) + `[${chord}]`;
      vis = Math.max(vis + 1, col);
      continue;
    }
    const to = Math.min(col, text.length);
    out += text.slice(pos, to);
    vis += to - pos;
    pos = to;
    if (col > text.length) out += ' '.repeat(Math.max(1, col - vis)), (vis = col);
    out += `[${chord}]`;
  }
  return (out + text.slice(pos)).replace(/\s+$/, '');
}

/** True when the text already uses inline [chords] or {directives}. */
export function looksLikeChordPro(text: string) {
  const lines = text.split('\n');
  const inline = lines.filter((l) => /\[[A-G][^\]\s]{0,10}\]\S|\S\[[A-G][^\]\s]{0,10}\]/.test(l) || /^\s*\[[A-G][^\]\s]{0,10}\]\s*\w/.test(l)).length;
  const directives = lines.filter((l) => /^\s*\{\s*(title|t|artist|key|start_of_\w+|soc|sov|c|comment)\b/i.test(l)).length;
  return inline >= 2 || directives >= 2;
}

/** Keys a set of chords fits best: the most chords in the scale, with a nudge for the first and last chord. */
export function guessKey(chords: string[]): string {
  if (!chords.length) return '';
  const roots = chords.map((c) => {
    const m = /^([A-G][#b]?)(m(?!aj))?/.exec(normChord(c));
    return m ? { i: noteIndex(m[1]), minor: !!m[2] } : null;
  }).filter((x): x is { i: number; minor: boolean } => !!x && x.i >= 0);
  if (!roots.length) return '';
  let best = { score: -1, key: '' };
  for (let k = 0; k < 12; k++) {
    // Major key: I ii iii IV V vi (minor chords on 2, 3, 6).
    const majors = [0, 5, 7].map((d) => (k + d) % 12);
    const minors = [2, 4, 9].map((d) => (k + d) % 12);
    let score = 0;
    for (const r of roots) score += (r.minor ? minors : majors).includes(r.i) ? 2 : (r.minor ? majors : minors).includes(r.i) ? 0.5 : 0;
    if (!roots[0].minor && roots[0].i === k) score += 2;
    if (!roots.at(-1)!.minor && roots.at(-1)!.i === k) score += 1.5;
    // A song that starts and ends on the vi chord is usually in that minor key.
    if (score > best.score) best = { score, key: (FLAT_KEYS.has(FLAT_NOTES[k]) ? FLAT_NOTES : NOTES)[k] };
  }
  const first = roots[0];
  if (first.minor && roots.at(-1)!.minor && roots.at(-1)!.i === first.i && (first.i - noteIndex(best.key) + 12) % 12 === 9) return `${NOTES[first.i]}m`;
  return best.key;
}

/** Chords used in a chart, in order of first use. */
export const chartChords = (chart: string) => [...new Set([...chart.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1]).filter(isChord))];

/** The chords that belong to a key, for the editor's palette. */
export function keyChords(key: string): { label: string; chords: string[] }[] {
  const m = /^([A-G][#b]?)(m)?$/.exec(key.trim());
  if (!m) return keyChords('G');
  const minor = !!m[2];
  const root = noteIndex(m[1]);
  const flat = FLAT_KEYS.has(key.trim()) || m[1].includes('b');
  const n = (d: number) => (flat ? FLAT_NOTES : NOTES)[(root + d + 12) % 12];
  if (minor) {
    return [
      { label: 'In the key', chords: [`${n(0)}m`, `${n(2)}dim`, n(3), `${n(5)}m`, `${n(7)}m`, n(8), n(10)] },
      { label: 'Colour', chords: [n(7), `${n(7)}7`, `${n(0)}m7`, `${n(5)}m7`, `${n(3)}maj7`, `${n(10)}sus4`, `${n(3)}/${n(7)}`] },
    ];
  }
  return [
    { label: 'In the key', chords: [n(0), `${n(2)}m`, `${n(4)}m`, n(5), n(7), `${n(9)}m`, `${n(11)}dim`] },
    { label: 'Colour', chords: [`${n(0)}2`, `${n(0)}/${n(4)}`, `${n(5)}2`, `${n(7)}sus4`, `${n(7)}/${n(11)}`, `${n(9)}m7`, `${n(2)}m7`, `${n(0)}maj7`, `${n(5)}maj7`, `${n(7)}7`, n(10), `${n(2)}`] },
  ];
}

/** Moves every chord in a chart up or down, for saving the song in a new key. */
export function transposeChart(chart: string, steps: number, fromKey?: string) {
  if (!steps) return chart;
  const flats = fromKey ? flatKey(transposeKey(fromKey, steps)) : undefined;
  return chart.replace(/\[([^\]]+)\]/g, (all, c: string) => (isChord(c) ? `[${transposeChord(c, steps, flats)}]` : all));
}
export { transposeKey };

/** Plain lyrics from a chart: chords removed, sections kept as headings for the projector. */
export function chartToLyrics(chart: string) {
  const out: string[] = [];
  for (const raw of chart.split('\n')) {
    const line = raw.trimEnd();
    if (/^\s*\{(title|t|artist|key|tempo|ccli|capo|time|subtitle|st)\b/i.test(line)) continue;
    const section = sectionName(line);
    if (section) {
      if (out.length && out.at(-1) !== '') out.push('');
      out.push(section);
      continue;
    }
    if (/^\s*\{.*\}\s*$/.test(line)) continue;
    const words = line.replace(/\[[^\]]*\]/g, '').replace(/\s{2,}/g, ' ').trim();
    // A line of only chords (an instrumental) has no words for the projector.
    if (!words && line.includes('[')) continue;
    out.push(words);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Song body text in any layout (ChordPro or chords over lyrics) as the app's chart. */
export function toChart(text: string): string {
  const body = text.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n').map((l) => l.replace(/\s+$/, ''));
  let chart: string;
  if (looksLikeChordPro(body.join('\n'))) {
    chart = body.map((l) => {
      const s = sectionName(l);
      return s ? `[${s}]` : l.replace(/\[([^\]]+)\]/g, (all, c: string) => (isChord(c) ? `[${normChord(c)}]` : sectionName(c) ? `[${sectionName(c)}]` : all));
    }).join('\n');
  } else {
    const out: string[] = [];
    for (let i = 0; i < body.length; i++) {
      const line = body[i];
      const s = sectionName(line);
      if (s) {
        if (out.length && out.at(-1) !== '') out.push('');
        out.push(`[${s}]`);
        continue;
      }
      if (isChordLine(line)) {
        const next = body[i + 1];
        if (next !== undefined && next.trim() && !isChordLine(next) && !sectionName(next)) {
          out.push(mergeChordLine(line, next));
          i++;
        } else out.push(mergeChordLine(line, ''));
        continue;
      }
      out.push(line.trim() ? line.replace(/^\s{1,12}/, '') : '');
    }
    chart = out.join('\n');
  }
  return chart.replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Reads song text in any of the usual layouts and returns it in the app's format. The text may
 * come from a PDF, a .cho/.chopro/.txt file, or something pasted from WhatsApp or a website.
 */
export function parseSongText(input: string, fileName = ''): ParsedSong {
  const warnings: string[] = [];
  const text = input.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').replace(/ /g, ' ');
  const meta: Record<string, string> = {};
  const body: string[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\s+$/, '');
    const d = /^\s*\{\s*(title|t|subtitle|st|artist|author|composer|key|tempo|ccli|copyright|capo|time)\s*:\s*(.*?)\s*\}\s*$/i.exec(line);
    if (d) {
      const k = { t: 'title', st: 'subtitle', author: 'artist', composer: 'artist' }[d[1].toLowerCase()] ?? d[1].toLowerCase();
      meta[k] ??= d[2];
      continue;
    }
    // "Key: G   Tempo: 72 | CCLI 12345" can hold several labels on one line.
    const parts = line.trim().split(/\s{2,}|\s+\|\s+|\s+·\s+/);
    const found = isChordLine(line) ? [] : parts.map((p) => META_RE.exec(p.trim()));
    if (found.length && found.every(Boolean)) {
      for (const m of found as RegExpExecArray[]) {
        const k = m[1].toLowerCase();
        const key = k.startsWith('ccli') ? 'ccli' : /artist|author|writer|words|music/.test(k) ? 'artist' : k === 'bpm' ? 'tempo' : k;
        meta[key] ??= m[2].trim();
      }
      continue;
    }
    body.push(line);
  }
  while (body.length && !body[0].trim()) body.shift();

  // Title: a directive, else the first line when it isn't a section, chord or lyric-looking line.
  let title = meta.title ?? '';
  const plain = (l: string | undefined) => l !== undefined && !!l.trim() && !sectionName(l) && !isChordLine(l) && l.trim().length <= 60;
  const breakAfter = (l: string | undefined) => l === undefined || !l.trim() || isChordLine(l) || !!sectionName(l);
  if (!title && plain(body[0])) {
    if (breakAfter(body[1])) title = body.shift()!.trim();
    else if (plain(body[1]) && body[1].trim().length <= 50 && breakAfter(body[2])) {
      // Title, then the writer on the next line.
      title = body.shift()!.trim();
      meta.artist ??= body.shift()!.trim().replace(/^(by|words and music by|written by)\s+/i, '');
    }
  }
  while (body.length && !body[0].trim()) body.shift();
  if (!title) title = fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();

  let chart = toChart(body.join('\n'));
  chart = chart.replace(/\n{3,}/g, '\n\n').trim();
  const chords = chartChords(chart);
  const keyMeta = /^[A-G][#b]?m?\b/.exec(normChord(meta.key ?? ''))?.[0] ?? '';
  const key = keyMeta || guessKey(chords);
  if (!chords.length) warnings.push('No chords found. Saved as lyrics only.');
  else if (!keyMeta) warnings.push(`Key guessed from the chords: ${key}. Check it.`);
  if (!title) warnings.push('No title found.');
  const bpm = Number(/\d{2,3}/.exec(meta.tempo ?? '')?.[0]) || null;
  return {
    title: title.slice(0, 120),
    author: (meta.artist ?? '').slice(0, 120),
    key,
    bpm,
    ccli: /\d{3,}/.exec(meta.ccli ?? '')?.[0] ?? '',
    chordChart: chords.length ? chart : '',
    lyrics: chartToLyrics(chart),
    warnings,
  };
}

/** A song as a ChordPro file that OnSong, SongSelect, Planning Center and most chord apps read. */
export function toChordPro(song: { title: string; author?: string; defaultKey?: string; bpm?: number | null; ccli?: string; chordChart?: string; lyrics?: string }, steps = 0) {
  const head = [`{title: ${song.title}}`];
  if (song.author) head.push(`{artist: ${song.author}}`);
  if (song.defaultKey) head.push(`{key: ${transposeKey(song.defaultKey, steps)}}`);
  if (song.bpm) head.push(`{tempo: ${song.bpm}}`);
  if (song.ccli) head.push(`{ccli: ${song.ccli}}`);
  const chart = song.chordChart?.trim() ? transposeChart(song.chordChart, steps, song.defaultKey) : (song.lyrics ?? '');
  const body = chart.split('\n').map((l) => {
    const s = /^\s*\[([^\]]+)\]\s*$/.test(l) && !isChord(l.trim().slice(1, -1)) ? sectionName(l) : song.chordChart?.trim() ? null : sectionName(l);
    return s ? `{comment: ${s}}` : l;
  });
  return `${head.join('\n')}\n\n${body.join('\n')}\n`;
}

/** Chords above lyrics, as plain text (for WhatsApp or a text file). */
export function toChordsOverLyrics(chart: string, steps = 0, key?: string) {
  const out: string[] = [];
  for (const line of transposeChart(chart, steps, key).split('\n')) {
    const s = /^\s*\[([^\]]+)\]\s*$/.exec(line);
    if (s && !isChord(s[1])) {
      out.push(s[1].toUpperCase());
      continue;
    }
    if (!line.includes('[')) {
      out.push(line);
      continue;
    }
    let chords = '';
    let words = '';
    for (const part of line.split(/(\[[^\]]+\])/)) {
      const m = /^\[([^\]]+)\]$/.exec(part);
      if (m) {
        if (chords.length > words.length) words = words.padEnd(chords.length, ' ');
        chords = chords.padEnd(words.length, ' ') + m[1] + ' ';
      } else words += part;
    }
    out.push(chords.trimEnd(), words.trimEnd());
  }
  return out.join('\n');
}

/** Semitones from one key to another, the short way round (G to A is 2, G to F is -2). */
export function stepsBetween(from: string, to: string) {
  const a = noteIndex(/^([A-G][#b]?)/.exec(from.trim())?.[1] ?? '');
  const b = noteIndex(/^([A-G][#b]?)/.exec(to.trim())?.[1] ?? '');
  if (a < 0 || b < 0) return 0;
  const d = (b - a + 12) % 12;
  return d > 6 ? d - 12 : d;
}
