// My journey: the steps of a member's walk with the church, and one gentle next step.
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router';

import { MemberApi } from '@/api/endpoints';
import type { JourneyStep } from '@/core/types';
import { ErrorState, Loading } from '@/components/ui';
import { useT } from '@/i18n';
import { formatDate } from '@/lib/format';
import { useApi } from '@/lib/use-api';

import '@/admin/journey.css';

const NEXT: Record<string, string> = { '/app/groups': 'jn_groups', '/app/occasions': 'jn_occasions', '/app/courses': 'jn_courses', '/app/serving': 'jn_serving' };

export function MemberJourneyPage() {
  const { t, locale } = useT();
  const q = useApi(MemberApi.journey);
  const label = (s: JourneyStep) => (s.kind === 'custom' ? s.label : t(`jk_${s.kind}` as never));
  return (
    <div className="stack">
      <div>
        <h1>{t('journeyTitle')}</h1>
        <p className="muted">{t('journeyIntro')}</p>
      </div>
      {q.error ? <ErrorState error={q.error} onRetry={q.reload} /> : !q.data ? <Loading /> : (
        <>
          <div className="card card-pad">
            <ol className="journey-line">
              {q.data.steps.map((s, i) => (
                <li key={`${s.kind}-${i}`}>
                  <span className="journey-dot" />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <b>{label(s)}</b>{s.detail && s.kind !== 'regular' && s.kind !== 'serving' && <span className="muted"> · {s.detail}</span>}
                    {s.date && <div className="small muted">{formatDate(`${s.date}T12:00:00`, locale)}</div>}
                  </div>
                </li>
              ))}
            </ol>
          </div>
          {q.data.next ? (
            <Link to={q.data.next.link} className="card card-pad row" style={{ gap: 12, textDecoration: 'none', color: 'inherit' }}>
              <div className="grow"><span className="eyebrow">{t('journeyNext')}</span><b style={{ display: 'block' }}>{t((NEXT[q.data.next.link] ?? 'jn_groups') as never)}</b></div>
              <ArrowRight size={20} />
            </Link>
          ) : <div className="card card-pad muted">{t('journeyAllDone')}</div>}
        </>
      )}
    </div>
  );
}
