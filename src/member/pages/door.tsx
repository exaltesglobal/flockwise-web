// Opened by scanning the door QR on a leader's phone: /app/door?e=<event>&t=<code>. Marks the
// signed-in person present, plus any family members they tick. The team app opens the same link.
import { CheckCircle2, DoorOpen } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';

import type { FamilyCheckinEvent, FamilyCheckinResult } from '@/api/admin-types';
import type { ApiError } from '@/core/errors';
import { MemberApi } from '@/api/endpoints';
import { FormError, Loading } from '@/components/ui';
import { useT } from '@/i18n';
import { formatDay, formatTime } from '@/lib/format';
import { toApiError, useAction } from '@/lib/use-api';

export function MemberDoorPage() {
  const { t } = useT();
  const [params] = useSearchParams();
  const eventId = params.get('e') ?? '';
  const token = params.get('t') ?? '';
  const [view, setView] = useState<FamilyCheckinEvent | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [done, setDone] = useState<FamilyCheckinResult | null>(null);

  useEffect(() => {
    if (!eventId || !token) return;
    let live = true;
    MemberApi.door
      .get(eventId, token)
      .then((v) => {
        if (!live) return;
        setView(v);
        // Everyone in the family who is not already in, with the signed-in person first.
        setPicked(v.members.filter((m) => !m.checkedIn).map((m) => m.id));
      })
      .catch((e) => live && setError(toApiError(e)));
    return () => {
      live = false;
    };
  }, [eventId, token]);

  const go = useAction(async () => setDone(await MemberApi.door.checkIn(eventId, token, picked)));

  if (!eventId || !token)
    return (
      <div className="stack" style={{ alignItems: 'center', textAlign: 'center', paddingTop: 32 }}>
        <DoorOpen size={40} />
        <h1>{t('doorTitle')}</h1>
        <p className="muted">{t('doorScanHint')}</p>
        <Link className="btn" to="/app">{t('tabHome')}</Link>
      </div>
    );
  if (error)
    return (
      <div className="stack" style={{ alignItems: 'center', textAlign: 'center', paddingTop: 32 }}>
        <DoorOpen size={40} />
        <h1>{t('doorTitle')}</h1>
        <p className="muted">{error.code === 'door_expired' ? t('doorExpired') : error.message}</p>
        <Link className="btn" to="/app">{t('tabHome')}</Link>
      </div>
    );
  if (!view) return <Loading />;
  if (done)
    return (
      <div className="stack" style={{ alignItems: 'center', textAlign: 'center', paddingTop: 32 }}>
        <CheckCircle2 size={64} color="var(--ok)" />
        <h1>{t('doorDone')}</h1>
        <p className="muted">{view.title} · {formatDay(view.startsAt)} {formatTime(view.startsAt)}</p>
        {done.securityCode && (
          <>
            <p>{t('familyPickupCode')}</p>
            <div style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 56, fontWeight: 800, letterSpacing: '0.15em' }}>{done.securityCode}</div>
            {done.event.members.filter((m) => m.isChild && m.checkedIn && m.roomName).map((k) => <p key={k.id}>{k.name} → <b>{k.roomName}</b></p>)}
          </>
        )}
        <Link className="btn primary" to="/app">{t('tabHome')}</Link>
      </div>
    );
  const already = view.members.every((m) => m.checkedIn);
  return (
    <div className="stack">
      <div className="row" style={{ gap: 10 }}><DoorOpen size={28} /><h1 style={{ margin: 0 }}>{t('doorTitle')}</h1></div>
      <p className="muted" style={{ margin: 0 }}>{view.title} · {formatDay(view.startsAt)} {formatTime(view.startsAt)}{view.location ? ` · ${view.location}` : ''}</p>
      {view.members.length > 1 && <h3 style={{ margin: '8px 0 0' }}>{t('doorWho')}</h3>}
      <div className="card">
        {view.members.map((m) => (
          <label key={m.id} className="list-row" style={{ cursor: m.checkedIn ? 'default' : 'pointer' }}>
            <input type="checkbox" disabled={m.checkedIn} checked={m.checkedIn || picked.includes(m.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, m.id] : picked.filter((x) => x !== m.id))} />
            <div className="grow">
              <b>{m.name}</b>
              {m.roomName && <span className="small muted"> · {m.roomName}</span>}
            </div>
            {m.checkedIn && <span className="badge ok"><CheckCircle2 size={12} /> {t('checkedIn')}</span>}
          </label>
        ))}
      </div>
      <FormError error={go.error} />
      {already ? (
        <Link className="btn" to="/app">{t('tabHome')}</Link>
      ) : (
        <button className="btn lg accent" disabled={go.busy || !picked.length} onClick={() => go.run()}><CheckCircle2 size={18} /> {t('doorHere')}</button>
      )}
    </div>
  );
}
