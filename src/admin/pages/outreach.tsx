// Care › Talent bank: what members would give free to the neighbourhood (medical, legal, tuition,
// job referrals), and the free clinics, tuition evenings and job fairs the church runs with them.
// Plan a day, ask the members with the right skills, share the public sign-up link, and afterwards
// record how many were helped.
import { Check, Copy, HandHeart, Link2, Pencil, Plus, Send, Trash2, X } from 'lucide-react';
import { useState } from 'react';

import { AdminApi, type OutreachInput } from '@/api/endpoints';
import type { OutreachDetail, OutreachKind, OutreachView, TalentBank } from '@/core/types';
import { Empty, ErrorState, Field, FormError, Loading, Modal, useHiddenRows, useToast, useUndoableDelete } from '@/components/ui';
import { formatDay } from '@/lib/format';
import { useAction, useApi } from '@/lib/use-api';

import { PageHeader } from '../layout';

const day = (d: string) => formatDay(`${d}T12:00:00`);
const hours = (o: { startTime: string; endTime: string }) => (o.startTime ? `${o.startTime}${o.endTime ? `–${o.endTime}` : ''}` : '');
const today = () => new Date().toISOString().slice(0, 10);

export function OutreachPage() {
  const q = useApi(AdminApi.outreach.get);
  const rows = useHiddenRows();
  const undoable = useUndoableDelete();
  const [planning, setPlanning] = useState<OutreachDetail | 'new' | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const title = 'Talent bank';
  if (q.error) return <><PageHeader title={title} /><ErrorState error={q.error} onRetry={q.reload} /></>;
  if (!q.data) return <><PageHeader title={title} /><Loading /></>;
  const d = q.data;
  const list = d.outreaches.filter((o) => !rows.hidden.has(o.id));
  const upcoming = list.filter((o) => o.status === 'planned' && o.date >= today()).sort((a, b) => a.date.localeCompare(b.date));
  const past = list.filter((o) => !upcoming.includes(o));
  const remove = (o: OutreachView) => undoable({ text: 'Outreach removed.', hide: () => rows.hide(o.id), show: () => rows.show(o.id), run: () => AdminApi.outreach.remove(o.id), done: q.reload });
  return (
    <>
      <PageHeader
        title={title}
        subtitle="Members say which skills they would give free to people around the church: medical, legal, tuition, job referrals. Plan a free clinic, tuition evening or job fair, ask the members with the right skills, and share a link for people in the area to register. They get a reminder the day before."
        actions={<button className="btn primary" onClick={() => setPlanning('new')}><Plus size={15} /> Plan an outreach</button>}
      />
      <div className="card card-pad stack" style={{ gap: 10, marginBottom: 16 }}>
        <div className="row between wrap" style={{ gap: 8 }}>
          <b>{d.givers === 0 ? 'No members have offered their skills yet' : `${d.givers} ${d.givers === 1 ? 'member gives' : 'members give'} their skills to the neighbourhood`}</b>
          {d.helped > 0 && <span className="badge green">{d.helped.toLocaleString('en-IN')} people helped so far</span>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
          {d.areas.map((a) => (
            <div key={a.key} className="card card-pad" style={{ padding: 12 }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{a.people}</div>
              <div className="small"><b>{a.label}</b></div>
              <div className="small muted">{a.skills.slice(0, 3).join(', ')}</div>
            </div>
          ))}
        </div>
        {d.givers === 0 && <span className="small muted">Members add their skills in the member app under Help our neighbourhood. To get started, put a notice in the bulletin, for example: "Doctor, teacher, lawyer? Give two hours a month."</span>}
      </div>
      <h3 style={{ margin: '0 0 8px' }}>Coming up</h3>
      {!upcoming.length ? <Empty title="No outreach planned" body="Start with one: a free health check-up after the Sunday service, or a tuition evening in the church hall." action={<button className="btn primary" onClick={() => setPlanning('new')}><Plus size={15} /> Plan an outreach</button>} /> : (
        <div className="stack">{upcoming.map((o) => <OutreachRow key={o.id} o={o} onOpen={() => setOpen(o.id)} onRemove={() => remove(o)} />)}</div>
      )}
      {past.length > 0 && (
        <>
          <h3 style={{ margin: '20px 0 8px' }}>Earlier</h3>
          <div className="stack">{past.map((o) => <OutreachRow key={o.id} o={o} onOpen={() => setOpen(o.id)} onRemove={() => remove(o)} />)}</div>
        </>
      )}
      {planning && <PlanModal bank={d} prev={planning === 'new' ? null : planning} onClose={() => setPlanning(null)} onSaved={(o) => { setPlanning(null); setOpen(o.id); q.reload(); }} />}
      {open && <DetailModal id={open} onClose={() => { setOpen(null); q.reload(); }} onEdit={(o) => { setOpen(null); setPlanning(o); }} />}
    </>
  );
}

function OutreachRow({ o, onOpen, onRemove }: { o: OutreachView; onOpen: () => void; onRemove: () => void }) {
  const status = o.status === 'done' ? <span className="badge green">Done · {o.served ?? 0} helped</span> : o.status === 'cancelled' ? <span className="badge gray">Cancelled</span> : o.date < today() ? <span className="badge amber">Record how it went</span> : null;
  return (
    <div className="card card-pad row wrap" style={{ gap: 12 }}>
      <HandHeart size={22} className="muted" />
      <button className="grow" onClick={onOpen} style={{ textAlign: 'left', background: 'none', border: 0, padding: 0, color: 'inherit', cursor: 'pointer', minWidth: 200 }}>
        <b>{o.title}</b>
        <div className="small muted">{day(o.date)}{hours(o) && ` · ${hours(o)}`}{o.place && ` · ${o.place}`}</div>
        <div className="small">{o.signups} registered{o.capacity ? ` of ${o.capacity}` : ''} · {o.yes} helping{o.asked > o.yes ? ` (${o.asked} asked)` : ''}</div>
      </button>
      {status}
      <button className="btn sm" onClick={onOpen}>Open</button>
      <button className="btn ghost icon sm danger" aria-label="Remove" onClick={onRemove}><Trash2 size={14} /></button>
    </div>
  );
}

function PlanModal({ bank, prev, onClose, onSaved }: { bank: TalentBank; prev: OutreachDetail | null; onClose: () => void; onSaved: (o: OutreachDetail) => void }) {
  const preset = (k: OutreachKind) => bank.kinds.find((x) => x.kind === k)!;
  const [f, setF] = useState<OutreachInput>(prev
    ? { kind: prev.kind, title: prev.title, date: prev.date, startTime: prev.startTime, endTime: prev.endTime, place: prev.place, about: prev.about, skills: prev.skills, capacity: prev.capacity }
    : { kind: 'clinic', title: preset('clinic').title, date: '', startTime: '10:00', endTime: '13:00', place: '', about: '', skills: preset('clinic').skills, capacity: null });
  const [extra, setExtra] = useState('');
  const pickKind = (k: OutreachKind) => setF({ ...f, kind: k, title: !f.title || bank.kinds.some((x) => x.title === f.title) ? preset(k).title : f.title, skills: preset(k).skills });
  const toggle = (s: string) => setF({ ...f, skills: f.skills.includes(s) ? f.skills.filter((x) => x !== s) : [...f.skills, s] });
  const save = useAction(async () => onSaved(prev ? await AdminApi.outreach.update(prev.id, f) : await AdminApi.outreach.create(f)));
  const choices = [...new Set([...preset(f.kind).skills, ...f.skills])];
  return (
    <Modal title={prev ? 'Edit outreach' : 'Plan an outreach'} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><span style={{ flex: 1 }} /><button className="btn primary" disabled={save.busy} onClick={() => void save.run()}>{prev ? 'Save' : 'Plan it'}</button></>}>
      <div className="stack">
        <Field label="What kind of day">
          <div className="row wrap" style={{ gap: 6 }}>
            {bank.kinds.map((k) => <button key={k.kind} type="button" className={`btn sm ${f.kind === k.kind ? 'primary' : ''}`} onClick={() => pickKind(k.kind)}>{k.label}</button>)}
          </div>
        </Field>
        <Field label="Title" hint="What people in the area will see."><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={100} /></Field>
        <div className="row wrap" style={{ gap: 8 }}>
          <Field label="Date"><input className="input" type="date" value={f.date} min={prev ? undefined : today()} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
          <Field label="From"><input className="input" type="time" value={f.startTime} onChange={(e) => setF({ ...f, startTime: e.target.value })} /></Field>
          <Field label="To"><input className="input" type="time" value={f.endTime} onChange={(e) => setF({ ...f, endTime: e.target.value })} /></Field>
        </div>
        <Field label="Place"><input className="input" value={f.place} onChange={(e) => setF({ ...f, place: e.target.value })} maxLength={120} placeholder="e.g. Church hall, Ameerpet" /></Field>
        <Field label="About the day" hint="What is offered and what to bring, e.g. BP and sugar check, eye test; bring old reports."><textarea className="input" rows={3} value={f.about} onChange={(e) => setF({ ...f, about: e.target.value })} maxLength={800} /></Field>
        <Field label="Skills needed" hint="Members with these skills are suggested as helpers.">
          <div className="row wrap" style={{ gap: 6 }}>
            {choices.map((s) => <button key={s} type="button" className={`btn sm ${f.skills.includes(s) ? 'primary' : ''}`} onClick={() => toggle(s)}>{f.skills.includes(s) && <Check size={13} />} {s}</button>)}
            <form className="row" style={{ gap: 4 }} onSubmit={(e) => { e.preventDefault(); const v = extra.trim(); if (v && !f.skills.includes(v)) setF({ ...f, skills: [...f.skills, v] }); setExtra(''); }}>
              <input className="input sm" style={{ width: 140 }} value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="Another skill" maxLength={40} />
              <button className="btn sm" aria-label="Add skill"><Plus size={13} /></button>
            </form>
          </div>
        </Field>
        <Field label="Most people who can register (optional)"><input className="input" type="number" min={1} style={{ width: 140 }} value={f.capacity ?? ''} onChange={(e) => setF({ ...f, capacity: e.target.value ? Number(e.target.value) : null })} /></Field>
        <FormError error={save.error} />
      </div>
    </Modal>
  );
}

function DetailModal({ id, onClose, onEdit }: { id: string; onClose: () => void; onEdit: (o: OutreachDetail) => void }) {
  const q = useApi(() => AdminApi.outreach.one(id), [id]);
  const toast = useToast();
  const [pick, setPick] = useState<Set<string>>(new Set());
  const [served, setServed] = useState<string>('');
  const [report, setReport] = useState('');
  const act = useAction(async (fn: () => Promise<OutreachDetail>) => q.setData(await fn()));
  const copy = (text: string, what: string) => navigator.clipboard?.writeText(text).then(() => toast(`${what} copied`), () => toast('Select the text to copy it', 'error'));
  const o = q.data;
  return (
    <Modal title={o?.title ?? 'Outreach'} onClose={onClose} footer={o && <>{o.status === 'planned' && <button className="btn" onClick={() => onEdit(o)}><Pencil size={14} /> Edit</button>}{o.status === 'planned' && <button className="btn" disabled={act.busy} onClick={() => void act.run(() => AdminApi.outreach.update(o.id, { status: 'cancelled' }))}><X size={14} /> Cancel the day</button>}<span style={{ flex: 1 }} /><button className="btn" onClick={onClose}>Close</button></>}>
      {q.error ? <ErrorState error={q.error} onRetry={q.reload} /> : !o ? <Loading /> : (
        <div className="stack">
          <div className="small muted">{day(o.date)}{hours(o) && ` · ${hours(o)}`}{o.place && ` · ${o.place}`}</div>
          {o.about && <p style={{ margin: 0 }}>{o.about}</p>}
          <FormError error={act.error} />
          {o.status === 'planned' && (
            <section className="card card-pad stack" style={{ gap: 8 }}>
              <b className="row" style={{ gap: 6 }}><Link2 size={16} /> Sign-up link for the neighbourhood</b>
              <div className="row wrap" style={{ gap: 6 }}>
                <code className="grow small" style={{ wordBreak: 'break-all' }}>{o.link}</code>
                <button className="btn sm" onClick={() => copy(o.link, 'Link')}><Copy size={13} /> Copy link</button>
                <button className="btn sm" onClick={() => copy(o.shareText, 'Message')}><Copy size={13} /> Copy WhatsApp message</button>
              </div>
              <span className="small muted">Share it in area WhatsApp groups, print it as a QR code, or read it out on Sunday.</span>
            </section>
          )}
          <section className="stack" style={{ gap: 6 }}>
            <div className="row between wrap"><b>Helpers from the church</b><span className="small muted">{o.yes} said yes{o.asked > o.yes ? `, ${o.asked - o.yes} asked` : ''}</span></div>
            {!o.helpers.length ? <span className="small muted">No member has listed {o.skills.slice(0, 3).join(', ') || 'these skills'} yet. Ask in a notice for people to add their skills in the app.</span> : (
              <>
                {o.helpers.map((h) => (
                  <label key={h.personId} className="row" style={{ gap: 8 }}>
                    <input type="checkbox" disabled={!!h.answer || o.status !== 'planned'} checked={!!h.answer || pick.has(h.personId)} onChange={(e) => { const n = new Set(pick); if (e.target.checked) n.add(h.personId); else n.delete(h.personId); setPick(n); }} />
                    <span className="grow">{h.name} <span className="small muted">· {h.skills.join(', ')}{h.community ? ' · gives to the neighbourhood' : ''}</span></span>
                    {h.answer === 'yes' ? <span className="badge green">Helping</span> : h.answer === 'no' ? <span className="badge gray">Can't</span> : h.answer === 'asked' ? <span className="badge amber">Asked</span> : null}
                  </label>
                ))}
                {o.status === 'planned' && <div><button className="btn sm primary" disabled={!pick.size || act.busy} onClick={() => void act.run(async () => { const r = await AdminApi.outreach.invite(o.id, [...pick]); setPick(new Set()); toast('Asked. They will answer in the app.'); return r; })}><Send size={13} /> Ask {pick.size || ''} to help</button></div>}
              </>
            )}
          </section>
          <section className="stack" style={{ gap: 6 }}>
            <div className="row between wrap"><b>Registered</b><span className="small muted">{o.list.length}{o.capacity ? ` of ${o.capacity}` : ''}</span></div>
            {!o.list.length ? <span className="small muted">No one yet. Share the link above.</span> : (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Came</th><th>Name</th><th>Phone</th><th>Needs</th><th /></tr></thead>
                  <tbody>
                    {o.list.map((s) => (
                      <tr key={s.id}>
                        <td><input type="checkbox" aria-label={`${s.name} came`} checked={s.came} onChange={(e) => void act.run(() => AdminApi.outreach.came(o.id, s.id, e.target.checked))} /></td>
                        <td>{s.name}{s.area && <div className="small muted">{s.area}</div>}</td>
                        <td><a href={`tel:${s.phone.replace(/\s/g, '')}`}>{s.phone}</a></td>
                        <td className="small">{s.need || <span className="muted">-</span>}</td>
                        <td><button className="btn ghost icon sm danger" aria-label="Remove" onClick={() => void act.run(() => AdminApi.outreach.removeSignup(o.id, s.id))}><Trash2 size={13} /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          {o.status === 'done' ? (
            <div className="card card-pad"><b>{o.served ?? 0} people helped.</b>{o.report && <p className="small" style={{ margin: '6px 0 0' }}>{o.report}</p>}</div>
          ) : o.status === 'planned' && o.date <= today() && (
            <section className="card card-pad stack" style={{ gap: 8 }}>
              <b>How did it go?</b>
              <div className="row wrap" style={{ gap: 8 }}>
                <Field label="People helped" hint={`Left empty, counts the ${o.list.filter((s) => s.came).length} ticked as came.`}><input className="input" type="number" min={0} style={{ width: 140 }} value={served} onChange={(e) => setServed(e.target.value)} /></Field>
                <div className="grow" style={{ minWidth: 220 }}><Field label="Notes (optional)"><input className="input" value={report} onChange={(e) => setReport(e.target.value)} maxLength={1000} placeholder="e.g. 40 BP checks, 6 referred to hospital" /></Field></div>
              </div>
              <div><button className="btn primary sm" disabled={act.busy} onClick={() => void act.run(() => AdminApi.outreach.done(o.id, { served: served === '' ? '' : Number(served), report }))}><Check size={14} /> Mark as done</button></div>
            </section>
          )}
        </div>
      )}
    </Modal>
  );
}
