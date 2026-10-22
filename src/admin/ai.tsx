// AI helpers in the church office: the assistant page, a writer for any message box, sermon
// follow-up material and worship set suggestions. Everything hides when AI is off on the server.
import { Copy, Languages, ListMusic, RotateCcw, Send, Sparkles, Wand2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import type { AiPurpose, AiSermonKind, AiSetlist, AiStatus, Sermon } from '@/api/admin-types';
import { adminSession } from '@/api/client';
import { AdminApi } from '@/api/endpoints';
import { FormError, Loading, Modal, Segmented, useToast } from '@/components/ui';
import { useAction } from '@/lib/use-api';

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
export function AiText({ text }: { text: string }) {
  const out: React.ReactNode[] = [];
  let list: string[] = [];
  const bold = (s: string) => s.split(/(\*\*[^*]+\*\*)/).map((p, i) => (p.startsWith('**') ? <b key={i}>{p.slice(2, -2)}</b> : p));
  const flush = () => { if (list.length) out.push(<ul key={`l${out.length}`}>{list.map((l, i) => <li key={i}>{bold(l)}</li>)}</ul>); list = []; };
  for (const line of text.split('\n')) {
    const t = line.trim();
    const li = /^([-*•]|\d+\.)\s+(.*)/.exec(t);
    if (li) { list.push(li[2]); continue; }
    flush();
    if (!t) continue;
    const h = /^#{1,4}\s+(.*)/.exec(t);
    out.push(h ? <h4 key={out.length}>{bold(h[1])}</h4> : <p key={out.length}>{bold(t)}</p>);
  }
  flush();
  return <div className="ai-text">{out}</div>;
}

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

type Turn = { role: 'user' | 'assistant'; text: string; tools?: string[] };
const SUGGESTIONS = ['Give me my weekly briefing', 'Who has a birthday or anniversary in the next two weeks?', 'Which volunteers have not confirmed for Sunday?', 'Who are the newest visitors and have they been followed up?', 'Which small groups have the most members?'];

export function AssistantPage() {
  const { status, loaded } = useAiStatus();
  const ai = status?.enabled ? status : null;
  const [turns, setTurns] = useState<Turn[]>([]);
  const [used, setUsed] = useState<number | null>(null);
  const [q, setQ] = useState('');
  const end = useRef<HTMLDivElement>(null);
  const ask = useAction(async (question: string, history: Turn[]) =>
    /weekly briefing/i.test(question) && !history.length ? AdminApi.ai.briefing() : AdminApi.ai.ask(question, history.map(({ role, text }) => ({ role, text }))));
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [turns, ask.busy]);
  const send = async (question: string) => {
    if (!question.trim() || ask.busy) return;
    const history = turns;
    setTurns([...history, { role: 'user', text: question }]);
    setQ('');
    const res = await ask.run(question, history);
    if (res) setTurns((t) => [...t, { role: 'assistant', text: res.answer, tools: res.toolsUsed }]);
    refreshAi();
    void AdminApi.ai.status().then((s) => setUsed(s.used), () => undefined);
  };
  return (
    <>
      <PageHeader title="Assistant" subtitle="Ask about your church in plain words. It reads your Flockwise data with your permissions and never changes anything." />
      {!loaded ? <Loading /> : !ai ? (
        <div className="card card-pad"><p style={{ margin: 0 }}>The assistant isn’t switched on for this server yet. The Flockwise team turns it on with your plan.</p></div>
      ) : (
        <div className="card ai-chat">
          <div className="ai-turns">
            {turns.length === 0 && (
              <div className="stack" style={{ gap: 8 }}>
                <p className="muted" style={{ margin: 0 }}>Try one of these:</p>
                <div className="row wrap" style={{ gap: 6 }}>{SUGGESTIONS.map((s) => <button key={s} className="chip" onClick={() => void send(s)}>{s}</button>)}</div>
              </div>
            )}
            {turns.map((t, i) => (
              <div key={i} className={`ai-turn ${t.role}`}>
                {t.role === 'assistant' ? <AiText text={t.text} /> : <p style={{ margin: 0 }}>{t.text}</p>}
                {t.tools && t.tools.length > 0 && <div className="small muted">Looked at: {[...new Set(t.tools)].map((x) => x.replace(/_/g, ' ')).join(', ')}</div>}
              </div>
            ))}
            {ask.busy && <div className="ai-turn assistant muted">Looking that up…</div>}
            <FormError error={ask.error} />
            <div ref={end} />
          </div>
          <form className="ai-ask" onSubmit={(e) => { e.preventDefault(); void send(q); }}>
            {turns.length > 0 && <button type="button" className="btn ghost icon" aria-label="New conversation" title="New conversation" onClick={() => setTurns([])}><RotateCcw size={16} /></button>}
            <input className="input grow" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask anything about your church…" maxLength={2000} aria-label="Question" />
            <button className="btn primary" type="submit" disabled={!q.trim() || ask.busy}><Send size={15} /> Ask</button>
          </form>
          <div className="small muted ai-usage">{used ?? ai.used} of {ai.limit} AI requests used this month</div>
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
