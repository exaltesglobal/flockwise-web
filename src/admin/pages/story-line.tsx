// Sundays & growth › Bible stories to listen to. For people who cannot read: someone records each
// story in the dialect people speak at home, listeners get a WhatsApp or SMS link (or call the
// story number), and the office sees who is hearing them and who asked for prayer.
import { Check, Circle, Copy, Headphones, Link2, Mic, Plus, Send, Settings2, Square, Trash2, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { AdminApi } from '@/api/endpoints';
import type { LanguageCode, StoryLineHub, StoryListenerView, StoryView } from '@/core/types';
import { LANGUAGES } from '@/core/languages';
import { PersonSearch } from '@/admin/components/person-picker';
import { uploadMedia } from '@/admin/pages/media';
import { Empty, ErrorState, Field, FormError, Loading, Modal, useToast } from '@/components/ui';
import { formatDay } from '@/lib/format';
import { useAction, useApi } from '@/lib/use-api';

import { PageHeader } from '../layout';

const CODES: LanguageCode[] = ['te', 'hi', 'ta', 'ml', 'kn', 'en', 'mr', 'bn', 'gu', 'pa', 'or'];
const english = (c: string) => LANGUAGES.find((l) => l.code === c)?.english ?? c;
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function StoryLinePage() {
  const q = useApi(AdminApi.stories.get);
  const toast = useToast();
  const [open, setOpen] = useState<StoryView | null>(null);
  const [adding, setAdding] = useState(false);
  const [settings, setSettings] = useState(false);
  const starter = useAction(async () => q.setData(await AdminApi.stories.starter()));
  const sendAll = useAction(async () => { const r = await AdminApi.stories.send(); q.setData(r.hub); toast(r.sent === 1 ? 'Sent to 1 listener.' : `Sent to ${r.sent} listeners.`); });
  const title = 'Bible stories to listen to';
  if (q.error) return <><PageHeader title={title} /><ErrorState error={q.error} onRetry={q.reload} /></>;
  if (!q.data) return <><PageHeader title={title} /><Loading /></>;
  const d = q.data;
  const s = d.settings;
  const recorded = d.stories.filter((x) => Object.keys(x.recordings).length).length;
  const actions = <>
    <button className="btn" onClick={() => setSettings(true)}><Settings2 size={15} /> Settings and phone line</button>
    <button className="btn" disabled={sendAll.busy || !d.listeners.some((l) => l.active)} onClick={() => void sendAll.run()}><Send size={15} /> Send the next story now</button>
    <button className="btn primary" onClick={() => setAdding(true)}><Plus size={15} /> Add a story</button>
  </>;
  const current = open ? d.stories.find((x) => x.id === open.id) ?? null : null;
  return (
    <>
      <PageHeader title={title} subtitle={`For people who cannot read. Someone in your church records each story in the language people speak at home. ${s.cadence === 'daily' ? 'Every day' : `Every ${DAYS[s.weekday]}`}, each listener gets the next one as a ${s.channel === 'sms' ? 'text' : 'WhatsApp'} link with one big play button${s.callNumber ? `, or calls ${s.callNumber} to hear it` : ''}. They reply 1 when they have listened and 2 to ask for prayer.`} actions={actions} />
      <FormError error={sendAll.error ?? starter.error} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', alignItems: 'start', gap: 16 }}>
        <section className="card card-pad stack" style={{ gap: 10 }}>
          <div className="row between wrap" style={{ gap: 8 }}>
            <h3 style={{ margin: 0 }}>Stories</h3>
            <span className="small muted">{recorded} of {d.stories.length} recorded</span>
          </div>
          {!d.stories.length ? (
            <Empty icon={<Headphones size={28} />} title="No stories yet" body="Start with 52 stories from Creation to Revelation, one a week for a year. Each comes with notes on what to tell, for whoever records it." action={<button className="btn primary" disabled={starter.busy} onClick={() => void starter.run()}>Add the 52-story series</button>} />
          ) : (
            <div className="stack" style={{ gap: 0 }}>
              {d.stories.map((x) => (
                <button key={x.id} className="row story-row" style={{ gap: 10, textAlign: 'left', padding: '8px 4px', background: 'none', border: 0, borderBottom: '1px solid var(--border)', font: 'inherit', color: 'inherit', cursor: 'pointer' }} onClick={() => setOpen(x)}>
                  <span className="muted small" style={{ width: 26, textAlign: 'right' }}>{x.order}</span>
                  <span className="grow" style={{ minWidth: 0 }}>
                    <b>{x.title}</b> <span className="small muted">{x.reference}</span>
                    <span className="row wrap" style={{ gap: 4, marginTop: 2 }}>
                      {Object.keys(x.recordings).length ? Object.keys(x.recordings).map((c) => <span key={c} className="badge ok">{english(c)}</span>) : <span className="small muted">Not recorded yet</span>}
                    </span>
                  </span>
                  {x.sent > 0 && <span className="small muted" title="Sent · listened · asked for prayer">{x.listened}/{x.sent} heard{x.prayer ? ` · ${x.prayer} 🙏` : ''}</span>}
                </button>
              ))}
            </div>
          )}
        </section>
        <Listeners d={d} onChange={q.setData} />
      </div>
      {d.recent.length > 0 && (
        <section className="card" style={{ marginTop: 16 }}>
          <div className="card-pad" style={{ paddingBottom: 0 }}><h3 style={{ margin: 0 }}>Recently sent and heard</h3></div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Who</th><th>Story</th><th>How</th><th>Sent</th><th>Heard</th></tr></thead>
              <tbody>{d.recent.map((r) => (
                <tr key={r.id}>
                  <td>{r.name ?? r.phone}</td>
                  <td>{r.storyTitle} <span className="small muted">({english(r.language)})</span></td>
                  <td className="small">{r.via === 'call' ? 'Called in' : 'Link'}</td>
                  <td className="small">{formatDay(r.at)}</td>
                  <td className="small">{r.prayerAt ? <span className="badge accent">Asked for prayer</span> : r.listenedAt ? <span className="row" style={{ gap: 4 }}><Check size={14} /> {formatDay(r.listenedAt)}</span> : <span className="muted">Not yet</span>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </section>
      )}
      {current && <StoryModal st={current} storage={d.storage} onClose={() => setOpen(null)} onChange={q.setData} />}
      {adding && <AddStory onClose={() => setAdding(false)} onSaved={(h) => { q.setData(h); setAdding(false); }} />}
      {settings && <SettingsModal d={d} onClose={() => setSettings(false)} onSaved={(h) => { q.setData(h); setSettings(false); }} />}
    </>
  );
}

function Listeners({ d, onChange }: { d: StoryLineHub; onChange: (h: StoryLineHub) => void }) {
  const [lang, setLang] = useState<LanguageCode>('te');
  const add = useAction(async (personId: string) => onChange(await AdminApi.stories.listener(personId, { language: lang })));
  return (
    <section className="card card-pad stack" style={{ gap: 10 }}>
      <h3 style={{ margin: 0 }}>Listeners</h3>
      <span className="small muted">People who would rather listen than read: older members, people who never went to school, new believers from oral cultures. They need a phone number.</span>
      <div className="row wrap" style={{ gap: 8 }}>
        <div className="grow" style={{ minWidth: 200 }}><PersonSearch onPick={(p) => void add.run(p.id)} exclude={d.listeners.map((l) => l.id)} placeholder="Add a listener" /></div>
        <select className="input" style={{ width: 'auto' }} value={lang} onChange={(e) => setLang(e.target.value as LanguageCode)} aria-label="Language">{CODES.map((c) => <option key={c} value={c}>{english(c)}</option>)}</select>
      </div>
      <FormError error={add.error} />
      {!d.listeners.length ? <span className="small muted">No listeners yet.</span> : d.listeners.map((l) => <ListenerRow key={l.id} l={l} onChange={onChange} />)}
    </section>
  );
}

function ListenerRow({ l, onChange }: { l: StoryListenerView; onChange: (h: StoryLineHub) => void }) {
  const toast = useToast();
  const save = useAction(async (body: Parameters<typeof AdminApi.stories.listener>[1]) => onChange(await AdminApi.stories.listener(l.id, body)));
  const remove = useAction(async () => onChange(await AdminApi.stories.removeListener(l.id)));
  const send = useAction(async () => { const r = await AdminApi.stories.send(l.id); onChange(r.hub); toast('Sent.'); });
  return (
    <div className="row wrap" style={{ gap: 8, padding: '6px 0', borderTop: '1px solid var(--border)', opacity: l.active ? 1 : 0.6 }}>
      <span className="grow" style={{ minWidth: 140 }}>
        <a href={`/admin/people?open=${l.id}`}><b>{l.name}</b></a>
        <span className="small muted" style={{ display: 'block' }}>{l.got ? `Heard ${l.heard} of ${l.got}${l.lastHeard ? ` · last ${formatDay(l.lastHeard)}` : ''}` : 'Nothing sent yet'}</span>
      </span>
      <select className="input sm" style={{ width: 'auto' }} value={l.language} onChange={(e) => void save.run({ language: e.target.value as LanguageCode })} aria-label="Language">{CODES.map((c) => <option key={c} value={c}>{english(c)}</option>)}</select>
      <select className="input sm" style={{ width: 'auto' }} value={l.channel} onChange={(e) => void save.run({ channel: e.target.value as 'whatsapp' | 'sms' })} aria-label="Send by"><option value="whatsapp">WhatsApp</option><option value="sms">SMS</option></select>
      <label className="row small" style={{ gap: 4 }}><input type="checkbox" checked={l.active} onChange={(e) => void save.run({ active: e.target.checked })} /> On</label>
      <button className="btn ghost icon sm" aria-label="Send the next story now" title="Send the next story now" disabled={send.busy || !l.active} onClick={() => void send.run()}><Send size={14} /></button>
      <button className="btn ghost icon sm danger" aria-label="Remove" onClick={() => void remove.run()}><Trash2 size={14} /></button>
      {(save.error || send.error) && <div style={{ width: '100%' }}><FormError error={save.error ?? send.error} /></div>}
    </div>
  );
}

function StoryModal({ st, storage, onClose, onChange }: { st: StoryView; storage: boolean; onClose: () => void; onChange: (h: StoryLineHub) => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ title: st.title, reference: st.reference, summary: st.summary });
  const [lang, setLang] = useState<LanguageCode>(CODES.find((c) => !st.recordings[c]) ?? 'te');
  const [mode, setMode] = useState<'record' | 'link'>('record');
  const [link, setLink] = useState('');
  const [uploading, setUploading] = useState<number | null>(null);
  const [recErr, setRecErr] = useState<string | null>(null);
  const save = useAction(async () => { onChange(await AdminApi.stories.update(st.id, form)); toast('Saved.'); });
  const remove = useAction(async () => { onChange(await AdminApi.stories.remove(st.id)); onClose(); });
  const setRec = useAction(async (body: { url?: string; mediaId?: string }, l: LanguageCode = lang) => { onChange(await AdminApi.stories.record(st.id, l, body)); setLink(''); });
  const keep = async (blob: Blob) => {
    setRecErr(null);
    if (!storage) { setRecErr('Recordings are kept in the church’s own Google Cloud Storage bucket. Connect it in Settings › Integrations, or record on a phone, put it online and paste the link.'); return; }
    setUploading(0);
    try {
      const ext = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm';
      const item = await uploadMedia(new File([blob], `story-${st.order}-${lang}.${ext}`, { type: blob.type || 'audio/webm' }), 'general', setUploading);
      await setRec.run({ mediaId: item.id });
      toast('Recording kept.');
    } catch (e) { setRecErr((e as Error).message); } finally { setUploading(null); }
  };
  const changed = form.title !== st.title || form.reference !== st.reference || form.summary !== st.summary;
  return (
    <Modal title={`${st.order}. ${st.title}`} onClose={onClose} footer={<>
      <button className="btn danger" disabled={remove.busy} onClick={() => void remove.run()}><Trash2 size={15} /> Remove story</button>
      <span style={{ flex: 1 }} />
      <button className="btn" onClick={onClose}>Close</button>
      {changed && <button className="btn primary" disabled={save.busy} onClick={() => void save.run()}>Save</button>}
    </>}>
      <div className="stack">
        <div className="row wrap" style={{ gap: 10 }}>
          <div className="grow"><Field label="Title"><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={100} /></Field></div>
          <div><Field label="Bible passage"><input className="input" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} maxLength={60} /></Field></div>
        </div>
        <Field label="What to tell" hint="For whoever records it. Tell it in your own words, as you would to a neighbour, in about three to five minutes. End with one question to think about."><textarea className="input" rows={3} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} maxLength={1000} /></Field>

        <div className="stack" style={{ gap: 6 }}>
          <b>Recordings</b>
          {Object.entries(st.recordings).length === 0 && <span className="small muted">None yet.</span>}
          {Object.entries(st.recordings).map(([c, r]) => (
            <div key={c} className="row wrap" style={{ gap: 8 }}>
              <span className="badge ok" style={{ minWidth: 70, justifyContent: 'center' }}>{english(c)}</span>
              <audio src={r!.url} controls preload="none" style={{ height: 34, flex: 1, minWidth: 180 }} />
              <span className="small muted">{r!.by}</span>
              <button className="btn ghost icon sm danger" aria-label={`Remove the ${english(c)} recording`} onClick={() => void setRec.run({}, c as LanguageCode)}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>

        <div className="card card-pad stack" style={{ gap: 8, background: 'var(--bg-subtle, transparent)' }}>
          <div className="row wrap" style={{ gap: 8 }}>
            <b className="grow">Add a recording in</b>
            <select className="input sm" style={{ width: 'auto' }} value={lang} onChange={(e) => setLang(e.target.value as LanguageCode)} aria-label="Recording language">{CODES.map((c) => <option key={c} value={c}>{english(c)}{st.recordings[c] ? ' (replace)' : ''}</option>)}</select>
          </div>
          <div className="row" style={{ gap: 6 }}>
            <button type="button" className={`opt-chip ${mode === 'record' ? 'on' : ''}`} onClick={() => setMode('record')}><Mic size={14} /> Record here</button>
            <button type="button" className={`opt-chip ${mode === 'link' ? 'on' : ''}`} onClick={() => setMode('link')}><Link2 size={14} /> Paste a link</button>
          </div>
          {mode === 'record' ? <AudioRecorder onKeep={(b) => void keep(b)} /> : (
            <div className="row wrap" style={{ gap: 8 }}>
              <input className="input grow" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://… (an MP3 or other audio file)" />
              <button className="btn primary" disabled={!link.trim() || setRec.busy} onClick={() => void setRec.run({ url: link.trim() })}>Save</button>
            </div>
          )}
          {uploading !== null && <span className="small muted">Uploading… {uploading}%</span>}
          {recErr && <span className="small" style={{ color: 'var(--danger, #b42318)' }}>{recErr}</span>}
          <FormError error={setRec.error ?? save.error ?? remove.error} />
        </div>
      </div>
    </Modal>
  );
}

const MAX_SECONDS = 15 * 60;

/** Microphone in the browser; listen back before keeping. */
function AudioRecorder({ onKeep }: { onKeep: (blob: Blob) => void }) {
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const stream = useRef<MediaStream | null>(null);
  const [state, setState] = useState<'idle' | 'recording' | 'review'>('idle');
  const [seconds, setSeconds] = useState(0);
  const [clip, setClip] = useState<{ url: string; blob: Blob } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => () => { stream.current?.getTracks().forEach((t) => t.stop()); }, []);
  useEffect(() => () => { if (clip) URL.revokeObjectURL(clip.url); }, [clip]);
  useEffect(() => {
    if (state !== 'recording') return;
    const h = setInterval(() => setSeconds((s) => { if (s + 1 >= MAX_SECONDS) stop(); return s + 1; }), 1000);
    return () => clearInterval(h);
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps
  const start = async () => {
    setErr(null);
    const Rec = (window as Window & { MediaRecorder?: typeof MediaRecorder }).MediaRecorder;
    if (!Rec) { setErr('This browser cannot record. Record on your phone and paste a link.'); return; }
    try {
      stream.current = stream.current ?? await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch { setErr('The browser did not give access to the microphone. Allow it in the address bar, or paste a link instead.'); return; }
    const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((t) => Rec.isTypeSupported?.(t)) ?? '';
    const r = new Rec(stream.current, type ? { mimeType: type } : undefined);
    chunks.current = [];
    r.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
    r.onstop = () => { const blob = new Blob(chunks.current, { type: type || 'audio/webm' }); setClip({ url: URL.createObjectURL(blob), blob }); setState('review'); };
    rec.current = r;
    r.start(1000);
    setSeconds(0);
    setState('recording');
  };
  const stop = () => { if (rec.current && rec.current.state !== 'inactive') rec.current.stop(); };
  const mm = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  return (
    <div className="stack" style={{ gap: 8 }}>
      {state === 'review' && clip && <audio src={clip.url} controls style={{ width: '100%' }} />}
      <div className="row wrap" style={{ gap: 8, alignItems: 'center' }}>
        {state === 'idle' && <button type="button" className="btn primary sm" onClick={() => void start()}><Circle size={14} /> Start recording</button>}
        {state === 'recording' && <><button type="button" className="btn danger sm" onClick={stop}><Square size={14} /> Stop</button><span className="badge" style={{ background: '#b42318', color: '#fff' }}>● {mm}</span></>}
        {state === 'review' && clip && <><button type="button" className="btn primary sm" onClick={() => onKeep(clip.blob)}><Upload size={14} /> Keep this one</button><button type="button" className="btn sm" onClick={() => { setClip(null); setState('idle'); }}>Record again</button></>}
      </div>
      {state === 'idle' && <span className="small muted">Find a quiet room, hold the phone or laptop close, and tell the story slowly, as you would to a neighbour.</span>}
      {err && <span className="small" style={{ color: 'var(--danger, #b42318)' }}>{err}</span>}
    </div>
  );
}

function AddStory({ onClose, onSaved }: { onClose: () => void; onSaved: (h: StoryLineHub) => void }) {
  const [form, setForm] = useState({ title: '', reference: '', summary: '' });
  const save = useAction(async () => onSaved(await AdminApi.stories.add(form)));
  return (
    <Modal title="Add a story" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!form.title.trim() || save.busy} onClick={() => void save.run()}>Add</button></>}>
      <div className="stack">
        <Field label="Title"><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. The lost sheep" maxLength={100} autoFocus /></Field>
        <Field label="Bible passage"><input className="input" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="e.g. Luke 15:1-7" maxLength={60} /></Field>
        <Field label="What to tell (for whoever records it)"><textarea className="input" rows={3} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} maxLength={1000} /></Field>
        <span className="small muted">It goes at the end of the series.</span>
        <FormError error={save.error} />
      </div>
    </Modal>
  );
}

function SettingsModal({ d, onClose, onSaved }: { d: StoryLineHub; onClose: () => void; onSaved: (h: StoryLineHub) => void }) {
  const toast = useToast();
  const [s, setS] = useState(d.settings);
  const save = useAction(async () => onSaved(await AdminApi.stories.settings(s)));
  const copy = async (text: string) => { try { await navigator.clipboard.writeText(text); toast('Copied.'); } catch { toast('Select the text and copy it.', 'error'); } };
  return (
    <Modal title="Settings and phone line" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={save.busy} onClick={() => void save.run()}>Save</button></>}>
      <div className="stack">
        <div className="row wrap" style={{ gap: 10 }}>
          <Field label="How often"><select className="input" value={s.cadence} onChange={(e) => setS({ ...s, cadence: e.target.value as 'daily' | 'weekly' })}><option value="weekly">Once a week</option><option value="daily">Every day</option></select></Field>
          {s.cadence === 'weekly' && <Field label="On"><select className="input" value={s.weekday} onChange={(e) => setS({ ...s, weekday: Number(e.target.value) })}>{DAYS.map((x, i) => <option key={x} value={i}>{x}</option>)}</select></Field>}
          <Field label="New listeners get it by"><select className="input" value={s.channel} onChange={(e) => setS({ ...s, channel: e.target.value as 'whatsapp' | 'sms' })}><option value="whatsapp">WhatsApp</option><option value="sms">SMS</option></select></Field>
        </div>
        <span className="small muted">Stories go out in the morning, after 8 am.</span>
        <Field label="Story number (optional)" hint="A number people can call, or give a missed call to, to hear the story on any phone. It is added to the messages."><input className="input" value={s.callNumber} onChange={(e) => setS({ ...s, callNumber: e.target.value })} placeholder="e.g. 080 4718 2000" maxLength={20} /></Field>
        {d.callUrl && (
          <div className="stack" style={{ gap: 6 }}>
            <b>Connect the number</b>
            <span className="small muted">Take a virtual number from a phone provider and point its call webhook here. Twilio or Plivo: use the first link as the voice webhook. Exotel or similar: use the second link in a greeting step that plays a dynamic audio URL, then a gather step that calls the first link with the key pressed.</span>
            {[`${d.callUrl}?format=twiml`, `${d.callUrl}?format=url`].map((u) => (
              <div key={u} className="row" style={{ gap: 6 }}>
                <code className="small grow" style={{ wordBreak: 'break-all' }}>{u}</code>
                <button className="btn ghost icon sm" aria-label="Copy" onClick={() => void copy(u)}><Copy size={14} /></button>
              </div>
            ))}
          </div>
        )}
        <FormError error={save.error} />
      </div>
    </Modal>
  );
}
