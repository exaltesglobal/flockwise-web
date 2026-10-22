import { BookOpen, FileText, Headphones, PlayCircle } from 'lucide-react';
import { useState } from 'react';

import type { Sermon } from '@/api/admin-types';
import { MemberApi } from '@/api/endpoints';
import { LightMarkdown } from '@/components/markdown';
import { ErrorState, Loading } from '@/components/ui';
import { useT } from '@/i18n';
import { formatDate } from '@/lib/format';
import { useApi } from '@/lib/use-api';

export function MemberSermonsPage() {
  const { t } = useT();
  const { data, error, reload } = useApi(MemberApi.sermons);
  return (
    <>
      <div>
        <h1>{t('tabSermons')}</h1>
        <p className="muted">{t('sermonsBody')}</p>
      </div>
      {error ? <ErrorState error={error} onRetry={reload} /> : !data ? <Loading /> : <SermonList sermons={data} />}
    </>
  );
}

/** Sermon cards with a series filter. Shared by the member app and the public church page. */
export function SermonList({ sermons }: { sermons: Sermon[] }) {
  const { t, locale } = useT();
  const [series, setSeries] = useState('');
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
        <article key={s.id} className="card sermon-card">
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
            </div>
            {s.notes && (
              <details className="sermon-notes">
                <summary><FileText size={14} /> {t('notes')}</summary>
                <LightMarkdown text={s.notes} className="notes-md" />
              </details>
            )}
          </div>
        </article>
      ))}
      </div>
    </div>
  );
}
