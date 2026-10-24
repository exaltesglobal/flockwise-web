// /alert/:token: the page a church's legal-aid contact opens from the WhatsApp or SMS when a member
// presses the emergency alert. It shows who needs help, what is happening and the live location
// while it is shared (2 hours by default); after that only the status remains. No sign-in.
import { MapPin, Phone, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router';

import { PublicApi } from '@/api/endpoints';
import type { PublicSafetyAlert, SafetyAlertKind } from '@/core/types';
import { Loading } from '@/components/ui';
import { formatTime } from '@/lib/format';

import { Shell } from './public';

const KIND: Record<SafetyAlertKind, string> = { threat: 'Being threatened', violence: 'Facing violence', police: 'Police complaint or arrest', mob: 'Facing a mob', medical: 'Medical emergency', other: 'Emergency' };

export function PublicAlertPage() {
  const { token = '' } = useParams();
  const [data, setData] = useState<PublicSafetyAlert | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const load = () => PublicApi.safetyAlert(token).then((a) => { setData(a); document.title = `Alert: ${a.name}`; }, (e: Error) => setError(e.message));
    void load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [token]);
  if (error) return <Shell><div className="card card-pad pub-form muted">{error}</div></Shell>;
  if (!data) return <Shell><Loading /></Shell>;
  const live = data.status === 'active';
  return (
    <Shell>
      <div className="card card-pad pub-form stack" style={{ gap: 12, borderLeft: `4px solid ${live ? 'var(--danger)' : 'var(--ok, green)'}` }}>
        <span className="small muted">{data.church}</span>
        <h1 style={{ margin: 0 }}>{live ? <ShieldAlert size={22} color="var(--danger)" style={{ verticalAlign: '-3px' }} /> : <ShieldCheck size={22} color="var(--ok, green)" style={{ verticalAlign: '-3px' }} />} {data.name}</h1>
        <b>{live ? KIND[data.kind] : data.status === 'safe' ? 'Says they are safe now' : 'This alert has ended'}</b>
        {data.note && <span>“{data.note}”</span>}
        <span className="small muted">Raised at {formatTime(data.startedAt)}{data.responders ? ` · ${data.responders} church leader${data.responders === 1 ? '' : 's'} responding` : ''}</span>
        {data.sharing && (
          <div className="stack" style={{ gap: 8 }}>
            <div className="row wrap" style={{ gap: 8 }}>
              {data.phone && <a className="btn" href={`tel:${data.phone}`}><Phone size={16} /> {data.phone}</a>}
              {data.location && <a className="btn primary" href={`https://maps.google.com/?q=${data.location.lat},${data.location.lng}`} target="_blank" rel="noreferrer"><MapPin size={16} /> Open location in Maps</a>}
            </div>
            <span className="small muted">{data.location ? `Last location at ${formatTime(data.location.at)}${data.location.accuracy ? ` (±${data.location.accuracy} m)` : ''}. ` : 'Location not shared yet. '}Shared until {formatTime(data.shareUntil)}. This page refreshes itself.</span>
          </div>
        )}
        {!data.sharing && live && <span className="small muted">The location sharing time is over. Contact the church office.</span>}
        <span className="small muted">Please keep this link private.</span>
      </div>
    </Shell>
  );
}
