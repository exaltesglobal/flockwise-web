import { BookOpen, Captions, FileText, Headphones, MessagesSquare, PenLine, PlayCircle } from 'lucide-react';
import { Fragment, useEffect, useRef, useState } from 'react';

import type { GroupKit, Sermon } from '@/api/admin-types';
import { MemberApi } from '@/api/endpoints';
import { LightMarkdown } from '@/components/markdown';
import { ErrorState, Loading } from '@/components/ui';
import { useT } from '@/i18n';
import { formatDate } from '@/lib/format';
import { useApi } from '@/lib/use-api';
import { useOpenParam } from '@/lib/use-new-param';

import { TranscriptModal } from '../transcript';

export function MemberSermonsPage() {
  const { t } = useT();
  const { data, error, reload } = useApi(MemberApi.sermons);
  const [open, setOpen] = useState<string | null>(null);
  useOpenParam('open', (id) => { setOpen(id); return true; });
  useEffect(() => { if (open && data) document.getElementById(`sermon-${open}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, [open, data]);
  return (
    <>
      <div>
        <h1>{t('tabSermons')}</h1>
        <p className="muted">{t('sermonsBody')}</p>
      </div>
      {error ? <ErrorState error={error} onRetry={reload} /> : !data ? <Loading /> : <SermonList sermons={data} member open={open} />}
    </>
  );
}

/** Sermon cards with a series filter. Shared by the member app and the public church page. */
export function SermonList({ sermons, member = false, open = null }: { sermons: Sermon[]; member?: boolean; open?: string | null }) {
  const { t, locale, lang } = useT();
  const [series, setSeries] = useState('');
  const [reading, setReading] = useState<Sermon | null>(null);
  const all = [...new Set(sermons.map((s) => s.series).filter(Boolean))];
  const shown = sermons.filter((s) => !series || s.series === series);
  if (sermons.length === 0) return <p className="muted">{t('noSermons')}</p>;
  return (
    <div className="stack">
      {all.length > 1 && (
        <div className="row wrap" style={{ gap: 6 }}>
          <button type="button" className={`opt-chip ${series === '' ? 'on' : ''}`} onClick={() => setSeries('')}>{t('allSeries')}</button>
          {all.map((s) => <button key={s} type="button" className={`opt-chip ${series === s ? 'on' : ''}`} onClick={() => setSeries(s)}>{s}</button>)}
        </div>
      )}
      <div className="tiles wide">
      {shown.map((s) => (
        <article key={s.id} id={`sermon-${s.id}`} className={`card sermon-card ${open === s.id ? 'on' : ''}`}>
          {s.imageUrl ? <img src={s.imageUrl} alt="" /> : <div className="sermon-art"><BookOpen size={26} /></div>}
          <div className="card-pad stack" style={{ gap: 6 }}>
            {s.series && <span className="small" style={{ color: 'var(--primary)', fontWeight: 600 }}>{s.series}</span>}
            <h3>{s.title}</h3>
            <span className="small muted">{[formatDate(s.date, locale), s.speaker, s.scripture].filter(Boolean).join(' · ')}</span>
            {s.description && <p className="muted" style={{ whiteSpace: 'pre-wrap' }}>{s.description}</p>}
            <div className="row wrap" style={{ gap: 8 }}>
              {s.videoUrl && <a className="btn sm primary" href={s.videoUrl} target="_blank" rel="noreferrer"><PlayCircle size={15} /> {t('watch')}</a>}
              {s.audioUrl && <a className="btn sm" href={s.audioUrl} target="_blank" rel="noreferrer"><Headphones size={15} /> {t('listen')}</a>}
              {s.notesUrl && <a className="btn sm" href={s.notesUrl} target="_blank" rel="noreferrer"><FileText size={15} /> {t('notes')}</a>}
              {!!s.transcript?.lines && <button type="button" className="btn sm" onClick={() => setReading(s)}><Captions size={15} /> {t('sermonTranscript')}</button>}
            </div>
            {s.notes && (
              <details className="sermon-notes">
                <summary><FileText size={14} /> {t('notes')}</summary>
                <LightMarkdown text={s.notes} className="notes-md" />
              </details>
            )}
            {member && !!s.outline?.points.length && (
              <details className="sermon-notes" open={open === s.id}>
                <summary><PenLine size={14} /> {t('sermonFill')}</summary>
                <FillNotes sermon={s} />
              </details>
            )}
            {member && s.kits && Object.keys(s.kits).length > 0 && (
              <details className="sermon-notes" open={open === s.id}>
                <summary><MessagesSquare size={14} /> {t('sermonKit')}</summary>
                <Kit kit={s.kits[lang] ?? s.kits.en ?? Object.values(s.kits)[0]} />
              </details>
            )}
          </div>
        </article>
      ))}
      </div>
      {reading && <TranscriptModal sermon={reading} member={member} onClose={() => setReading(null)} />}
    </div>
  );
}

/** Fill-in-the-blank notes for one sermon: words in [brackets] become boxes. Saved as they type, private to the member. */
function FillNotes({ sermon }: { sermon: Sermon }) {
  const { t } = useT();
  const q = useApi(() => MemberApi.sermonNotes(sermon.id), [sermon.id]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [show, setShow] = useState(false);
  const [saved, setSaved] = useState(false);
  const dirty = useRef(false);
  useEffect(() => { if (q.data) { setAnswers(q.data.fill?.answers ?? []); setNote(q.data.fill?.note ?? ''); } }, [q.data]);
  useEffect(() => {
    if (!dirty.current) return;
    const id = setTimeout(() => { void MemberApi.saveSermonNotes(sermon.id, { answers, note }).then(() => setSaved(true), () => undefined); dirty.current = false; }, 800);
    return () => clearTimeout(id);
  }, [answers, note, sermon.id]);
  if (q.error) return <ErrorState error={q.error} onRetry={q.reload} />;
  if (!q.data) return <Loading />;
  let n = -1;
  const edit = (i: number, v: string) => { dirty.current = true; setSaved(false); setAnswers((a) => { const next = [...a]; next[i] = v; return next; }); };
  return (
    <div className="stack fill-notes" style={{ gap: 10 }}>
      <p className="small muted" style={{ margin: 0 }}>{t('sermonFillHint')}</p>
      {sermon.outline!.bigIdea && <p style={{ margin: 0 }}><b>{sermon.outline!.bigIdea}</b></p>}
      {sermon.outline!.points.map((p, i) => (
        <div key={i}>
          <div className="fill-line">
            <b>{i + 1}.</b>{' '}
            {p.heading.split(/(\[[^\]]*\])/).map((part, j) => {
              const m = /^\[([^\]]*)\]$/.exec(part);
              if (!m) return <Fragment key={j}>{part}</Fragment>;
              const k = ++n;
              const right = (answers[k] ?? '').trim().toLowerCase() === m[1].trim().toLowerCase();
              return (
                <span key={j} className="fill-blank">
                  <input value={answers[k] ?? ''} onChange={(e) => edit(k, e.target.value)} size={Math.max(4, m[1].length + 1)} aria-label={`${i + 1}`} className={show ? (right ? 'ok' : 'miss') : ''} />
                  {show && !right && <span className="small fill-answer">{m[1]}</span>}
                </span>
              );
            })}
          </div>
          {p.refs.length > 0 && <div className="small muted">{p.refs.join('; ')}</div>}
        </div>
      ))}
      <textarea className="input" rows={3} value={note} onChange={(e) => { dirty.current = true; setSaved(false); setNote(e.target.value); }} placeholder={t('sermonFillNote')} />
      <div className="row between">
        <button type="button" className="btn sm ghost" onClick={() => setShow((x) => !x)}>{show ? t('sermonFillHide') : t('sermonFillShow')}</button>
        {saved && <span className="small muted">{t('sermonFillSaved')}</span>}
      </div>
    </div>
  );
}

function Kit({ kit }: { kit: GroupKit }) {
  const { t } = useT();
  return (
    <div className="stack" style={{ gap: 8 }}>
      {kit.summary && <p style={{ margin: 0 }}>{kit.summary}</p>}
      <div><b className="small">{t('kitStart')}</b><p style={{ margin: '2px 0 0' }}>{kit.icebreaker}</p></div>
      <div><b className="small">{t('kitQuestions')}</b><ol style={{ margin: '2px 0 0', paddingLeft: 20 }}>{kit.questions.map((q, i) => <li key={i}>{q}</li>)}</ol></div>
      {kit.memoryVerse.reference && <div><b className="small">{t('kitVerse')} · {kit.memoryVerse.reference}</b>{kit.memoryVerse.text && <p style={{ margin: '2px 0 0', fontStyle: 'italic' }}>{kit.memoryVerse.text}</p>}</div>}
      <div><b className="small">{t('kitPray')}</b><p style={{ margin: '2px 0 0' }}>{kit.prayer}</p></div>
    </div>
  );
}
