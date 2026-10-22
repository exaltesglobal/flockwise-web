import { ArrowDown, ArrowUp, ClipboardList, Copy, Download, ExternalLink, Link2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Fragment, useState } from 'react';

import type { DiscountCode, FormField, FormFieldType, FormInput, FormResponse, FormView, TicketType } from '@/api/admin-types';
import { AdminApi } from '@/api/endpoints';
import { Empty, ErrorState, Field, FormError, Loading, Modal, Segmented, useToast } from '@/components/ui';
import { downloadCsv, formatDate, formatMoney, formatRelative, toLocalInput } from '@/lib/format';
import { useAction, useApi } from '@/lib/use-api';

import { PageHeader } from '../layout';

const FIELD_TYPES: { value: FormFieldType; label: string }[] = [
  { value: 'text', label: 'Short answer' },
  { value: 'textarea', label: 'Paragraph' },
  { value: 'select', label: 'Dropdown' },
  { value: 'multiselect', label: 'Checkboxes (many)' },
  { value: 'checkbox', label: 'Yes / no tick' },
  { value: 'date', label: 'Date' },
  { value: 'number', label: 'Number' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
];

const STATUS_BADGE: Record<FormResponse['status'], string> = { confirmed: 'ok', waitlisted: 'warn', pending_payment: 'gray', cancelled: 'gray' };
const STATUS_LABEL: Record<FormResponse['status'], string> = { confirmed: 'Confirmed', waitlisted: 'Waitlist', pending_payment: 'Awaiting payment', cancelled: 'Cancelled' };

export const publicFormUrl = (id: string) => `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}/forms/${id}`;

export function FormsPage() {
  const { data, error, reload } = useApi(AdminApi.forms.list);
  const [editing, setEditing] = useState<FormView | 'new' | null>(null);
  const [viewing, setViewing] = useState<FormView | null>(null);
  const toast = useToast();

  const copyLink = async (f: FormView) => {
    try {
      await navigator.clipboard.writeText(publicFormUrl(f.id));
      toast('Link copied');
    } catch {
      prompt('Copy this link', publicFormUrl(f.id));
    }
  };

  return (
    <>
      <PageHeader
        title="Forms & registrations"
        subtitle="Sign-ups for events, classes and camps. Add questions, sell tickets, offer discount codes and keep a waitlist."
        actions={<button className="btn primary" onClick={() => setEditing('new')}><Plus size={16} /> New form</button>}
      />
      {error ? <ErrorState error={error} onRetry={reload} /> : !data ? <Loading /> : data.length === 0 ? (
        <div className="card"><Empty icon={<ClipboardList size={32} />} title="No forms yet" body="Create a registration for your next camp, class or event." action={<button className="btn primary" onClick={() => setEditing('new')}>Create a form</button>} /></div>
      ) : (
        <div className="grid cols-2">
          {data.map((f) => (
            <div key={f.id} className="card card-pad stack" style={{ gap: 10 }}>
              <div className="row" style={{ alignItems: 'flex-start' }}>
                <div className="grow stack" style={{ gap: 4 }}>
                  <h3>{f.title}</h3>
                  <div className="row wrap" style={{ gap: 6 }}>
                    <span className={`badge ${f.status === 'open' ? 'ok' : 'gray'}`}>{f.status === 'open' ? 'Open' : f.status === 'draft' ? 'Draft' : 'Closed'}</span>
                    {f.isPublic && <span className="badge gray">Public link</span>}
                    {f.eventTitle && <span className="small muted">For {f.eventTitle}</span>}
                    {f.closesAt && <span className="small muted">Closes {formatDate(f.closesAt)}</span>}
                  </div>
                </div>
                <button className="btn ghost icon sm" title="Edit" onClick={() => setEditing(f)}><Pencil size={15} /></button>
              </div>
              {f.description && <p className="small muted" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{f.description}</p>}
              <div className="stat-row">
                <div><b>{f.confirmed}</b> <span className="small muted">registered</span></div>
                {f.capacity ? <div><b>{f.places}</b><span className="small muted"> / {f.capacity} places</span></div> : null}
                {f.waitlisted > 0 && <div><b>{f.waitlisted}</b> <span className="small muted">waiting</span></div>}
                {f.revenue > 0 && <div><b>{formatMoney(f.revenue, 'INR')}</b> <span className="small muted">paid</span></div>}
              </div>
              {f.capacity ? <div className="progress"><i style={{ width: `${Math.min(100, (f.places / f.capacity) * 100)}%` }} /></div> : null}
              <div className="row wrap" style={{ gap: 6 }}>
                <button className="btn sm primary" onClick={() => setViewing(f)}>Responses</button>
                {f.isPublic && <button className="btn sm" onClick={() => copyLink(f)}><Link2 size={14} /> Copy link</button>}
                {f.isPublic && f.status !== 'draft' && <a className="btn sm ghost" href={publicFormUrl(f.id)} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Open</a>}
                <span className="grow" />
                <button className="btn sm ghost" title="Duplicate" onClick={async () => { await AdminApi.forms.duplicate(f.id); toast('Duplicated as a draft'); reload(); }}><Copy size={14} /></button>
                <button className="btn sm ghost danger" title="Delete" onClick={async () => {
                  if (!confirm(`Delete “${f.title}” and its responses?`)) return;
                  try { await AdminApi.forms.remove(f.id); toast('Deleted'); reload(); } catch (e) { toast((e as Error).message, 'error'); }
                }}><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
      {editing && <FormEditor form={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); toast('Saved'); }} />}
      {viewing && <Responses form={viewing} onClose={() => { setViewing(null); reload(); }} />}
    </>
  );
}

type Draft = FormInput;
const blank = (): Draft => ({ title: '', description: '', eventId: null, fields: [], ticketTypes: [], capacity: null, waitlist: true, discountCodes: [], opensAt: null, closesAt: null, status: 'open', isPublic: true, addTag: null, addToGroupId: null, workflowId: null, confirmationMessage: '' });
const newId = (p: string) => `${p}${Math.random().toString(36).slice(2, 8)}`;

function FormEditor({ form, onClose, onSaved }: { form: FormView | null; onClose: () => void; onSaved: () => void }) {
  const [tab, setTab] = useState<'details' | 'questions' | 'tickets' | 'after'>('details');
  const [d, setD] = useState<Draft>(() => (form ? { ...blank(), ...form } : blank()));
  const events = useApi(() => AdminApi.events.list('upcoming'));
  const groups = useApi(AdminApi.groups.list);
  const workflows = useApi(AdminApi.workflows.list);
  const save = useAction((input: Draft) => (form ? AdminApi.forms.update(form.id, input) : AdminApi.forms.create(input)));
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));
  const setField = (i: number, patch: Partial<FormField>) => set({ fields: d.fields.map((f, j) => (j === i ? { ...f, ...patch } : f)) });
  const move = (i: number, by: number) => {
    const next = [...d.fields];
    const [f] = next.splice(i, 1);
    next.splice(i + by, 0, f);
    set({ fields: next });
  };
  const setTicket = (i: number, patch: Partial<TicketType>) => set({ ticketTypes: d.ticketTypes.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  const setCode = (i: number, patch: Partial<DiscountCode>) => set({ discountCodes: d.discountCodes.map((c, j) => (j === i ? { ...c, ...patch } : c)) });

  return (
    <Modal wide title={form ? 'Edit form' : 'New form'} onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={save.busy || !d.title.trim()} onClick={async () => { if (await save.run(d)) onSaved(); }}>Save form</button>
      </>}
    >
      <div className="stack">
        <FormError error={save.error} />
        <div className="tabs">
          {([['details', 'Details'], ['questions', `Questions (${d.fields.length})`], ['tickets', 'Tickets & pricing'], ['after', 'After someone registers']] as const).map(([v, l]) => (
            <button key={v} className={tab === v ? 'on' : ''} onClick={() => setTab(v)}>{l}</button>
          ))}
        </div>

        {tab === 'details' && (
          <div className="stack">
            <Field label="Title"><input className="input" autoFocus value={d.title} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Youth Camp 2026" /></Field>
            <Field label="Description" hint="Shown at the top of the form."><textarea className="textarea" rows={3} value={d.description} onChange={(e) => set({ description: e.target.value })} /></Field>
            <div className="grid cols-2">
              <Field label="Status">
                <select className="input" value={d.status} onChange={(e) => set({ status: e.target.value as Draft['status'] })}>
                  <option value="draft">Draft (hidden)</option>
                  <option value="open">Open for registrations</option>
                  <option value="closed">Closed</option>
                </select>
              </Field>
              <Field label="Linked event" hint="Registrants are RSVP'd to it.">
                <select className="input" value={d.eventId ?? ''} onChange={(e) => set({ eventId: e.target.value || null })}>
                  <option value="">None</option>
                  {events.data?.data.map((ev) => <option key={ev.id} value={ev.id}>{ev.title} · {formatDate(ev.startsAt)}</option>)}
                </select>
              </Field>
              <Field label="Opens" hint="Leave empty to open now."><input type="datetime-local" className="input" value={d.opensAt ? toLocalInput(d.opensAt) : ''} onChange={(e) => set({ opensAt: e.target.value ? new Date(e.target.value).toISOString() : null })} /></Field>
              <Field label="Closes"><input type="datetime-local" className="input" value={d.closesAt ? toLocalInput(d.closesAt) : ''} onChange={(e) => set({ closesAt: e.target.value ? new Date(e.target.value).toISOString() : null })} /></Field>
              <Field label="Places available" hint="Leave empty for no limit."><input type="number" min={1} className="input" value={d.capacity ?? ''} onChange={(e) => set({ capacity: e.target.value ? Number(e.target.value) : null })} /></Field>
            </div>
            <label className="check"><input type="checkbox" checked={d.waitlist} onChange={(e) => set({ waitlist: e.target.checked })} /> Keep a waitlist when places run out</label>
            <label className="check"><input type="checkbox" checked={d.isPublic} onChange={(e) => set({ isPublic: e.target.checked })} /> Anyone with the link can register (no sign-in needed)</label>
          </div>
        )}

        {tab === 'questions' && (
          <div className="stack">
            <p className="small muted">Name, email and phone are asked automatically for people who aren't signed in.</p>
            {d.fields.map((f, i) => (
              <div key={f.id} className="card card-pad stack" style={{ gap: 8 }}>
                <div className="row" style={{ gap: 8 }}>
                  <input className="input grow" value={f.label} placeholder="Question" onChange={(e) => setField(i, { label: e.target.value })} />
                  <select className="input" style={{ width: 180 }} value={f.type} onChange={(e) => setField(i, { type: e.target.value as FormFieldType })}>
                    {FIELD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <button className="btn ghost icon sm" disabled={i === 0} onClick={() => move(i, -1)} title="Move up"><ArrowUp size={15} /></button>
                  <button className="btn ghost icon sm" disabled={i === d.fields.length - 1} onClick={() => move(i, 1)} title="Move down"><ArrowDown size={15} /></button>
                  <button className="btn ghost icon sm danger" onClick={() => set({ fields: d.fields.filter((_, j) => j !== i) })} title="Remove"><X size={15} /></button>
                </div>
                {(f.type === 'select' || f.type === 'multiselect') && (
                  <Field label="Options" hint="One per line."><textarea className="textarea" rows={3} value={f.options.join('\n')} onChange={(e) => setField(i, { options: e.target.value.split('\n') })} /></Field>
                )}
                <div className="row wrap" style={{ gap: 12 }}>
                  <label className="check"><input type="checkbox" checked={f.required} onChange={(e) => setField(i, { required: e.target.checked })} /> Required</label>
                  <input className="input grow" style={{ minWidth: 200 }} placeholder="Help text (optional)" value={f.helpText} onChange={(e) => setField(i, { helpText: e.target.value })} />
                </div>
              </div>
            ))}
            <div className="row wrap" style={{ gap: 6 }}>
              <button className="btn" onClick={() => set({ fields: [...d.fields, { id: newId('q'), label: '', type: 'text', required: false, options: [], helpText: '' }] })}><Plus size={15} /> Add a question</button>
              {[['T-shirt size', 'select', ['S', 'M', 'L', 'XL']], ['Allergies or medical needs', 'textarea', []], ['Emergency contact phone', 'phone', []], ['Date of birth', 'date', []]].map(([label, type, options]) => (
                <button key={label as string} className="chip" onClick={() => set({ fields: [...d.fields, { id: newId('q'), label: label as string, type: type as FormFieldType, required: false, options: options as string[], helpText: '' }] })}>+ {label as string}</button>
              ))}
            </div>
          </div>
        )}

        {tab === 'tickets' && (
          <div className="stack">
            <p className="small muted">Leave this empty for a free sign-up. Payments go to your church's Razorpay account; registrations are confirmed when the payment arrives.</p>
            {d.ticketTypes.map((t, i) => (
              <div key={t.id} className="row wrap" style={{ gap: 8 }}>
                <input className="input grow" placeholder="Ticket name (e.g. Adult)" value={t.name} onChange={(e) => setTicket(i, { name: e.target.value })} />
                <label className="row" style={{ gap: 4 }}>₹<input className="input" type="number" min={0} style={{ width: 110 }} placeholder="Price" value={t.price / 100 || ''} onChange={(e) => setTicket(i, { price: Math.round(Number(e.target.value) * 100) })} /></label>
                <input className="input" type="number" min={1} style={{ width: 130 }} placeholder="Limit (optional)" value={t.capacity ?? ''} onChange={(e) => setTicket(i, { capacity: e.target.value ? Number(e.target.value) : null })} />
                <button className="btn ghost icon sm danger" onClick={() => set({ ticketTypes: d.ticketTypes.filter((_, j) => j !== i) })}><X size={15} /></button>
              </div>
            ))}
            <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => set({ ticketTypes: [...d.ticketTypes, { id: newId('tt'), name: '', price: 0, capacity: null }] })}><Plus size={15} /> Add a ticket type</button>
            {d.ticketTypes.some((t) => t.price > 0) && (
              <>
                <h3 className="section-title">Discount codes</h3>
                {d.discountCodes.map((c, i) => (
                  <div key={i} className="row wrap" style={{ gap: 8 }}>
                    <input className="input mono" style={{ width: 150, textTransform: 'uppercase' }} placeholder="CODE" value={c.code} onChange={(e) => setCode(i, { code: e.target.value.toUpperCase() })} />
                    <label className="row" style={{ gap: 4 }}><input className="input" type="number" min={1} max={100} style={{ width: 80 }} value={c.percentOff ?? ''} placeholder="%" onChange={(e) => setCode(i, { percentOff: e.target.value ? Number(e.target.value) : null, amountOff: null })} />% off</label>
                    <span className="small muted">or</span>
                    <label className="row" style={{ gap: 4 }}>₹<input className="input" type="number" min={1} style={{ width: 90 }} value={c.amountOff ? c.amountOff / 100 : ''} onChange={(e) => setCode(i, { amountOff: e.target.value ? Math.round(Number(e.target.value) * 100) : null, percentOff: null })} /> off</label>
                    <input className="input" type="number" min={1} style={{ width: 120 }} placeholder="Max uses" value={c.maxUses ?? ''} onChange={(e) => setCode(i, { maxUses: e.target.value ? Number(e.target.value) : null })} />
                    <span className="small muted">{c.used} used</span>
                    <button className="btn ghost icon sm danger" onClick={() => set({ discountCodes: d.discountCodes.filter((_, j) => j !== i) })}><X size={15} /></button>
                  </div>
                ))}
                <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => set({ discountCodes: [...d.discountCodes, { code: '', percentOff: 10, amountOff: null, maxUses: null, used: 0 }] })}><Plus size={15} /> Add a code</button>
              </>
            )}
          </div>
        )}

        {tab === 'after' && (
          <div className="stack">
            <Field label="Confirmation message" hint="Shown on screen and in the confirmation email."><textarea className="textarea" rows={3} value={d.confirmationMessage} onChange={(e) => set({ confirmationMessage: e.target.value })} placeholder="Thanks for registering! We'll send details closer to the date." /></Field>
            <div className="grid cols-2">
              <Field label="Add a tag" hint="Find everyone who registered in People."><input className="input" value={d.addTag ?? ''} onChange={(e) => set({ addTag: e.target.value || null })} placeholder="e.g. Youth camp 2026" /></Field>
              <Field label="Add to a group">
                <select className="input" value={d.addToGroupId ?? ''} onChange={(e) => set({ addToGroupId: e.target.value || null })}>
                  <option value="">Don't add</option>
                  {groups.data?.data.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </Field>
              <Field label="Start a follow-up workflow">
                <select className="input" value={d.workflowId ?? ''} onChange={(e) => set({ workflowId: e.target.value || null })}>
                  <option value="">None</option>
                  {workflows.data?.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </Field>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function answerText(v: unknown) {
  if (v === true) return 'Yes';
  if (v === false || v === null || v === undefined) return '';
  return Array.isArray(v) ? v.join(', ') : String(v);
}

function Responses({ form, onClose }: { form: FormView; onClose: () => void }) {
  const { data, error, reload } = useApi(() => AdminApi.forms.responses(form.id), [form.id]);
  const [filter, setFilter] = useState<'all' | FormResponse['status']>('all');
  const toast = useToast();
  const ticketName = (id: string) => form.ticketTypes.find((t) => t.id === id)?.name ?? 'Ticket';
  const rows = (data ?? []).filter((r) => filter === 'all' || r.status === filter);

  const exportCsv = () => {
    downloadCsv(`${form.title.replace(/\W+/g, '-').toLowerCase()}-responses.csv`, [
      ['Name', 'Email', 'Phone', 'Status', 'Tickets', 'Amount', 'Discount', 'Registered', ...form.fields.map((f) => f.label)],
      ...(data ?? []).map((r) => [r.name, r.email, r.phone, STATUS_LABEL[r.status], r.tickets.map((t) => `${t.qty} × ${ticketName(t.ticketTypeId)}`).join('; '), r.amount / 100, r.discountCode, formatDate(r.createdAt), ...form.fields.map((f) => answerText(r.answers[f.id]))]),
    ]);
  };

  const act = async (fn: () => Promise<unknown>, msg: string) => {
    try { await fn(); toast(msg); reload(); } catch (e) { toast((e as Error).message, 'error'); }
  };

  return (
    <Modal wide side title={form.title} onClose={onClose}>
      <div className="stack">
        <div className="row wrap">
          <Segmented value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'confirmed', label: 'Confirmed' }, { value: 'waitlisted', label: 'Waitlist' }, { value: 'pending_payment', label: 'Unpaid' }, { value: 'cancelled', label: 'Cancelled' }]} />
          <span className="grow" />
          <button className="btn sm" onClick={exportCsv} disabled={!data?.length}><Download size={14} /> Export CSV</button>
        </div>
        {error ? <ErrorState error={error} onRetry={reload} /> : !data ? <Loading /> : rows.length === 0 ? <Empty title="No responses here yet" /> : rows.map((r) => (
          <div key={r.id} className="card card-pad stack" style={{ gap: 6 }}>
            <div className="row" style={{ gap: 8 }}>
              <div className="grow">
                <div style={{ fontWeight: 600 }}>{r.name}</div>
                <div className="small muted">{[r.email, r.phone].filter(Boolean).join(' · ')} · {formatRelative(r.createdAt)}</div>
              </div>
              <span className={`badge ${STATUS_BADGE[r.status]}`}>{STATUS_LABEL[r.status]}</span>
            </div>
            {r.tickets.length > 0 && <div className="small">{r.tickets.map((t) => `${t.qty} × ${ticketName(t.ticketTypeId)}`).join(', ')}{r.amount ? ` · ${formatMoney(r.amount, 'INR')}` : ''}{r.discountCode ? ` · code ${r.discountCode}` : ''}</div>}
            {form.fields.length > 0 && (
              <dl className="small" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 2fr)', gap: '2px 12px', margin: 0 }}>
                {form.fields.map((f) => <Fragment key={f.id}><dt className="muted">{f.label}</dt><dd style={{ margin: 0 }}>{answerText(r.answers[f.id]) || '—'}</dd></Fragment>)}
              </dl>
            )}
            <div className="row wrap" style={{ gap: 6 }}>
              {r.status === 'waitlisted' && <button className="btn sm primary" onClick={() => act(() => AdminApi.forms.promote(form.id, r.id), r.amount ? 'Payment link sent' : 'Moved off the waitlist')}>Give them a place</button>}
              {r.status === 'pending_payment' && <button className="btn sm" onClick={() => act(() => AdminApi.forms.setStatus(form.id, r.id, 'confirmed'), 'Marked as paid')}>Mark paid (cash)</button>}
              {r.status !== 'cancelled' && <button className="btn sm ghost danger" onClick={() => confirm(`Cancel ${r.name}'s registration?${r.amount && r.status === 'confirmed' ? ' Refund the payment separately in Giving.' : ''}`) && act(() => AdminApi.forms.setStatus(form.id, r.id, 'cancelled'), 'Cancelled')}>Cancel</button>}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
