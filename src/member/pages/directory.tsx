import { Mail, MessageCircle, Phone, Search, UsersRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';

import { MemberApi } from '@/api/endpoints';
import { ErrorState, Loading } from '@/components/ui';
import { useT } from '@/i18n';
import { useApi } from '@/lib/use-api';

export function MemberDirectoryPage() {
  const { t } = useT();
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setQuery(q.trim()), 250);
    return () => clearTimeout(id);
  }, [q]);
  const { data, error, reload } = useApi(() => MemberApi.directory(query || undefined), [query]);
  const optIn = error?.code === 'directory_opt_in';

  return (
    <>
      <div>
        <h1>{t('tabDirectory')}</h1>
        <p className="muted">{t('directoryBody')}</p>
      </div>
      {optIn ? (
        <div className="card card-pad stack">
          <p>{t('directoryOptIn')}</p>
          <Link to="/app/me" className="btn primary" style={{ alignSelf: 'flex-start' }}>{t('tabMe')}</Link>
        </div>
      ) : (
        <>
          <div className="search-box">
            <Search size={17} className="muted" />
            <input className="input" placeholder={t('searchByName')} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {error ? <ErrorState error={error} onRetry={reload} /> : !data ? <Loading /> : (
            <div className="tiles">
              {data.data.map((h) => (
                <div key={h.householdName} className="card card-pad stack" style={{ gap: 8 }}>
                  <div className="row" style={{ gap: 8 }}>
                    <UsersRound size={18} className="muted" />
                    <h3 className="grow">{h.householdName}</h3>
                    {h.area && <span className="small muted">{h.area}</span>}
                  </div>
                  {h.people.map((p) => (
                    <div key={p.id} className="row" style={{ gap: 8 }}>
                      <span className="grow">{p.name}</span>
                      {p.phone && <a className="btn ghost icon sm" href={`tel:${p.phone}`} title={p.phone}><Phone size={15} /></a>}
                      {p.phone && <a className="btn ghost icon sm" href={`https://wa.me/${p.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" title="WhatsApp"><MessageCircle size={15} /></a>}
                      {p.email && <a className="btn ghost icon sm" href={`mailto:${p.email}`} title={p.email}><Mail size={15} /></a>}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
