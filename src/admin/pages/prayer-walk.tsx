// Care › Prayer walk map: the church's neighbourhood, street by street. Set the area (a centre and
// how far around it), load the streets and lanes from OpenStreetMap or draw them, and watch them turn
// green as members prayer-walk them. A street counts as prayed for when someone walked it within the
// cycle (a month by default), so over a month the whole locality is covered.
import { Footprints, MapPin, Pencil, Search, Trash2, Undo2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import { AdminApi } from '@/api/endpoints';
import type { PrayerWalkView, WalkStreetView } from '@/core/types';
import { ErrorState, Field, FormError, Loading, Segmented, useHiddenRows, useToast, useUndoableDelete } from '@/components/ui';
import { WalkLegend, WalkMap, type LatLng } from '@/components/walk-map';
import { formatDate } from '@/lib/format';
import { useAction, useApi } from '@/lib/use-api';

import { PageHeader } from '../layout';

type Mode = 'look' | 'area' | 'draw';
const INDIA: LatLng = { lat: 17.385, lng: 78.4867 };
const km = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`);

export function PrayerWalkPage() {
  const q = useApi(AdminApi.prayerWalk.get);
  const [data, setData] = useState<PrayerWalkView | null>(null);
  const d = data ?? q.data;
  const title = 'Prayer walk map';
  if (q.error) return <><PageHeader title={title} /><ErrorState error={q.error} onRetry={q.reload} /></>;
  if (!d) return <><PageHeader title={title} /><Loading /></>;
  return (
    <>
      <PageHeader title={title} subtitle="Members prayer-walk their street and tick it in the app. The map shows which streets and lanes around the church have been prayed for this month (green) and which are still waiting (orange), so the whole locality is covered street by street." />
      <Hub d={d} onChange={setData} />
    </>
  );
}

function Hub({ d, onChange }: { d: PrayerWalkView; onChange: (v: PrayerWalkView) => void }) {
  const [mode, setMode] = useState<Mode>(d.area.center ? 'look' : 'area');
  const [centre, setCentre] = useState<LatLng | null>(d.area.center);
  const [radius, setRadius] = useState(d.area.radius);
  const [picked, setPicked] = useState<string | null>(null);
  const [draft, setDraft] = useState<[number, number][]>([]);
  const rows = useHiddenRows();
  const streets = useMemo(() => d.streets.filter((s) => !rows.hidden.has(s.id)), [d.streets, rows.hidden]);
  const street = streets.find((s) => s.id === picked) ?? null;
  const toast = useToast();

  const saveArea = useAction(async () => {
    if (!centre) return;
    const v = await AdminApi.prayerWalk.area({ center: centre, radius });
    onChange(v);
    setCentre(v.area.center);
    toast('Area saved');
  });
  const load = useAction(async () => {
    const v = await AdminApi.prayerWalk.load();
    onChange(v);
    setMode('look');
    toast(`${v.streets.length} streets on the map`);
  });
  const areaChanged = !!centre && (centre.lat !== d.area.center?.lat || centre.lng !== d.area.center?.lng || radius !== d.area.radius);

  const onPoint = (p: LatLng) => {
    if (mode === 'area') setCentre(p);
    else if (mode === 'draw') setDraft([...draft, [p.lat, p.lng]]);
    else setPicked(null);
  };

  return (
    <div className="stack" style={{ gap: 16 }}>
      {d.streets.length > 0 && <Stats d={d} />}
      <section className="card card-pad stack" style={{ gap: 12 }}>
        <div className="row between wrap" style={{ gap: 8 }}>
          <Segmented<Mode> value={mode} onChange={(m) => { setMode(m); setPicked(null); }} options={[{ value: 'look', label: 'Streets' }, { value: 'area', label: 'Set the area' }, { value: 'draw', label: 'Draw a street' }]} />
          <WalkLegend covered="Prayed for this cycle" uncovered="Still to walk" picked="Chosen" />
        </div>
        {mode === 'area' && <AreaTools centre={centre} radius={radius} setCentre={setCentre} setRadius={setRadius} />}
        {mode === 'draw' && <p className="small muted" style={{ margin: 0 }}>Tap along a lane that OpenStreetMap does not have, point by point, then name it and save.</p>}
        <WalkMap
          center={centre ?? d.area.center ?? INDIA}
          radius={mode === 'area' || !d.streets.length ? radius : d.area.radius}
          streets={mode === 'area' ? [] : streets}
          selected={picked ? new Set([picked]) : undefined}
          draft={mode === 'draw' ? draft : undefined}
          height={480}
          onStreet={mode === 'look' ? setPicked : undefined}
          onPoint={onPoint}
        />
        {mode === 'area' && (
          <div className="stack" style={{ gap: 8 }}>
            <FormError error={saveArea.error ?? load.error} />
            <div className="row wrap" style={{ gap: 8 }}>
              <button className="btn primary" disabled={!centre || !areaChanged || saveArea.busy} onClick={() => saveArea.run()}>Save the area</button>
              <button className="btn" disabled={!d.area.center || areaChanged || load.busy} onClick={() => load.run()}>{load.busy ? 'Loading streets…' : d.area.loadedAt ? 'Load the streets again' : 'Load the streets from OpenStreetMap'}</button>
            </div>
            <span className="small muted">
              {!centre ? 'Tap the map where the church is, or use your location.' : areaChanged ? 'Save the area first, then load its streets.' : d.area.loadedAt ? `Streets loaded ${formatDate(d.area.loadedAt)}. Loading again replaces them and keeps the ones you drew; walks on streets that stay are kept.` : 'Loading takes a few seconds. Lanes OpenStreetMap does not have can be drawn by hand.'}
            </span>
          </div>
        )}
        {mode === 'draw' && <DrawTools draft={draft} setDraft={setDraft} onSaved={(v) => { onChange(v); setDraft([]); }} />}
        {mode === 'look' && !d.streets.length && <div className="small muted">No streets yet. Choose "Set the area" to place the church and load the streets around it.</div>}
        {mode === 'look' && street && <StreetCard key={street.id} s={street} onChange={onChange} onRemove={() => {
          setPicked(null);
          rows.hide(street.id);
        }} onBack={() => rows.show(street.id)} />}
        {mode === 'look' && !street && d.streets.length > 0 && <span className="small muted">Tap a street to see who walked it, rename it or take it off the map.</span>}
      </section>
      <Settings d={d} onChange={onChange} />
      <People d={d} />
    </div>
  );
}

function Stats({ d }: { d: PrayerWalkView }) {
  const s = d.stats;
  const tile = (value: string, label: string) => (
    <div className="card card-pad stack" style={{ gap: 2, flex: '1 1 150px' }}>
      <b style={{ fontSize: '1.5rem', fontFamily: 'var(--font-heading)' }}>{value}</b>
      <span className="small muted">{label}</span>
    </div>
  );
  return (
    <div className="row wrap" style={{ gap: 12, alignItems: 'stretch' }}>
      {tile(`${s.percent}%`, `of the area prayed for in the last ${d.area.cycleDays} days`)}
      {tile(`${s.covered} of ${s.streets}`, 'streets and lanes walked')}
      {tile(km(s.coveredLength), `walked of ${km(s.length)}`)}
      {tile(String(s.walkers), `walkers this cycle · ${s.walksThisCycle} walks`)}
    </div>
  );
}

function AreaTools({ centre, radius, setCentre, setRadius }: { centre: LatLng | null; radius: number; setCentre: (c: LatLng) => void; setRadius: (r: number) => void }) {
  const [place, setPlace] = useState('');
  const [msg, setMsg] = useState('');
  const find = useAction(async () => {
    setMsg('');
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=in&q=${encodeURIComponent(place)}`).then((x) => x.json() as Promise<{ lat: string; lon: string; display_name: string }[]>);
    if (!r.length) return setMsg('That place was not found. Try the area and city, like "Gachibowli, Hyderabad".');
    setCentre({ lat: Number(r[0].lat), lng: Number(r[0].lon) });
    setMsg(r[0].display_name);
  });
  const mine = () => {
    if (!('geolocation' in navigator)) return setMsg('This browser cannot share its location.');
    navigator.geolocation.getCurrentPosition((p) => setCentre({ lat: p.coords.latitude, lng: p.coords.longitude }), () => setMsg('Location is off. Tap the map instead.'), { enableHighAccuracy: true, timeout: 8000 });
  };
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row wrap" style={{ gap: 8 }}>
        <form className="row grow" style={{ gap: 6, minWidth: 240 }} onSubmit={(e) => { e.preventDefault(); if (place.trim()) void find.run(); }}>
          <input className="input grow" value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Find a place: area, landmark, city" />
          <button className="btn" disabled={find.busy || !place.trim()}><Search size={15} /> Find</button>
        </form>
        <button type="button" className="btn" onClick={mine}><MapPin size={15} /> I am at the church</button>
      </div>
      <Field label={`How far around the church: ${km(radius)}`} hint="The streets inside this circle make up your neighbourhood. Start small (500 m to 1 km) so it can be covered in a month.">
        <input type="range" min={200} max={3000} step={100} value={radius} onChange={(e) => setRadius(Number(e.target.value))} style={{ maxWidth: 360 }} />
      </Field>
      <span className="small muted">{msg || (centre ? `Centre: ${centre.lat.toFixed(5)}, ${centre.lng.toFixed(5)}. Tap the map to move it.` : '')}</span>
    </div>
  );
}

function DrawTools({ draft, setDraft, onSaved }: { draft: [number, number][]; setDraft: (d: [number, number][]) => void; onSaved: (v: PrayerWalkView) => void }) {
  const [name, setName] = useState('');
  const save = useAction(async () => { onSaved(await AdminApi.prayerWalk.addStreet({ name: name.trim(), path: draft })); setName(''); });
  return (
    <div className="stack" style={{ gap: 8 }}>
      <FormError error={save.error} />
      <div className="row wrap" style={{ gap: 8 }}>
        <input className="input grow" style={{ minWidth: 200 }} value={name} onChange={(e) => setName(e.target.value)} placeholder="Name of the street or lane" />
        <button className="btn" disabled={!draft.length} onClick={() => setDraft(draft.slice(0, -1))}><Undo2 size={15} /> Undo point</button>
        <button className="btn primary" disabled={draft.length < 2 || !name.trim() || save.busy} onClick={() => save.run()}>Save street</button>
      </div>
      <span className="small muted">{draft.length ? `${draft.length} point${draft.length === 1 ? '' : 's'}` : 'No points yet.'}</span>
    </div>
  );
}

function StreetCard({ s, onChange, onRemove, onBack }: { s: WalkStreetView; onChange: (v: PrayerWalkView) => void; onRemove: () => void; onBack: () => void }) {
  const [name, setName] = useState(s.name);
  const undoable = useUndoableDelete();
  const rename = useAction(async () => onChange(await AdminApi.prayerWalk.rename(s.id, name.trim())));
  return (
    <div className="card card-pad stack" style={{ gap: 8, background: 'var(--tint)' }}>
      <div className="row wrap" style={{ gap: 6 }}>
        <input className="input grow" style={{ minWidth: 180 }} value={name} onChange={(e) => setName(e.target.value)} aria-label="Street name" />
        <button className="btn sm" disabled={!name.trim() || name === s.name || rename.busy} onClick={() => rename.run()}><Pencil size={14} /> Rename</button>
        <button className="btn ghost sm" onClick={() => undoable({ text: `${s.name} taken off the map`, hide: onRemove, show: onBack, run: () => AdminApi.prayerWalk.remove(s.id).then(onChange) })}><Trash2 size={14} /> Take off the map</button>
      </div>
      <FormError error={rename.error} />
      <span className="small">
        {s.covered ? <span className="badge ok">Prayed for</span> : <span className="badge warn">Still to walk</span>} {km(s.length)} · {s.kind === 'drawn' ? 'drawn by hand' : 'from OpenStreetMap'} · {s.lastWalkedAt ? `last walked ${formatDate(s.lastWalkedAt)}, ${s.walks} walk${s.walks === 1 ? '' : 's'} this cycle` : 'never walked yet'}
      </span>
    </div>
  );
}

function Settings({ d, onChange }: { d: PrayerWalkView; onChange: (v: PrayerWalkView) => void }) {
  const [name, setName] = useState(d.area.name);
  const [cycle, setCycle] = useState(d.area.cycleDays);
  const [prompts, setPrompts] = useState(d.area.prompts.join('\n'));
  const toast = useToast();
  const save = useAction(async () => { onChange(await AdminApi.prayerWalk.area({ name, cycleDays: cycle, prompts: prompts.split('\n') })); toast('Saved'); });
  return (
    <section className="card card-pad stack" style={{ gap: 12 }}>
      <h3 style={{ margin: 0 }}>For the walkers</h3>
      <FormError error={save.error} />
      <div className="row wrap" style={{ gap: 12 }}>
        <Field label="Name of the area"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Gachibowli and Kondapur" /></Field>
        <Field label="A street counts as prayed for" hint="Once walked, a street stays green for this long.">
          <select className="select" value={cycle} onChange={(e) => setCycle(Number(e.target.value))}>
            {[7, 14, 30, 60, 90].map((n) => <option key={n} value={n}>{n === 30 ? 'for a month' : n === 7 ? 'for a week' : `for ${n} days`}</option>)}
          </select>
        </Field>
      </div>
      <Field label="What to pray while walking" hint="One per line. Members see these as they walk.">
        <textarea className="input" rows={5} value={prompts} onChange={(e) => setPrompts(e.target.value)} />
      </Field>
      <button className="btn primary" style={{ alignSelf: 'flex-start' }} disabled={save.busy} onClick={() => save.run()}>Save</button>
    </section>
  );
}

function People({ d }: { d: PrayerWalkView }) {
  if (!d.recent.length) return <div className="card card-pad small muted"><Footprints size={15} style={{ verticalAlign: '-3px' }} /> No walks yet. Members find the map under Prayer walk in the app.</div>;
  return (
    <div className="row wrap" style={{ gap: 16, alignItems: 'flex-start' }}>
      <section className="card card-pad stack" style={{ gap: 6, flex: '1 1 260px' }}>
        <h3 style={{ margin: 0 }}>Walkers this cycle</h3>
        {d.walkers.map((w) => <div key={w.name} className="row between"><span>{w.name}</span><span className="small muted">{w.streets} street{w.streets === 1 ? '' : 's'}</span></div>)}
      </section>
      <section className="card card-pad stack" style={{ gap: 6, flex: '2 1 320px' }}>
        <h3 style={{ margin: 0 }}>Latest walks</h3>
        {d.recent.map((r, i) => (
          <div key={i} className="stack" style={{ gap: 0 }}>
            <span><b>{r.name}</b> walked {r.streetName} <span className="small muted">· {formatDate(r.at)}</span></span>
            {r.note && <span className="small muted">“{r.note}”</span>}
          </div>
        ))}
      </section>
    </div>
  );
}
