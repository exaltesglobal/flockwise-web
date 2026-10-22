// ChordPro-style charts: chords in [brackets] before the syllable, {directives} and [Section] lines.
const SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const SECTION = /^(verse|chorus|bridge|pre-?chorus|intro|outro|tag|interlude|ending|instrumental)\b/i;

function shiftNote(note: string, steps: number, preferFlats: boolean) {
  const i = SHARPS.indexOf(note) >= 0 ? SHARPS.indexOf(note) : FLATS.indexOf(note);
  if (i < 0) return note;
  const j = (((i + steps) % 12) + 12) % 12;
  return (preferFlats ? FLATS : SHARPS)[j];
}

/** Moves a chord like "F#m7/C#" up or down by semitones. */
export function transposeChord(chord: string, steps: number) {
  if (!steps) return chord;
  const flats = /b/.test(chord.slice(1, 2));
  return chord.replace(/([A-G][#b]?)/g, (n) => shiftNote(n, steps, flats));
}

export const transposeKey = (key: string, steps: number) => {
  const m = /^([A-G][#b]?)(.*)$/.exec(key.trim());
  return m ? shiftNote(m[1], steps, /b/.test(m[1])) + m[2] : key;
};

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
export function ChordChart({ text, steps = 0, capo = 0, mode = 'chords', songKey = 'C' }: { text: string; steps?: number; capo?: number; mode?: ChartMode; songKey?: string }) {
  const lines = text.split('\n');
  return (
    <div className="chart">
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
            const c = mode === 'numbers' ? toNashville(m[1], songKey) : transposeChord(m[1], steps - capo);
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
