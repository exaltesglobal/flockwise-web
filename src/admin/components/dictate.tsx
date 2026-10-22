// Voice notes through the browser's own speech recognition (Chrome, Edge, Android Chrome, Safari):
// nothing is uploaded and no AI credit is spent until the office asks for the notes to be tidied.
import { Mic, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean;
  start(): void; stop(): void; abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};
const Ctor = (): (new () => Recognition) | null => {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};
export const canDictate = () => typeof window !== 'undefined' && !!Ctor();

/** Speech languages the office can dictate in, by the church's language codes. */
export const DICTATION_LANGS: { value: string; label: string }[] = [
  { value: 'en-IN', label: 'English (India)' }, { value: 'hi-IN', label: 'हिन्दी Hindi' }, { value: 'te-IN', label: 'తెలుగు Telugu' }, { value: 'ta-IN', label: 'தமிழ் Tamil' },
  { value: 'ml-IN', label: 'മലയാളം Malayalam' }, { value: 'kn-IN', label: 'ಕನ್ನಡ Kannada' }, { value: 'mr-IN', label: 'मराठी Marathi' }, { value: 'bn-IN', label: 'বাংলা Bengali' },
  { value: 'gu-IN', label: 'ગુજરાતી Gujarati' }, { value: 'pa-IN', label: 'ਪੰਜਾਬੀ Punjabi' }, { value: 'ur-IN', label: 'اردو Urdu' }, { value: 'en-US', label: 'English (US)' },
];

/**
 * Keeps listening until stopped; finished phrases go to `onText` (with a trailing space), the
 * phrase still being spoken comes back as `interim` to show under the box.
 */
export function useDictation(lang: string, onText: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Recognition | null>(null);
  const cb = useRef(onText);
  cb.current = onText;
  useEffect(() => () => rec.current?.abort(), []);

  const stop = () => { rec.current?.stop(); rec.current = null; setListening(false); setInterim(''); };
  const start = () => {
    const C = Ctor();
    if (!C) { setError('This browser cannot listen. Use Chrome or Edge, or the Android app.'); return; }
    const r = new C();
    r.lang = lang; r.continuous = true; r.interimResults = true;
    r.onresult = (e) => {
      let live = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) cb.current(res[0].transcript.trim() + ' ');
        else live += res[0].transcript;
      }
      setInterim(live);
    };
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') setError('Allow the microphone in the browser to dictate.');
      else if (e.error !== 'aborted' && e.error !== 'no-speech') setError(`Listening stopped (${e.error}).`);
    };
    // Browsers end a session after a pause; start again until the office presses stop.
    r.onend = () => { if (rec.current === r) { try { r.start(); } catch { setListening(false); } } };
    rec.current = r;
    setError(null);
    r.start();
    setListening(true);
  };
  return { listening, interim, error, start, stop, toggle: () => (listening ? stop() : start()) };
}

export function DictateButton({ lang, onLang, onText, className = 'btn sm' }: { lang: string; onLang: (l: string) => void; onText: (t: string) => void; className?: string }) {
  const d = useDictation(lang, onText);
  if (!canDictate()) return <span className="small muted">Dictation needs Chrome, Edge or the Android app.</span>;
  return (
    <div className="row wrap" style={{ gap: 6 }}>
      <button type="button" className={`${className} ${d.listening ? 'danger' : ''}`} onClick={d.toggle} aria-pressed={d.listening}>
        {d.listening ? <><Square size={14} /> Stop</> : <><Mic size={14} /> Dictate</>}
      </button>
      <select className="select" style={{ width: 'auto', height: 32 }} value={lang} onChange={(e) => onLang(e.target.value)} disabled={d.listening} aria-label="Speak in">
        {DICTATION_LANGS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
      </select>
      {d.listening && <span className="small muted dictating">Listening… {d.interim}</span>}
      {d.error && <span className="small danger-text">{d.error}</span>}
    </div>
  );
}
