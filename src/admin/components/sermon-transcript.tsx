// Office › Sermons › Transcript: the sermon as preached, from Sunday's live captions, a caption
// file (.srt or .vtt, such as YouTube's) or pasted text. AI adds a summary, chapters and moments to
// share; the office can correct any of it before members see it beside the recording.
import { Captions, FileUp, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { Sermon, SermonTranscript, TranscriptChapter, TranscriptClip } from '@/api/admin-types';
import { AdminApi } from '@/api/endpoints';
import { ErrorState, Field, FormError, Loading, Modal, useToast, useUndoableDelete } from '@/components/ui';
import { clock, parseClock } from '@/lib/transcript';
import { useAction, useApi } from '@/lib/use-api';

import { useAi } from '../ai';

export function SermonTranscriptModal({ sermon, onClose, onChanged }: { sermon: Sermon; onClose: () => void; onChanged: () => void }) {
  const q = useApi(() => AdminApi.sermons.transcript(sermon.id), [sermon.id]);
  const [replace, setReplace] = useState(false);
  const [gone, setGone] = useState(false);
  const undoable = useUndoableDelete();
  const tr = gone ? null : q.data?.transcript ?? null;
  const done = () => { setReplace(false); q.reload(); onChanged(); };
  const remove = () => undoable({ text: 'Transcript removed.', hide: () => setGone(true), show: () => setGone(false), run: () => AdminApi.sermons.removeTranscript(sermon.id), done: () => { setGone(false); done(); } });

  return (
    <Modal wide title={`Transcript · ${sermon.title}`} onClose={onClose}>
      {q.error ? <ErrorState error={q.error} onRetry={q.reload} /> : !q.data ? <Loading /> : !tr || replace ? (
        <TranscriptSetup sermon={sermon} captions={q.data.captions} onCancel={tr ? () => setReplace(false) : undefined} onSaved={done} />
      ) : (
        <TranscriptEditor sermon={sermon} tr={tr} onReplace={() => setReplace(true)} onRemove={remove} onSaved={done} />
      )}
    </Modal>
  );
}

function TranscriptSetup({ sermon, captions, onCancel, onSaved }: { sermon: Sermon; captions: { eventId: string; title: string; lines: number } | null; onCancel?: () => void; onSaved: () => void }) {
  const [text, setText] = useState('');
  const [file, setFile] = useState<string | null>(null);
  const [start, setStart] = useState('');
  const offset = parseClock(start);
  const save = useAction(async (source: 'captions' | 'file' | 'typed') => {
    await AdminApi.sermons.saveTranscript(sermon.id, { source, text: source === 'captions' ? undefined : text, eventId: captions?.eventId, offset: offset ?? 0 });
    onSaved();
  });
  const pick = async (f: File | undefined) => {
    if (!f) return;
    setText(await f.text());
    setFile(f.name);
  };
  return (
    <div className="stack">
      <p className="muted small" style={{ margin: 0 }}>Members read the sermon beside the recording, search it, and jump to any chapter. Choose where the words come from.</p>
      <FormError error={save.error} />
      {captions && (
        <div className="card card-pad stack tr-source" style={{ gap: 6 }}>
          <b className="row" style={{ gap: 6 }}><Captions size={16} /> Use Sunday's live captions</b>
          <span className="small muted">{captions.lines} lines were captured during {captions.title}.</span>
          <button className="btn primary" style={{ alignSelf: 'flex-start' }} disabled={save.busy} onClick={() => void save.run('captions')}>Use the captions</button>
        </div>
      )}
      <div className="card card-pad stack tr-source" style={{ gap: 8 }}>
        <b className="row" style={{ gap: 6 }}><FileUp size={16} /> A caption file or the text</b>
        <span className="small muted">From YouTube Studio, open the video's Subtitles and download the .srt or .vtt file. Or paste the sermon, with or without times like [12:30].</span>
        <label className="btn sm" style={{ alignSelf: 'flex-start' }}>
          <FileUp size={14} /> {file ?? 'Choose a .srt, .vtt or .txt file'}
          <input type="file" accept=".srt,.vtt,.txt,text/plain,text/vtt" hidden onChange={(e) => void pick(e.target.files?.[0])} />
        </label>
        <textarea className="textarea" rows={7} value={text} onChange={(e) => { setText(e.target.value); setFile(null); }} placeholder="Or paste the sermon here" />
        <button className="btn primary" style={{ alignSelf: 'flex-start' }} disabled={save.busy || text.trim().split(/\s+/).length < 30} onClick={() => void save.run(file ? 'file' : 'typed')}>Save the transcript</button>
      </div>
      <Field label="Where the sermon starts in the recording" hint="Only when the times are counted from the sermon but the video starts earlier, for example 45:10 into the livestream. Leave empty otherwise.">
        <input className="input" style={{ maxWidth: 160 }} value={start} onChange={(e) => setStart(e.target.value)} placeholder="0:00" aria-invalid={offset === null} />
      </Field>
      {onCancel && <button className="btn ghost" style={{ alignSelf: 'flex-start' }} onClick={onCancel}>Keep the current transcript</button>}
    </div>
  );
}

function TranscriptEditor({ sermon, tr, onReplace, onRemove, onSaved }: { sermon: Sermon; tr: SermonTranscript; onReplace: () => void; onRemove: () => void; onSaved: () => void }) {
  const ai = useAi();
  const toast = useToast();
  const [summary, setSummary] = useState(tr.summary);
  const [chapters, setChapters] = useState<TranscriptChapter[]>(tr.chapters);
  const [clips, setClips] = useState<TranscriptClip[]>(tr.clips);
  const [start, setStart] = useState(tr.offset ? clock(tr.offset) : '');
  useEffect(() => { setSummary(tr.summary); setChapters(tr.chapters); setClips(tr.clips); setStart(tr.offset ? clock(tr.offset) : ''); }, [tr]);
  const offset = parseClock(start);
  const timed = tr.lines.some((l) => l.at !== null);
  const where = (line: number) => { const at = tr.lines[line]?.at; return at === null || at === undefined ? `¶${line + 1}` : clock(at + (offset ?? 0)); };
  const make = useAction(async () => { await AdminApi.sermons.chapterTranscript(sermon.id); toast('Summary, chapters and moments are ready. Check them below.'); onSaved(); });
  const save = useAction(async () => { await AdminApi.sermons.editTranscript(sermon.id, { summary, chapters, clips, offset: offset ?? 0 }); toast('Saved. Members see it under the sermon.'); onSaved(); });
  const words = tr.lines.reduce((n, l) => n + l.text.split(/\s+/).length, 0);
  const source = tr.source === 'captions' ? 'live captions' : tr.source === 'file' ? 'a caption file' : 'pasted text';

  return (
    <div className="stack">
      <div className="row between wrap" style={{ gap: 8 }}>
        <span className="small muted">{words.toLocaleString('en-IN')} words from {source}{timed ? `, about ${clock(tr.lines[tr.lines.length - 1].at ?? 0)} long` : ''}.</span>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn sm ghost" onClick={onReplace}>Replace</button>
          <button className="btn sm ghost danger" onClick={onRemove}><Trash2 size={14} /> Remove</button>
        </div>
      </div>
      {ai && (
        <div className="row wrap" style={{ gap: 8 }}>
          <button className="btn" onClick={() => void make.run()} disabled={make.busy}><Sparkles size={15} /> {make.busy ? 'Reading the sermon…' : tr.chapters.length ? 'Make chapters again with AI' : 'Make summary, chapters and moments with AI'}</button>
          <FormError error={make.error} />
        </div>
      )}
      <Field label="Summary"><textarea className="textarea" rows={4} value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={1500} /></Field>

      <div className="stack" style={{ gap: 6 }}>
        <b>Chapters</b>
        {!chapters.length && <span className="small muted">None yet. {ai ? 'Let AI find them, or add your own.' : 'Add where each part of the sermon begins.'}</span>}
        {chapters.map((c, i) => (
          <div key={i} className="tr-row">
            <select className="input tr-at" value={c.line} onChange={(e) => setChapters(chapters.map((x, j) => (j === i ? { ...x, line: Number(e.target.value) } : x)).sort((a, b) => a.line - b.line))} aria-label="Starts at">
              {tr.lines.map((l, n) => <option key={n} value={n}>{where(n)} {l.text.slice(0, 40)}</option>)}
            </select>
            <div className="grow stack" style={{ gap: 4, minWidth: 0 }}>
              <input className="input" value={c.title} onChange={(e) => setChapters(chapters.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} placeholder="Title" maxLength={120} />
              <input className="input" value={c.summary} onChange={(e) => setChapters(chapters.map((x, j) => (j === i ? { ...x, summary: e.target.value } : x)))} placeholder="One sentence (optional)" maxLength={300} />
            </div>
            <button className="btn sm ghost icon" onClick={() => setChapters(chapters.filter((_, j) => j !== i))} aria-label="Remove chapter"><X size={14} /></button>
          </div>
        ))}
        <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setChapters([...chapters, { line: chapters.length ? Math.min(tr.lines.length - 1, chapters[chapters.length - 1].line + 1) : 0, title: '', summary: '' }])}><Plus size={14} /> Add a chapter</button>
      </div>

      {clips.length > 0 && (
        <div className="stack" style={{ gap: 6 }}>
          <b>Moments to share</b>
          {clips.map((c, i) => (
            <div key={i} className="tr-row">
              <span className="small muted tr-at">{where(c.line)}</span>
              <div className="grow stack" style={{ gap: 4, minWidth: 0 }}>
                <input className="input" value={c.title} onChange={(e) => setClips(clips.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} maxLength={120} />
                <textarea className="textarea" rows={2} value={c.quote} onChange={(e) => setClips(clips.map((x, j) => (j === i ? { ...x, quote: e.target.value } : x)))} maxLength={500} />
              </div>
              <button className="btn sm ghost icon" onClick={() => setClips(clips.filter((_, j) => j !== i))} aria-label="Remove moment"><X size={14} /></button>
            </div>
          ))}
        </div>
      )}

      {timed && (
        <Field label="Where the sermon starts in the recording" hint="Added to every time, when the video starts before the sermon.">
          <input className="input" style={{ maxWidth: 160 }} value={start} onChange={(e) => setStart(e.target.value)} placeholder="0:00" aria-invalid={offset === null} />
        </Field>
      )}

      <details className="tr-preview">
        <summary className="small">Read the transcript</summary>
        {tr.lines.map((l, i) => <p key={i} className="small"><span className="muted">{where(i)}</span> {l.text}</p>)}
      </details>

      <FormError error={save.error} />
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn primary" onClick={() => void save.run()} disabled={save.busy || offset === null || chapters.some((c) => !c.title.trim())}>Save</button>
      </div>
    </div>
  );
}
