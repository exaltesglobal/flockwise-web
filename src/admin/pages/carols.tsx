// Christmas carol rounds: a season with its pace, the homes that asked, routes planned by zone and
// team with an arrival time per house, and what each team found at the door.
import { ArrowDown, ArrowUp, Check, Home, MapPin, Music2, Pencil, Plus, Route, Settings2, Trash2, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import type { CarolNightView, CarolSeasonView, CarolStopStatus } from '@/api/admin-types';
import { AdminApi, type CarolSeasonInput, type CarolsHub } from '@/api/endpoints';
import { Empty, ErrorState, Field, FormError, Loading, Modal, useToast } from '@/components/ui';
import { formatDate, formatMoney } from '@/lib/format';
import { useCan } from '@/lib/perms';
import { useAction, useApi } from '@/lib/use-api';

import { PersonSearch } from '../components/person-picker';
import { PageHeader } from '../layout';

const day = (d: string) => formatDate(`${d}T12:00:00`);
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const STATUS: { value: CarolStopStatus; label: string; badge: string }[] = [
  { value: 'planned', label: 'Planned', badge: 'gray' },
  { value: 'visited', label: 'Visited', badge: 'ok' },
  { value: 'not_home', label: 'Not home', badge: 'warn' },
  { value: 'skipped', label: 'Skipped', badge: 'gray' },
];
const year = () => new Date().getFullYear();
const defaultSeason = (): CarolSeasonInput => ({ from: `${year()}-12-10`, to: `${year()}-12-23`, startTime: '18:30', minutesPerHouse: 15, travelMinutes: 10, housesPerNight: 6, offDays: [0], fundId: null, message: 'The church carol team would love to sing at your home this Christmas. Pick the nights that suit your family.' });

export function CarolsPage() {
  const can = useCan();
  const { data, error, reload } = useApi(AdminApi.carols.get);
  const [settings, setSettings] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [adding, setAdding] = useState(false);
  const toast = useToast();
  const editable = can('care');

  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const s = data.season;
  const money = (n: number) => formatMoney(n, data.currency);

  return (
    <>
      <PageHeader
        title="Carol rounds"
        subtitle={s ? `${s.name} · ${day(s.from)} to ${day(s.to)} · from ${s.startTime}, about ${s.minutesPerHouse} min a house` : 'Plan the December house visits: who asked, which team sings where, and when they arrive.'}
        actions={s && editable ? (
          <>
            <button className="btn" onClick={() => setSettings(true)}><Settings2 size={16} /> Season</button>
            <button className="btn" onClick={() => setAdding(true)}><Plus size={16} /> Night</button>
            <button className="btn primary" onClick={() => setPlanning(true)}><Route size={16} /> Plan routes</button>
          </>
        ) : undefined}
      />
      {!s ? (
        <Empty
          icon={<Music2 size={28} />}
          title="No carol season yet"
          body="Start one and households can ask for a visit from the member app. You then plan the routes by zone and team, and the office tells each home the night before."
          action={editable ? <button className="btn primary" onClick={() => setSettings(true)}><Plus size={16} /> Start this year's season</button> : undefined}
        />
      ) : (
        <>
          <div className="stat-row">
            <div className="card mini-stat"><b>{s.totals.homes}</b><span>Homes on routes · {s.totals.nights} night{s.totals.nights === 1 ? '' : 's'}</span></div>
            <div className="card mini-stat"><b>{s.totals.visited}</b><span>Visited so far</span></div>
            <div className="card mini-stat"><b>{s.totals.requests}</b><span>Homes that asked · {s.waiting.length} still waiting</span></div>
            <div className="card mini-stat"><b>{money(s.totals.offering)}</b><span>Offerings at the door{s.fundName ? ` → ${s.fundName}` : ''}</span></div>
          </div>
          {s.waiting.length > 0 && (
            <div className="card">
              <div className="card-head"><h2>Waiting for a night</h2><span className="small muted">Asked from the app and not on a route yet. Plan routes to place them, or add them to a night below.</span></div>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Home</th><th>Area</th><th>Nights they prefer</th></tr></thead>
                  <tbody>
                    {s.waiting.map((w) => (
                      <tr key={w.familyKey}>
                        <td><b>{w.familyName}</b>{w.address && <div className="small muted">{w.address}</div>}</td>
                        <td>{w.zoneName ?? <span className="muted">No zone</span>}</td>
                        <td>{w.preferredDates.length ? w.preferredDates.map(day).join(', ') : <span className="muted">Any night</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {s.nights.length === 0 ? (
            <div className="card card-pad muted row"><Route size={18} /> No routes yet. Plan routes to fill the nights from your zones and the homes that asked, or add a night by hand.</div>
          ) : (
            <div className="stack">
              {s.nights.map((n) => <NightCard key={n.id} night={n} hub={data} editable={editable} onChanged={reload} />)}
            </div>
          )}
        </>
      )}
      {settings && (
        <SeasonModal
          season={s}
          hub={data}
          onClose={() => setSettings(false)}
          onSaved={() => { setSettings(false); reload(); }}
          onRemoved={() => { setSettings(false); toast('Season removed'); reload(); }}
        />
      )}
      {planning && s && <PlanModal season={s} hub={data} onClose={() => setPlanning(false)} onDone={(v) => { setPlanning(false); toast(`${v.totals.homes} homes over ${v.totals.nights} nights`); reload(); }} />}
      {adding && s && <NightModal season={s} hub={data} onClose={() => setAdding(false)} onDone={() => { setAdding(false); reload(); }} />}
    </>
  );
}

function NightCard({ night: n, hub, editable, onChanged }: { night: CarolNightView; hub: CarolsHub; editable: boolean; onChanged: () => void }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [addingStop, setAddingStop] = useState(false);
  const [form, setForm] = useState({ date: n.date, startTime: n.startTime, teamId: n.teamId ?? '', area: n.area, notes: n.notes });
  const update = useAction((input: Parameters<typeof AdminApi.carols.updateNight>[1]) => AdminApi.carols.updateNight(n.id, input));
  const remove = useAction(() => AdminApi.carols.removeNight(n.id));
  const addStop = useAction((personId: string) => AdminApi.carols.addStop(n.id, { personId }));
  const money = (v: number) => formatMoney(v, hub.currency);
  const move = async (key: string, dir: -1 | 1) => {
    const keys = n.stops.map((s) => s.familyKey);
    const i = keys.indexOf(key);
    const j = i + dir;
    if (j < 0 || j >= keys.length) return;
    [keys[i], keys[j]] = [keys[j], keys[i]];
    if (await update.run({ order: keys })) onChanged();
  };
  return (
    <div className="card">
      <div className="card-head" style={{ alignItems: 'flex-start' }}>
        <div className="grow">
          <h2>{day(n.date)} · {n.startTime}</h2>
          <div className="small muted">{n.teamName || 'No team yet'}{n.leaderName ? ` · led by ${n.leaderName}` : ''}{n.area ? ` · ${n.area}` : ''} · {n.visited}/{n.total} visited{n.offering > 0 ? ` · ${money(n.offering)} offered` : ''}</div>
          {n.notes && <div className="small" style={{ marginTop: 4 }}>{n.notes}</div>}
        </div>
        <div className="row wrap">
          {n.mapsUrl && n.stops.length > 0 && <a className="btn sm" href={n.mapsUrl} target="_blank" rel="noreferrer"><MapPin size={14} /> Route map</a>}
          {editable && <button className="btn sm" onClick={() => setAddingStop(!addingStop)}><Plus size={14} /> Home</button>}
          {editable && <button className="btn ghost icon sm" aria-label="Edit night" onClick={() => setEditing(!editing)}><Pencil size={15} /></button>}
          {editable && <button className="btn ghost icon sm" aria-label="Remove night" onClick={async () => { if (window.confirm('Remove this night and its route?') && (await remove.run())) { toast('Night removed'); onChanged(); } }}><Trash2 size={15} /></button>}
        </div>
      </div>
      <FormError error={update.error ?? remove.error ?? addStop.error} />
      {editing && (
        <form className="card-body stack" style={{ borderBottom: '1px solid var(--border)' }} onSubmit={async (e: FormEvent) => { e.preventDefault(); if (await update.run({ ...form, teamId: form.teamId || null })) { setEditing(false); onChanged(); } }}>
          <div className="row wrap">
            <Field label="Date"><input className="input" type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
            <Field label="Set out at"><input className="input" type="time" required value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} /></Field>
            <Field label="Team">
              <select className="select" value={form.teamId} onChange={(e) => setForm({ ...form, teamId: e.target.value })}>
                <option value="">No team</option>
                {hub.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </Field>
            <Field label="Area"><input className="input" value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} placeholder="Shown to the team" /></Field>
          </div>
          <Field label="Notes for the team"><input className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Carry the keyboard, meet at the church gate…" /></Field>
          <div className="row"><button className="btn primary" disabled={update.busy}>Save</button><button type="button" className="btn ghost" onClick={() => setEditing(false)}>Cancel</button></div>
        </form>
      )}
      {addingStop && (
        <div className="card-body" style={{ borderBottom: '1px solid var(--border)' }}>
          <PersonSearch autoFocus placeholder="Add a home: search anyone in the household" exclude={n.stops.flatMap((s) => s.personIds)} onPick={async (p) => { if (await addStop.run(p.id)) { toast(`${p.name}’s home added`); setAddingStop(false); onChanged(); } }} />
        </div>
      )}
      {n.stops.length === 0 ? (
        <div className="card-body muted small">No homes on this route yet.</div>
      ) : (
        <div className="table-wrap">
          <table className="table carol-stops">
            <thead><tr><th>Arrive</th><th>Home</th><th>At the door</th><th>Offering</th>{editable && <th />}</tr></thead>
            <tbody>
              {n.stops.map((s, i) => <StopRow key={s.familyKey} night={n} stop={s} index={i} editable={editable} currency={hub.currency} onMove={move} onChanged={onChanged} />)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StopRow({ night, stop: s, index, editable, currency, onMove, onChanged }: { night: CarolNightView; stop: CarolNightView['stops'][number]; index: number; editable: boolean; currency: CarolsHub['currency']; onMove: (key: string, dir: -1 | 1) => void; onChanged: () => void }) {
  const update = useAction((input: { status?: CarolStopStatus; offering?: number | null; note?: string }) => AdminApi.carols.updateStop(night.id, s.familyKey, input));
  const remove = useAction(() => AdminApi.carols.removeStop(night.id, s.familyKey));
  const [rupees, setRupees] = useState(s.offering == null ? '' : String(s.offering / 100));
  const [note, setNote] = useState(s.note);
  const status = STATUS.find((x) => x.value === s.status)!;
  const saveOffering = async () => {
    const v = rupees.trim() === '' ? null : Math.round(Number(rupees) * 100);
    if (v !== null && (!Number.isFinite(v) || v < 0)) return;
    if (v !== (s.offering ?? null) && (await update.run({ offering: v }))) onChanged();
  };
  return (
    <tr className={s.status === 'visited' ? 'done' : ''}>
      <td className="nowrap"><b>{s.eta}</b></td>
      <td>
        <div className="row" style={{ gap: 8 }}><Home size={14} className="muted" /><b>{s.familyName}</b></div>
        {s.address && <div className="small muted">{s.address}</div>}
        {s.phone && <div className="small muted">{s.phone}</div>}
        {editable ? (
          <input className="input sm carol-note" placeholder="Note from the door" value={note} onChange={(e) => setNote(e.target.value)} onBlur={async () => { if (note !== s.note && (await update.run({ note }))) onChanged(); }} />
        ) : s.note ? <div className="small">{s.note}</div> : null}
      </td>
      <td>
        {editable ? (
          <div className="row wrap" style={{ gap: 4 }}>
            {STATUS.map((x) => (
              <button key={x.value} className={`btn sm ${s.status === x.value ? 'primary' : 'ghost'}`} disabled={update.busy} onClick={async () => { if (s.status !== x.value && (await update.run({ status: x.value }))) onChanged(); }}>{x.value === 'visited' && <Check size={13} />}{x.label}</button>
            ))}
          </div>
        ) : <span className={`badge ${status.badge}`}>{status.label}</span>}
        <FormError error={update.error ?? remove.error} />
      </td>
      <td className="nowrap">
        {editable ? (
          <input className="input sm" style={{ width: 110 }} inputMode="decimal" placeholder={currency === 'INR' ? '₹' : currency} value={rupees} onChange={(e) => setRupees(e.target.value)} onBlur={saveOffering} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
        ) : s.offering != null ? formatMoney(s.offering, currency) : <span className="muted">—</span>}
      </td>
      {editable && (
        <td className="nowrap">
          <div className="row" style={{ gap: 2 }}>
            <button className="btn ghost icon sm" aria-label="Earlier" disabled={index === 0} onClick={() => onMove(s.familyKey, -1)}><ArrowUp size={14} /></button>
            <button className="btn ghost icon sm" aria-label="Later" disabled={index === night.stops.length - 1} onClick={() => onMove(s.familyKey, 1)}><ArrowDown size={14} /></button>
            <button className="btn ghost icon sm" aria-label="Remove home" onClick={async () => { if (await remove.run()) onChanged(); }}><X size={14} /></button>
          </div>
        </td>
      )}
    </tr>
  );
}

function SeasonModal({ season, hub, onClose, onSaved, onRemoved }: { season: CarolSeasonView | null; hub: CarolsHub; onClose: () => void; onSaved: () => void; onRemoved: () => void }) {
  const [form, setForm] = useState<CarolSeasonInput>(season ? { name: season.name, from: season.from, to: season.to, startTime: season.startTime, minutesPerHouse: season.minutesPerHouse, travelMinutes: season.travelMinutes, housesPerNight: season.housesPerNight, offDays: season.offDays, fundId: season.fundId, message: season.message } : defaultSeason());
  const save = useAction(() => (season ? AdminApi.carols.updateSeason(season.id, form) : AdminApi.carols.createSeason(form)));
  const remove = useAction(() => AdminApi.carols.removeSeason(season!.id));
  const num = (k: 'minutesPerHouse' | 'travelMinutes' | 'housesPerNight') => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: Number(e.target.value) });
  const offDays = form.offDays ?? [];
  return (
    <Modal
      title={season ? 'Season settings' : 'Start the carol season'}
      onClose={onClose}
      footer={
        <>
          {season && <button type="button" className="btn ghost danger-text" disabled={remove.busy} onClick={async () => { if (window.confirm('Remove the whole season, its routes and requests?') && (await remove.run())) onRemoved(); }}><Trash2 size={15} /> Remove season</button>}
          <span className="grow" />
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button type="submit" form="carol-season" className="btn primary" disabled={save.busy}>{season ? 'Save' : 'Start season'}</button>
        </>
      }
    >
      <form id="carol-season" className="stack" onSubmit={async (e: FormEvent) => { e.preventDefault(); if (await save.run()) onSaved(); }}>
        <FormError error={save.error ?? remove.error} />
        <Field label="Name" hint="Leave blank for “Christmas carols 2026”."><input className="input" value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <div className="row wrap">
          <Field label="First night"><input className="input" type="date" required value={form.from ?? ''} onChange={(e) => setForm({ ...form, from: e.target.value })} /></Field>
          <Field label="Last night"><input className="input" type="date" required value={form.to ?? ''} onChange={(e) => setForm({ ...form, to: e.target.value })} /></Field>
          <Field label="Set out at"><input className="input" type="time" required value={form.startTime ?? ''} onChange={(e) => setForm({ ...form, startTime: e.target.value })} /></Field>
        </div>
        <div className="row wrap">
          <Field label="Minutes a house"><input className="input" type="number" min={5} max={60} value={form.minutesPerHouse ?? 15} onChange={num('minutesPerHouse')} /></Field>
          <Field label="Travel between"><input className="input" type="number" min={0} max={60} value={form.travelMinutes ?? 10} onChange={num('travelMinutes')} /></Field>
          <Field label="Houses a night"><input className="input" type="number" min={1} max={30} value={form.housesPerNight ?? 6} onChange={num('housesPerNight')} /></Field>
        </div>
        <Field label="Nights the team stays home">
          <div className="row wrap" style={{ gap: 6 }}>
            {WEEKDAYS.map((w, i) => (
              <label key={w} className={`chip ${offDays.includes(i) ? '' : 'off'}`} style={{ cursor: 'pointer', paddingRight: 10 }}>
                <input type="checkbox" checked={offDays.includes(i)} onChange={() => setForm({ ...form, offDays: offDays.includes(i) ? offDays.filter((d) => d !== i) : [...offDays, i].sort() })} /> {w}
              </label>
            ))}
          </div>
        </Field>
        <Field label="Offerings at the door go to" hint="Each offering is recorded as a cash gift to this fund with a receipt number.">
          <select className="select" value={form.fundId ?? ''} onChange={(e) => setForm({ ...form, fundId: e.target.value || null })}>
            <option value="">Do not record offerings</option>
            {hub.funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </Field>
        <Field label="What households read in the app"><textarea className="textarea" rows={3} value={form.message ?? ''} onChange={(e) => setForm({ ...form, message: e.target.value })} /></Field>
      </form>
    </Modal>
  );
}

function PlanModal({ season, hub, onClose, onDone }: { season: CarolSeasonView; hub: CarolsHub; onClose: () => void; onDone: (v: CarolSeasonView) => void }) {
  const [zoneIds, setZoneIds] = useState<string[]>(hub.zones.filter((z) => z.homes > 0).map((z) => z.id));
  const [teamIds, setTeamIds] = useState<string[]>(hub.teams.slice(0, 2).map((t) => t.id));
  const [onlyRequests, setOnlyRequests] = useState(hub.zones.every((z) => z.homes === 0));
  const plan = useAction(() => AdminApi.carols.plan(season.id, { zoneIds: onlyRequests ? [] : zoneIds, teamIds, onlyRequests }));
  const toggle = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const homes = onlyRequests ? season.totals.requests : hub.zones.filter((z) => zoneIds.includes(z.id)).reduce((n, z) => n + z.homes, 0) + season.waiting.filter((w) => !w.zoneName || !zoneIds.some((id) => hub.zones.find((z) => z.id === id)?.name === w.zoneName)).length;
  const nights = Math.ceil(homes / Math.max(1, season.housesPerNight));
  const kept = season.nights.filter((n) => n.stops.some((s) => s.status !== 'planned')).length;
  return (
    <Modal
      title="Plan the routes"
      onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={plan.busy || teamIds.length === 0} onClick={async () => { const v = await plan.run(); if (v) onDone(v); }}><Route size={16} /> Plan {homes} home{homes === 1 ? '' : 's'} over about {nights} night{nights === 1 ? '' : 's'}</button></>}
    >
      <div className="stack">
        <p className="small muted">Homes are grouped by zone and address, the ones that asked go first, {season.housesPerNight} to a night, and the teams take turns across {season.dates.length} nights from {day(season.from)}. Nights already visited are kept; the rest are rebuilt.{kept > 0 ? ` ${kept} night${kept === 1 ? '' : 's'} with visits will stay as they are.` : ''}</p>
        <FormError error={plan.error} />
        <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={onlyRequests} onChange={(e) => setOnlyRequests(e.target.checked)} /> Only the homes that asked ({season.totals.requests})</label>
        {!onlyRequests && (
          <Field label="Zones to cover" hint="Every home in these zones gets a visit; homes that asked are added even if their zone is not ticked.">
            {hub.zones.length === 0 ? <span className="small muted">No zones yet. Set them up under Zones, or plan only the homes that asked.</span> : (
              <div className="stack" style={{ gap: 4 }}>
                {hub.zones.map((z) => <label key={z.id} className="row hub-pick-row"><input type="checkbox" checked={zoneIds.includes(z.id)} onChange={() => toggle(zoneIds, setZoneIds, z.id)} /><span className="grow">{z.name}</span><span className="small muted">{z.homes} home{z.homes === 1 ? '' : 's'}</span></label>)}
              </div>
            )}
          </Field>
        )}
        <Field label="Teams that sing" hint="Nights are shared round-robin between the ticked teams.">
          <div className="stack" style={{ gap: 4 }}>
            {hub.teams.map((t) => <label key={t.id} className="row hub-pick-row"><input type="checkbox" checked={teamIds.includes(t.id)} onChange={() => toggle(teamIds, setTeamIds, t.id)} /><span className="grow">{t.name}</span></label>)}
          </div>
        </Field>
      </div>
    </Modal>
  );
}

function NightModal({ season, hub, onClose, onDone }: { season: CarolSeasonView; hub: CarolsHub; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ date: season.dates.find((d) => !season.nights.some((n) => n.date === d)) ?? season.from, teamId: hub.teams[0]?.id ?? '', startTime: season.startTime, area: '' });
  const add = useAction(() => AdminApi.carols.addNight(season.id, { ...form, teamId: form.teamId || null }));
  return (
    <Modal title="Add a night" onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button type="submit" form="carol-night" className="btn primary" disabled={add.busy}>Add night</button></>}>
      <form id="carol-night" className="stack" onSubmit={async (e: FormEvent) => { e.preventDefault(); if (await add.run()) onDone(); }}>
        <FormError error={add.error} />
        <div className="row wrap">
          <Field label="Date"><input className="input" type="date" required min={season.from} max={season.to} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
          <Field label="Set out at"><input className="input" type="time" required value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} /></Field>
        </div>
        <Field label="Team">
          <select className="select" value={form.teamId} onChange={(e) => setForm({ ...form, teamId: e.target.value })}>
            <option value="">Decide later</option>
            {hub.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
        <Field label="Area" hint="Then add homes to the night from the card."><input className="input" value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} placeholder="Jubilee Hills" /></Field>
      </form>
    </Modal>
  );
}
