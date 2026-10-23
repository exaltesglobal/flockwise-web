import { AlertTriangle, CalendarClock, CheckCircle2, Copy, HandHeart, Link2, Lock, MessageCircle, Phone, Plus, Printer, QrCode as QrIcon, RefreshCw, Tablet, Trash2, UserRound } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';

import type { AtRiskPerson, CareCase, CareStatus, CareType } from '@/api/admin-types';
import { AdminApi, type AdminPrayer } from '@/api/endpoints';
import { Empty, ErrorState, Field, FormError, Loading, Modal, Segmented, useToast } from '@/components/ui';
import { formatDate, formatRelative } from '@/lib/format';
import { useAction, useApi } from '@/lib/use-api';

import { QrCode } from '@/components/qr';

import { PersonField, type PickedPerson } from '../components/person-picker';
import { PageHeader } from '../layout';

type Tab = 'cases' | 'at-risk' | 'prayer';

export const CARE_TYPES: { value: CareType; label: string }[] = [
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'visitor', label: 'New visitor' },
  { value: 'hospital', label: 'Hospital visit' },
  { value: 'counselling', label: 'Counselling' },
  { value: 'bereavement', label: 'Bereavement' },
  { value: 'prayer', label: 'Prayer' },
  { value: 'absent', label: 'Missing from church' },
  { value: 'other', label: 'Other' },
];
const typeLabel = (t: CareType) => CARE_TYPES.find((x) => x.value === t)?.label ?? t;
const COLUMNS: { status: CareStatus; label: string }[] = [
  { status: 'open', label: 'Open' },
  { status: 'in_progress', label: 'In progress' },
  { status: 'closed', label: 'Closed' },
];
const isOverdue = (c: CareCase) => c.status !== 'closed' && !!c.dueAt && new Date(c.dueAt) < new Date();

export function CarePage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'cases';
  const openId = params.get('case');
  const [creating, setCreating] = useState<Partial<{ person: PickedPerson; type: CareType; title: string }> | null>(null);
  const [mine, setMine] = useState(false);
  const cases = useApi(() => AdminApi.care.list({ mine }), [mine]);
  const atRisk = useApi(AdminApi.care.atRisk);
  const prayer = useApi(AdminApi.care.prayer);
  const toast = useToast();

  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    setParams(next, { replace: true });
  };
  const openCase = cases.data?.data.find((c) => c.id === openId) ?? null;
  const openPrayers = prayer.data?.data.filter((p) => p.status === 'open').length ?? 0;

  return (
    <>
      <PageHeader
        title="Care & prayer"
        subtitle="Follow up with visitors, visit the sick, and notice who has drifted away, so nobody falls through the cracks."
        actions={<button className="btn primary" onClick={() => setCreating({})}><Plus size={16} /> New care case</button>}
      />
      <div className="tabs">
        <button className={tab === 'cases' ? 'on' : ''} onClick={() => setParam('tab', null)}>Cases {cases.data && <span className="count">{cases.data.data.filter((c) => c.status !== 'closed').length}</span>}</button>
        <button className={tab === 'at-risk' ? 'on' : ''} onClick={() => setParam('tab', 'at-risk')}>Missing people {atRisk.data && <span className="count">{atRisk.data.length}</span>}</button>
        <button className={tab === 'prayer' ? 'on' : ''} onClick={() => setParam('tab', 'prayer')}>Prayer requests {openPrayers > 0 && <span className="count">{openPrayers}</span>}</button>
      </div>

      {tab === 'cases' && (
        <>
          <div className="row" style={{ margin: '12px 0', gap: 12 }}>
            <Segmented value={mine ? 'mine' : 'all'} options={[{ value: 'all', label: 'All cases' }, { value: 'mine', label: 'Assigned to me' }]} onChange={(v) => setMine(v === 'mine')} />
          </div>
          {cases.error ? <ErrorState error={cases.error} onRetry={cases.reload} /> : !cases.data ? <Loading /> : (
            <div className="board">
              {COLUMNS.map((col) => {
                const items = cases.data!.data.filter((c) => c.status === col.status);
                return (
                  <div key={col.status} className="board-col">
                    <h3>{col.label} <span className="muted">{items.length}</span></h3>
                    {items.length === 0 && <p className="small muted" style={{ padding: '0 4px' }}>Nothing here.</p>}
                    {items.slice(0, col.status === 'closed' ? 15 : 100).map((c) => (
                      <div key={c.id} className="card case-card" onClick={() => setParam('case', c.id)}>
                        <div className="row" style={{ gap: 6 }}>
                          {c.priority === 'urgent' && <span className="badge danger">Urgent</span>}
                          <span className="badge gray">{typeLabel(c.type)}</span>
                          {c.confidential && <Lock size={13} className="muted" />}
                        </div>
                        <strong>{c.title}</strong>
                        <span className="small muted">{c.personName}</span>
                        <div className="row small muted" style={{ gap: 10 }}>
                          {c.assignedName ? <span className="row" style={{ gap: 4 }}><UserRound size={13} /> {c.assignedName}</span> : <span>Unassigned</span>}
                          {c.dueAt && c.status !== 'closed' && (
                            <span className="row" style={{ gap: 4, color: isOverdue(c) ? 'var(--danger)' : undefined }}><CalendarClock size={13} /> {formatDate(c.dueAt)}</span>
                          )}
                          {c.notes.length > 0 && <span className="row" style={{ gap: 4 }}><MessageCircle size={13} /> {c.notes.length}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {tab === 'at-risk' && (
        <AtRiskList data={atRisk.data} error={atRisk.error} reload={atRisk.reload}
          onOpenCase={(p) => p.openCaseId ? setParams({ case: p.openCaseId }) : setCreating({ person: { id: p.id, name: p.name }, type: 'absent', title: `Check in with ${p.name.split(' ')[0]}` })} />
      )}

      {tab === 'prayer' && <PrayerModeration data={prayer.data?.data} error={prayer.error} reload={prayer.reload}
        onCase={async (p) => {
          const c = await AdminApi.care.create({ title: `Pray with ${p.name.split(' ')[0]}`, personId: p.personId, personName: p.name, type: 'prayer', prayerId: p.id, note: p.text });
          toast('Care case opened');
          cases.reload();
          setParams({ case: c.id });
        }} />}

      {openCase && (
        <CaseDrawer key={openCase.id} c={openCase} onClose={() => setParam('case', null)}
          onChanged={() => { cases.reload(); atRisk.reload(); }}
          onDeleted={() => { setParam('case', null); cases.reload(); toast('Deleted'); }} />
      )}
      {creating && (
        <CaseForm initial={creating} onClose={() => setCreating(null)}
          onSaved={(c) => { setCreating(null); cases.reload(); atRisk.reload(); toast('Care case opened'); setParams({ case: c.id }); }} />
      )}
    </>
  );
}

function AtRiskList({ data, error, reload, onOpenCase }: { data: AtRiskPerson[] | null; error: ReturnType<typeof useApi>['error']; reload: () => void; onOpenCase: (p: AtRiskPerson) => void }) {
  return (
    <div className="card" style={{ marginTop: 12 }}>
      <p className="small muted" style={{ marginBottom: 8 }}>Members and regulars who haven’t been at church for three weeks or more. A quick call often means more than you think.</p>
      {error ? <ErrorState error={error} onRetry={reload} /> : !data ? <Loading /> : data.length === 0 ? (
        <Empty icon={<CheckCircle2 size={32} />} title="Everyone’s been around recently" />
      ) : data.map((p) => (
        <div key={p.id} className="list-row">
          <AlertTriangle size={18} style={{ color: p.weeksAway >= 6 ? 'var(--danger)' : '#e0a100' }} />
          <div className="grow">
            <h3>{p.name}</h3>
            <span className="small muted">{p.weeksAway} weeks away · last seen {p.lastAttendedAt ? formatDate(p.lastAttendedAt) : 'never'} · {p.status}</span>
          </div>
          {p.phone && <a className="btn ghost icon sm" title="Call" href={`tel:${p.phone}`}><Phone size={15} /></a>}
          {p.phone && <a className="btn ghost icon sm" title="WhatsApp" href={`https://wa.me/${p.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"><MessageCircle size={15} /></a>}
          <button className="btn sm" onClick={() => onOpenCase(p)}>{p.openCaseId ? 'View case' : 'Open case'}</button>
        </div>
      ))}
    </div>
  );
}

function PrayerModeration({ data, error, reload, onCase }: { data: AdminPrayer[] | undefined; error: ReturnType<typeof useApi>['error']; reload: () => void; onCase: (p: AdminPrayer) => void }) {
  const [filter, setFilter] = useState<'open' | 'answered'>('open');
  const [answering, setAnswering] = useState<AdminPrayer | null>(null);
  const [kiosk, setKiosk] = useState(false);
  const toast = useToast();
  const chain = useApi(AdminApi.care.chain);
  const [sending, setSending] = useState<string | null>(null);
  async function sendChain(p: AdminPrayer) {
    if (!confirm(`Send ${p.name.split(' ')[0]}’s request to the ${chain.data?.members ?? ''} people on the prayer chain?`)) return;
    setSending(p.id);
    try {
      const next = await AdminApi.care.sendChain(p.id);
      toast(`Sent to ${next.chainCount} ${next.chainCount === 1 ? 'person' : 'people'}`);
      reload();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setSending(null);
    }
  }
  const items = useMemo(() => data?.filter((p) => p.status === filter) ?? [], [data, filter]);
  const patch = async (p: AdminPrayer, change: Parameters<typeof AdminApi.care.updatePrayer>[1], msg: string) => {
    await AdminApi.care.updatePrayer(p.id, change);
    toast(msg);
    reload();
  };
  return (
    <>
      <div className="row between wrap" style={{ margin: '12px 0', gap: 8 }}>
        <div className="row wrap" style={{ gap: 8 }}>
          <Segmented value={filter} options={[{ value: 'open', label: 'Open' }, { value: 'answered', label: 'Answered' }]} onChange={setFilter} />
          <button className="btn sm" onClick={() => setKiosk(true)}><Tablet size={14} /> Lobby kiosk &amp; QR cards</button>
        </div>
        {chain.data && <span className="small muted" title="Members join from Prayer in the app, or reply JOIN PRAYER CHAIN on WhatsApp"><Link2 size={13} /> Prayer chain: {chain.data.members} {chain.data.members === 1 ? 'person' : 'people'}</span>}
      </div>
      <div className="card">
        {error ? <ErrorState error={error} onRetry={reload} /> : !data ? <Loading /> : items.length === 0 ? (
          <Empty icon={<HandHeart size={32} />} title={filter === 'open' ? 'No open prayer requests' : 'No answered prayers yet'} />
        ) : items.map((p) => (
          <div key={p.id} className="list-row" style={{ alignItems: 'flex-start' }}>
            <HandHeart size={18} className="muted" style={{ marginTop: 3 }} />
            <div className="grow stack" style={{ gap: 4 }}>
              <div className="row wrap" style={{ gap: 8 }}>
                <strong>{p.name}</strong>
                {p.visibility === 'pastors' ? <span className="badge gray"><Lock size={11} /> Pastors only</span> : <span className="badge">Prayer wall</span>}
                {p.source === 'card' && <span className="badge warn"><QrIcon size={11} /> Prayer card</span>}
                {p.source === 'kiosk' && <span className="badge warn"><Tablet size={11} /> Lobby kiosk</span>}
                {p.contact && <span className="small muted"><Phone size={11} /> {p.contact}</span>}
                <span className="small muted">{formatRelative(p.createdAt)} · {p.prayedCount} praying</span>
                {p.chainSentAt && <span className="badge ok"><Link2 size={11} /> Chain · {p.chainCount}</span>}
              </div>
              <p style={{ whiteSpace: 'pre-wrap' }}>{p.text}</p>
              {p.answeredNote && <p className="small" style={{ color: 'var(--ok)' }}>Answered: {p.answeredNote}</p>}
              <div className="row wrap" style={{ gap: 6, marginTop: 4 }}>
                {p.status === 'open' && <button className="btn sm" onClick={() => setAnswering(p)}><CheckCircle2 size={14} /> Mark answered</button>}
                {p.status === 'answered' && <button className="btn sm" onClick={() => patch(p, { status: 'open' }, 'Reopened')}>Reopen</button>}
                {p.visibility === 'church'
                  ? <button className="btn sm" onClick={() => patch(p, { visibility: 'pastors' }, 'Hidden from the prayer wall')}>Hide from wall</button>
                  : <button className="btn sm" onClick={() => patch(p, { visibility: 'church' }, 'Shared on the prayer wall')}>Share on wall</button>}
                <button className="btn sm" onClick={() => onCase(p)}>Open care case</button>
                {p.status === 'open' && <button className="btn sm" disabled={sending === p.id || !chain.data?.members} title={chain.data?.members ? undefined : 'Nobody has joined the prayer chain yet'} onClick={() => void sendChain(p)}><Link2 size={14} /> {p.chainSentAt ? 'Send to chain again' : 'Send to prayer chain'}</button>}
                <button className="btn ghost icon sm danger" title="Delete" onClick={async () => {
                  if (!confirm('Delete this prayer request?')) return;
                  await AdminApi.care.removePrayer(p.id);
                  toast('Deleted');
                  reload();
                }}><Trash2 size={15} /></button>
              </div>
            </div>
          </div>
        ))}
      </div>
      {kiosk && <KioskModal onClose={() => setKiosk(false)} />}
      {answering && <AnsweredForm p={answering} onClose={() => setAnswering(null)} onSaved={() => { setAnswering(null); reload(); toast('Praise God! Marked as answered'); }} />}
    </>
  );
}

function AnsweredForm({ p, onClose, onSaved }: { p: AdminPrayer; onClose: () => void; onSaved: () => void }) {
  const [note, setNote] = useState('');
  const save = useAction(() => AdminApi.care.updatePrayer(p.id, { status: 'answered', answeredNote: note.trim() || undefined }));
  return (
    <Modal title="Mark as answered" onClose={onClose} footer={<button className="btn primary" disabled={save.busy} onClick={async () => { if (await save.run()) onSaved(); }}>Save</button>}>
      <div className="stack">
        <FormError error={save.error} />
        <p className="small muted">{p.text}</p>
        <Field label="How was it answered? (optional)" hint="Shown on the prayer wall to encourage others."><textarea className="textarea" rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function CaseDrawer({ c, onClose, onChanged, onDeleted }: { c: CareCase; onClose: () => void; onChanged: () => void; onDeleted: () => void }) {
  const assignees = useApi(AdminApi.care.assignees);
  const [note, setNote] = useState('');
  const toast = useToast();
  const update = useAction((patch: Parameters<typeof AdminApi.care.update>[1]) => AdminApi.care.update(c.id, patch));
  const addNote = useAction(() => AdminApi.care.addNote(c.id, note.trim()));
  const change = async (patch: Parameters<typeof AdminApi.care.update>[1]) => { if (await update.run(patch)) onChanged(); };

  return (
    <Modal side title={c.title} onClose={onClose}>
      <div className="stack">
        <FormError error={update.error ?? addNote.error} />
        <div className="row wrap" style={{ gap: 6 }}>
          <span className="badge gray">{typeLabel(c.type)}</span>
          {c.source !== 'manual' && <span className="badge gray">{c.source === 'automation' ? 'Opened automatically' : 'From a prayer request'}</span>}
          {isOverdue(c) && <span className="badge danger">Overdue</span>}
        </div>
        <div className="small muted">For <strong style={{ color: 'var(--text)' }}>{c.personName}</strong> · opened {formatRelative(c.createdAt)}{c.closedAt && ` · closed ${formatRelative(c.closedAt)}`}</div>
        <Field label="Status">
          <Segmented value={c.status} options={COLUMNS.map((x) => ({ value: x.status, label: x.label }))} onChange={(status) => change({ status })} />
        </Field>
        <div className="grid cols-2">
          <Field label="Assigned to">
            <select className="select" value={c.assignedTo ?? ''} onChange={(e) => change({ assignedTo: e.target.value || null })}>
              <option value="">Unassigned</option>
              {assignees.data?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
          <Field label="Follow up by">
            <input className="input" type="date" value={c.dueAt?.slice(0, 10) ?? ''} onChange={(e) => change({ dueAt: e.target.value ? new Date(`${e.target.value}T09:00:00`).toISOString() : null })} />
          </Field>
          <Field label="Priority">
            <Segmented value={c.priority} options={[{ value: 'normal', label: 'Normal' }, { value: 'urgent', label: 'Urgent' }]} onChange={(priority) => change({ priority })} />
          </Field>
          <Field label="Type">
            <select className="select" value={c.type} onChange={(e) => change({ type: e.target.value as CareType })}>
              {CARE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
        </div>
        <label className="row small" style={{ gap: 8 }}>
          <input type="checkbox" checked={c.confidential} onChange={(e) => change({ confidential: e.target.checked })} />
          <Lock size={14} /> Confidential: only pastors and the assigned person can see the notes
        </label>

        <h3 className="section-title">Notes</h3>
        <div className="timeline">
          {c.notes.length === 0 && <p className="small muted">No notes yet. Record calls, visits and what you prayed about.</p>}
          {[...c.notes].reverse().map((n) => (
            <div key={n.id} className="timeline-item">
              <span className="tl-icon"><MessageCircle size={14} /></span>
              <div className="grow">
                <div className="small muted">{n.by} · {formatRelative(n.at)}</div>
                <p style={{ whiteSpace: 'pre-wrap' }}>{n.text}</p>
              </div>
            </div>
          ))}
        </div>
        <textarea className="textarea" rows={3} placeholder="Add a note…" value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <button className="btn ghost sm danger" onClick={async () => {
            if (!confirm('Delete this care case and its notes?')) return;
            await AdminApi.care.remove(c.id);
            onDeleted();
          }}><Trash2 size={14} /> Delete case</button>
          <button className="btn primary sm" disabled={!note.trim() || addNote.busy} onClick={async () => {
            if (await addNote.run()) { setNote(''); onChanged(); toast('Note added'); }
          }}>Add note</button>
        </div>
      </div>
    </Modal>
  );
}

function CaseForm({ initial, onClose, onSaved }: { initial: Partial<{ person: PickedPerson; type: CareType; title: string }>; onClose: () => void; onSaved: (c: CareCase) => void }) {
  const assignees = useApi(AdminApi.care.assignees);
  const [person, setPerson] = useState<PickedPerson | null>(initial.person ?? null);
  const [form, setForm] = useState({
    type: initial.type ?? ('follow_up' as CareType),
    title: initial.title ?? '',
    priority: 'normal' as 'normal' | 'urgent',
    assignedTo: '' as string,
    dueAt: '',
    confidential: false,
    note: '',
  });
  const save = useAction(() => AdminApi.care.create({
    personId: person?.id ?? null,
    personName: person?.name,
    type: form.type,
    title: form.title.trim(),
    priority: form.priority,
    assignedTo: form.assignedTo || null,
    dueAt: form.dueAt ? new Date(`${form.dueAt}T09:00:00`).toISOString() : null,
    confidential: form.confidential,
    note: form.note.trim() || undefined,
  }));
  return (
    <Modal title="New care case" onClose={onClose}
      footer={<button className="btn primary" disabled={save.busy || !form.title.trim()} onClick={async () => { const c = await save.run(); if (c) onSaved(c); }}>Open case</button>}>
      <div className="stack">
        <FormError error={save.error} />
        <Field label="Person"><PersonField value={person} onChange={setPerson} placeholder="Who is this about?" /></Field>
        <div className="grid cols-2">
          <Field label="Type">
            <select className="select" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as CareType })}>
              {CARE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="Priority">
            <Segmented value={form.priority} options={[{ value: 'normal', label: 'Normal' }, { value: 'urgent', label: 'Urgent' }]} onChange={(priority) => setForm({ ...form, priority })} />
          </Field>
        </div>
        <Field label="What needs to happen?"><input className="input" value={form.title} placeholder="e.g. Visit at CMC hospital" onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
        <div className="grid cols-2">
          <Field label="Assign to">
            <select className="select" value={form.assignedTo} onChange={(e) => setForm({ ...form, assignedTo: e.target.value })}>
              <option value="">Unassigned</option>
              {assignees.data?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
          <Field label="Follow up by"><input className="input" type="date" value={form.dueAt} onChange={(e) => setForm({ ...form, dueAt: e.target.value })} /></Field>
        </div>
        <Field label="First note (optional)"><textarea className="textarea" rows={3} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
        <label className="row small" style={{ gap: 8 }}>
          <input type="checkbox" checked={form.confidential} onChange={(e) => setForm({ ...form, confidential: e.target.checked })} /> Confidential
        </label>
      </div>
    </Modal>
  );
}

/** The lobby kiosk link, the public /pray link as a QR, and printable prayer cards. */
function KioskModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const { data, error, reload, setData } = useApi(AdminApi.care.kiosk);
  const act = useAction((input: { enabled?: boolean; rotate?: boolean }) => AdminApi.care.setKiosk(input));
  const [cards, setCards] = useState(false);
  const copy = (v: string) => navigator.clipboard?.writeText(v).then(() => toast('Copied'), () => undefined);
  return (
    <Modal title="Lobby kiosk & QR prayer cards" onClose={onClose} footer={<button className="btn" onClick={onClose}>Done</button>}>
      {error ? <ErrorState error={error} onRetry={reload} /> : !data ? <Loading /> : (
        <div className="stack">
          <FormError error={act.error} />
          <div className="row between wrap" style={{ gap: 8 }}>
            <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={data.enabled} onChange={async (e) => { const r = await act.run({ enabled: e.target.checked }); if (r) setData(r); }} /> Anyone can send a prayer request from the cards and the kiosk</label>
            <span className="small muted">{data.stats.fromCards} from cards · {data.stats.fromKiosk} from the kiosk · {data.stats.prayedThisWeek} prayed this week</span>
          </div>
          <div className="row wrap" style={{ gap: 16, alignItems: 'flex-start' }}>
            <QrCode value={data.publicUrl} size={140} label="Scan to send a prayer request" />
            <div className="stack grow" style={{ gap: 8, minWidth: 220 }}>
              <b>Prayer cards</b>
              <p className="small muted">Print cards for the pews and the welcome desk. Each has this QR; people scan it and type a request, or write on the card and drop it in the box.</p>
              <div className="row wrap" style={{ gap: 6 }}>
                <input className="input small" readOnly value={data.publicUrl} style={{ flex: 1, minWidth: 160 }} onFocus={(e) => e.currentTarget.select()} />
                <button className="btn sm" onClick={() => copy(data.publicUrl)}><Copy size={13} /></button>
                <button className="btn sm primary" onClick={() => setCards(true)}><Printer size={14} /> Print 8 cards (A4)</button>
              </div>
            </div>
          </div>
          <div className="stack" style={{ gap: 8 }}>
            <b>Lobby kiosk</b>
            <p className="small muted">Open this link on a tablet in the lobby. It shows the prayer wall with an “I prayed” button and takes new requests, and resets itself for the next person. Keep the link private: it carries a key.</p>
            <div className="row wrap" style={{ gap: 6 }}>
              <input className="input small" readOnly value={data.kioskUrl} style={{ flex: 1, minWidth: 200 }} onFocus={(e) => e.currentTarget.select()} />
              <button className="btn sm" onClick={() => copy(data.kioskUrl)}><Copy size={13} /> Copy</button>
              <a className="btn sm" href={data.kioskUrl} target="_blank" rel="noreferrer"><Tablet size={13} /> Open</a>
              <button className="btn sm" disabled={act.busy} onClick={async () => { if (!confirm('Make a new kiosk link? The old one stops working.')) return; const r = await act.run({ rotate: true }); if (r) { setData(r); toast('New kiosk link'); } }}><RefreshCw size={13} /> New link</button>
            </div>
          </div>
        </div>
      )}
      {cards && data && <CardsSheet url={data.publicUrl} onClose={() => setCards(false)} />}
    </Modal>
  );
}

/** Eight prayer cards on an A4 sheet; the print hides everything else. */
function CardsSheet({ url, onClose }: { url: string; onClose: () => void }) {
  const church = useApi(AdminApi.settings.get);
  useEffect(() => {
    document.body.classList.add('cert-open');
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => { document.body.classList.remove('cert-open'); window.removeEventListener('keydown', onKey); };
  }, [onClose]);
  const c = church.data;
  return createPortal(
    <div className="cert-overlay">
      <div className="cert-bar no-print">
        <span className="grow small">Eight cards on A4. Cut along the lines; a pen on each pew helps.</span>
        <button className="btn primary sm" onClick={() => window.print()}><Printer size={15} /> Print</button>
        <button className="btn ghost sm" onClick={onClose}>Close</button>
      </div>
      <article className="cert-page cards-page">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="prayer-card">
            <div className="row" style={{ gap: 8 }}>
              {c?.logoUrl && <img src={c.logoUrl} alt="" style={{ width: 28, height: 28, borderRadius: 6, objectFit: 'cover' }} />}
              <b style={{ fontSize: 13 }}>{c?.name ?? 'Our church'}</b>
            </div>
            <div className="prayer-card-title">How can we pray for you?</div>
            <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
              <QrCode value={url} size={78} />
              <div className="small" style={{ lineHeight: 1.35 }}>Scan to send your request from your phone, or write it here and drop the card in the prayer box. The pastors pray for every request this week.</div>
            </div>
            <div className="prayer-card-lines"><i /><i /><i /></div>
            <div className="small muted" style={{ fontSize: 10 }}>Name and phone (optional): ______________________ · Share with the church? ☐ yes ☐ pastors only</div>
          </div>
        ))}
      </article>
    </div>,
    document.body,
  );
}
