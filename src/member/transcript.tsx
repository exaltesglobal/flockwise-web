// A sermon as preached, for members and the public page: the recording, a summary, chapters that
// jump the recording there, moments to share on WhatsApp, and the full text to read or search.
import { MessageCircle, Play, Search } from 'lucide-react';
import { Fragment, useMemo, useRef, useState } from 'react';

import type { Sermon, SermonTranscript } from '@/api/admin-types';
import { MemberApi, PublicApi } from '@/api/endpoints';
import { ErrorState, Loading, Modal } from '@/components/ui';
import { useT } from '@/i18n';
import { useApi } from '@/lib/use-api';
import { clock, isMediaFile, linkAt, youTubeId } from '@/lib/transcript';

import './transcript.css';

export function TranscriptModal({ sermon, member, onClose }: { sermon: Sermon; member: boolean; onClose: () => void }) {
  const { t } = useT();
  const res = useApi(() => (member ? MemberApi.sermonTranscript(sermon.id) : PublicApi.sermonTranscript(sermon.id)), [sermon.id, member]);
  return (
    <Modal title={`${t('sermonTranscript')} · ${sermon.title}`} onClose={onClose} wide>
      {res.error ? <ErrorState error={res.error} onRetry={res.reload} /> : !res.data ? <Loading /> : <TranscriptView sermon={sermon} tr={res.data} />}
    </Modal>
  );
}

function TranscriptView({ sermon, tr }: { sermon: Sermon; tr: SermonTranscript }) {
  const { t } = useT();
  const audio = useRef<HTMLAudioElement>(null);
  const [start, setStart] = useState<number | null>(null);
  const [q, setQ] = useState('');
  const yt = youTubeId(sermon.videoUrl);
  const file = isMediaFile(sermon.audioUrl) ? sermon.audioUrl : isMediaFile(sermon.videoUrl) ? sermon.videoUrl : '';
  const recording = sermon.videoUrl || sermon.audioUrl;
  const timeOf = (line: number) => { const at = tr.lines[line]?.at; return at === null || at === undefined ? null : at + tr.offset; };
  const lineEl = (i: number) => document.getElementById(`tl-${i}`);

  /** Jump the player (or open the recording) at a line, and bring the line into view. */
  const play = (line: number) => {
    lineEl(line)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const at = timeOf(line);
    if (at === null) return;
    if (file && audio.current) { audio.current.currentTime = at; void audio.current.play().catch(() => undefined); }
    else if (yt) setStart(at);
    else if (recording) window.open(linkAt(recording, at), '_blank', 'noopener');
  };
  const share = (quote: string, line: number) => {
    const at = timeOf(line);
    const text = `“${quote}”\n${sermon.title}${sermon.speaker ? `, ${sermon.speaker}` : ''}${recording ? `\n${at !== null ? linkAt(recording, at) : recording}` : ''}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };

  const terms = q.trim().toLowerCase();
  const hits = useMemo(() => (terms.length < 2 ? null : tr.lines.map((l, i) => (l.text.toLowerCase().includes(terms) ? i : -1)).filter((i) => i >= 0)), [tr.lines, terms]);
  const chapterAt = new Map(tr.chapters.map((c) => [c.line, c]));
  const mark = (text: string) => {
    if (!hits) return text;
    const parts = text.split(new RegExp(`(${terms.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig'));
    return parts.map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : <Fragment key={i}>{p}</Fragment>));
  };

  return (
    <div className="stack tx" style={{ gap: 14 }}>
      {file ? <audio ref={audio} controls preload="metadata" src={file} className="tx-audio" /> : yt && start !== null ? (
        <iframe key={start} className="tx-video" src={`https://www.youtube-nocookie.com/embed/${yt}?start=${Math.floor(start)}&autoplay=1`} title={sermon.title} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />
      ) : null}

      {tr.summary && <section><h3 className="tx-h">{t('sermonSummary')}</h3><p style={{ margin: 0 }}>{tr.summary}</p></section>}

      {tr.chapters.length > 0 && (
        <section className="stack" style={{ gap: 4 }}>
          <h3 className="tx-h">{t('sermonChapters')}</h3>
          {tr.chapters.map((c) => {
            const at = timeOf(c.line);
            return (
              <button key={c.line} className="tx-chapter" onClick={() => play(c.line)}>
                <span className="tx-time">{at !== null ? clock(at) : <Play size={12} />}</span>
                <span className="grow"><b>{c.title}</b>{c.summary && <span className="small muted" style={{ display: 'block' }}>{c.summary}</span>}</span>
              </button>
            );
          })}
        </section>
      )}

      {tr.clips.length > 0 && (
        <section className="stack" style={{ gap: 8 }}>
          <h3 className="tx-h">{t('sermonMoments')}</h3>
          <div className="tx-clips">
            {tr.clips.map((c, i) => {
              const at = timeOf(c.line);
              return (
                <figure key={i} className="tx-clip">
                  <b className="small">{c.title}</b>
                  <blockquote>“{c.quote}”</blockquote>
                  <div className="row wrap" style={{ gap: 6 }}>
                    <button className="btn sm" onClick={() => play(c.line)}><Play size={13} /> {at !== null ? clock(at) : t('sermonRead')}</button>
                    <button className="btn sm ghost" onClick={() => share(c.quote, c.line)}><MessageCircle size={13} /> {t('sermonShare')}</button>
                  </div>
                </figure>
              );
            })}
          </div>
        </section>
      )}

      <section className="stack" style={{ gap: 8 }}>
        <h3 className="tx-h">{t('sermonFullText')}</h3>
        <label className="tx-search">
          <Search size={15} className="muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('sermonSearchWords')} aria-label={t('sermonSearchWords')} />
          {hits && <span className="small muted">{hits.length ? t('sermonMatches', { n: String(hits.length) }) : t('sermonNoMatch')}</span>}
        </label>
        {hits && hits.length > 0 && (
          <div className="row wrap" style={{ gap: 4 }}>
            {hits.slice(0, 30).map((i) => <button key={i} className="tx-chip" onClick={() => play(i)}>{timeOf(i) !== null ? clock(timeOf(i)!) : `¶${i + 1}`}</button>)}
          </div>
        )}
        <div className="tx-lines">
          {tr.lines.map((l, i) => (
            <Fragment key={i}>
              {chapterAt.has(i) && <h4 className="tx-ch">{chapterAt.get(i)!.title}</h4>}
              <p id={`tl-${i}`} className={hits?.includes(i) ? 'hit' : ''}>
                {l.at !== null && <button className="tx-time" onClick={() => play(i)}>{clock(l.at + tr.offset)}</button>}
                {mark(l.text)}
              </p>
            </Fragment>
          ))}
        </div>
        <p className="small muted">{t('sermonTranscriptNote')}</p>
      </section>
    </div>
  );
}
