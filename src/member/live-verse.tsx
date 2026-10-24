// "On the screen now": when the church's screen shows a Bible reading, members following along see
// it here in their own Bible, with a tap to open it in the reader. Asks every 20 seconds while the
// app is open and visible, and every 10 seconds while a reading is showing.
import { BookOpen, Radio } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';

import { memberSession } from '@/api/client';
import { MemberApi } from '@/api/endpoints';
import { FEATURED_BIBLES } from '@/core/bible-texts';
import type { LiveVerse } from '@/core/types';
import { useT } from '@/i18n';
import { useSession } from '@/lib/session';

/** The Bible the member reads in: the one open in the reader, else the first in their language. */
export function myBible(lang: string): string {
  try {
    const saved = JSON.parse(localStorage.getItem('fw.bible.place') ?? 'null') as { tr?: string } | null;
    if (saved?.tr) return saved.tr;
  } catch { /* private window */ }
  return FEATURED_BIBLES.find((b) => b.app === lang)?.id ?? 'engbsb';
}

export function LiveVerseCard() {
  const { t, lang } = useT();
  const session = useSession(memberSession);
  const tr = myBible(session?.member.language ?? lang);
  const [live, setLive] = useState<LiveVerse | null>(null);
  const [all, setAll] = useState(false);
  const showing = useRef(false);
  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      if (document.hidden) { timer = setTimeout(tick, 20_000); return; }
      MemberApi.liveVerse(tr).then((r) => { showing.current = !!r.live; if (!stop) setLive(r.live); }, () => undefined)
        .finally(() => { if (!stop) timer = setTimeout(tick, showing.current ? 10_000 : 20_000); });
    };
    tick();
    const onVis = () => { if (!document.hidden) { clearTimeout(timer); tick(); } };
    document.addEventListener('visibilitychange', onVis);
    return () => { stop = true; clearTimeout(timer); document.removeEventListener('visibilitychange', onVis); };
  }, [tr]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setAll(false), [live?.reference]);
  if (!live) return null;
  const verses = live.passage?.verses ?? [];
  const shown = all ? verses : verses.slice(0, 4);
  return (
    <div className="card card-pad stack live-verse" style={{ gap: 8 }} aria-live="polite">
      <span className="eyebrow row" style={{ gap: 6 }}><Radio size={14} /> {t('liveVerseTitle')} · {live.eventTitle}</span>
      <b className="live-verse-ref">{live.reference}</b>
      {shown.length > 0 && <div className="live-verse-text">{shown.map((v) => <p key={v.verse}><sup>{v.verse}</sup> {v.text}</p>)}</div>}
      <div className="row wrap" style={{ gap: 8 }}>
        {verses.length > 4 && <button className="btn sm ghost" onClick={() => setAll((a) => !a)}>{all ? t('liveVerseLess') : t('liveVerseMore')}</button>}
        <Link className="btn sm" to={`/app/bible?tr=${encodeURIComponent(tr)}&ref=${encodeURIComponent(`${live.book} ${live.chapter}${live.verse ? `:${live.verse}` : ''}`)}`}><BookOpen size={14} /> {t('liveVerseOpen')}</Link>
        {live.passage && <span className="small muted">{live.passage.translation}</span>}
      </div>
    </div>
  );
}
