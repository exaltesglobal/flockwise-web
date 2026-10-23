// The pastor's video greeting: record once (camera and mic in the browser, stored in the church's
// own bucket) or paste a link, write the line that goes under it, switch it on. From then on every
// birthday and anniversary gets a personal link on the morning of the day; children's go to the
// parents. The page also shows who was sent one, who watched and who wrote back.
import { Check, Circle, Eye, Link2, MessageCircle, Send, Square, Trash2, Upload, Video } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import type { VideoGreetingKind, VideoGreetingView } from '@/api/admin-types';
import { AdminApi } from '@/api/endpoints';
import { Empty, ErrorState, Field, FormError, Loading, Modal, useToast } from '@/components/ui';
import { formatRelative } from '@/lib/format';
import { useAction, useApi } from '@/lib/use-api';

import { PageHeader } from '../layout';
import { uploadMedia } from './media';

const KINDS: Record<VideoGreetingKind, { label: string; hint: string }> = {
  birthday: { label: 'Birthdays', hint: 'Adults on their birthday. Twenty seconds is plenty: their name is on the page, so keep the recording general.' },
  child: { label: "Children's birthdays", hint: 'Sent to the parents on the child’s birthday. Without one, children get the birthday recording.' },
  anniversary: { label: 'Wedding anniversaries', hint: 'Each spouse with an anniversary date on record gets the link.' },
};
const MAX_SECONDS = 60;

export function VideoGreetingsPage() {
  const { data, error, reload } = useApi(AdminApi.videoGreetings.hub);
  const [editing, setEditing] = useState<VideoGreetingKind | null>(null);
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const current = data.greetings.find((g) => g.id === editing) ?? null;
  return (
    <>
      <PageHeader title="Pastor's video greeting" subtitle="Record it once. On the morning of each birthday or anniversary the person gets a personal link with their name on it, the recording and a box to write back. Parents get it for a child." />
      <div className="grid cols-3">
        {data.greetings.map((g) => (
          <div key={g.id} className="card card-pad stack" style={{ gap: 10 }}>
            <div className="row between">
              <h3>{KINDS[g.id].label}</h3>
              <span className={`badge ${g.enabled ? 'ok' : 'gray'}`}>{g.enabled ? 'On' : g.videoUrl ? 'Off' : 'Not recorded'}</span>
            </div>
            {g.videoUrl ? <Preview url={g.videoUrl} poster={g.posterUrl} /> : <div className="stack" style={{ alignItems: 'center', padding: '18px 0', color: 'var(--muted)' }}><Video size={30} /><span className="small">{KINDS[g.id].hint}</span></div>}
            {g.videoUrl && <span className="small muted">From {g.fromName || 'the office'}{g.recordedAt ? ` · recorded ${formatRelative(g.recordedAt)}` : ''}</span>}
            <div className="row wrap small muted" style={{ gap: 10 }}>
              <span>{g.upcoming} coming up this week</span>
              <span>· {g.sentThisYear} sent this year</span>
              <span>· {g.watched} watched</span>
              <span>· {g.replies} wrote back</span>
            </div>
            <div className="row wrap" style={{ gap: 8 }}>
              <button className="btn primary sm" onClick={() => setEditing(g.id)}><Video size={14} /> {g.videoUrl ? 'Change' : 'Record or link'}</button>
              {g.videoUrl && <TestButton kind={g.id} onDone={reload} />}
            </div>
          </div>
        ))}
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-pad row between"><h3>Sent recently</h3><span className="small muted">{data.recent.length ? `${data.recent.length} links` : ''}</span></div>
        {data.recent.length === 0 ? <Empty icon={<Send size={26} />} title="Nothing sent yet" body="Switch a recording on and the next birthday gets its link at breakfast time. Send yourself a test to see the page." /> : (
          <table className="table compact">
            <thead><tr><th>Who</th><th>For</th><th>Sent</th><th>Watched</th><th>Wrote back</th><th /></tr></thead>
            <tbody>
              {data.recent.map((l) => (
                <tr key={l.id}>
                  <td>{l.name}{l.test && <span className="badge gray" style={{ marginLeft: 6 }}>test</span>}</td>
                  <td>{l.kind === 'anniversary' ? 'Anniversary' : l.videoKind === 'child' ? 'Birthday (child)' : 'Birthday'}</td>
                  <td className="small muted">{formatRelative(l.createdAt)}</td>
                  <td>{l.watchedAt ? <span className="row small" style={{ gap: 4 }}><Eye size={14} /> {l.views}×</span> : <span className="small muted">not yet</span>}</td>
                  <td className="small">{l.reply ? <span className="row" style={{ gap: 4 }}><MessageCircle size={14} /> “{l.reply}”</span> : <span className="muted">—</span>}</td>
                  <td><a className="btn sm" href={l.url} target="_blank" rel="noreferrer"><Link2 size={14} /> Open</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {current && <EditModal g={current} storage={data.storage} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </>
  );
}

function Preview({ url, poster }: { url: string; poster: string | null }) {
  const yt = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([\w-]{6,})/.exec(url)?.[1];
  if (yt) return <a href={url} target="_blank" rel="noreferrer" className="small">YouTube video · open</a>;
  return <video src={url} poster={poster ?? undefined} controls preload="metadata" playsInline style={{ width: '100%', borderRadius: 10, background: '#000', maxHeight: 180 }} />;
}

function TestButton({ kind, onDone }: { kind: VideoGreetingKind; onDone: () => void }) {
  const toast = useToast();
  const test = useAction(async () => { const l = await AdminApi.videoGreetings.test(kind); toast(`Sent to ${l.name}. Open ${l.url}`); window.open(l.url, '_blank'); onDone(); });
  return <button className="btn sm" onClick={() => test.run()} disabled={test.busy}><Send size={14} /> Send me a test</button>;
}

function EditModal({ g, storage, onClose, onSaved }: { g: VideoGreetingView; storage: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [mode, setMode] = useState<'record' | 'link'>(g.videoUrl && !g.mediaId ? 'link' : 'record');
  const [videoUrl, setVideoUrl] = useState(g.mediaId ? '' : g.videoUrl);
  const [mediaId, setMediaId] = useState<string | null>(g.mediaId);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(g.mediaId ? g.videoUrl : null);
  const [fromName, setFromName] = useState(g.fromName);
  const [message, setMessage] = useState(g.message);
  const [enabled, setEnabled] = useState(g.enabled || !g.videoUrl);
  const [uploading, setUploading] = useState<number | null>(null);
  const [recErr, setRecErr] = useState<string | null>(null);
  const save = useAction(async () => {
    const input = mode === 'link' ? { videoUrl: videoUrl.trim(), fromName, message, enabled } : { mediaId, fromName, message, enabled };
    if (mode === 'link' && !videoUrl.trim()) throw new Error('Paste the link to the video.');
    if (mode === 'record' && !mediaId) throw new Error('Record a greeting and keep it first.');
    await AdminApi.videoGreetings.save(g.id, input);
    onSaved();
  });
  const remove = useAction(async () => { await AdminApi.videoGreetings.remove(g.id); onSaved(); });
  const keep = async (blob: Blob) => {
    setRecErr(null);
    if (!storage) { setRecErr('Recordings are stored in the church’s own Google Cloud Storage bucket. Connect it in Settings › Integrations, or paste a link to a video instead.'); return; }
    setUploading(0);
    try {
      const file = new File([blob], `greeting-${g.id}-${new Date().toISOString().slice(0, 10)}.webm`, { type: blob.type || 'video/webm' });
      const item = await uploadMedia(file, 'general', setUploading);
      setMediaId(item.id);
      setRecordedUrl(item.url);
      toast('Recording kept');
    } catch (e) { setRecErr((e as Error).message); } finally { setUploading(null); }
  };
  return (
    <Modal title={`${KINDS[g.id].label}: the recording`} onClose={onClose} footer={
      <>
        {g.videoUrl && <button className="btn danger" onClick={() => remove.run()} disabled={remove.busy}><Trash2 size={16} /> Remove</button>}
        <span style={{ flex: 1 }} />
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={() => save.run()} disabled={save.busy || uploading !== null}><Check size={16} /> Save</button>
      </>
    }>
      <div className="stack">
        <p className="small muted" style={{ margin: 0 }}>{KINDS[g.id].hint}</p>
        <div className="row" style={{ gap: 6 }}>
          <button type="button" className={`opt-chip ${mode === 'record' ? 'on' : ''}`} onClick={() => setMode('record')}><Video size={14} /> Record here</button>
          <button type="button" className={`opt-chip ${mode === 'link' ? 'on' : ''}`} onClick={() => setMode('link')}><Link2 size={14} /> Paste a link</button>
        </div>
        {mode === 'record' ? (
          <>
            <Recorder onKeep={keep} existingUrl={recordedUrl} />
            {uploading !== null && <div className="progress"><i style={{ width: `${uploading}%` }} /></div>}
            {mediaId && <span className="small row" style={{ gap: 6, color: 'var(--primary)' }}><Check size={14} /> Recording kept{recordedUrl ? '' : ' (uploaded)'}</span>}
            {recErr && <span className="small" style={{ color: 'var(--danger, #b42318)' }}>{recErr}</span>}
          </>
        ) : (
          <Field label="Video link" hint="A YouTube link (unlisted is fine), a file in the media library, or any public video URL."><input className="input" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://youtu.be/…" /></Field>
        )}
        <Field label="From"><input className="input" value={fromName} maxLength={80} onChange={(e) => setFromName(e.target.value)} placeholder="Pastor Samuel Raj" /></Field>
        <Field label="Line under the video" hint="{{firstName}} becomes their name."><textarea className="input" rows={2} value={message} maxLength={300} onChange={(e) => setMessage(e.target.value)} /></Field>
        <label className="row small" style={{ gap: 8 }}><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Send it automatically on the day</label>
        <FormError error={save.error ?? remove.error} />
      </div>
    </Modal>
  );
}

/** Camera and mic in the browser; up to a minute; review before keeping. */
function Recorder({ onKeep, existingUrl }: { onKeep: (blob: Blob) => void; existingUrl: string | null }) {
  const video = useRef<HTMLVideoElement | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [state, setState] = useState<'idle' | 'live' | 'recording' | 'review'>('idle');
  const [seconds, setSeconds] = useState(0);
  const [clip, setClip] = useState<{ url: string; blob: Blob } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => () => { stream?.getTracks().forEach((t) => t.stop()); if (clip) URL.revokeObjectURL(clip.url); }, [stream, clip]);
  useEffect(() => { if (video.current && stream && state !== 'review') { video.current.srcObject = stream; void video.current.play().catch(() => undefined); } }, [stream, state]);
  useEffect(() => {
    if (state !== 'recording') return;
    const h = setInterval(() => setSeconds((s) => { if (s + 1 >= MAX_SECONDS) stop(); return s + 1; }), 1000);
    return () => clearInterval(h);
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps
  const start = async () => {
    setErr(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: true });
      setStream(s);
      setState('live');
    } catch { setErr('The browser did not give access to the camera and microphone. Allow them in the address bar, or paste a link instead.'); }
  };
  const record = () => {
    if (!stream) return;
    const Rec = (window as Window & { MediaRecorder?: typeof MediaRecorder }).MediaRecorder;
    if (!Rec) { setErr('This browser cannot record video. Record on your phone and paste a link.'); return; }
    const type = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find((t) => Rec.isTypeSupported?.(t)) ?? '';
    const r = new Rec(stream, type ? { mimeType: type } : undefined);
    chunks.current = [];
    r.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
    r.onstop = () => { const blob = new Blob(chunks.current, { type: type || 'video/webm' }); setClip({ url: URL.createObjectURL(blob), blob }); setState('review'); };
    rec.current = r;
    r.start(500);
    setSeconds(0);
    setState('recording');
  };
  const stop = () => { if (rec.current && rec.current.state !== 'inactive') rec.current.stop(); };
  const again = () => { if (clip) URL.revokeObjectURL(clip.url); setClip(null); setState(stream ? 'live' : 'idle'); };
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div style={{ position: 'relative', background: '#000', borderRadius: 12, overflow: 'hidden', aspectRatio: '16 / 9' }}>
        {state === 'review' && clip ? <video src={clip.url} controls playsInline style={{ width: '100%', height: '100%' }} />
          : state === 'idle' && existingUrl ? <video src={existingUrl} controls playsInline preload="metadata" style={{ width: '100%', height: '100%' }} />
            : <video ref={video} muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />}
        {state === 'recording' && <span className="badge" style={{ position: 'absolute', top: 10, left: 10, background: '#b42318', color: '#fff' }}>● {seconds}s / {MAX_SECONDS}s</span>}
      </div>
      <div className="row wrap" style={{ gap: 8 }}>
        {state === 'idle' && <button type="button" className="btn primary sm" onClick={start}><Video size={14} /> {existingUrl ? 'Record a new one' : 'Open camera'}</button>}
        {state === 'live' && <button type="button" className="btn primary sm" onClick={record}><Circle size={14} /> Start recording</button>}
        {state === 'recording' && <button type="button" className="btn danger sm" onClick={stop}><Square size={14} /> Stop</button>}
        {state === 'review' && clip && <><button type="button" className="btn primary sm" onClick={() => onKeep(clip.blob)}><Upload size={14} /> Keep this one</button><button type="button" className="btn sm" onClick={again}>Record again</button></>}
      </div>
      {err && <span className="small" style={{ color: 'var(--danger, #b42318)' }}>{err}</span>}
    </div>
  );
}
