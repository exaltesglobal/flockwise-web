// Special offerings: harvest festival, building fund, thanksgiving and other campaigns. One progress
// bar adds up online and in-person gifts, numbered family envelopes, in-kind offerings and the auction.
import { ArrowLeft, Gavel, Mail, Plus, Sprout, Trash2, Wheat } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';

import type { AuctionLot, CampaignDetail, CampaignKind, CampaignView, Currency, InKindGift, OfferingEnvelope, PaymentMethod } from '@/api/admin-types';
import { adminSession } from '@/api/client';
import { AdminApi } from '@/api/endpoints';
import { Empty, ErrorState, Field, FormError, Loading, Modal, Segmented, useToast } from '@/components/ui';
import { formatDate, formatMoney, formatMoneyShort } from '@/lib/format';
import { useCan } from '@/lib/perms';
import { useSession } from '@/lib/session';
import { useAction, useApi } from '@/lib/use-api';

import { PersonField, type PickedPerson } from '../components/person-picker';
import { PageHeader } from '../layout';

const KIND: Record<CampaignKind, string> = { harvest: 'Harvest festival', building: 'Building fund', thanksgiving: 'Thanksgiving', mission: 'Mission appeal', special: 'Special offering' };
const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'bank_transfer', label: 'Bank transfer' },
];
const toPaise = (v: string) => Math.round(Number(v || 0) * 100);
const today = () => new Date().toISOString().slice(0, 10);

function useCurrency() {
  return (useSession(adminSession)?.church.currency ?? 'INR') as Currency;
}

/** The thermometer: raised against the goal, split by where the money came from. */
function Progress({ c, big = false }: { c: CampaignView; big?: boolean }) {
  const currency = useCurrency();
  const p = c.progress;
  const parts = [
    { key: 'gifts', label: 'Gifts', value: p.gifts, cls: 'g1' },
    { key: 'envelopes', label: 'Envelopes', value: p.envelopes, cls: 'g2' },
    { key: 'auction', label: 'Auction', value: p.auction, cls: 'g3' },
    { key: 'inKind', label: 'In kind', value: p.inKind, cls: 'g4' },
  ];
  const scale = Math.max(p.goal ?? 0, p.raised, 1);
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="row between wrap" style={{ gap: 6, alignItems: 'baseline' }}>
        <b style={{ fontSize: big ? 26 : 18 }}>{formatMoney(p.raised, currency)}</b>
        <span className="small muted">{p.goal ? `${p.percent}% of ${formatMoneyShort(p.goal, currency)}` : 'No goal set'} · {p.givers} {p.givers === 1 ? 'giver' : 'givers'}</span>
      </div>
      <div className={`offer-bar ${big ? 'big' : ''}`} role="img" aria-label={`${p.percent ?? 0}% raised`}>
        {parts.map((x) => x.value > 0 && <i key={x.key} className={x.cls} style={{ width: `${(x.value / scale) * 100}%` }} />)}
      </div>
      {big && (
        <div className="row wrap small" style={{ gap: 14 }}>
          {parts.map((x) => <span key={x.key} className="row" style={{ gap: 6 }}><i className={`offer-dot ${x.cls}`} />{x.label} {formatMoneyShort(x.value, currency)}</span>)}
        </div>
      )}
    </div>
  );
}

export function OfferingsPage() {
  const { id } = useParams();
  return id ? <CampaignPage id={id} /> : <CampaignList />;
}

function CampaignList() {
  const can = useCan();
  const { data, error, reload } = useApi(() => AdminApi.offerings.list(), []);
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  return (
    <>
      <PageHeader
        title="Special offerings"
        subtitle="Harvest festival, building fund and other appeals: family envelopes, produce and the auction, all in one total."
        actions={can('giving.edit') && <button className="btn primary" onClick={() => setCreating(true)}><Plus size={16} /> New offering</button>}
      />
      {error ? <ErrorState error={error} onRetry={reload} /> : !data ? <Loading /> : data.length === 0 ? (
        <div className="card"><Empty icon={<Wheat size={28} />} title="No special offerings yet" body="Start one for your harvest festival, a building fund drive or a thanksgiving offering." action={can('giving.edit') && <button className="btn primary" onClick={() => setCreating(true)}><Plus size={16} /> New offering</button>} /></div>
      ) : (
        <div className="grid cols-2">
          {data.map((c) => (
            <Link key={c.id} to={`/admin/offerings/${c.id}`} className="card card-pad stack offer-card">
              <div className="row between wrap" style={{ gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <h3 style={{ margin: 0 }}>{c.name}</h3>
                  <div className="small muted">{KIND[c.kind]} · {formatDate(c.startsOn)}{c.endsOn ? ` to ${formatDate(c.endsOn)}` : ''}</div>
                </div>
                {c.status === 'closed' ? <span className="badge gray">Closed</span> : <span className="badge ok">Open</span>}
              </div>
              <Progress c={c} />
              {c.envelopesOut > 0 && <div className="small muted">{c.envelopesBack} of {c.envelopesOut} envelopes back</div>}
            </Link>
          ))}
        </div>
      )}
      {creating && <CampaignForm onClose={() => setCreating(false)} onSaved={(c) => navigate(`/admin/offerings/${c.id}`)} />}
    </>
  );
}

function CampaignForm({ campaign, onClose, onSaved }: { campaign?: CampaignDetail; onClose: () => void; onSaved: (c: CampaignDetail) => void }) {
  const { data: funds } = useApi(() => AdminApi.giving.funds(), []);
  const [f, setF] = useState({
    name: campaign?.name ?? '',
    kind: campaign?.kind ?? ('harvest' as CampaignKind),
    description: campaign?.description ?? '',
    goal: campaign?.goal ? String(campaign.goal / 100) : '',
    startsOn: campaign?.startsOn ?? today(),
    endsOn: campaign?.endsOn ?? '',
    showPublic: campaign?.showPublic ?? true,
    fundId: '',
  });
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));
  const input = { name: f.name, kind: f.kind, description: f.description, goal: f.goal ? toPaise(f.goal) : null, startsOn: f.startsOn, endsOn: f.endsOn || null, showPublic: f.showPublic };
  const save = useAction(() => (campaign ? AdminApi.offerings.update(campaign.id, input) : AdminApi.offerings.create({ ...input, fundId: f.fundId || null })));
  return (
    <Modal title={campaign ? 'Edit offering' : 'New special offering'} onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!f.name.trim() || save.busy} onClick={async () => { const c = await save.run(); if (c) onSaved(c); }}>{save.busy ? 'Saving…' : campaign ? 'Save' : 'Start'}</button></>}>
      <div className="stack">
        <Field label="Name"><input className="input" value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="Harvest Festival 2026" autoFocus /></Field>
        <Field label="Kind">
          <select className="input" value={f.kind} onChange={(e) => set({ kind: e.target.value as CampaignKind })}>
            {Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <div className="grid cols-2">
          <Field label="Starts"><input className="input" type="date" value={f.startsOn} onChange={(e) => set({ startsOn: e.target.value })} /></Field>
          <Field label="Ends" hint="Optional"><input className="input" type="date" value={f.endsOn} onChange={(e) => set({ endsOn: e.target.value })} /></Field>
        </div>
        <Field label="Goal (₹)" hint="Optional. Shows a progress bar to members."><input className="input" inputMode="decimal" value={f.goal} onChange={(e) => set({ goal: e.target.value.replace(/[^\d.]/g, '') })} placeholder="500000" /></Field>
        {!campaign && (
          <Field label="Fund" hint="Gifts to this fund during the dates count. A new fund keeps this offering separate in your accounts.">
            <select className="input" value={f.fundId} onChange={(e) => set({ fundId: e.target.value })}>
              <option value="">A new fund named after this offering</option>
              {(funds ?? []).filter((x) => x.active).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="Note for members" hint="Optional"><textarea className="input" rows={3} value={f.description} onChange={(e) => set({ description: e.target.value })} /></Field>
        <label className="check"><input type="checkbox" checked={f.showPublic} onChange={(e) => set({ showPublic: e.target.checked })} /> Show the progress bar in the member app and on the church page</label>
        <FormError error={save.error} />
      </div>
    </Modal>
  );
}

type Tab = 'overview' | 'envelopes' | 'harvest';

function CampaignPage({ id }: { id: string }) {
  const can = useCan();
  const edit = can('giving.edit');
  const currency = useCurrency();
  const { data: c, error, reload, setData } = useApi(() => AdminApi.offerings.get(id), [id]);
  const [tab, setTab] = useState<Tab>('overview');
  const [editing, setEditing] = useState(false);
  const toast = useToast();
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!c) return <Loading />;
  const closed = c.status === 'closed';
  const canEdit = edit && !closed;
  return (
    <>
      <div style={{ marginBottom: 8 }}><Link to="/admin/offerings" className="small row" style={{ gap: 4 }}><ArrowLeft size={14} /> Special offerings</Link></div>
      <PageHeader
        title={c.name}
        subtitle={`${KIND[c.kind]} · ${c.fundName} fund · ${formatDate(c.startsOn)}${c.endsOn ? ` to ${formatDate(c.endsOn)}` : ''}`}
        actions={edit && (
          <div className="row wrap" style={{ gap: 6 }}>
            <button className="btn" onClick={() => setEditing(true)}>Edit</button>
            <button className="btn ghost" onClick={async () => { setData(await AdminApi.offerings.update(c.id, { status: closed ? 'active' : 'closed' })); toast(closed ? 'Reopened' : 'Closed'); }}>{closed ? 'Reopen' : 'Close'}</button>
          </div>
        )}
      />
      {closed && <div className="alert" style={{ marginBottom: 12 }}>This offering is closed. Reopen it to record more.</div>}
      <div className="card card-pad" style={{ marginBottom: 14 }}><Progress c={c} big /></div>
      <div className="seg-scroll" style={{ marginBottom: 14 }}>
        <Segmented value={tab} onChange={setTab} options={[{ value: 'overview', label: 'Overview' }, { value: 'envelopes', label: `Envelopes (${c.envelopesBack}/${c.envelopesOut})` }, { value: 'harvest', label: `In kind & auction (${c.inKind.length})` }]} />
      </div>
      {tab === 'overview' && (
        <div className="grid cols-2" style={{ alignItems: 'start' }}>
          <div className="card table-wrap">
            <div className="card-head"><h2>Top givers</h2></div>
            {c.topGivers.length === 0 ? <p className="small muted" style={{ padding: '0 16px 16px' }}>No gifts yet.</p> : (
              <table className="table"><tbody>{c.topGivers.map((g, i) => <tr key={i}><td>{g.name}</td><td className="num">{formatMoney(g.amount, currency)}</td></tr>)}</tbody></table>
            )}
          </div>
          <div className="card card-pad stack">
            <h2 style={{ margin: 0, fontSize: 16 }}>How it adds up</h2>
            <dl className="int-facts">
              <div><dt>Gifts online and at the counter</dt><dd>{formatMoney(c.progress.gifts, currency)}</dd></div>
              <div><dt>Envelopes</dt><dd>{formatMoney(c.progress.envelopes, currency)}</dd></div>
              <div><dt>Auction, paid</dt><dd>{formatMoney(c.progress.auction, currency)}</dd></div>
              <div><dt>Auction, still to collect</dt><dd>{formatMoney(c.progress.auctionUnpaid, currency)}</dd></div>
              <div><dt>In kind, not auctioned</dt><dd>{formatMoney(c.progress.inKind, currency)}</dd></div>
            </dl>
            {c.description && <p className="small muted" style={{ margin: 0 }}>{c.description}</p>}
            <p className="small muted" style={{ margin: 0 }}>Online gifts come in when members give to the {c.fundName} fund. Envelope and auction money is recorded in Giving with an 80G receipt like any other gift.</p>
          </div>
        </div>
      )}
      {tab === 'envelopes' && <Envelopes c={c} canEdit={canEdit} onChange={setData} reload={reload} />}
      {tab === 'harvest' && <Harvest c={c} canEdit={canEdit} reload={reload} />}
      {editing && <CampaignForm campaign={c} onClose={() => setEditing(false)} onSaved={(x) => { setData(x); setEditing(false); toast('Saved'); }} />}
    </>
  );
}

// ---------------------------------------------------------------- envelopes

function Envelopes({ c, canEdit, onChange, reload }: { c: CampaignDetail; canEdit: boolean; onChange: (c: CampaignDetail) => void; reload: () => void }) {
  const currency = useCurrency();
  const toast = useToast();
  const [filter, setFilter] = useState<'all' | 'out' | 'back'>('all');
  const [q, setQ] = useState('');
  const [receiving, setReceiving] = useState<OfferingEnvelope | null>(null);
  const give = useAction((blank?: number) => AdminApi.offerings.giveEnvelopes(c.id, blank ? { blank } : {}));
  const rows = c.envelopes
    .filter((e) => filter === 'all' || (filter === 'back' ? !!e.receivedAt : !e.receivedAt))
    .filter((e) => !q || String(e.number) === q.trim() || e.familyName.toLowerCase().includes(q.toLowerCase()));
  const run = async (blank?: number) => {
    const r = await give.run(blank);
    if (r) { onChange(r.campaign); toast(r.made ? `${r.made} envelopes numbered` : 'Every family already has an envelope'); }
  };
  return (
    <div className="stack">
      {canEdit && (
        <div className="card card-pad row wrap" style={{ gap: 8 }}>
          <div className="grow small muted" style={{ minWidth: 220 }}>Number an envelope for every family, then record each one as it comes back. Families who join later get the next number when you run it again.</div>
          <button className="btn primary" disabled={give.busy} onClick={() => run()}><Mail size={15} /> Number envelopes for families</button>
          <button className="btn" disabled={give.busy} onClick={() => run(10)}>Add 10 blank</button>
        </div>
      )}
      <FormError error={give.error} />
      {c.envelopes.length === 0 ? <div className="card"><Empty icon={<Mail size={28} />} title="No envelopes yet" body="Number envelopes for every family, print the list and hand them out on Sunday." /></div> : (
        <div className="card table-wrap">
          <div className="card-head row wrap" style={{ gap: 8 }}>
            <Segmented value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'out', label: 'Not back' }, { value: 'back', label: 'Back' }]} />
            <input className="input" style={{ maxWidth: 220 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Number or family" aria-label="Find an envelope" />
          </div>
          <table className="table">
            <thead><tr><th className="num">No.</th><th>Family</th><th className="num">Promised</th><th className="num">Given</th><th /></tr></thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id}>
                  <td className="num"><b>{e.number}</b></td>
                  <td>{e.familyName || <span className="muted">Blank</span>}</td>
                  <td className="num small">{e.promised ? formatMoneyShort(e.promised, currency) : '—'}</td>
                  <td className="num">{e.amount ? <>{formatMoney(e.amount, currency)}<div className="small muted">{e.receivedAt ? formatDate(e.receivedAt) : ''}</div></> : '—'}</td>
                  <td className="nowrap" style={{ textAlign: 'right' }}>
                    {canEdit && !e.receivedAt && <button className="btn sm" onClick={() => setReceiving(e)}>Record</button>}
                    {canEdit && !e.receivedAt && <button className="btn sm ghost icon" aria-label={`Remove envelope ${e.number}`} onClick={async () => { await AdminApi.offerings.removeEnvelope(c.id, e.id); reload(); }}><Trash2 size={14} /></button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {receiving && <ReceiveEnvelope c={c} e={receiving} onClose={() => setReceiving(null)} onDone={() => { setReceiving(null); reload(); toast(`Envelope ${receiving.number} recorded`); }} />}
    </div>
  );
}

function ReceiveEnvelope({ c, e, onClose, onDone }: { c: CampaignDetail; e: OfferingEnvelope; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState(e.promised ? String(e.promised / 100) : '');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [name, setName] = useState(e.familyName);
  const save = useAction(() => AdminApi.offerings.receiveEnvelope(c.id, e.id, { amount: toPaise(amount), method, donorName: name }));
  return (
    <Modal title={`Envelope ${e.number}`} onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!(Number(amount) > 0) || save.busy} onClick={async () => { if (await save.run()) onDone(); }}>Record gift</button></>}>
      <div className="stack">
        {!e.familyName && <Field label="From"><input className="input" value={name} onChange={(x) => setName(x.target.value)} placeholder="Name on the envelope" /></Field>}
        {e.familyName && <div className="small muted">{e.familyName}</div>}
        <Field label="Amount (₹)"><input className="input" inputMode="decimal" value={amount} onChange={(x) => setAmount(x.target.value.replace(/[^\d.]/g, ''))} autoFocus /></Field>
        <Field label="Given by"><Segmented value={method} onChange={setMethod} options={METHODS} /></Field>
        <FormError error={save.error} />
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- in kind and auction

function Harvest({ c, canEdit, reload }: { c: CampaignDetail; canEdit: boolean; reload: () => void }) {
  const currency = useCurrency();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [selling, setSelling] = useState<InKindGift | 'other' | null>(null);
  const lotFor = (id: string) => c.lots.find((l) => l.inKindId === id);
  const others = c.lots.filter((l) => !l.inKindId);
  const pay = async (lot: AuctionLot, method: PaymentMethod) => { await AdminApi.offerings.payLot(c.id, lot.id, method); reload(); toast(`${lot.bidderName} paid`); };
  return (
    <div className="stack">
      {canEdit && (
        <div className="row wrap" style={{ gap: 8 }}>
          <button className="btn primary" onClick={() => setAdding(true)}><Sprout size={15} /> Record an offering in kind</button>
          <button className="btn" onClick={() => setSelling('other')}><Gavel size={15} /> Add an auction lot</button>
        </div>
      )}
      {c.inKind.length === 0 && c.lots.length === 0 ? <div className="card"><Empty icon={<Wheat size={28} />} title="Nothing brought yet" body="Record rice, coconuts, produce, gold or livestock as people bring them, then sell them at the auction." /></div> : (
        <div className="card table-wrap">
          <table className="table">
            <thead><tr><th>Item</th><th>From</th><th className="num">Value</th><th>Auction</th><th /></tr></thead>
            <tbody>
              {c.inKind.map((g) => {
                const lot = lotFor(g.id);
                return (
                  <tr key={g.id}>
                    <td><b>{g.item}</b>{g.quantity && <div className="small muted">{g.quantity}</div>}</td>
                    <td>{g.donorName}</td>
                    <td className="num small">{g.value ? formatMoneyShort(g.value, currency) : '—'}</td>
                    <td><LotCell lot={lot} canEdit={canEdit} forAuction={g.forAuction} onSell={() => setSelling(g)} onPay={pay} /></td>
                    <td style={{ textAlign: 'right' }}>{canEdit && !lot && <button className="btn sm ghost icon" aria-label={`Remove ${g.item}`} onClick={async () => { await AdminApi.offerings.removeInKind(c.id, g.id); reload(); }}><Trash2 size={14} /></button>}</td>
                  </tr>
                );
              })}
              {others.map((l) => (
                <tr key={l.id}>
                  <td><b>{l.title}</b><div className="small muted">Auction lot</div></td>
                  <td>—</td>
                  <td className="num small">—</td>
                  <td><LotCell lot={l} canEdit={canEdit} forAuction onSell={() => undefined} onPay={pay} /></td>
                  <td style={{ textAlign: 'right' }}>{canEdit && !l.paid && <button className="btn sm ghost icon" aria-label={`Remove ${l.title}`} onClick={async () => { await AdminApi.offerings.removeLot(c.id, l.id); reload(); }}><Trash2 size={14} /></button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {adding && <InKindForm c={c} onClose={() => setAdding(false)} onDone={() => { setAdding(false); reload(); toast('Recorded'); }} />}
      {selling && <LotForm c={c} item={selling === 'other' ? null : selling} onClose={() => setSelling(null)} onDone={() => { setSelling(null); reload(); toast('Sold'); }} />}
    </div>
  );
}

function LotCell({ lot, canEdit, forAuction, onSell, onPay }: { lot?: AuctionLot; canEdit: boolean; forAuction: boolean; onSell: () => void; onPay: (l: AuctionLot, m: PaymentMethod) => void }) {
  const currency = useCurrency();
  if (!lot) return forAuction ? (canEdit ? <button className="btn sm" onClick={onSell}><Gavel size={13} /> Sell</button> : <span className="small muted">Not sold yet</span>) : <span className="small muted">Kept</span>;
  return (
    <div className="stack" style={{ gap: 4 }}>
      <span className="small"><b>{formatMoney(lot.amount, currency)}</b> · {lot.bidderName}</span>
      {lot.paid ? <span className="badge ok">Paid</span> : canEdit ? (
        <div className="row" style={{ gap: 4 }}><span className="badge warn">To collect</span><button className="btn sm" onClick={() => onPay(lot, 'cash')}>Cash</button><button className="btn sm" onClick={() => onPay(lot, 'upi')}>UPI</button></div>
      ) : <span className="badge warn">To collect</span>}
    </div>
  );
}

function InKindForm({ c, onClose, onDone }: { c: CampaignDetail; onClose: () => void; onDone: () => void }) {
  const [who, setWho] = useState<PickedPerson | null>(null);
  const [name, setName] = useState('');
  const [item, setItem] = useState('');
  const [quantity, setQuantity] = useState('');
  const [value, setValue] = useState('');
  const [forAuction, setForAuction] = useState(true);
  const save = useAction(() => AdminApi.offerings.addInKind(c.id, { donorId: who?.id ?? null, donorName: who ? undefined : name, item, quantity, value: toPaise(value), forAuction }));
  return (
    <Modal title="Offering in kind" onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!item.trim() || (!who && !name.trim()) || save.busy} onClick={async () => { if (await save.run()) onDone(); }}>Record</button></>}>
      <div className="stack">
        <Field label="Brought by"><PersonField value={who} onChange={setWho} /></Field>
        {!who && <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Or type a name" aria-label="Name" />}
        <div className="grid cols-2">
          <Field label="What"><input className="input" value={item} onChange={(e) => setItem(e.target.value)} placeholder="Rice, coconuts, gold ring…" /></Field>
          <Field label="How much" hint="Optional"><input className="input" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="2 bags" /></Field>
        </div>
        <Field label="Estimated value (₹)" hint="Counted in the total until it is sold at the auction."><input className="input" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ''))} /></Field>
        <label className="check"><input type="checkbox" checked={forAuction} onChange={(e) => setForAuction(e.target.checked)} /> For the auction</label>
        <FormError error={save.error} />
      </div>
    </Modal>
  );
}

function LotForm({ c, item, onClose, onDone }: { c: CampaignDetail; item: InKindGift | null; onClose: () => void; onDone: () => void }) {
  const [title, setTitle] = useState('');
  const [who, setWho] = useState<PickedPerson | null>(null);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [paidNow, setPaidNow] = useState(true);
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const save = useAction(() => AdminApi.offerings.addLot(c.id, { inKindId: item?.id ?? null, title: item ? undefined : title, bidderId: who?.id ?? null, bidderName: who ? undefined : name, amount: toPaise(amount), paidNow, method }));
  return (
    <Modal title={item ? `Sell ${item.quantity ? `${item.quantity} ` : ''}${item.item}` : 'Auction lot'} onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!(Number(amount) > 0) || (!who && !name.trim()) || (!item && !title.trim()) || save.busy} onClick={async () => { if (await save.run()) onDone(); }}>Sold</button></>}>
      <div className="stack">
        {!item && <Field label="What was sold"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Basket of fruit" autoFocus /></Field>}
        <Field label="Winning bidder"><PersonField value={who} onChange={setWho} /></Field>
        {!who && <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Or type a name" aria-label="Bidder name" />}
        <Field label="Winning bid (₹)"><input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} /></Field>
        <label className="check"><input type="checkbox" checked={paidNow} onChange={(e) => setPaidNow(e.target.checked)} /> Paid now</label>
        {paidNow && <Segmented value={method} onChange={setMethod} options={METHODS} />}
        <FormError error={save.error} />
      </div>
    </Modal>
  );
}
