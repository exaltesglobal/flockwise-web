// The chord editor: type lyrics, then put chords where they belong without counting spaces.
// Pick a chord from the palette for the song's key and tap the syllable it falls on, or type
// [G] in the text. Pasting "chords over lyrics" from a PDF, website or WhatsApp is converted.
import { ArrowDown, ArrowUp, Eraser, MousePointerClick, Type } from 'lucide-react';
import { useMemo, useRef, useState, type ClipboardEvent } from 'react';

import { isChord, isChordLine, keyChords, looksLikeChordPro, toChart, transposeChart, transposeKey } from '@/lib/songfile';

const KEYS = ['C', 'C#', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B', 'Cm', 'C#m', 'Dm', 'Ebm', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'Bbm', 'Bm'];
const SECTIONS = ['Verse 1', 'Verse 2', 'Pre-Chorus', 'Chorus', 'Bridge', 'Intro', 'Interlude', 'Tag', 'Outro', 'Pallavi', 'Charanam 1'];

type Seg = { chord: string | null; chordAt: number; text: string; at: number };

/** One chart line as chord + words pieces, with where each piece sits in the source line. */
function segments(line: string): Seg[] {
  const out: Seg[] = [];
  const re = /\[([^\]]+)\]/g;
  let last = 0;
  let pending: { chord: string; at: number } | null = null;
  for (let m = re.exec(line); m; m = re.exec(line)) {
    if (!isChord(m[1])) continue;
    if (m.index > last || pending) out.push({ chord: pending?.chord ?? null, chordAt: pending?.at ?? -1, text: line.slice(last, m.index), at: last });
    pending = { chord: m[1], at: m.index };
    last = m.index + m[0].length;
  }
  out.push({ chord: pending?.chord ?? null, chordAt: pending?.at ?? -1, text: line.slice(last), at: last });
  return out.filter((s, i) => s.chord || s.text || i === 0);
}

export function ChordEditor({ value, onChange, songKey, onKeyChange }: { value: string; onChange: (v: string) => void; songKey: string; onKeyChange: (k: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [brush, setBrush] = useState<string | null>(null);
  const [custom, setCustom] = useState('');
  const [note, setNote] = useState('');
  const key = songKey || 'G';
  const palette = useMemo(() => keyChords(key), [key]);
  const lines = value.split('\n');
  const unknown = useMemo(() => [...new Set([...value.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1]).filter((t) => !isChord(t) && !/^[A-Za-z][\w\s-]*\d*$/.test(t)))], [value]);

  /** Puts text at the cursor in the text box. */
  function insert(text: string) {
    const ta = ref.current;
    if (!ta) return onChange(value + text);
    const { selectionStart: a, selectionEnd: b } = ta;
    const next = value.slice(0, a) + text + value.slice(b);
    onChange(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(a + text.length, a + text.length);
    });
  }
  function insertSection(name: string) {
    const ta = ref.current;
    const at = ta?.selectionStart ?? value.length;
    const before = value.slice(0, at);
    const pre = !before || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
    insert(`${pre}[${name}]\n`);
  }
  function pick(chord: string) {
    setBrush(chord);
    // On a computer with the cursor in the text, also type it in.
    if (document.activeElement === ref.current) insert(`[${chord}]`);
  }
  /** Tap a letter in the preview: the chosen chord goes before it. */
  function place(lineNo: number, pos: number) {
    if (!brush) {
      setNote('Choose a chord above first, then tap the word it starts on.');
      return;
    }
    const ls = [...lines];
    ls[lineNo] = ls[lineNo].slice(0, pos) + `[${brush}]` + ls[lineNo].slice(pos);
    onChange(ls.join('\n'));
    setNote('');
  }
  function removeChord(lineNo: number, at: number) {
    const ls = [...lines];
    ls[lineNo] = ls[lineNo].slice(0, at) + ls[lineNo].slice(at).replace(/^\[[^\]]+\]/, '');
    onChange(ls.join('\n'));
  }
  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const text = e.clipboardData.getData('text/plain');
    const ls = text.split(/\r?\n/);
    const hasChordLines = ls.some((l, i) => isChordLine(l) && ls[i + 1]?.trim() && !isChordLine(ls[i + 1]));
    if (!hasChordLines || looksLikeChordPro(text)) return;
    e.preventDefault();
    const at = ref.current?.selectionStart ?? value.length;
    const before = value.slice(0, at);
    const chart = toChart(text);
    const startsSection = chart.startsWith('[') && !isChord(/^\[([^\]]+)\]/.exec(chart)?.[1] ?? '');
    const pre = !before || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? (startsSection ? '\n' : '') : startsSection ? '\n\n' : '\n';
    insert(pre + chart);
    setNote('Chords over lyrics were converted, so they stay on the right words in any key.');
  }
  function transpose(steps: number) {
    onChange(transposeChart(value, steps, key));
    onKeyChange(transposeKey(key, steps));
  }

  return (
    <div className="ce">
      <div className="ce-bar">
        <label className="row small" style={{ gap: 6 }}>Key
          <select className="select" style={{ width: 82 }} value={KEYS.includes(key) ? key : ''} onChange={(e) => onKeyChange(e.target.value)}>
            {!KEYS.includes(key) && <option value="">{key}</option>}
            {KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>
        <div className="row" style={{ gap: 4 }}>
          <button type="button" className="btn sm" title="Move every chord down a semitone" onClick={() => transpose(-1)}><ArrowDown size={14} /> Key</button>
          <button type="button" className="btn sm" title="Move every chord up a semitone" onClick={() => transpose(1)}><ArrowUp size={14} /> Key</button>
        </div>
        <span className="grow" />
        <span className="small muted">{brush ? <>Tapping adds <b className="ce-chip on">{brush}</b></> : 'Pick a chord, then tap a word'}</span>
        {brush && <button type="button" className="btn ghost sm" onClick={() => setBrush(null)}><Eraser size={14} /> Clear</button>}
      </div>
      {palette.map((g) => (
        <div key={g.label} className="ce-palette">
          <span className="small muted">{g.label}</span>
          {g.chords.map((c) => <button type="button" key={c} className={`ce-chip ${brush === c ? 'on' : ''}`} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(c)}>{c}</button>)}
          {g.label === 'Colour' && (
            <form className="row" style={{ gap: 4 }} onSubmit={(e) => { e.preventDefault(); if (isChord(custom.trim())) { pick(custom.trim()); setCustom(''); } }}>
              <input className="input ce-custom" placeholder="Other, e.g. F#m7" value={custom} onChange={(e) => setCustom(e.target.value)} aria-label="Other chord" />
              <button className="btn sm" disabled={!isChord(custom.trim())}>Use</button>
            </form>
          )}
        </div>
      ))}
      <div className="ce-palette">
        <span className="small muted">Sections</span>
        {SECTIONS.map((s) => <button type="button" key={s} className="ce-chip section" onMouseDown={(e) => e.preventDefault()} onClick={() => insertSection(s)}>{s}</button>)}
      </div>
      <div className="ce-panes">
        <div className="ce-pane">
          <div className="ce-pane-head"><Type size={14} /> Type or paste</div>
          <textarea ref={ref} className="textarea mono ce-text" value={value} onChange={(e) => onChange(e.target.value)} onPaste={onPaste} spellCheck={false}
            placeholder={'[Verse 1]\n[G]Amazing [G7]grace, how [C]sweet the [G]sound\n\nOr paste chords over lyrics:\nG          C       G\nAmazing grace how sweet'} />
        </div>
        <div className="ce-pane">
          <div className="ce-pane-head"><MousePointerClick size={14} /> Tap to place chords · tap a chord to remove it</div>
          <div className="ce-preview">
            {!value.trim() && <p className="small muted">Your chart appears here as musicians will see it.</p>}
            {lines.map((line, n) => {
              const sec = /^\s*\[([^\]]+)\]\s*$/.exec(line);
              if (sec && !isChord(sec[1])) return <div key={n} className="ce-sec">{sec[1]}</div>;
              if (/^\s*\{.*\}\s*$/.test(line)) return <div key={n} className="ce-sec">{line.replace(/^\s*\{\s*\w+\s*:?\s*|\s*\}\s*$/g, '')}</div>;
              if (!line.trim()) return <div key={n} className="ce-gap" />;
              const segs = segments(line);
              const chords = segs.some((s) => s.chord);
              return (
                <div key={n} className={`ce-line ${chords ? 'has' : ''}`}>
                  {segs.map((s, i) => (
                    <span key={i} className="ce-seg">
                      <span className="ce-chord">{s.chord ? <button type="button" title={`Remove ${s.chord}`} onClick={() => removeChord(n, s.chordAt)}>{s.chord}</button> : ' '}</span>
                      <span className="ce-words">
                        {s.text ? [...s.text].map((ch, j) => <span key={j} className="ce-ch" onClick={() => place(n, s.at + j)}>{ch === ' ' ? ' ' : ch}</span>) : ' '}
                        {i === segs.length - 1 && <span className="ce-ch end" onClick={() => place(n, line.length)}>{'  '}</span>}
                      </span>
                    </span>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {note && <p className="small muted" style={{ margin: 0 }}>{note}</p>}
      {unknown.length > 0 && <p className="small" style={{ margin: 0, color: 'var(--danger)' }}>Not read as chords: {unknown.map((u) => `[${u}]`).join(' ')}. Check the spelling (for example Bb, F#m7, Dsus4, G/B).</p>}
    </div>
  );
}
