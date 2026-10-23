// Asset register: what the church owns, where it is, who looks after it, and when it is next due
// a service or the AMC runs out. Everyone on staff can look; changing it needs the settings or
// giving.edit permission (the same people who sign off expenses).
import { Armchair, Download, Plus, Wrench } from 'lucide-react';
import { useState } from 'react';

import type { AssetCategory, AssetCondition, AssetLogEntry, AssetView } from '@/api/admin-types';
import { AdminApi, type AssetInput } from '@/api/endpoints';
import { Empty, ErrorState, Field, FormError, Loading, Modal, Segmented, useToast } from '@/components/ui';
import { downloadCsv, formatDate, formatMoney } from '@/lib/format';
import { useCan } from '@/lib/perms';
import { useAction, useApi } from '@/lib/use-api';

import { PersonSearch } from '../components/person-picker';
import { PageHeader } from '../layout';

export const CATEGORY: Record<AssetCategory, string> = {
  furniture: 'Furniture', sound: 'Sound', av: 'Projection & video', instrument: 'Instruments', electrical: 'Electrical & generator',
  vehicle: 'Vehicles', kitchen: 'Kitchen', building: 'Building & fittings', it: 'Computers & office', other: 'Other',
};
const CONDITION: Record<AssetCondition, { label: string; badge: string }> = { good: { label: 'Good', badge: 'ok' }, needs_repair: { label: 'Needs repair', badge: 'warn' }, retired: { label: 'Retired', badge: 'gray' } };
const LOG_KIND: Record<AssetLogEntry['kind'], string> = { service: 'Serviced', repair: 'Repaired', note: 'Note', moved: 'Moved', retired: 'Retired' };
type Status = 'active' | 'retired' | 'all';
const rupees = (minor: number | null) => (minor === null ? '' : String(minor / 100));
const minor = (s: string) => (s.trim() === '' ? null : Math.round(Number(s) * 100));

function dueText(a: AssetView): { text: string; tone: 'danger' | 'warn' | '' } | null {
  const bits: { text: string; days: number }[] = [];
  if (a.serviceDueInDays !== null) bits.push({ text: a.serviceDueInDays < 0 ? `Service overdue by ${-a.serviceDueInDays} d` : a.serviceDueInDays === 0 ? 'Service due today' : `Service in ${a.serviceDueInDays} d`, days: a.serviceDueInDays });
  if (a.amcDueInDays !== null && a.amcDueInDays <= 60) bits.push({ text: a.amcDueInDays < 0 ? 'AMC ended' : `AMC ends in ${a.amcDueInDays} d`, days: a.amcDueInDays });
  if (a.warrantyDueInDays !== null && a.warrantyDueInDays <= 60) bits.push({ text: a.warrantyDueInDays < 0 ? 'Warranty over' : `Warranty ends in ${a.warrantyDueInDays} d`, days: a.warrantyDueInDays });
  if (!bits.length) return null;
  const soonest = Math.min(...bits.map((b) => b.days));
  return { text: bits.map((b) => b.text).join(' · '), tone: soonest < 0 ? 'danger' : soonest <= 30 ? 'warn' : '' };
}

export function AssetsPage() {
  const toast = useToast();
  const can = useCan();
  const canEdit = can('settings', 'giving.edit');
  const [status, setStatus] = useState<Status>('active');
  const [category, setCategory] = useState('');
  const [q, setQ] = useState('');
  const { data, error, reload } = useApi(() => AdminApi.assets.hub({ status, category: category || undefined, q: q.trim() || undefined }), [status, category, q]);
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const s = data.summary;
  const current = open ? data.assets.find((a) => a.id === open) ?? null : null;
  async function exportCsv() {
    const all = await AdminApi.assets.hub({ status: 'all' });
    downloadCsv('assets.csv', [
      ['Tag', 'Name', 'Category', 'Qty', 'Location', 'Custodian', 'Serial', 'Vendor', 'Purchased', 'Cost per unit', 'Warranty until', 'AMC vendor', 'AMC phone', 'AMC until', 'Service every (months)', 'Last serviced', 'Next service', 'Condition', 'Status', 'Notes'],
      ...all.assets.map((a) => [a.tag, a.name, CATEGORY[a.category], a.quantity, a.location, a.custodianName, a.serial, a.vendor, a.purchasedOn, a.cost === null ? '' : a.cost / 100, a.warrantyUntil, a.amc?.vendor, a.amc?.phone, a.amc?.until, a.serviceEveryMonths, a.lastServicedOn, a.nextServiceOn, CONDITION[a.condition].label, a.status, a.notes]),
    ]);
  }
  return (
    <>
      <PageHeader title="Assets" subtitle="Everything the church owns, from the generator to the chairs: where it is, who looks after it, and when the next service or AMC is due. The office is reminded a week before a service and a month before an AMC or warranty ends."
        actions={<><button className="btn" onClick={exportCsv}><Download size={16} /> Export CSV</button>{canEdit && <button className="btn primary" onClick={() => setAdding(true)}><Plus size={16} /> Add asset</button>}</>} />
      <div className="stat-row">
        <div className="card mini-stat"><b>{s.count}</b><span>Items in use</span></div>
        <div className="card mini-stat"><b>{formatMoney(s.value, 'INR')}</b><span>Purchase value</span></div>
        <div className="card mini-stat"><b style={{ color: s.serviceDue ? 'var(--warn)' : undefined }}>{s.serviceDue}</b><span>Service due this week</span></div>
        <div className="card mini-stat"><b style={{ color: s.amcExpiring ? 'var(--warn)' : undefined }}>{s.amcExpiring}</b><span>AMC or warranty ending</span></div>
        <div className="card mini-stat"><b style={{ color: s.needsRepair ? 'var(--danger)' : undefined }}>{s.needsRepair}</b><span>Need repair</span></div>
      </div>
      <div className="row wrap" style={{ gap: 10, alignItems: 'center' }}>
        <Segmented value={status} onChange={(v) => { setStatus(v); setOpen(null); }} options={[{ value: 'active', label: 'In use' }, { value: 'retired', label: 'Retired' }, { value: 'all', label: 'All' }]} />
        <select className="select" style={{ width: 'auto' }} value={category} aria-label="Category" onChange={(e) => { setCategory(e.target.value); setOpen(null); }}>
          <option value="">All categories</option>
          {data.categories.map((c) => <option key={c} value={c}>{CATEGORY[c]}</option>)}
        </select>
        <input className="input" style={{ width: 240 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, tag, place, person…" aria-label="Search assets" />
      </div>
      <div className="card">
        {data.assets.length === 0 ? <Empty icon={<Armchair size={26} />} title={q || category ? 'Nothing matches' : status === 'retired' ? 'Nothing retired yet' : 'No assets yet'} body={canEdit ? 'Start with the big things: the generator, the sound desk, the projector, the chairs. Each gets a sticker tag like A-0001.' : 'Ask someone with the settings permission to add the first asset.'} action={canEdit && !q && !category && status === 'active' ? <button className="btn primary" onClick={() => setAdding(true)}><Plus size={16} /> Add asset</button> : undefined} /> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Tag</th><th>Asset</th><th>Where · who</th><th className="num">Qty</th><th className="num">Cost</th><th>Condition</th><th>Due</th></tr></thead>
            <tbody>{data.assets.map((a) => { const due = dueText(a); return (
              <tr key={a.id} className="clickable" onClick={() => setOpen(a.id)}>
                <td className="mono small">{a.tag}</td>
                <td><b>{a.name}</b><div className="small muted">{CATEGORY[a.category]}{a.serial ? ` · ${a.serial}` : ''}</div></td>
                <td className="small">{a.location || '—'}{a.custodianName ? <div className="muted">{a.custodianName}</div> : null}</td>
                <td className="num">{a.quantity}</td>
                <td className="num">{a.cost !== null ? formatMoney(a.cost * a.quantity, 'INR') : '—'}</td>
                <td><span className={`badge ${CONDITION[a.condition].badge}`}>{CONDITION[a.condition].label}</span></td>
                <td className="small">{due ? <span className={due.tone ? `badge ${due.tone}` : 'muted'}>{due.text}</span> : <span className="muted">—</span>}</td>
              </tr>
            ); })}</tbody>
          </table></div>
        )}
      </div>
      {current && <Detail a={current} canEdit={canEdit} onClose={() => setOpen(null)} onChanged={reload} />}
      {adding && <AssetForm onClose={() => setAdding(false)} onSaved={() => { setAdding(false); toast('Asset added'); reload(); }} />}
    </>
  );
}

function Detail({ a, canEdit, onClose, onChanged }: { a: AssetView; canEdit: boolean; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const [mode, setMode] = useState<'log' | 'edit' | 'retire' | null>(null);
  const [kind, setKind] = useState<'service' | 'repair' | 'note' | 'moved'>('service');
  const [text, setText] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [cost, setCost] = useState('');
  const [location, setLocation] = useState(a.location);
  const [reason, setReason] = useState('');
  const log = useAction(() => AdminApi.assets.log(a.id, { kind, text, date, cost: minor(cost), location: kind === 'moved' ? location : undefined }));
  const mark = useAction((condition: AssetCondition) => AdminApi.assets.update(a.id, { condition }));
  const retire = useAction(() => AdminApi.assets.retire(a.id, reason));
  const restore = useAction(() => AdminApi.assets.update(a.id, { status: 'active' }));
  const done = (msg: string) => { toast(msg); setMode(null); setText(''); setCost(''); onChanged(); };
  const due = dueText(a);
  return (
    <Modal side title={`${a.tag} · ${a.name}`} onClose={onClose}>
      {mode === 'edit' ? <AssetForm asset={a} inline onClose={() => setMode(null)} onSaved={() => done('Saved')} /> : (
        <div className="stack">
          <div className="row wrap" style={{ gap: 8, alignItems: 'center' }}>
            <span className={`badge ${CONDITION[a.condition].badge}`}>{CONDITION[a.condition].label}</span>
            {a.status === 'retired' && <span className="badge gray">Retired</span>}
            {due && <span className={due.tone ? `badge ${due.tone}` : 'small muted'}>{due.text}</span>}
          </div>
          <dl className="kv">
            <dt>Category</dt><dd>{CATEGORY[a.category]}{a.quantity > 1 ? ` · ${a.quantity} pcs` : ''}</dd>
            <dt>Where</dt><dd>{a.location || '—'}</dd>
            <dt>Looked after by</dt><dd>{a.custodianName || '—'}</dd>
            {a.serial && <><dt>Serial</dt><dd className="mono">{a.serial}</dd></>}
            <dt>Bought</dt><dd>{a.purchasedOn ? formatDate(a.purchasedOn) : '—'}{a.vendor ? ` from ${a.vendor}` : ''}{a.cost !== null ? ` · ${formatMoney(a.cost, 'INR')}${a.quantity > 1 ? ` each, ${formatMoney(a.cost * a.quantity, 'INR')} in all` : ''}` : ''}</dd>
            {a.warrantyUntil && <><dt>Warranty</dt><dd>until {formatDate(a.warrantyUntil)}</dd></>}
            {a.amc && <><dt>AMC</dt><dd>{a.amc.vendor || 'Vendor not noted'}{a.amc.phone ? ` · ${a.amc.phone}` : ''}{a.amc.until ? ` · until ${formatDate(a.amc.until)}` : ''}{a.amc.note ? <div className="small muted">{a.amc.note}</div> : null}</dd></>}
            {a.serviceEveryMonths && <><dt>Service</dt><dd>every {a.serviceEveryMonths} month{a.serviceEveryMonths === 1 ? '' : 's'}{a.lastServicedOn ? ` · last ${formatDate(a.lastServicedOn)}` : ' · never serviced'}{a.nextServiceOn ? ` · next ${formatDate(a.nextServiceOn)}` : ''}</dd></>}
            {a.notes && <><dt>Notes</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{a.notes}</dd></>}
          </dl>
          {a.photoUrl && <img src={a.photoUrl} alt="" style={{ maxWidth: '100%', borderRadius: 8 }} />}
          <FormError error={log.error ?? mark.error ?? retire.error ?? restore.error} />
          {canEdit && !mode && (
            <div className="row wrap" style={{ gap: 8 }}>
              {a.status === 'active' && <button className="btn primary" onClick={() => { setKind('service'); setMode('log'); }}><Wrench size={15} /> Log service or repair</button>}
              {a.status === 'active' && <button className="btn" onClick={() => { setKind('note'); setMode('log'); }}>Add note</button>}
              <button className="btn" onClick={() => setMode('edit')}>Edit</button>
              {a.status === 'active' && a.condition === 'good' && <button className="btn ghost" disabled={mark.busy} onClick={async () => { if (await mark.run('needs_repair')) done('Marked as needing repair'); }}>Needs repair</button>}
              {a.status === 'active' && <button className="btn ghost danger" onClick={() => setMode('retire')}>Retire</button>}
              {a.status === 'retired' && <button className="btn" disabled={restore.busy} onClick={async () => { if (await restore.run()) done('Back in use'); }}>Put back in use</button>}
            </div>
          )}
          {mode === 'log' && (
            <div className="card card-pad stack">
              <Segmented value={kind} onChange={setKind} options={[{ value: 'service', label: 'Service' }, { value: 'repair', label: 'Repair' }, { value: 'moved', label: 'Moved' }, { value: 'note', label: 'Note' }]} />
              <Field label={kind === 'note' ? 'Note' : 'What was done'}><input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder={kind === 'service' ? 'Oil and filter change' : kind === 'repair' ? 'Channel 3 fader replaced' : kind === 'moved' ? 'Taken to the camp site' : 'Anything the next person should know'} /></Field>
              {kind === 'moved' && <Field label="New location"><input className="input" value={location} onChange={(e) => setLocation(e.target.value)} /></Field>}
              <div className="grid cols-2">
                <Field label="Date"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
                {kind !== 'note' && kind !== 'moved' && <Field label="Cost (₹, optional)"><input className="input" type="number" min={0} value={cost} onChange={(e) => setCost(e.target.value)} /></Field>}
              </div>
              <div className="row" style={{ gap: 8 }}><button className="btn primary" disabled={log.busy || (kind === 'note' && !text.trim())} onClick={async () => { if (await log.run()) done(kind === 'note' ? 'Note added' : 'Logged'); }}>Save</button><button className="btn ghost" onClick={() => setMode(null)}>Cancel</button></div>
            </div>
          )}
          {mode === 'retire' && (
            <div className="card card-pad stack">
              <Field label="Why is it going?" hint="Sold, scrapped, given away, stolen. It stays in the register under Retired."><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Replaced by a digital mixer" /></Field>
              <div className="row" style={{ gap: 8 }}><button className="btn danger" disabled={retire.busy} onClick={async () => { if (await retire.run()) { toast('Retired'); onClose(); onChanged(); } }}>Retire</button><button className="btn ghost" onClick={() => setMode(null)}>Cancel</button></div>
            </div>
          )}
          <div className="stack" style={{ gap: 6 }}>
            <b className="small">History</b>
            {a.log.length === 0 && <span className="small muted">Nothing logged yet.</span>}
            {a.log.map((e, i) => <div key={i} className="small"><b>{LOG_KIND[e.kind]}</b> {formatDate(e.on)}{e.text ? ` — ${e.text}` : ''}{e.cost ? ` (${formatMoney(e.cost, 'INR')})` : ''} <span className="muted">· {e.by}</span></div>)}
            <div className="small muted">Added {formatDate(a.createdAt)} by {a.createdBy}.</div>
          </div>
        </div>
      )}
    </Modal>
  );
}

function AssetForm({ asset, inline, onClose, onSaved }: { asset?: AssetView; inline?: boolean; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    name: asset?.name ?? '', tag: asset?.tag ?? '', category: asset?.category ?? 'sound' as AssetCategory, quantity: String(asset?.quantity ?? 1), location: asset?.location ?? '', serial: asset?.serial ?? '', vendor: asset?.vendor ?? '',
    purchasedOn: asset?.purchasedOn ?? '', cost: rupees(asset?.cost ?? null), warrantyUntil: asset?.warrantyUntil ?? '', serviceEveryMonths: asset?.serviceEveryMonths ? String(asset.serviceEveryMonths) : '', lastServicedOn: asset?.lastServicedOn ?? '',
    hasAmc: !!asset?.amc, amcVendor: asset?.amc?.vendor ?? '', amcPhone: asset?.amc?.phone ?? '', amcUntil: asset?.amc?.until ?? '', amcNote: asset?.amc?.note ?? '', notes: asset?.notes ?? '', photoUrl: asset?.photoUrl ?? '',
  });
  const [custodian, setCustodian] = useState<{ id: string; name: string } | null>(asset?.custodianId ? { id: asset.custodianId, name: asset.custodianName } : null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const input = (): AssetInput => ({
    name: f.name.trim(), tag: f.tag.trim() || undefined, category: f.category, quantity: Math.max(1, Number(f.quantity) || 1), location: f.location, serial: f.serial, vendor: f.vendor,
    purchasedOn: f.purchasedOn || null, cost: minor(f.cost), warrantyUntil: f.warrantyUntil || null,
    amc: f.hasAmc ? { vendor: f.amcVendor, phone: f.amcPhone, until: f.amcUntil || null, note: f.amcNote } : null,
    serviceEveryMonths: f.serviceEveryMonths ? Number(f.serviceEveryMonths) : null, lastServicedOn: f.lastServicedOn || null,
    condition: asset?.condition ?? 'good', custodianId: custodian?.id ?? null, notes: f.notes, photoUrl: f.photoUrl.trim() || null,
  });
  const save = useAction(() => (asset ? AdminApi.assets.update(asset.id, input()) : AdminApi.assets.create(input())));
  const body = (
    <div className="stack">
      <FormError error={save.error} />
      <div className="grid cols-2">
        <Field label="Name"><input className="input" autoFocus value={f.name} onChange={set('name')} placeholder="Kirloskar 15 kVA generator" /></Field>
        <Field label="Tag" hint={asset ? undefined : 'Leave blank for the next A-number'}><input className="input" value={f.tag} onChange={set('tag')} placeholder="A-0001" /></Field>
        <Field label="Category"><select className="select" value={f.category} onChange={set('category')}>{(Object.keys(CATEGORY) as AssetCategory[]).map((c) => <option key={c} value={c}>{CATEGORY[c]}</option>)}</select></Field>
        <Field label="Quantity"><input className="input" type="number" min={1} value={f.quantity} onChange={set('quantity')} /></Field>
        <Field label="Where it is kept"><input className="input" value={f.location} onChange={set('location')} placeholder="Generator room" /></Field>
        <Field label="Serial number"><input className="input" value={f.serial} onChange={set('serial')} /></Field>
      </div>
      <div className="field">
        <span>Looked after by</span>
        {custodian ? <div className="row" style={{ gap: 8 }}><b>{custodian.name}</b><button type="button" className="link-btn small" onClick={() => setCustodian(null)}>change</button></div>
          : <PersonSearch placeholder="Search by name or phone (optional)" onPick={(p) => setCustodian({ id: p.id, name: p.name })} />}
      </div>
      <div className="grid cols-2">
        <Field label="Bought on"><input className="input" type="date" value={f.purchasedOn} onChange={set('purchasedOn')} /></Field>
        <Field label="Cost per unit (₹)"><input className="input" type="number" min={0} value={f.cost} onChange={set('cost')} /></Field>
        <Field label="Bought from"><input className="input" value={f.vendor} onChange={set('vendor')} /></Field>
        <Field label="Warranty until"><input className="input" type="date" value={f.warrantyUntil} onChange={set('warrantyUntil')} /></Field>
        <Field label="Service every (months)" hint="Reminder a week before it is due"><input className="input" type="number" min={1} max={120} value={f.serviceEveryMonths} onChange={set('serviceEveryMonths')} placeholder="6" /></Field>
        <Field label="Last serviced on"><input className="input" type="date" value={f.lastServicedOn} onChange={set('lastServicedOn')} /></Field>
      </div>
      <label className="row" style={{ gap: 8, alignItems: 'center' }}><input type="checkbox" checked={f.hasAmc} onChange={(e) => setF({ ...f, hasAmc: e.target.checked })} /> Under an annual maintenance contract (AMC)</label>
      {f.hasAmc && (
        <div className="grid cols-2">
          <Field label="AMC vendor"><input className="input" value={f.amcVendor} onChange={set('amcVendor')} placeholder="PowerCare Services" /></Field>
          <Field label="Vendor phone"><input className="input" value={f.amcPhone} onChange={set('amcPhone')} /></Field>
          <Field label="AMC ends" hint="Reminder a month before"><input className="input" type="date" value={f.amcUntil} onChange={set('amcUntil')} /></Field>
          <Field label="What it covers"><input className="input" value={f.amcNote} onChange={set('amcNote')} placeholder="Two services a year, parts extra" /></Field>
        </div>
      )}
      <Field label="Notes"><textarea className="input" rows={2} value={f.notes} onChange={set('notes')} /></Field>
      <Field label="Photo link (optional)"><input className="input" value={f.photoUrl} onChange={set('photoUrl')} placeholder="https://…" /></Field>
    </div>
  );
  const buttons = <><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!f.name.trim() || save.busy} onClick={async () => { if (await save.run()) onSaved(); }}>{asset ? 'Save' : 'Add asset'}</button></>;
  if (inline) return <div className="stack">{body}<div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>{buttons}</div></div>;
  return <Modal wide title="Add asset" onClose={onClose} footer={buttons}>{body}</Modal>;
}
