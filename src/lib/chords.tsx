// ChordPro-style charts: chords in [brackets] before the syllable, {directives} and [Section] lines.
import type { SongColours } from '@/core/types';
import { colourVars, hasColours } from './song-colours';

const SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const SECTION = /^(verse|chorus|refrain|bridge|pre-?chorus|post-?chorus|intro|outro|tag|interlude|ending|instrumental|vamp|coda|turnaround|hook|breakdown|stanza|pallavi|anupallavi|charanam)/i;

function shiftNote(note: string, steps: number, preferFlats: boolean) {
  const i = SHARPS.indexOf(note) >= 0 ? SHARPS.indexOf(note) : FLATS.indexOf(note);
  if (i < 0) return note;
  const j = (((i + steps) % 12) + 12) % 12;
  return (preferFlats ? FLATS : SHARPS)[j];
}

/** Moves a chord like "F#m7/C#" up or down by semitones. preferFlats spells it for a flat key (Bb, not A#). */
export function transposeChord(chord: string, steps: number, preferFlats?: boolean) {
  if (!steps && preferFlats === undefined) return chord;
  const flats = preferFlats ?? /b/.test(chord.slice(1, 2));
  return chord.replace(/([A-G][#b]?)/g, (n) => shiftNote(n, steps, flats));
}

// How keys are usually written: Eb not D#, F# not Gb; minor keys likewise.
const KEY_NAME: Record<string, string> = { 'D#': 'Eb', 'G#': 'Ab', 'A#': 'Bb', 'C#': 'Db', Gb: 'F#', 'D#m': 'Ebm', 'A#m': 'Bbm', Gbm: 'F#m', Dbm: 'C#m', Abm: 'G#m' };
const FLAT_KEYS = new Set(['F', 'Bb', 'Eb', 'Ab', 'Db', 'Dm', 'Gm', 'Cm', 'Fm', 'Bbm', 'Ebm']);

export const transposeKey = (key: string, steps: number) => {
  const m = /^([A-G][#b]?)(m?)(.*)$/.exec(key.trim());
  if (!m) return key;
  if (!steps) return key;
  const root = shiftNote(m[1], steps, false) + m[2];
  return (KEY_NAME[root] ?? root) + m[3];
};

/** Whether chords in this key are written with flats. */
export const flatKey = (key: string) => FLAT_KEYS.has(/^([A-G][#b]?m?)/.exec(key.trim())?.[1] ?? '');

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const noteIndex = (n: string) => (SHARPS.indexOf(n) >= 0 ? SHARPS.indexOf(n) : FLATS.indexOf(n));

function degree(note: string, keyRoot: string) {
  const i = noteIndex(note);
  const k = noteIndex(keyRoot);
  if (i < 0 || k < 0) return note;
  const interval = (i - k + 12) % 12;
  const d = MAJOR.indexOf(interval);
  return d >= 0 ? String(d + 1) : `b${MAJOR.indexOf(interval + 1) + 1}`;
}

/** Nashville number for a chord in a key: in G, "Em7/B" is "6m7/3". */
export function toNashville(chord: string, key: string) {
  const k = /^([A-G][#b]?)/.exec(key.trim())?.[1];
  const m = /^([A-G][#b]?)([^/]*)(?:\/([A-G][#b]?))?$/.exec(chord);
  if (!k || !m) return chord;
  return degree(m[1], k) + m[2] + (m[3] ? `/${degree(m[3], k)}` : '');
}

export type ChartMode = 'chords' | 'numbers';

/**
 * steps transposes the song; capo shows the shapes a guitarist plays with a capo on that fret
 * (the song still sounds in the transposed key); "numbers" shows the Nashville number system.
 */
export function ChordChart({ text, steps = 0, capo = 0, mode = 'chords', songKey = 'C', colours }: { text: string; steps?: number; capo?: number; mode?: ChartMode; songKey?: string; colours?: SongColours }) {
  const lines = text.split('\n');
  return (
    <div className={`chart ${hasColours(colours) ? 'coloured' : ''}`} style={colourVars(colours)}>
      {lines.map((line, i) => {
        const directive = /^\{(\w+):?\s*(.*)\}$/.exec(line.trim());
        if (directive) return directive[1] === 'title' || directive[1] === 'key' ? null : <span key={i} className="section">{directive[2] || directive[1]}</span>;
        const section = /^\[([^\]]+)\]$/.exec(line.trim());
        if (section && SECTION.test(section[1])) return <span key={i} className="section">{section[1]}</span>;
        if (!line.includes('[')) return <div key={i}>{line || ' '}</div>;
        // Two rows: chords above their syllables.
        let chords = '';
        let words = '';
        for (const part of line.split(/(\[[^\]]+\])/)) {
          const m = /^\[([^\]]+)\]$/.exec(part);
          if (m) {
            const c = mode === 'numbers' ? toNashville(m[1], songKey) : transposeChord(m[1], steps - capo, steps - capo ? flatKey(transposeKey(songKey, steps - capo)) : undefined);
            if (chords.length > words.length) words = words.padEnd(chords.length, ' ');
            chords = chords.padEnd(words.length, ' ') + c + ' ';
          } else words += part;
        }
        return (
          <div key={i} style={{ marginTop: 4 }}>
            <div className="chord">{chords.trimEnd() || ' '}</div>
            <div>{words || ' '}</div>
          </div>
        );
      })}
    </div>
  );
}
