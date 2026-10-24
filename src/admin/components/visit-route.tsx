// A day's planned visits as a route: put the stops in order, then open the whole route in Google
// Maps (starting from the church) on the phone or computer. Families without an address are listed
// so the office can add one.
import { ArrowDown, ArrowUp, MapPinned, Phone } from 'lucide-react';
import { useEffect, useState } from 'react';

import { AdminApi } from '@/api/endpoints';
import type { VisitRouteStop } from '@/core/types';
import { VISIT_PURPOSES } from '@/core/modules/zones';
import { ErrorState, Field, Loading, Modal, Segmented } from '@/components/ui';
import { useApi } from '@/lib/use-api';

/** Google Maps directions through the stops in order (Maps allows 9 stops between start and end). */
export function directionsUrl(start: string | null, addresses: string[]): string {
  if (!addresses.length) return '';
  const p = new URLSearchParams({ api: '1', travelmode: 'driving' });
  if (start) p.set('origin', start);
  p.set('destination', addresses[addresses.length - 1]);
  const via = addresses.slice(0, -1).slice(0, 9);
  if (via.length) p.set('waypoints', via.join('|'));
  return `https://www.google.com/maps/dir/?${p.toString()}`;
}

const today = () => new Date().toISOString().slice(0, 10);

export function VisitRouteModal({ date: initial, onClose }: { date?: string; onClose: () => void }) {
  const [date, setDate] = useState(initial ?? today());
  const [mine, setMine] = useState<'mine' | 'all'>('mine');
  const q = useApi(() => AdminApi.visits.route(date, mine === 'mine'), [date, mine]);
  const [stops, setStops] = useState<VisitRouteStop[]>([]);
  useEffect(() => { if (q.data) setStops(q.data.stops); }, [q.data]);
  const routed = stops.filter((s) => s.address);
  const url = directionsUrl(q.data?.start ?? null, routed.map((s) => s.address!));
  const move = (i: number, by: number) => { const next = [...stops]; const [x] = next.splice(i, 1); next.splice(i + by, 0, x); setStops(next); };
  return (
    <Modal title="Route for the day" onClose={onClose} footer={<>
      <button className="btn ghost" onClick={onClose}>Close</button>
      {url ? <a className="btn primary" href={url} target="_blank" rel="noreferrer"><MapPinned size={15} /> Open in Google Maps</a> : <button className="btn primary" disabled>Open in Google Maps</button>}
    </>}>
      <div className="stack">
        <div className="row wrap" style={{ gap: 10, alignItems: 'flex-end' }}>
          <Field label="Day"><input type="date" value={date} onChange={(e) => setDate(e.target.value || today())} /></Field>
          <Segmented value={mine} onChange={setMine} options={[{ value: 'mine', label: 'My visits' }, { value: 'all', label: 'Everyone' }]} />
        </div>
        {q.error ? <ErrorState error={q.error} onRetry={q.reload} /> : !q.data ? <Loading /> : !stops.length ? (
          <p className="small muted" style={{ margin: 0 }}>No visits planned for this day. Plan visits from Area visits, then come back for the route.</p>
        ) : (
          <>
            <p className="small muted" style={{ margin: 0 }}>
              {q.data.start ? `Starts from ${q.data.start}. ` : 'Starts from where you are. '}Put the stops in the order you will go.
              {routed.length > 10 && ' Google Maps shows the first 10 stops.'}
            </p>
            <ol className="vr-stops">
              {stops.map((s, i) => (
                <li key={s.visitId} className={s.address ? '' : 'vr-missing'}>
                  <span className="mt-num">{i + 1}</span>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <b>{s.familyName}</b> <span className="small muted">· {VISIT_PURPOSES[s.purpose]}{s.zoneName ? ` · ${s.zoneName}` : ''}</span>
                    <div className="small ellipsis">{s.address ?? <span className="danger-text">No address on their record, so it is left out of the map</span>}</div>
                  </div>
                  {s.phone && <a className="btn sm ghost icon" href={`tel:${s.phone.replace(/\s/g, '')}`} aria-label={`Call ${s.familyName}`}><Phone size={14} /></a>}
                  <button className="btn sm ghost icon" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Earlier"><ArrowUp size={14} /></button>
                  <button className="btn sm ghost icon" disabled={i === stops.length - 1} onClick={() => move(i, 1)} aria-label="Later"><ArrowDown size={14} /></button>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </Modal>
  );
}
