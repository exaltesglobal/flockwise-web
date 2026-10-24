// AI helpers in the church office: the assistant page, a writer for any message box, sermon
// follow-up material and worship set suggestions. Everything hides when AI is off on the server.
import { Copy, Languages, ListMusic, Mic, RotateCcw, Send, Sparkles, Square, Volume2, VolumeX, Wand2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import type { AiPurpose, AiSermonKind, AiSetlist, AiStatus, Sermon } from '@/api/admin-types';
import type { VoiceAction } from '@/core/types';
import { adminSession } from '@/api/client';
import { AdminApi } from '@/api/endpoints';
import { FormError, Loading, Mark, Modal, Segmented, useToast } from '@/components/ui';
import { LightMarkdown } from '@/components/markdown';
import { useAction } from '@/lib/use-api';

import { canDictate, DICTATION_LANGS, useDictation } from './components/dictate';
import { VoiceActionCard } from './components/voice-actions';
import { PageHeader } from './layout';

export const AI_LANGS: { value: string; label: string }[] = [
  { value: 'en', label: 'English' }, { value: 'hi', label: 'हिन्दी Hindi' }, { value: 'te', label: 'తెలుగు Telugu' }, { value: 'ta', label: 'தமிழ் Tamil' },
  { value: 'ml', label: 'മലയാളം Malayalam' }, { value: 'kn', label: 'ಕನ್ನಡ Kannada' }, { value: 'mr', label: 'मराठी Marathi' }, { value: 'bn', label: 'বাংলা Bengali' },
  { value: 'gu', label: 'ગુજરાતી Gujarati' }, { value: 'pa', label: 'ਪੰਜਾਬੀ Punjabi' }, { value: 'or', label: 'ଓଡ଼ିଆ Odia' }, { value: 'lus', label: 'Mizo' }, { value: 'ne', label: 'नेपाली Nepali' },
];

let cached: Promise<AiStatus | null> | null = null;
/** The church's AI status (asked once per page load) and whether the answer has arrived. */
function useAiStatus() {
  const [st, setSt] = useState<{ status: AiStatus | null; loaded: boolean }>({ status: null, loaded: false });
  useEffect(() => {
    if (!adminSession.get()) return;
    cached ??= AdminApi.ai.status().catch(() => null);
    // A failed check (signed out, offline) is not remembered, so the next screen asks again.
    void cached.then((s) => { if (!s) cached = null; setSt({ status: s, loaded: true }); });
  }, []);
  return st;
}
/** The AI status when AI is on for this church, otherwise null. */
export function useAi() {
  const { status } = useAiStatus();
  return status?.enabled ? status : null;
}
const refreshAi = () => { cached = null; };

/** Light Markdown (headings, bullets, bold) for AI replies. */
export const AiText = ({ text }: { text: string }) => <LightMarkdown text={text} />;

function copy(text: string, toast: ReturnType<typeof useToast>) {
  navigator.clipboard?.writeText(text).then(() => toast('Copied'), () => toast('Select the text to copy it', 'error'));
}

// ---------------------------------------------------------------- writer for message boxes

/**
 * "Write with AI" for a message box: describe it in a line, get a draft; or rewrite or translate
 * what is already there.
 */
export function AiWriter({ purpose, channel, body, onDraft }: { purpose: AiPurpose; channel?: string; body: string; onDraft: (d: { subject: string; text: string }) => void }) {
  const ai = useAi();
  const [open, setOpen] = useState(false);
  const [brief, setBrief] = useState('');
  const [lang, setLang] = useState('en');
  const write = useAction(() => AdminApi.ai.write({ purpose, channel, brief: brief.trim() || 'Improve this message', language: lang, draft: body.trim() || undefined }));
  const translate = useAction(() => AdminApi.ai.translate(body, lang));
  if (!ai) return null;
  if (!open) return <button type="button" className="btn sm ghost ai-btn" onClick={() => setOpen(true)}><Sparkles size={14} /> Write with AI</button>;
  return (
    <div className="ai-writer">
      <div className="row wrap" style={{ gap: 6 }}>
        <input className="input grow" value={brief} onChange={(e) => setBrief(e.target.value)} placeholder={body.trim() ? 'How to change it, e.g. shorter and warmer' : 'What is it about? e.g. Youth night Friday 7 pm, bring a friend'} maxLength={2000}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void write.run().then((d) => d && onDraft(d)); } }} />
        <select className="select" style={{ width: 'auto' }} value={lang} onChange={(e) => setLang(e.target.value)} aria-label="Language">
          {AI_LANGS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
        </select>
      </div>
      <div className="row wrap" style={{ gap: 6 }}>
        <button type="button" className="btn sm primary" disabled={write.busy || (!brief.trim() && !body.trim())} onClick={async () => { const d = await write.run(); if (d) { onDraft(d); refreshAi(); } }}>
          <Wand2 size={14} /> {write.busy ? 'Writing…' : body.trim() ? 'Rewrite' : 'Write draft'}
        </button>
        {body.trim() && lang !== 'en' && (
          <button type="button" className="btn sm" disabled={translate.busy} onClick={async () => { const t = await translate.run(); if (t) onDraft({ subject: '', text: t.text }); }}>
            <Languages size={14} /> {translate.busy ? 'Translating…' : 'Translate what’s there'}
          </button>
        )}
        <span className="small muted">Check names, dates and amounts before you send.</span>
      </div>
      <FormError error={write.error ?? translate.error} />
    </div>
  );
}

// ---------------------------------------------------------------- assistant page

type Turn = { role: 'user' | 'assistant'; text: string; tools?: string[]; actions?: VoiceAction[] };
const SUGGESTIONS = ['Give me my weekly briefing', 'Who has a birthday or anniversary in the next two weeks?', 'Which volunteers have not confirmed for Sunday?', 'Who are the newest visitors and have they been followed up?', 'Which small groups have the most members?'];

const LANG_KEY = 'fw.voiceLang';
const SPEAK_KEY = 'fw.voiceSpeak';
const store = { get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private window */ } } };

/** Reads an answer aloud in the language it was asked in, when the browser has a voice for it. */
function say(text: string, lang: string) {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
  if (!synth) return;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/[*_#>`]/g, ''));
  u.lang = lang;
  const voice = synth.getVoices().find((v) => v.lang.replace('_', '-').toLowerCase().startsWith(lang.slice(0, 2).toLowerCase()));
  if (voice) u.voice = voice;
  synth.speak(u);
}

export function AssistantPage() {
  const { status, loaded } = useAiStatus();
  const ai = status?.enabled ? status : null;
  const [turns, setTurns] = useState<Turn[]>([]);
  const [used, setUsed] = useState<number | null>(null);
  const [q, setQ] = useState('');
  const [lang, setLang] = useState(() => store.get(LANG_KEY) ?? 'en-IN');
  const [speak, setSpeak] = useState(() => store.get(SPEAK_KEY) === '1');
  const heard = useRef('');
  const end = useRef<HTMLDivElement>(null);
  const dict = useDictation(lang, (t) => { heard.current += t; setQ(heard.current); });
  const ask = useAction(async (question: string, history: Turn[], spoken: boolean) =>
    /weekly briefing/i.test(question) && !history.length ? AdminApi.ai.briefing().then((r) => ({ ...r, actions: [] as VoiceAction[] })) : AdminApi.ai.voice(question, lang.slice(0, 2), history.map(({ role, text }) => ({ role, text })), spoken));
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [turns, ask.busy]);
  const send = async (question: string, spoken = false) => {
    if (!question.trim() || ask.busy) return;
    const history = turns;
    setTurns([...history, { role: 'user', text: question }]);
    setQ('');
    heard.current = '';
    const res = await ask.run(question, history, spoken);
    if (res) {
      setTurns((t) => [...t, { role: 'assistant', text: res.answer, tools: res.toolsUsed, actions: res.actions }]);
      if (spoken && speak) say(res.answer, lang);
    }
    refreshAi();
    void AdminApi.ai.status().then((s) => setUsed(s.used), () => undefined);
  };
  const mic = () => {
    if (dict.listening) { dict.stop(); void send(heard.current, true); return; }
    heard.current = '';
    setQ('');
    window.speechSynthesis?.cancel();
    dict.start();
  };
  return (
    <>
      <PageHeader title="Assistant" subtitle="Ask about your church in plain words, typed or spoken in your own language. It reads your Flockwise data with your permissions. Ask it to add a family, record a gift or a care follow-up, and it prepares a card for you to check and confirm; nothing changes until you do." />
      {!loaded ? <Loading /> : !ai ? (
        <div className="card card-pad"><p style={{ margin: 0 }}>The assistant isn’t switched on for this server yet. The Flockwise team turns it on with your plan.</p></div>
      ) : (
        <div className="card ai-chat">
          <div className="ai-turns">
            {turns.length === 0 && (
              <div className="ai-welcome">
                <Mark size={44} />
                <h2>What would you like to know?</h2>
                <p className="muted">Pick a question, type your own, or press the microphone and speak, for example: “Add Ravi’s family, his wife Sunita and their son Anil” or “How much came for the building fund this month?”</p>
                <div className="ai-suggest">{SUGGESTIONS.map((x) => <button key={x} className="card" onClick={() => void send(x)}><Sparkles size={15} /> <span>{x}</span></button>)}</div>
              </div>
            )}
            {turns.map((t, i) => (
              <div key={i} className={`ai-turn ${t.role}`}>
                {t.role === 'assistant' ? <AiText text={t.text} /> : <p style={{ margin: 0 }}>{t.text}</p>}
                {t.actions?.map((a, n) => <VoiceActionCard key={n} action={a} />)}
                {t.tools && t.tools.filter((x) => !x.startsWith('propose_')).length > 0 && <div className="small muted">Looked at: {[...new Set(t.tools.filter((x) => !x.startsWith('propose_')))].map((x) => x.replace(/_/g, ' ')).join(', ')}</div>}
              </div>
            ))}
            {ask.busy && <div className="ai-turn assistant muted">Looking that up…</div>}
            <FormError error={ask.error} />
            <div ref={end} />
          </div>
          <form className="ai-ask" onSubmit={(e) => { e.preventDefault(); if (dict.listening) dict.stop(); void send(q); }}>
            {turns.length > 0 && <button type="button" className="btn ghost icon" aria-label="New conversation" title="New conversation" onClick={() => setTurns([])}><RotateCcw size={16} /></button>}
            {canDictate() && <button type="button" className={`btn icon ${dict.listening ? 'danger' : ''}`} onClick={mic} aria-pressed={dict.listening} aria-label={dict.listening ? 'Stop and send' : 'Speak'} title={dict.listening ? 'Stop and send' : 'Speak'}>{dict.listening ? <Square size={16} /> : <Mic size={16} />}</button>}
            <input className="input grow" value={dict.listening ? `${q}${dict.interim}` : q} onChange={(e) => { heard.current = e.target.value; setQ(e.target.value); }} placeholder={dict.listening ? 'Listening… press the square to send' : 'Ask anything about your church…'} maxLength={2000} aria-label="Question" />
            <button className="btn primary" type="submit" disabled={!q.trim() || ask.busy}><Send size={15} /> Ask</button>
          </form>
          <div className="row wrap small muted ai-usage" style={{ gap: 10 }}>
            <span>{used ?? ai.used} of {ai.limit} AI requests used this month</span>
            <span style={{ flex: 1 }} />
            {canDictate() && (
              <>
                <select className="select" style={{ width: 'auto', height: 28 }} value={lang} disabled={dict.listening} onChange={(e) => { setLang(e.target.value); store.set(LANG_KEY, e.target.value); }} aria-label="Speak in">
                  {DICTATION_LANGS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
                <button type="button" className="btn ghost sm" onClick={() => { setSpeak(!speak); store.set(SPEAK_KEY, speak ? '0' : '1'); if (speak) window.speechSynthesis?.cancel(); }} aria-pressed={speak}>{speak ? <Volume2 size={14} /> : <VolumeX size={14} />} {speak ? 'Answers read aloud' : 'Read answers aloud'}</button>
              </>
            )}
            {dict.error && <span className="danger-text">{dict.error}</span>}
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------- sermons and worship

const SERMON_KINDS: { value: AiSermonKind; label: string }[] = [
  { value: 'discussion', label: 'Small-group questions' }, { value: 'summary', label: 'Newsletter summary' }, { value: 'social', label: 'Social posts' },
  { value: 'kids', label: 'Kids version' }, { value: 'outline', label: 'Preaching outline' },
];

export function SermonAiModal({ sermon, onClose }: { sermon: Pick<Sermon, 'title'> & Partial<Sermon>; onClose: () => void }) {
  const toast = useToast();
  const [kind, setKind] = useState<AiSermonKind>('discussion');
  const [lang, setLang] = useState('en');
  const s = sermon as Partial<Sermon> & { passage?: string; scripture?: string; notes?: string; description?: string; summary?: string };
  const [notes, setNotes] = useState(s.notes ?? s.summary ?? s.description ?? '');
  const gen = useAction(() => AdminApi.ai.sermon({ kind, title: sermon.title, passage: s.passage ?? s.scripture ?? '', notes, language: lang }));
  const [out, setOut] = useState('');
  return (
    <Modal wide title={<><Sparkles size={16} /> Sermon follow-up · {sermon.title}</>} onClose={onClose}
      footer={<>{out && <button className="btn" onClick={() => copy(out, toast)}><Copy size={15} /> Copy</button>}<button className="btn primary" disabled={gen.busy} onClick={async () => { const r = await gen.run(); if (r) setOut(r.text); }}><Wand2 size={15} /> {gen.busy ? 'Writing…' : out ? 'Write again' : 'Write'}</button></>}>
      <div className="stack">
        <Segmented value={kind} options={SERMON_KINDS} onChange={setKind} />
        <div className="row wrap" style={{ gap: 6 }}>
          <select className="select" style={{ width: 'auto' }} value={lang} onChange={(e) => setLang(e.target.value)} aria-label="Language">{AI_LANGS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}</select>
        </div>
        <textarea className="textarea" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Paste the sermon notes or main points. The more you give, the closer it stays to what was preached." />
        <FormError error={gen.error} />
        {out && <div className="ai-out"><AiText text={out} /></div>}
      </div>
    </Modal>
  );
}

/** Suggests songs from the church's own library for a theme; the leader picks which to add. */
export function SetlistModal({ theme: initialTheme, onAdd, onClose }: { theme: string; onAdd: (songIds: string[]) => void; onClose: () => void }) {
  const [theme, setTheme] = useState(initialTheme);
  const [count, setCount] = useState(4);
  const [res, setRes] = useState<AiSetlist | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const gen = useAction(() => AdminApi.ai.setlist(theme, count));
  const run = async () => { const r = await gen.run(); if (r) { setRes(r); setPicked(r.songs.map((s) => s.songId)); } };
  return (
    <Modal title={<><ListMusic size={16} /> Suggest songs</>} onClose={onClose}
      footer={<>{res && <button className="btn primary" disabled={!picked.length} onClick={() => onAdd(picked)}>Add {picked.length} to plan</button>}<button className={`btn ${res ? '' : 'primary'}`} disabled={gen.busy} onClick={() => void run()}><Sparkles size={15} /> {gen.busy ? 'Thinking…' : res ? 'Try again' : 'Suggest'}</button></>}>
      <div className="stack">
        <div className="row wrap" style={{ gap: 6 }}>
          <input className="input grow" value={theme} onChange={(e) => setTheme(e.target.value)} placeholder="Theme or sermon, e.g. The Good Shepherd, John 10" />
          <select className="select" style={{ width: 'auto' }} value={count} onChange={(e) => setCount(Number(e.target.value))} aria-label="How many songs">{[3, 4, 5, 6].map((n) => <option key={n} value={n}>{n} songs</option>)}</select>
        </div>
        <p className="small muted" style={{ margin: 0 }}>Chooses only from your song library, keeps keys and tempos flowing, and rests songs you sang recently.</p>
        <FormError error={gen.error} />
        {res && (
          <div className="stack" style={{ gap: 6 }}>
            {res.songs.map((s, i) => (
              <label key={s.songId} className="list-row" style={{ alignItems: 'flex-start', gap: 10 }}>
                <input type="checkbox" checked={picked.includes(s.songId)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, s.songId] : p.filter((x) => x !== s.songId)))} style={{ marginTop: 4 }} />
                <div className="grow" style={{ minWidth: 0 }}><div style={{ fontWeight: 600 }}>{i + 1}. {s.title}</div><div className="small muted">{s.reason}</div></div>
              </label>
            ))}
            {res.note && <p className="small muted" style={{ margin: 0 }}>{res.note}</p>}
          </div>
        )}
      </div>
    </Modal>
  );
}
