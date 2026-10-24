// Sing it in my language. While the church's screen shows a song, the phone shows the same lines
// as they change, in the language the person picks: the song's own words, its second language,
// English letters, or the meaning in their language. Members open /app/sing (and see a card on
// Home while a song is up); visitors open /sing without signing in.
import { Music, Radio } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';

import { memberSession } from '@/api/client';
import { MemberApi, PublicApi } from '@/api/endpoints';
import type { LiveSong } from '@/core/types';
import { LANGUAGES } from '@/core/languages';
import { useStrings } from '@/i18n';
import { useSession } from '@/lib/session';

import './sing.css';

const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private window */ } };
const MINE = ['en', 'hi', 'te', 'ta', 'ml', 'kn', 'mr', 'bn', 'gu', 'pa', 'or'];

/** Asks for the song every 2.5 seconds while one is up, every 15 seconds otherwise, and not while hidden. */
function useLiveSong(lang: string, member: boolean) {
  const [live, setLive] = useState<LiveSong | null | undefined>(undefined);
  const [church, setChurch] = useState('');
  const up = useRef(false);
  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      if (document.hidden) { timer = setTimeout(tick, 15_000); return; }
      ((member ? MemberApi.liveSong(lang) : PublicApi.liveSong(lang)) as Promise<{ live: LiveSong | null; churchName?: string }>)
        .then((r) => { up.current = !!r.live; if (!stop) { setLive(r.live); if (r.churchName) setChurch(r.churchName); } }, () => { if (!stop) setLive((x) => x ?? null); })
        .finally(() => { if (!stop) timer = setTimeout(tick, up.current ? 2500 : 15_000); });
    };
    tick();
    const onVis = () => { if (!document.hidden) { clearTimeout(timer); tick(); } };
    document.addEventListener('visibilitychange', onVis);
    return () => { stop = true; clearTimeout(timer); document.removeEventListener('visibilitychange', onVis); };
  }, [lang, member]);
  return { live, church };
}

export function SingView({ member }: { member: boolean }) {
  const session = useSession(memberSession);
  const home = session?.member.language ?? 'en';
  const [lang, setLang] = useState(() => read('fw.sing.lang') ?? home);
  const { t } = useStrings(member ? home : read('fw.ask.lang') ?? lang);
  const { live, church } = useLiveSong(lang, member);
  const pick = (l: string) => { setLang(l); write('fw.sing.lang', l); };
  const name = (code: string) => LANGUAGES.find((l) => l.code === code)?.label ?? code;
  const singable = live?.versions ?? [];
  const others = MINE.filter((c) => !singable.some((v) => v.key === c));
  const active = singable.some((v) => v.key === lang) || others.includes(lang) ? lang : live?.language;

  return (
    <div className="sing stack">
      <div>
        <h1 className="sing-h">{t('singTitle')}</h1>
        {!member && church && <span className="small muted">{church}</span>}
      </div>
      {live === undefined ? null : !live ? (
        <div className="card card-pad muted sing-wait"><Music size={22} /> {t('singWaiting')}</div>
      ) : (
        <>
          <div className="sing-langs" role="tablist">
            {singable.map((v) => <button key={v.key} role="tab" aria-selected={lang === v.key} className={active === v.key ? 'on' : ''} onClick={() => pick(v.key)}>{v.kind === 'roman' ? t('singLetters') : v.label}</button>)}
            <select value={others.includes(lang) ? lang : ''} onChange={(e) => e.target.value && pick(e.target.value)} aria-label="Language" className={others.includes(lang) ? 'on' : ''}>
              <option value="">…</option>
              {others.map((c) => <option key={c} value={c}>{name(c)}</option>)}
            </select>
          </div>
          <article className="sing-card" aria-live="polite">
            <header className="sing-meta">
              <span><Radio size={13} /> {live.songTitle}</span>
              <span>{live.label}{live.slides > 1 && live.slide > 0 ? ` · ${t('singOf', { n: live.slide, m: live.slides })}` : ''}</span>
            </header>
            <div className={`sing-lines ${live.kind}`}>{live.lines.map((l, i) => <p key={i}>{l}</p>)}</div>
            {live.kind === 'meaning' && (
              <div className="sing-sung">
                <span className="small muted">{t('singMeaning')}</span>
                {live.sung.map((l, i) => <p key={i}>{l}</p>)}
              </div>
            )}
            {live.kind === 'roman' && live.sung.length > 0 && <div className="sing-sung">{live.sung.map((l, i) => <p key={i}>{l}</p>)}</div>}
            <footer className="small muted row between wrap" style={{ gap: 8 }}>
              <span>{live.next ? t('singNext', { label: live.next }) : ''}</span>
              {live.copyright && <span>{live.copyright}</span>}
            </footer>
          </article>
        </>
      )}
    </div>
  );
}

export function MemberSingPage() {
  return <SingView member />;
}

export function PublicSingPage() {
  useEffect(() => { document.title = 'Sing along'; }, []);
  return <div className="sing-public"><SingView member={false} /></div>;
}

/** On Home while a song is on the screen. */
export function LiveSongCard() {
  const session = useSession(memberSession);
  const { t } = useStrings(session?.member.language);
  const lang = read('fw.sing.lang') ?? session?.member.language ?? 'en';
  const { live } = useLiveSong(lang, true);
  if (!live) return null;
  return (
    <Link to="/app/sing" className="card card-pad row sing-home" style={{ gap: 10 }}>
      <Music size={20} />
      <span className="grow"><span className="eyebrow">{t('singOnScreen')}</span><b style={{ display: 'block' }}>{live.songTitle}</b><span className="small muted">{live.lines[0]}</span></span>
      <span className="btn sm primary">{t('singOpen')}</span>
    </Link>
  );
}
