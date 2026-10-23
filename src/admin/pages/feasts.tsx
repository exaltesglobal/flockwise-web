// Love-feast and kitchen planner: pick the event and a menu, and the RSVP count becomes a
// shopping list with quantities and a cost estimate, split per head or per family if the church
// is not paying. The kitchen team edits per-head quantities and prices to match their market.
import { CookingPot, Download, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { FeastDish, FeastSplit, FeastUnit } from '@/api/admin-types';
import { AdminApi, type FeastMenuInput } from '@/api/endpoints';
import { Empty, ErrorState, Field, FormError, Loading, Modal, useToast } from '@/components/ui';
import { downloadCsv, formatDate, formatMoney } from '@/lib/format';
import { useCan } from '@/lib/perms';
import { useAction, useApi } from '@/lib/use-api';

import { PersonSearch } from '../components/person-picker';
import { PageHeader } from '../layout';

const SPLIT: Record<FeastSplit, string> = { church: 'The church pays', per_head: 'Split per head', per_family: 'Split per family' };
const fmtQty = (q: number, unit: FeastUnit) => `${Number.isInteger(q) ? q : q.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')} ${unit}`;

export function FeastsPage() {
  const toast = useToast();
  const canEdit = useCan()('events', 'volunteers');
  const { data, error, reload } = useApi(() => AdminApi.feasts.hub(), []);
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <Loading />;
  return (
    <>
      <PageHeader title="Love feasts & kitchen" subtitle="Pick the event and a menu; the RSVP count becomes a shopping list with quantities and a cost estimate. Change the per-head amounts and prices to match your market, and split the cost per head or per family if the church is not paying."
        actions={canEdit && <button className="btn primary" onClick={() => setCreating(true)}><Plus size={16} /> Plan a feast</button>} />
      <div className="card">
        {data.feasts.length === 0 ? <Empty icon={<CookingPot size={26} />} title="No feast planned" body="Start with the next love feast: choose the event, pick biryani, a South Indian meal, veg pulao or tea and snacks, and the list writes itself from the RSVPs." action={canEdit ? <button className="btn primary" onClick={() => setCreating(true)}><Plus size={16} /> Plan a feast</button> : undefined} /> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Event</th><th>Menu</th><th className="num">RSVPs</th><th className="num">Cooking for</th><th className="num">Estimated cost</th><th>Who pays</th></tr></thead>
            <tbody>{data.feasts.map((f) => (
              <tr key={f.id} className="clickable" onClick={() => setOpen(f.id)}>
                <td><b>{f.event?.title ?? 'Event removed'}</b>{f.event && <div className="small muted">{formatDate(f.event.startsAt)} · {f.event.location}</div>}</td>
                <td>{f.name}<div className="small muted">{f.menu.length} dish{f.menu.length === 1 ? '' : 'es'}</div></td>
                <td className="num">{f.rsvps}<div className="small muted">{f.families} famil{f.families === 1 ? 'y' : 'ies'}</div></td>
                <td className="num"><b>{f.heads}</b>{f.headsOverride !== null ? <div className="small muted">fixed</div> : f.extraHeads ? <div className="small muted">+{f.extraHeads} guests</div> : null}</td>
                <td className="num">{formatMoney(f.estimatedCost, 'INR')}</td>
                <td className="small">{SPLIT[f.split]}{f.split === 'per_head' ? ` · ${formatMoney(f.perHead, 'INR')} each` : f.split === 'per_family' ? ` · ${formatMoney(f.perFamily, 'INR')} a family` : ''}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
      {open && <Detail id={open} canEdit={canEdit} units={data.units} onClose={() => setOpen(null)} onChanged={reload} />}
      {creating && <PlanFeast events={data.events} templates={data.templates} onClose={() => setCreating(false)} onSaved={(id) => { setCreating(false); toast('Feast planned'); reload(); setOpen(id); }} />}
    </>
  );
}

function Detail({ id, canEdit, units, onClose, onChanged }: { id: string; canEdit: boolean; units: FeastUnit[]; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const { data: f, error, reload, setData } = useApi(() => AdminApi.feasts.get(id), [id]);
  const [menu, setMenu] = useState<FeastDish[] | null>(null);
  const [pickCook, setPickCook] = useState<number | null>(null);
  const update = useAction((input: Parameters<typeof AdminApi.feasts.update>[1]) => AdminApi.feasts.update(id, input));
  const remove = useAction(() => AdminApi.feasts.remove(id));
  useEffect(() => { if (f && menu === null) setMenu(f.menu); }, [f, menu]);
  if (error) return <Modal side title="Kitchen plan" onClose={onClose}><ErrorState error={error} onRetry={reload} /></Modal>;
  if (!f || menu === null) return <Modal side title="Kitchen plan" onClose={onClose}><Loading /></Modal>;
  const dirty = JSON.stringify(menu) !== JSON.stringify(f.menu);
  const save = async (input: Parameters<typeof AdminApi.feasts.update>[1], msg: string) => { const v = await update.run(input); if (v) { setData(v); setMenu(v.menu); toast(msg); onChanged(); } };
  const setDish = (i: number, patch: Partial<FeastDish>) => setMenu(menu.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const setIng = (i: number, k: number, patch: Partial<FeastDish['ingredients'][number]>) => setDish(i, { ingredients: menu[i].ingredients.map((x, l) => (l === k ? { ...x, ...patch } : x)) });
  const exportList = () => downloadCsv('shopping-list.csv', [['Item', 'Quantity', 'Unit', 'For', 'Rate (₹)', 'Cost (₹)'], ...f.shopping.map((i) => [i.name, i.qty, i.unit, i.dishes.join('; '), i.costPerUnit === null ? '' : i.costPerUnit / 100, i.cost === null ? '' : i.cost / 100]), ['', '', '', `${f.heads} heads`, 'Total', f.estimatedCost / 100]]);
  return (
    <Modal side wide title={`${f.name} · ${f.event?.title ?? ''}`} onClose={onClose}>
      <div className="stack">
        {f.event && <div className="small muted">{formatDate(f.event.startsAt)} · {f.event.location} · planned by {f.createdBy}</div>}
        <div className="stat-row">
          <div className="card mini-stat"><b>{f.rsvps}</b><span>RSVPs, {f.families} famil{f.families === 1 ? 'y' : 'ies'}</span></div>
          <div className="card mini-stat"><b>{f.heads}</b><span>Cooking for</span></div>
          <div className="card mini-stat"><b>{formatMoney(f.estimatedCost, 'INR')}</b><span>Estimated cost</span></div>
          <div className="card mini-stat"><b>{f.split === 'church' ? '—' : formatMoney(f.split === 'per_head' ? f.perHead : f.perFamily, 'INR')}</b><span>{f.split === 'church' ? 'Church pays' : f.split === 'per_head' ? 'Per head' : 'Per family'}</span></div>
        </div>
        <FormError error={update.error ?? remove.error} />
        {canEdit && (
          <div className="grid cols-3">
            <Field label="Guests beyond RSVPs" hint="Visitors, children not on the app"><input className="input" type="number" min={0} defaultValue={f.extraHeads} onBlur={(e) => { const n = Math.max(0, Math.round(Number(e.target.value) || 0)); if (n !== f.extraHeads) void save({ extraHeads: n }, 'Headcount updated'); }} /></Field>
            <Field label="Or cook for exactly" hint="Blank follows the RSVPs"><input className="input" type="number" min={0} placeholder={String(f.rsvps + f.extraHeads)} defaultValue={f.headsOverride ?? ''} onBlur={(e) => { const v = e.target.value.trim() === '' ? null : Math.max(0, Math.round(Number(e.target.value) || 0)); if (v !== f.headsOverride) void save({ headsOverride: v }, 'Headcount updated'); }} /></Field>
            <Field label="Who pays"><select className="select" value={f.split} onChange={(e) => void save({ split: e.target.value as FeastSplit }, 'Saved')}>{(Object.keys(SPLIT) as FeastSplit[]).map((k) => <option key={k} value={k}>{SPLIT[k]}</option>)}</select></Field>
          </div>
        )}

        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
          <b>Shopping list</b>
          <button className="btn sm" onClick={exportList}><Download size={14} /> Download list</button>
        </div>
        {f.shopping.length === 0 ? <span className="small muted">Add dishes and ingredients below; the list fills in from the headcount.</span> : (
          <div className="table-wrap"><table className="table compact">
            <thead><tr><th>Item</th><th className="num">Buy</th><th>For</th><th className="num">Rate</th><th className="num">Cost</th></tr></thead>
            <tbody>{f.shopping.map((i) => (
              <tr key={`${i.name}|${i.unit}`}>
                <td><b>{i.name}</b></td>
                <td className="num">{fmtQty(i.qty, i.unit)}</td>
                <td className="small muted">{i.dishes.join(', ')}</td>
                <td className="num small muted">{i.costPerUnit === null ? '—' : `${formatMoney(i.costPerUnit, 'INR')}/${i.unit}`}</td>
                <td className="num">{i.cost === null ? '—' : formatMoney(i.cost, 'INR')}</td>
              </tr>
            ))}</tbody>
            <tfoot><tr><td colSpan={4} className="num"><b>Total for {f.heads}</b></td><td className="num"><b>{formatMoney(f.estimatedCost, 'INR')}</b></td></tr></tfoot>
          </table></div>
        )}

        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
          <b>Menu, per head</b>
          {canEdit && <div className="row" style={{ gap: 8 }}>
            <button className="btn sm" onClick={() => setMenu([...menu, { id: '', name: '', ingredients: [{ name: '', perHead: 0, unit: 'kg', costPerUnit: null }], cookId: null, cookName: '' }])}><Plus size={14} /> Dish</button>
            <button className="btn sm primary" disabled={!dirty || update.busy} onClick={() => void save({ menu: menu.map(({ id: did, cookName: _c, ...d }) => ({ ...d, ...(did ? { id: did } : {}) })) as FeastMenuInput }, 'Menu saved; list updated')}>Save menu</button>
          </div>}
        </div>
        {menu.map((d, i) => (
          <div key={d.id || `new-${i}`} className="card card-pad stack" style={{ gap: 8 }}>
            <div className="row wrap" style={{ gap: 8, alignItems: 'center' }}>
              {canEdit ? <input className="input" style={{ maxWidth: 260, fontWeight: 600 }} value={d.name} placeholder="Dish" onChange={(e) => setDish(i, { name: e.target.value })} /> : <b>{d.name}</b>}
              <span className="small muted">Cook: {d.cookName || 'not set'}</span>
              {canEdit && <button type="button" className="link-btn small" onClick={() => setPickCook(pickCook === i ? null : i)}>{d.cookId ? 'change' : 'set'}</button>}
              {canEdit && d.cookId && <button type="button" className="link-btn small" onClick={() => setDish(i, { cookId: null, cookName: '' })}>clear</button>}
              {canEdit && <button type="button" className="btn ghost icon sm" aria-label="Remove dish" style={{ marginLeft: 'auto' }} onClick={() => setMenu(menu.filter((_, j) => j !== i))}><Trash2 size={14} /></button>}
            </div>
            {pickCook === i && <PersonSearch autoFocus placeholder="Who is cooking this?" onPick={(p) => { setDish(i, { cookId: p.id, cookName: p.name }); setPickCook(null); }} />}
            <div className="stack" style={{ gap: 4 }}>
              {d.ingredients.map((x, k) => canEdit ? (
                <div key={k} className="row wrap" style={{ gap: 6, alignItems: 'center' }}>
                  <input className="input" style={{ flex: '2 1 140px' }} value={x.name} placeholder="Ingredient" onChange={(e) => setIng(i, k, { name: e.target.value })} />
                  <input className="input" style={{ width: 86 }} type="number" min={0} step="any" value={x.perHead} aria-label="Per head" onChange={(e) => setIng(i, k, { perHead: Number(e.target.value) || 0 })} />
                  <select className="select" style={{ width: 86 }} value={x.unit} aria-label="Unit" onChange={(e) => setIng(i, k, { unit: e.target.value as FeastUnit })}>{units.map((u) => <option key={u} value={u}>{u}</option>)}</select>
                  <span className="small muted">₹</span>
                  <input className="input" style={{ width: 90 }} type="number" min={0} step="any" value={x.costPerUnit === null ? '' : x.costPerUnit / 100} placeholder="rate" aria-label="Rate per unit" onChange={(e) => setIng(i, k, { costPerUnit: e.target.value.trim() === '' ? null : Math.round(Number(e.target.value) * 100) })} />
                  <span className="small muted">/{x.unit}</span>
                  <button type="button" className="btn ghost icon sm" aria-label="Remove ingredient" onClick={() => setDish(i, { ingredients: d.ingredients.filter((_, l) => l !== k) })}><Trash2 size={13} /></button>
                </div>
              ) : <div key={k} className="small">{x.name} · {x.perHead} {x.unit} a head{x.costPerUnit !== null ? ` · ${formatMoney(x.costPerUnit, 'INR')}/${x.unit}` : ''}</div>)}
              {canEdit && <button type="button" className="link-btn small" style={{ alignSelf: 'flex-start' }} onClick={() => setDish(i, { ingredients: [...d.ingredients, { name: '', perHead: 0, unit: 'kg', costPerUnit: null }] })}>+ ingredient</button>}
            </div>
          </div>
        ))}

        {canEdit && (
          <>
            <Field label="Kitchen notes" hint="Who brings what, serving time, where the cooking happens"><textarea className="input" rows={2} defaultValue={f.notes} onBlur={(e) => { if (e.target.value !== f.notes) void save({ notes: e.target.value }, 'Notes saved'); }} /></Field>
            <button className="btn ghost danger sm" style={{ alignSelf: 'flex-start' }} disabled={remove.busy} onClick={async () => { if (window.confirm('Remove this kitchen plan?') && (await remove.run())) { toast('Removed'); onClose(); onChanged(); } }}><Trash2 size={14} /> Remove plan</button>
          </>
        )}
      </div>
    </Modal>
  );
}

function PlanFeast({ events, templates, onClose, onSaved }: { events: { id: string; title: string; startsAt: string; going: number }[]; templates: { id: string; name: string; description: string }[]; onClose: () => void; onSaved: (id: string) => void }) {
  const [eventId, setEventId] = useState(events[0]?.id ?? '');
  const [template, setTemplate] = useState('biryani');
  const [extra, setExtra] = useState('0');
  const [name, setName] = useState('');
  const tpl = templates.find((t) => t.id === template);
  const save = useAction(() => AdminApi.feasts.create({ eventId, template, name: name.trim() || undefined, extraHeads: Number(extra) || 0 }));
  return (
    <Modal title="Plan a feast" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!eventId || save.busy} onClick={async () => { const f = await save.run(); if (f) onSaved(f.id); }}>Plan it</button></>}>
      <div className="stack">
        <FormError error={save.error} />
        {events.length === 0 ? <div className="alert warn small">Every upcoming event already has a plan, or there are no upcoming events yet. Add the event first under Services & events.</div> : (
          <Field label="Event"><select className="select" value={eventId} onChange={(e) => setEventId(e.target.value)}>{events.map((e) => <option key={e.id} value={e.id}>{e.title} · {formatDate(e.startsAt)} · {e.going} going</option>)}</select></Field>
        )}
        <Field label="Menu"><select className="select" value={template} onChange={(e) => setTemplate(e.target.value)}>{templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
        {tpl && <p className="small muted" style={{ margin: 0 }}>{tpl.description}</p>}
        <div className="grid cols-2">
          <Field label="Guests beyond RSVPs" hint="Visitors, children, the kitchen team"><input className="input" type="number" min={0} value={extra} onChange={(e) => setExtra(e.target.value)} /></Field>
          <Field label="Name" hint="Blank keeps the menu name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={tpl?.name} /></Field>
        </div>
      </div>
    </Modal>
  );
}
