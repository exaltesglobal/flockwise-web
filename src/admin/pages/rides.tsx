// Sunday lifts: households that need a ride to the service and members who can drive, matched
// zone by zone. The office matches in one click, adjusts by hand, and both sides are told.
import { Car, Plus, Trash2, Wand2 } from 'lucide-react';
import { useState } from 'react';

import type { RideOfferView, RideRequestView } from '@/api/admin-types';
import { AdminApi } from '@/api/endpoints';
import { Empty, ErrorState, Field, FormError, Loading, Modal, Segmented, useToast } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { useCan } from '@/lib/perms';
import { useAction, useApi } from '@/lib/use-api';

import { PersonSearch } from '../components/person-picker';
import { PageHeader } from '../layout';

const day = (d: string) => formatDate(`${d}T12:00:00`);

export function RidesPage() {
  const can = useCan();
  const toast = useToast();
  const [sunday, setSunday] = useState('');
  const { data, error, reload } = useApi(() => AdminApi.rides.hub(sunday || undefined), [sunday]);
  const [adding, setAdding] = useState<'request' | 'offer' | null>(null);
  const match = useAction((anyZone: boolean) => AdminApi.rides.match(data!.sunday, anyZone));
  const assign = useAction((q: RideRequestView, offerId: string | null) => AdminApi.rides.updateRequest(q.id, { offerId }));
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const edit = can('care');
  const runMatch = async (anyZone: boolean) => { const r = await match.run(anyZone); if (r) { toast(r.made ? `${r.made} matched` : 'Nobody new could be matched'); reload(); } };
  return (
    <>
      <PageHeader title="Sunday lifts" subtitle="Households that need a ride to the service, matched to members who can drive, zone by zone."
        actions={edit && (
          <>
            <button className="btn" onClick={() => setAdding('request')}><Plus size={16} /> Needs a lift</button>
            <button className="btn" onClick={() => setAdding('offer')}><Car size={16} /> Can drive</button>
            <button className="btn primary" disabled={match.busy || !data.waiting || !data.offers.length} onClick={() => runMatch(false)}><Wand2 size={16} /> Match by zone</button>
          </>
        )}
      />
      <div className="row wrap" style={{ gap: 12, alignItems: 'center' }}>
        <Segmented value={data.sunday} onChange={setSunday} options={data.sundays.map((s) => ({ value: s, label: day(s) }))} />
        {data.serviceTime && <span className="small muted">Service at {data.serviceTime}</span>}
      </div>
      <div className="stat-row">
        <div className="card mini-stat"><b>{data.waiting}</b><span>Waiting for a lift</span></div>
        <div className="card mini-stat"><b>{data.matched}</b><span>Matched</span></div>
        <div className="card mini-stat"><b>{data.offers.length}</b><span>Drivers</span></div>
        <div className="card mini-stat"><b>{data.seatsLeft}</b><span>Seats spare</span></div>
      </div>
      <FormError error={match.error ?? assign.error} />
      <div className="grid cols-2">
        <div className="card">
          <div className="card-head"><h2>Need a lift</h2>{edit && data.waiting > 0 && data.offers.some((o) => o.seatsLeft > 0) && <button className="btn ghost sm" disabled={match.busy} onClick={() => runMatch(true)}>Match across zones</button>}</div>
          {data.requests.length === 0 ? <Empty icon={<Car size={26} />} title="Nobody has asked for a lift this Sunday" body="Members ask in the app under Sunday lift, or add a household here." /> : (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Household</th><th>Zone</th><th className="num">People</th><th>Driver</th>{edit && <th />}</tr></thead>
              <tbody>{data.requests.map((q) => (
                <tr key={q.id}>
                  <td><b>{q.familyName}</b>{q.weekly && <span className="badge gray" style={{ marginLeft: 6 }}>Every Sunday</span>}<div className="small muted">{[q.phone, q.address].filter(Boolean).join(' · ')}{q.note ? ` · ${q.note}` : ''}</div></td>
                  <td className="small">{q.zoneName ?? '—'}</td>
                  <td className="num">{q.people}</td>
                  <td>
                    {edit ? (
                      <select className="select" style={{ minWidth: 160 }} value={q.driver?.id ?? ''} disabled={assign.busy} aria-label={`Driver for ${q.familyName}`} onChange={async (e) => { if (await assign.run(q, e.target.value || null)) reload(); }}>
                        <option value="">Waiting</option>
                        {data.offers.map((o) => <option key={o.id} value={o.id} disabled={o.id !== q.driver?.id && o.seatsLeft < q.people}>{o.driverName} · {o.zoneName ?? 'no zone'} · {o.seatsLeft} seat{o.seatsLeft === 1 ? '' : 's'} left</option>)}
                      </select>
                    ) : q.driver ? <span className="badge ok">{q.driver.name}</span> : <span className="badge warn">Waiting</span>}
                  </td>
                  {edit && <td className="num"><button className="btn ghost icon sm" aria-label="Remove" onClick={async () => { await AdminApi.rides.removeRequest(q.id); reload(); }}><Trash2 size={14} /></button></td>}
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </div>
        <div className="card">
          <div className="card-head"><h2>Can drive</h2></div>
          {data.offers.length === 0 ? <Empty icon={<Car size={26} />} title="No drivers yet" body="Members offer seats in the app under Sunday lift, or add a driver here." /> : (
            <div className="list">{data.offers.map((o) => <DriverRow key={o.id} o={o} edit={edit} onChanged={reload} />)}</div>
          )}
        </div>
      </div>
      {adding && <AddModal kind={adding} sunday={data.sunday} onClose={() => setAdding(null)} onSaved={() => { setAdding(null); toast(adding === 'request' ? 'Household added' : 'Driver added'); reload(); }} />}
    </>
  );
}

function DriverRow({ o, edit, onChanged }: { o: RideOfferView; edit: boolean; onChanged: () => void }) {
  return (
    <div className="list-row" style={{ alignItems: 'flex-start' }}>
      <div className="grow">
        <div><b>{o.driverName}</b>{o.weekly && <span className="badge gray" style={{ marginLeft: 6 }}>Every Sunday</span>} <span className="small muted">· {o.zoneName ?? 'no zone'} · {o.seatsLeft} of {o.seats} seats spare</span></div>
        <div className="small muted">{[o.phone, o.address].filter(Boolean).join(' · ')}{o.note ? ` · ${o.note}` : ''}</div>
        <div className="row wrap" style={{ gap: 6, marginTop: 6 }}>
          {o.riders.length ? o.riders.map((r) => <span key={r.id} className="badge ok" title={[r.address, r.phone].filter(Boolean).join(' · ')}>{r.familyName} ({r.people})</span>) : <span className="small muted">No riders yet</span>}
        </div>
      </div>
      {edit && <button className="btn ghost icon sm" aria-label="Remove driver" onClick={async () => { if (!o.riders.length || window.confirm(`${o.driverName} has ${o.riders.length} rider(s). Remove and put them back to waiting?`)) { await AdminApi.rides.removeOffer(o.id); onChanged(); } }}><Trash2 size={14} /></button>}
    </div>
  );
}

function AddModal({ kind, sunday, onClose, onSaved }: { kind: 'request' | 'offer'; sunday: string; onClose: () => void; onSaved: () => void }) {
  const [person, setPerson] = useState<{ id: string; name: string } | null>(null);
  const [n, setN] = useState(kind === 'request' ? '2' : '3');
  const [weekly, setWeekly] = useState(false);
  const [note, setNote] = useState('');
  const save = useAction((): Promise<RideRequestView | RideOfferView> => kind === 'request'
    ? AdminApi.rides.addRequest({ personId: person!.id, sunday, people: Number(n), weekly, note })
    : AdminApi.rides.addOffer({ personId: person!.id, sunday, seats: Number(n), weekly, note }));
  return (
    <Modal title={kind === 'request' ? `Needs a lift on ${day(sunday)}` : `Can drive on ${day(sunday)}`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!person || save.busy} onClick={async () => { if (await save.run()) onSaved(); }}>Add</button></>}>
      <div className="stack">
        <FormError error={save.error} />
        <div className="field">
          <span>{kind === 'request' ? 'Anyone in the household' : 'Driver'}</span>
          {person ? <div className="row" style={{ gap: 8 }}><b>{person.name}</b><button type="button" className="link-btn small" onClick={() => setPerson(null)}>change</button></div>
            : <PersonSearch autoFocus placeholder="Search by name or phone" onPick={(p) => setPerson({ id: p.id, name: p.name })} />}
        </div>
        <div className="grid cols-2">
          <Field label={kind === 'request' ? 'How many people' : 'Seats spare'}><input className="input" type="number" min={1} max={kind === 'request' ? 12 : 20} value={n} onChange={(e) => setN(e.target.value)} /></Field>
          <Field label="Repeats"><label className="row" style={{ gap: 8, height: 38 }}><input type="checkbox" checked={weekly} onChange={(e) => setWeekly(e.target.checked)} /> Every Sunday</label></Field>
        </div>
        <Field label="Note"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={kind === 'request' ? 'Car seat needed, wheelchair, leaves after kids church…' : 'Hatchback, leaves 8:15 from the main road…'} /></Field>
      </div>
    </Modal>
  );
}
