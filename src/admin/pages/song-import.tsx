// Import songs from files: PDFs (chord sheets from websites, SongSelect, a songbook page, or a
// Flockwise PDF), ChordPro and OnSong files, or text pasted from WhatsApp. Each one is shown for a
// quick check before it is added to the library.
import { AlertTriangle, CheckCircle2, FileUp, Upload } from 'lucide-react';
import { useRef, useState, type DragEvent } from 'react';

import type { SongView } from '@/api/admin-types';
import type { ApiError } from '@/core/errors';
import { AdminApi } from '@/api/endpoints';
import { Field, FormError, Modal, Segmented, useToast } from '@/components/ui';
import { ChordChart } from '@/lib/chords';
import { readSongFile } from '@/lib/pdf-songs';
import { parseSongText, type ParsedSong } from '@/lib/songfile';

type Row = ParsedSong & { id: string; file: string; pick: boolean; duplicate: boolean; open: boolean };
const ACCEPT = '.pdf,.cho,.chopro,.chordpro,.crd,.pro,.onsong,.txt,text/plain,application/pdf';

export function ImportSongsModal({ existing, onClose, onDone }: { existing: SongView[]; onClose: () => void; onDone: (n: number) => void }) {
  const [tab, setTab] = useState<'files' | 'paste'>('files');
  const [rows, setRows] = useState<Row[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  const [reading, setReading] = useState(false);
  const [pasted, setPasted] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const titles = new Set(existing.map((s) => s.title.trim().toLowerCase()));

  const addParsed = (songs: ParsedSong[], file: string) =>
    setRows((rs) => [...rs, ...songs.map((s, i) => {
      const duplicate = titles.has(s.title.trim().toLowerCase()) || rs.some((r) => r.title.trim().toLowerCase() === s.title.trim().toLowerCase());
      return { ...s, id: `${Date.now()}-${rs.length + i}`, file, pick: !duplicate && !!(s.chordChart || s.lyrics), duplicate, open: rs.length + i === 0 };
    })]);

  async function readFiles(files: FileList | File[]) {
    setReading(true);
    const bad: string[] = [];
    for (const f of [...files]) {
      if (f.size > 15 * 1024 * 1024) {
        bad.push(`${f.name}: bigger than 15 MB.`);
        continue;
      }
      try {
        const r = await readSongFile(f);
        if (r.scanned) bad.push(`${f.name}: this PDF is a scanned picture with no text in it. Type the song in the chord editor, or use a PDF with real text.`);
        else addParsed(r.songs, f.name);
      } catch {
        bad.push(`${f.name}: could not be read. Is it a song PDF or a text file?`);
      }
    }
    setProblems((p) => [...p, ...bad]);
    setReading(false);
  }
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (e.dataTransfer.files.length) void readFiles(e.dataTransfer.files);
  };
  const set = (id: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const picked = rows.filter((r) => r.pick && r.title.trim());

  async function save() {
    setSaving(true);
    setError(null);
    let n = 0;
    try {
      for (const r of picked) {
        await AdminApi.services.createSong({ title: r.title.trim(), author: r.author, defaultKey: r.key, bpm: r.bpm, ccli: r.ccli, tags: ['imported'], lyrics: r.lyrics, lyricsAlt: '', chordChart: r.chordChart, attachments: [] });
        n++;
      }
      toast(`${n} ${n === 1 ? 'song' : 'songs'} added`);
      onDone(n);
    } catch (e) {
      setError(e as ApiError);
      if (n) toast(`${n} added before the error`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal wide title="Import songs" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!picked.length || saving} onClick={save}>{saving ? 'Adding…' : picked.length ? `Add ${picked.length} ${picked.length === 1 ? 'song' : 'songs'}` : 'Add songs'}</button></>}>
      <div className="stack">
        <Segmented value={tab} onChange={setTab} options={[{ value: 'files', label: 'From files' }, { value: 'paste', label: 'Paste text' }]} />
        {tab === 'files' ? (
          <div className={`drop ${over ? 'over' : ''}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={onDrop} onClick={() => input.current?.click()} role="button" tabIndex={0}>
            <Upload size={26} />
            <b>{reading ? 'Reading…' : 'Drop song files here, or choose them'}</b>
            <span className="small muted">PDF chord sheets, ChordPro (.cho, .chopro, .pro), OnSong and text files. Several at once is fine. A PDF made by Flockwise comes back exactly as it was.</span>
            <input ref={input} type="file" accept={ACCEPT} multiple hidden onChange={(e) => { if (e.target.files?.length) void readFiles(e.target.files); e.target.value = ''; }} />
          </div>
        ) : (
          <div className="stack">
            <Field label="Paste a song" hint="Chords over lyrics, ChordPro, or plain lyrics. Put the title on the first line.">
              <textarea className="textarea mono" style={{ minHeight: 180 }} value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder={'Amazing Grace\nKey: G\n\nVerse 1\nG            G7        C       G\nAmazing grace! How sweet the sound'} />
            </Field>
            <button className="btn" style={{ alignSelf: 'flex-start' }} disabled={!pasted.trim()} onClick={() => { addParsed([parseSongText(pasted)], 'Pasted'); setPasted(''); }}><FileUp size={15} /> Read this song</button>
          </div>
        )}
        {problems.map((p, i) => <div key={i} className="alert warn small"><AlertTriangle size={15} /> {p}</div>)}
        {rows.map((r) => (
          <div key={r.id} className="card import-row">
            <div className="row wrap" style={{ gap: 8, padding: '10px 12px' }}>
              <input type="checkbox" checked={r.pick} onChange={(e) => set(r.id, { pick: e.target.checked })} aria-label={`Import ${r.title}`} />
              <input className="input grow" style={{ minWidth: 160 }} value={r.title} onChange={(e) => set(r.id, { title: e.target.value })} aria-label="Title" />
              <input className="input" style={{ width: 70 }} value={r.key} onChange={(e) => set(r.id, { key: e.target.value })} aria-label="Key" placeholder="Key" />
              <button className="btn ghost sm" onClick={() => set(r.id, { open: !r.open })}>{r.open ? 'Hide' : 'Preview'}</button>
            </div>
            <div className="small muted" style={{ padding: '0 12px 10px' }}>
              {r.file}{r.author ? ` · ${r.author}` : ''} · {r.chordChart ? <><CheckCircle2 size={12} style={{ verticalAlign: '-2px', color: 'var(--ok)' }} /> chords and lyrics</> : 'lyrics only'}
              {r.duplicate && <span className="badge warn" style={{ marginLeft: 6 }}>Already in your library</span>}
              {r.warnings.map((w) => <span key={w} style={{ display: 'block' }}>{w}</span>)}
            </div>
            {r.open && <div className="import-preview">{r.chordChart ? <ChordChart text={r.chordChart} songKey={r.key || 'C'} /> : <pre>{r.lyrics}</pre>}</div>}
          </div>
        ))}
        <FormError error={error} />
      </div>
    </Modal>
  );
}
