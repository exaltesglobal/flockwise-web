import { Clock, MapPin, UserRound } from 'lucide-react';
import { Link } from 'react-router';

import { MemberApi } from '@/api/endpoints';
import { ErrorState, Loading, useToast } from '@/components/ui';
import { useT } from '@/i18n';
import { useApi } from '@/lib/use-api';

export function MemberGroupsPage() {
  const { t } = useT();
  const toast = useToast();
  const { data, error, reload, setData } = useApi(MemberApi.groups.list);

  async function join(id: string) {
    try {
      const g = await MemberApi.groups.requestToJoin(id);
      setData((d) => (d ? { ...d, data: d.data.map((x) => (x.id === id ? g : x)) } : d));
      toast(t('requested'));
    } catch (e) {
      toast(e instanceof Error ? e.message : t('somethingWrong'), 'error');
    }
  }

  return (
    <>
      <h1>{t('tabGroups')}</h1>
      {error ? <ErrorState error={error} onRetry={reload} /> : !data ? <Loading /> : (
        <div className="tiles">
          {data.data.map((g) => (
            <div key={g.id} className="card card-pad stack" style={{ gap: 10 }}>
              <div className="row between" style={{ alignItems: 'flex-start' }}>
                <div>
                  <h3>{g.name}</h3>
                  <span className="small muted">{t('members', { count: g.memberCount })}</span>
                </div>
                {g.membership === 'member' ? (
                  <Link to={`/app/groups/${g.id}`} className="btn sm primary">{t('openGroup')}</Link>
                ) : g.membership === 'requested' ? (
                  <span className="badge warn">{t('requested')}</span>
                ) : (
                  <button className="btn primary sm" onClick={() => join(g.id)}>{t('joinGroup')}</button>
                )}
              </div>
              <p className="muted">{g.description}</p>
              <div className="row wrap small" style={{ gap: 14 }}>
                <span className="row" style={{ gap: 5 }}><Clock size={14} className="muted" /> {g.meetingSchedule}</span>
                <span className="row" style={{ gap: 5 }}><MapPin size={14} className="muted" /> {g.location}</span>
                <span className="row" style={{ gap: 5 }}><UserRound size={14} className="muted" /> {t('ledBy', { name: g.leaderName })}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
