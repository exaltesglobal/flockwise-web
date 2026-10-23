// Kids' memory verse game, played by a parent with their child: this week's verse from Sunday
// school in three rounds (read it, put the missing words back, say it from memory, by typing or by
// speaking), stars for each round, the teacher's register tick, and the class board for the week.
// Scoring happens on the server; the page only sends answers.
import { Check, Mic, MicOff, RotateCcw, Star, Trophy } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import type { MemberVerses, VerseAnswerResult, VerseBoard, VerseGameView, VerseLevel } from '@/api/admin-types';
import { MemberApi } from '@/api/endpoints';
import { ErrorState, FormError, Loading } from '@/components/ui';
import { useT } from '@/i18n';
import { formatDate } from '@/lib/format';
import { useAction, useApi } from '@/lib/use-api';

type T = ReturnType<typeof useT>['t'];
type Child = MemberVerses['children'][number];

export function MemberVersesPage() {
  const { t, locale } = useT();
  const { data, error, reload, setData } = useApi(MemberApi.verses.get);
  const [childId, setChildId] = useState<string | null>(null);
  const kids = data?.children ?? [];
  const child = kids.find((c) => c.id === childId) ?? kids[0] ?? null;
  return (
    <>
      <div>
        <h1>{t('verseTitle')}</h1>
        <p className="muted">{t('verseBody')}</p>
      </div>
      {error ? <ErrorState error={error} onRetry={reload} /> : !data ? <Loading /> : kids.length === 0 ? (
        <div className="card card-pad stack" style={{ alignItems: 'center', textAlign: 'center' }}><Star size={28} /><p className="muted" style={{ margin: 0 }}>{t('verseNoKids')}</p></div>
      ) : (
        <div className="stack">
          {kids.length > 1 && (
            <div className="row wrap" style={{ gap: 8 }}>
              {kids.map((c) => <button key={c.id} className={`chip-toggle ${c.id === child?.id ? 'on' : ''}`} onClick={() => setChildId(c.id)}>{c.name}</button>)}
            </div>
          )}
          {child && (
            <>
              <div className="row wrap small muted" style={{ gap: 12 }}>
                <span>{child.className}</span>
                <span>{t('verseStars', { n: child.totalStars })}</span>
                {child.rank && <span><Trophy size={13} style={{ verticalAlign: -2 }} /> {t('verseRank', { rank: child.rank })}</span>}
              </div>
              {!child.game ? (
                <div className="card card-pad"><p className="muted" style={{ margin: 0 }}>{t('verseNone')}</p></div>
              ) : (
                <Game key={`${child.id}:${child.game.lessonId}`} child={child} game={child.game} t={t} locale={locale} onResult={(r) => setData({ ...data, children: data.children.map((c) => (c.id === child.id ? { ...c, game: r.game } : c)) })} onRefresh={reload} />
              )}
              {data.boards.filter((b) => b.classId === child.classId).map((b) => <Board key={b.classId} board={b} t={t} />)}
            </>
          )}
        </div>
      )}
    </>
  );
}

const Stars = ({ n, size = 18 }: { n: number; size?: number }) => <span className="verse-stars" aria-label={`${n} stars`}>{[0, 1, 2].map((i) => <Star key={i} size={size} fill={i < n ? 'currentColor' : 'none'} className={i < n ? 'lit' : ''} />)}</span>;

function Game({ child, game, t, locale, onResult, onRefresh }: { child: Child; game: VerseGameView; t: T; locale: string; onResult: (r: VerseAnswerResult) => void; onRefresh: () => void }) {
  const answer = useAction((input: { level: VerseLevel; answers?: string[]; text?: string }) => MemberApi.verses.answer(child.id, input));
  const [last, setLast] = useState<VerseAnswerResult | null>(null);
  const submit = async (input: { level: VerseLevel; answers?: string[]; text?: string }) => {
    const r = await answer.run(input);
    if (r) { setLast(r); onResult(r); if (r.game.nextLevel === null && r.ok) onRefresh(); }
    return r;
  };
  const level = game.nextLevel;
  return (
    <div className="card card-pad stack verse-card" style={{ gap: 12 }}>
      <div className="row between wrap" style={{ gap: 8 }}>
        <span className="eyebrow">{t('verseWeekOf', { date: formatDate(`${game.week}T00:00:00Z`, locale) })}</span>
        <Stars n={game.stars} />
      </div>
      {level !== 'blanks' && <blockquote className="verse-text">“{game.verse}”</blockquote>}
      <div className="row between wrap small muted" style={{ gap: 8 }}>
        <b>{game.reference}</b>
        <span>{t('verseTaughtIn', { title: game.title })}</span>
      </div>
      <ol className="verse-steps">
        {(['read', 'blanks', 'recite'] as VerseLevel[]).map((l) => (
          <li key={l} className={game.done[l] ? 'done' : l === level ? 'now' : ''}>
            {game.done[l] ? <Check size={14} /> : <span className="dot" />} {t(l === 'read' ? 'verseRead' : l === 'blanks' ? 'verseBlanks' : 'verseRecite')}
            {game.scores[l] > 0 && <span className="muted"> +{game.scores[l]}</span>}
          </li>
        ))}
        {game.recitedInClass && <li className="done"><Check size={14} /> {t('verseInClass')} <span className="muted">+40</span></li>}
      </ol>
      <FormError error={answer.error} />
      {last && !last.ok && <p className="verse-msg warn">{last.message}</p>}
      {last?.ok && <p className="verse-msg ok">{last.message} +{last.earned}</p>}
      {level === 'read' && <button className="btn primary lg" disabled={answer.busy} onClick={() => submit({ level: 'read' })}><Check size={16} /> {t('verseReadDone')}</button>}
      {level === 'blanks' && <Blanks game={game} t={t} busy={answer.busy} onCheck={(answers) => submit({ level: 'blanks', answers })} />}
      {level === 'recite' && <Recite t={t} locale={locale} busy={answer.busy} onCheck={(text) => submit({ level: 'recite', text })} />}
      {level === null && <p className="verse-msg ok" style={{ margin: 0 }}>{t('verseAllDone')} <b>{t('versePoints', { n: game.points })}</b></p>}
    </div>
  );
}

function Blanks({ game, t, busy, onCheck }: { game: VerseGameView; t: T; busy: boolean; onCheck: (answers: string[]) => Promise<unknown> }) {
  const gaps = game.puzzle.words.map((w, i) => (w === null ? i : -1)).filter((i) => i >= 0);
  const [filled, setFilled] = useState<Record<number, string>>({});
  const used = Object.values(filled);
  const options = game.puzzle.options.map((o, i) => ({ o, i, used: used.filter((u) => u === o).length >= game.puzzle.options.filter((x) => x === o).length && used.includes(o) }));
  const place = (word: string) => {
    const next = gaps.find((g) => !filled[g]);
    if (next === undefined) return;
    setFilled({ ...filled, [next]: word });
  };
  const complete = gaps.every((g) => filled[g]);
  return (
    <div className="stack" style={{ gap: 10 }}>
      <p className="small muted" style={{ margin: 0 }}>{t('verseBlanksHint')}</p>
      <p className="verse-text">
        {game.puzzle.words.map((w, i) => w === null ? (
          <button key={i} type="button" className={`verse-gap ${filled[i] ? 'filled' : ''}`} onClick={() => { const n = { ...filled }; delete n[i]; setFilled(n); }}>{filled[i] ?? '______'}</button>
        ) : <span key={i}>{w} </span>)}
      </p>
      <div className="row wrap" style={{ gap: 8 }}>
        {options.map(({ o, i, used }) => <button key={i} type="button" className="verse-chip" disabled={used} onClick={() => place(o)}>{o}</button>)}
      </div>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn primary" disabled={!complete || busy} onClick={async () => { const r = (await onCheck(gaps.map((g) => filled[g]))) as VerseAnswerResult | null; if (r && !r.ok) setFilled({}); }}><Check size={16} /> {t('verseCheck')}</button>
        <button className="btn ghost" disabled={!used.length} onClick={() => setFilled({})}><RotateCcw size={14} /> {t('verseClear')}</button>
      </div>
    </div>
  );
}

type Recognition = { lang: string; interimResults: boolean; continuous: boolean; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null; start: () => void; stop: () => void };
const speechCtor = (): (new () => Recognition) | null => { const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }; return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null; };
const SPEECH_LANG: Record<string, string> = { en: 'en-IN', hi: 'hi-IN', ta: 'ta-IN', te: 'te-IN', ml: 'ml-IN', kn: 'kn-IN' };

function Recite({ t, locale, busy, onCheck }: { t: T; locale: string; busy: boolean; onCheck: (text: string) => Promise<unknown> }) {
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const rec = useRef<Recognition | null>(null);
  const canSpeak = !!speechCtor();
  useEffect(() => () => rec.current?.stop(), []);
  const speak = () => {
    const Ctor = speechCtor();
    if (!Ctor) return;
    if (listening) { rec.current?.stop(); setListening(false); return; }
    const r = new Ctor();
    r.lang = SPEECH_LANG[locale.slice(0, 2)] ?? 'en-IN'; r.interimResults = true; r.continuous = true;
    r.onresult = (e) => setText(Array.from(e.results).map((x) => x[0]?.transcript ?? '').join(' ').trim());
    r.onend = () => setListening(false); r.onerror = () => setListening(false);
    rec.current = r; setListening(true); r.start();
  };
  return (
    <div className="stack" style={{ gap: 10 }}>
      <p className="small muted" style={{ margin: 0 }}>{t('verseReciteHint')}</p>
      <textarea className="textarea" rows={3} value={text} onChange={(e) => setText(e.target.value)} autoCapitalize="off" autoCorrect="off" spellCheck={false} />
      <div className="row wrap" style={{ gap: 8 }}>
        {canSpeak && <button className={`btn ${listening ? 'primary' : ''}`} type="button" onClick={speak}>{listening ? <MicOff size={16} /> : <Mic size={16} />} {listening ? t('verseListening') : t('verseSpeak')}</button>}
        <button className="btn primary" disabled={text.trim().split(/\s+/).length < 2 || busy} onClick={async () => { rec.current?.stop(); const r = (await onCheck(text)) as VerseAnswerResult | null; if (r && !r.ok) setText(''); }}><Check size={16} /> {t('verseCheck')}</button>
      </div>
    </div>
  );
}

function Board({ board, t }: { board: VerseBoard; t: T }) {
  const ranked = board.rows.filter((r) => r.points > 0);
  return (
    <div className="card card-pad stack" style={{ gap: 8 }}>
      <div className="row between wrap" style={{ gap: 8 }}>
        <h2 style={{ fontSize: 17, margin: 0 }}><Trophy size={16} style={{ verticalAlign: -2 }} /> {t('verseBoard', { className: board.className })}</h2>
        <span className="small muted">{t('versePlayers', { players: board.players, of: board.of })}</span>
      </div>
      <ol className="verse-board">
        {ranked.map((r, i) => (
          <li key={r.id} className={r.mine ? 'mine' : ''}>
            <span className="rank">{i + 1}</span>
            <span className="grow">{r.name}</span>
            <Stars n={r.stars} size={14} />
            <b>{r.points}</b>
          </li>
        ))}
      </ol>
    </div>
  );
}
