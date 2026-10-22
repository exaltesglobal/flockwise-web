// The Sunday bulletin in the member app, with past weeks and a WhatsApp share button.
import { Share2 } from 'lucide-react';
import { Link, useParams } from 'react-router';

import { memberSession } from '@/api/client';
import { MemberApi } from '@/api/endpoints';
import { BulletinDoc } from '@/components/bulletin';
import { Empty, ErrorState, Loading } from '@/components/ui';
import { useT } from '@/i18n';
import { formatDate } from '@/lib/format';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/use-api';

export function MemberBulletinPage() {
  const { id } = useParams();
  const { t } = useT();
  const currency = useSession(memberSession)?.church.currency ?? 'INR';
  const { data, error, loading, reload } = useApi(() => (id ? MemberApi.bulletins.get(id) : MemberApi.bulletins.latest()), [id]);
  const past = useApi(MemberApi.bulletins.list);

  return (
    <>
      <div className="section-head">
        <h1>{t('tabBulletin')}</h1>
        {data && (
          <a className="btn sm" href={`https://wa.me/?text=${encodeURIComponent(`${data.church.name}: ${data.title}\n${data.shareUrl}`)}`} target="_blank" rel="noreferrer">
            <Share2 size={16} /> {t('shareWhatsApp')}
          </a>
        )}
      </div>
      {error ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? <Loading /> : data ? (
        <div className="card bulletin-card"><BulletinDoc b={data} currency={currency} /></div>
      ) : <div className="card"><Empty title={t('bulletinNone')} /></div>}
      {past.data && past.data.length > 1 && (
        <section className="stack">
          <h2>{t('bulletinPast')}</h2>
          <div className="card">
            {past.data.filter((b) => b.id !== data?.id).map((b) => (
              <Link key={b.id} to={`/app/bulletin/${b.id}`} className="list-row" style={{ justifyContent: 'space-between' }}>
                <span>{b.title}</span>
                <span className="small muted">{formatDate(`${b.date}T00:00:00Z`)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
