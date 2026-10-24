// Giving › FCRA and 80G guard: keeps foreign and local money apart. The office lists its foreign
// givers once; after that a foreign giver's gift cannot be recorded on the local side by mistake.
// The page shows what needs attention this year (foreign gifts in the main account, money from
// abroad on the main statement, the 20% admin limit, money passed on, registration validity, PAN
// gaps for 80G), the due dates for 10BD, 10BE, FC-4 and the quarterly disclosure, and the FC-4
// and Form 10BD figures ready to download.
import { AlertOctagon, AlertTriangle, Check, Download, ExternalLink, Info, Plus, Settings2, ShieldCheck, Trash2, Undo2, X } from 'lucide-react';
import { useState } from 'react';

import { AdminApi } from '@/api/endpoints';
import type { ComplianceDeadline, ComplianceGuard, ComplianceWarning, ForeignDonorKind } from '@/core/types';
import { Empty, ErrorState, Field, FormError, Loading, Modal, useToast } from '@/components/ui';
import { formatDate, formatMoney } from '@/lib/format';
import { useAction, useApi } from '@/lib/use-api';

import { PersonSearch } from '../components/person-picker';
import { PageHeader } from '../layout';

const KIND: Record<ForeignDonorKind, string> = { foreign_citizen: 'Foreign citizen', oci: 'OCI card holder', foreign_org: 'Foreign organisation', nri_indian: 'Indian citizen abroad (local)' };
const day = (d: string) => formatDate(`${d}T12:00:00`);
const pct = (n: number | null) => (n === null ? '–' : `${Math.round(n * 100)}%`);

function saveCsv(csv: string, filename: string) {
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  Object.assign(document.createElement('a'), { href: url, download: filename }).click();
  URL.revokeObjectURL(url);
}

function years() {
  const now = new Date();
  const start = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return [0, 1, 2, 3].map((i) => start - i);
}

export function CompliancePage() {
  const [year, setYear] = useState('');
  const q = useApi(() => AdminApi.compliance.get(year || undefined), [year]);
  const [data, setData] = useState<ComplianceGuard | null>(null);
  const [adding, setAdding] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const toast = useToast();
  const title = 'FCRA and 80G guard';
  const g = data && data.year.label === q.data?.year.label ? data : q.data;
  if (q.error) return <><PageHeader title={title} /><ErrorState error={q.error} onRetry={q.reload} /></>;
  if (!g) return <><PageHeader title={title} /><Loading /></>;
  const y = year || undefined;
  const fresh = (next: ComplianceGuard) => setData(next);
  const stops = g.warnings.filter((w) => w.level === 'stop').length;
  const pending = g.deadlines.filter((d) => d.status === 'overdue' || d.status === 'due');

  return (
    <>
      <PageHeader
        title={title}
        subtitle="Foreign money (from foreign citizens, OCI card holders and foreign bodies) must come in and go out only through the FCRA account. List your foreign givers once, and Flockwise stops their gifts landing in the main account. It checks the year for mistakes and prepares the FC-4 and Form 10BD figures. Working figures for your treasurer and auditor, not legal advice."
        actions={
          <div className="row wrap" style={{ gap: 8 }}>
            <select className="select" value={year || String(g.year.label.slice(0, 4))} onChange={(e) => setYear(e.target.value)} aria-label="Financial year">
              {years().map((s) => <option key={s} value={String(s)}>{s}-{String(s + 1).slice(2)}</option>)}
            </select>
            <button className="btn" onClick={() => setSettingsOpen(true)}><Settings2 size={15} /> Settings</button>
          </div>
        }
      />
      {!g.india ? <Empty title="For churches in India" body="FCRA and 80G apply to churches registered in India. Your church settings show another country." /> : (
        <div className="stack" style={{ gap: 16 }}>
          <div className={`card card-pad row wrap ${stops ? '' : ''}`} style={{ gap: 12, borderLeft: `4px solid var(${stops ? '--danger' : g.warnings.length ? '--warn' : '--ok'}, currentColor)` }}>
            {stops ? <AlertOctagon size={22} color="var(--danger)" /> : g.warnings.length ? <AlertTriangle size={22} color="var(--warn)" /> : <ShieldCheck size={22} color="var(--ok)" />}
            <div className="grow" style={{ minWidth: 220 }}>
              <b>{stops ? `${stops} thing${stops === 1 ? '' : 's'} to put right` : g.warnings.length ? `${g.warnings.length} thing${g.warnings.length === 1 ? '' : 's'} to check` : 'Nothing needs attention'}{pending.length ? ` · ${pending.length} return${pending.length === 1 ? '' : 's'} due` : ''}</b>
              <div className="small muted">
                {g.registered ? `FCRA registration ${g.fcra.registrationNumber ?? '(number not set)'}${g.fcra.accountLast4 ? ` · FCRA account ····${g.fcra.accountLast4}` : ''}${g.fcra.validTo ? ` · valid to ${day(g.fcra.validTo)}` : ''}` : 'No FCRA registration on record: this church cannot accept foreign gifts.'}
                {g.receipts80g.enabled ? ` · 80G ${g.receipts80g.registrationNumber ?? '(number not set)'}` : ' · 80G receipts off'}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
            <Stat label={`Foreign money in ${g.year.label}`} value={formatMoney(g.summary.foreignReceived, g.currency)} sub={`${g.summary.foreignGifts} gift${g.summary.foreignGifts === 1 ? '' : 's'}, FCRA account`} />
            <Stat label="Spent from the FCRA account" value={formatMoney(g.summary.foreignSpent, g.currency)} sub="Paid expenses marked FCRA" />
            <Stat label="Admin share of foreign money" value={pct(g.summary.adminShare)} sub={g.summary.adminShare === null ? 'Mark admin heads in Settings' : 'The limit is 20%'} warn={(g.summary.adminShare ?? 0) > 0.2} />
            <Stat label="Local money" value={formatMoney(g.summary.localReceived, g.currency)} sub="Main account" />
          </div>

          <section className="stack" style={{ gap: 8 }}>
            <h3 style={{ margin: 0 }}>What needs attention</h3>
            {!g.warnings.length ? <div className="card card-pad small muted">No problems found for {g.year.label}. The guard checks again every day.</div> : g.warnings.map((w) => <WarningRow key={w.id} w={w} year={y} onDone={(next, msg) => { fresh(next); toast(msg); }} />)}
          </section>

          <section className="stack" style={{ gap: 8 }}>
            <h3 style={{ margin: 0 }}>Returns and due dates</h3>
            {!g.deadlines.length ? <div className="card card-pad small muted">Turn on 80G receipts or add an FCRA registration in Settings › Giving to see the returns that apply.</div> : g.deadlines.map((d) => <DeadlineRow key={d.key} d={d} year={y} onDone={fresh} />)}
          </section>

          <section className="stack" style={{ gap: 8 }}>
            <div className="row between wrap" style={{ gap: 8 }}>
              <h3 style={{ margin: 0 }}>Foreign givers</h3>
              <button className="btn sm" onClick={() => setAdding(true)}><Plus size={14} /> Add a giver</button>
            </div>
            <p className="small muted" style={{ margin: 0 }}>Once a giver is here, the office cannot record their gift in the main account by mistake, and the member app asks them to give as a foreign giver. Add Indian citizens living abroad too, as local, so their gifts are not flagged.</p>
            {!g.donors.length ? <div className="card card-pad small muted">No foreign givers listed yet.</div> : (
              <div className="card" style={{ overflowX: 'auto' }}>
                <table className="table">
                  <thead><tr><th>Giver</th><th>Who</th><th>Country</th><th style={{ textAlign: 'right' }}>{g.year.label}</th><th /></tr></thead>
                  <tbody>
                    {g.donors.map((d) => (
                      <tr key={d.id}>
                        <td><b>{d.name}</b>{d.note && <div className="small muted">{d.note}</div>}</td>
                        <td>{d.kind === 'nri_indian' ? <span className="badge ok">{KIND[d.kind]}</span> : <span className="badge warn">{KIND[d.kind]}</span>}</td>
                        <td>{d.country || '–'}</td>
                        <td style={{ textAlign: 'right' }}>{d.gifts ? `${formatMoney(d.amount, g.currency)} · ${d.gifts}` : '–'}</td>
                        <td style={{ textAlign: 'right' }}><RemoveDonor id={d.id} name={d.name} year={y} onDone={fresh} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {g.registered && <Fc4Card year={y} label={g.year.label} currency={g.currency} />}
          {g.receipts80g.enabled && <Form10bdCard year={y} label={g.year.label} currency={g.currency} />}
        </div>
      )}
      {adding && <AddDonor year={y} onClose={() => setAdding(false)} onSaved={(next) => { setAdding(false); fresh(next); toast('Giver added'); }} />}
      {settingsOpen && <GuardSettings g={g} year={y} onClose={() => setSettingsOpen(false)} onSaved={(next) => { setSettingsOpen(false); fresh(next); toast('Settings saved'); }} />}
    </>
  );
}

function Stat({ label, value, sub, warn }: { label: string; value: string; sub: string; warn?: boolean }) {
  return (
    <div className="card card-pad" style={{ padding: 14 }}>
      <div className="small muted">{label}</div>
      <div style={{ fontSize: '1.45rem', fontWeight: 700, color: warn ? 'var(--danger)' : undefined }}>{value}</div>
      <div className="small muted">{sub}</div>
    </div>
  );
}

function WarningRow({ w, year, onDone }: { w: ComplianceWarning; year?: string; onDone: (g: ComplianceGuard, msg: string) => void }) {
  const [confirm, setConfirm] = useState(false);
  const move = useAction(async () => onDone(await AdminApi.compliance.markForeign(w.donationIds ?? [], year), 'Moved to the FCRA side'));
  const dismiss = useAction(async () => onDone(await AdminApi.compliance.dismiss(w.id, year), 'Set aside'));
  const icon = w.level === 'stop' ? <AlertOctagon size={18} color="var(--danger)" /> : w.level === 'warn' ? <AlertTriangle size={18} color="var(--warn)" /> : <Info size={18} className="muted" />;
  return (
    <div className="card card-pad stack" style={{ gap: 6 }}>
      <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
        <span style={{ marginTop: 2 }}>{icon}</span>
        <div className="grow stack" style={{ gap: 4, minWidth: 0 }}>
          <div className="row wrap" style={{ gap: 8 }}>
            <b>{w.title}</b>
            <span className={`badge ${w.level === 'stop' ? 'danger' : w.level === 'warn' ? 'warn' : 'gray'}`}>{w.level === 'stop' ? 'Put right' : w.level === 'warn' ? 'Check' : 'Note'}</span>
          </div>
          <span className="small">{w.detail}</span>
          <span className="small muted"><b>What to do:</b> {w.fix}</span>
          <FormError error={move.error ?? dismiss.error} />
          {(w.canMarkForeign || w.canDismiss) && (
            <div className="row wrap" style={{ gap: 8, marginTop: 4 }}>
              {w.canMarkForeign && !confirm && <button className="btn sm" onClick={() => setConfirm(true)}>Mark {w.donationIds?.length === 1 ? 'this gift' : `these ${w.donationIds?.length} gifts`} as foreign</button>}
              {confirm && (
                <>
                  <span className="small">Only after the money itself is in the FCRA account or returned. The PAN on these gifts is removed.</span>
                  <button className="btn sm primary" disabled={move.busy} onClick={() => move.run()}><Check size={14} /> Yes, move them</button>
                  <button className="btn sm ghost" onClick={() => setConfirm(false)}>Cancel</button>
                </>
              )}
              {w.canDismiss && !confirm && <button className="btn sm ghost" disabled={dismiss.busy} onClick={() => dismiss.run()}>Checked, it is local money</button>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DeadlineRow({ d, year, onDone }: { d: ComplianceDeadline; year?: string; onDone: (g: ComplianceGuard) => void }) {
  const [marking, setMarking] = useState(false);
  const [ack, setAck] = useState('');
  const file = useAction(async () => { onDone(await AdminApi.compliance.filed(d.key, ack.trim(), year)); setMarking(false); });
  const undo = useAction(async () => onDone(await AdminApi.compliance.unfile(d.key, year)));
  const badge = d.status === 'filed' ? <span className="badge ok">Filed</span> : d.status === 'overdue' ? <span className="badge danger">Overdue</span> : d.status === 'due' ? <span className="badge warn">Due soon</span> : <span className="badge gray">Later</span>;
  return (
    <div className="card card-pad row wrap" style={{ gap: 12, opacity: d.status === 'filed' ? 0.75 : 1 }}>
      <div style={{ minWidth: 92 }}>
        <div style={{ fontWeight: 700 }}>{day(d.due)}</div>
        {badge}
      </div>
      <div className="grow stack" style={{ gap: 2, minWidth: 220 }}>
        <b>{d.label}</b>
        <span className="small muted">{d.body}</span>
        {d.filed && <span className="small">Marked filed by {d.filed.by} on {formatDate(d.filed.at)}{d.filed.ack ? ` · acknowledgement ${d.filed.ack}` : ''}</span>}
        <FormError error={file.error ?? undo.error} />
        {marking && (
          <div className="row wrap" style={{ gap: 8, marginTop: 4 }}>
            <input className="input" style={{ maxWidth: 240 }} placeholder="Acknowledgement number (optional)" value={ack} onChange={(e) => setAck(e.target.value)} autoFocus />
            <button className="btn sm primary" disabled={file.busy} onClick={() => file.run()}><Check size={14} /> Mark filed</button>
            <button className="btn sm ghost" onClick={() => setMarking(false)}><X size={14} /></button>
          </div>
        )}
      </div>
      <div className="row wrap" style={{ gap: 6 }}>
        {d.link && <a className="btn sm ghost" href={d.link} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Portal</a>}
        {d.filed ? <button className="btn sm ghost" disabled={undo.busy} onClick={() => undo.run()}><Undo2 size={14} /> Not filed</button> : !marking && <button className="btn sm" onClick={() => setMarking(true)}>Mark filed</button>}
      </div>
    </div>
  );
}

function RemoveDonor({ id, name, year, onDone }: { id: string; name: string; year?: string; onDone: (g: ComplianceGuard) => void }) {
  const [sure, setSure] = useState(false);
  const del = useAction(async () => onDone(await AdminApi.compliance.removeDonor(id, year)));
  if (!sure) return <button className="btn ghost icon sm" title={`Take ${name} off the list`} onClick={() => setSure(true)}><Trash2 size={15} /></button>;
  return (
    <span className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
      <button className="btn sm danger" disabled={del.busy} onClick={() => del.run()}>Remove</button>
      <button className="btn sm ghost" onClick={() => setSure(false)}>Keep</button>
    </span>
  );
}

function AddDonor({ year, onClose, onSaved }: { year?: string; onClose: () => void; onSaved: (g: ComplianceGuard) => void }) {
  const [person, setPerson] = useState<{ id: string; name: string } | null>(null);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<ForeignDonorKind>('foreign_citizen');
  const [country, setCountry] = useState('');
  const [note, setNote] = useState('');
  const save = useAction(async () => onSaved(await AdminApi.compliance.addDonor({ personId: person?.id, name: person ? undefined : name.trim(), kind, country: country.trim(), note: note.trim() || undefined }, year)));
  return (
    <Modal title="Add a giver from abroad" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={save.busy || (!person && !name.trim())} onClick={() => save.run()}>Add</button></>}>
      <div className="stack">
        <FormError error={save.error} />
        <Field label="Giver" hint={person ? 'Linked to their profile' : 'Find them in People, or type the name of a giver who is not in People'}>
          {person ? (
            <div className="row" style={{ gap: 8 }}><b className="grow">{person.name}</b><button className="btn sm ghost" onClick={() => setPerson(null)}>Change</button></div>
          ) : (
            <>
              <PersonSearch onPick={(p) => setPerson(p)} />
              <input className="input" style={{ marginTop: 6 }} placeholder="Or type a name (for example Hope Foundation, USA)" value={name} onChange={(e) => setName(e.target.value)} />
            </>
          )}
        </Field>
        <Field label="Who they are" hint={kind === 'nri_indian' ? 'An Indian passport holder living abroad is a local source, even giving from an NRE or NRO account.' : kind === 'oci' ? 'OCI card holders are foreign citizens: their gifts are foreign contributions.' : undefined}>
          <select className="select" value={kind} onChange={(e) => setKind(e.target.value as ForeignDonorKind)}>
            {(Object.keys(KIND) as ForeignDonorKind[]).map((k) => <option key={k} value={k}>{KIND[k]}</option>)}
          </select>
        </Field>
        <Field label="Country" hint={kind === 'nri_indian' ? 'Optional' : 'FC-4 asks for it'}><input className="input" value={country} onChange={(e) => setCountry(e.target.value)} placeholder="United States" /></Field>
        <Field label="Note" hint="Optional"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Supports the children's education fund" /></Field>
      </div>
    </Modal>
  );
}

function GuardSettings({ g, year, onClose, onSaved }: { g: ComplianceGuard; year?: string; onClose: () => void; onSaved: (g: ComplianceGuard) => void }) {
  const [validTo, setValidTo] = useState(g.fcra.validTo ?? '');
  const [opening, setOpening] = useState('');
  const [admin, setAdmin] = useState(new Set(g.heads.filter((h) => h.admin).map((h) => h.id)));
  const save = useAction(async () =>
    onSaved(await AdminApi.compliance.settings({ registrationValidTo: validTo || null, adminHeadIds: [...admin], ...(opening.trim() ? { openingBalance: { year: g.year.label.slice(0, 4), amount: Math.round(Number(opening) * 100) } } : {}) }, year)),
  );
  return (
    <Modal title="Guard settings" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={save.busy} onClick={() => save.run()}>Save</button></>}>
      <div className="stack">
        <FormError error={save.error} />
        <p className="small muted" style={{ margin: 0 }}>The FCRA registration number, the FCRA account and the 80G details are in Settings › Giving.</p>
        {g.registered && <Field label="FCRA registration valid to" hint="Registration lasts five years. You get reminders well before it ends."><input className="input" type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} /></Field>}
        {g.registered && <Field label={`FCRA account balance on ${day(g.year.from)}`} hint="Brought forward from last year, for the FC-4 figures. Leave empty to keep what is saved."><input className="input" type="number" min={0} step="0.01" value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="125000" /></Field>}
        {g.registered && (
          <Field label="Administrative expense heads" hint="FCRA allows at most 20% of the year's foreign money on administration: office salaries, rent, utilities, travel, printing.">
            <div className="stack" style={{ gap: 4 }}>
              {g.heads.map((h) => (
                <label key={h.id} className="check">
                  <input type="checkbox" checked={admin.has(h.id)} onChange={(e) => setAdmin((s) => { const n = new Set(s); if (e.target.checked) n.add(h.id); else n.delete(h.id); return n; })} />
                  <span>{h.name}</span>
                </label>
              ))}
              {!g.heads.length && <span className="small muted">Add expense heads in Accounts first.</span>}
            </div>
          </Field>
        )}
        {!g.registered && <div className="alert info">Add your FCRA registration in Settings › Giving to use the FCRA checks. The 80G checks work without it.</div>}
      </div>
    </Modal>
  );
}

function Fc4Card({ year, label, currency }: { year?: string; label: string; currency: ComplianceGuard['currency'] }) {
  const q = useApi(() => AdminApi.compliance.fc4(year), [year]);
  const csv = useAction(async () => { const r = await AdminApi.compliance.fc4Csv(year); saveCsv(r.csv, r.filename); });
  const m = (n: number) => formatMoney(n, currency);
  return (
    <section className="card card-pad stack" style={{ gap: 10 }}>
      <div className="row between wrap" style={{ gap: 8 }}>
        <h3 style={{ margin: 0 }}>FC-4 figures for {label}</h3>
        <button className="btn sm" disabled={csv.busy || !q.data} onClick={() => csv.run()}><Download size={14} /> Download CSV</button>
      </div>
      {q.error ? <ErrorState error={q.error} onRetry={q.reload} /> : !q.data ? <Loading /> : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
            <Mini label="Opening balance" value={m(q.data.openingBalance)} />
            <Mini label="Received" value={m(q.data.received)} />
            <Mini label="Bank interest" value={m(q.data.interest)} />
            <Mini label="Utilised" value={m(q.data.utilised)} />
            <Mini label="Closing balance" value={m(q.data.closingBalance)} />
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead><tr><th>Foreign giver</th><th>Country</th><th>Purpose</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
              <tbody>
                {q.data.donors.map((d) => <tr key={d.key}><td>{d.name}{d.kind === 'unknown' && <span className="badge gray" style={{ marginLeft: 6 }}>not on the list</span>}</td><td>{d.country || '–'}</td><td className="small">{d.purpose}</td><td style={{ textAlign: 'right' }}>{m(d.amount)}</td></tr>)}
                {!q.data.donors.length && <tr><td colSpan={4} className="small muted">No foreign gifts this year.</td></tr>}
              </tbody>
            </table>
          </div>
          {q.data.utilisation.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead><tr><th>Spent on</th><th /><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
                <tbody>{q.data.utilisation.map((h) => <tr key={h.headId}><td>{h.name}</td><td>{h.admin && <span className="badge gray">admin</span>}</td><td style={{ textAlign: 'right' }}>{m(h.amount)}</td></tr>)}</tbody>
              </table>
            </div>
          )}
          <span className="small muted">FC-4 also needs the audited receipts and payments account, income and expenditure, balance sheet and the chartered accountant's certificate. These figures are the starting point.</span>
        </>
      )}
    </section>
  );
}

function Form10bdCard({ year, label, currency }: { year?: string; label: string; currency: ComplianceGuard['currency'] }) {
  const q = useApi(() => AdminApi.compliance.form10bd(year), [year]);
  const csv = useAction(async () => { const r = await AdminApi.compliance.form10bdCsv(year); saveCsv(r.csv, r.filename); });
  const [all, setAll] = useState(false);
  const m = (n: number) => formatMoney(n, currency);
  return (
    <section className="card card-pad stack" style={{ gap: 10 }}>
      <div className="row between wrap" style={{ gap: 8 }}>
        <h3 style={{ margin: 0 }}>Form 10BD for {label}</h3>
        <button className="btn sm" disabled={csv.busy || !q.data?.rows.length} onClick={() => csv.run()}><Download size={14} /> Download for the portal</button>
      </div>
      {q.error ? <ErrorState error={q.error} onRetry={q.reload} /> : !q.data ? <Loading /> : (
        <>
          <div className="row wrap" style={{ gap: 8 }}>
            <span className="badge accent">{q.data.rows.length} rows · {m(q.data.total)}</span>
            {q.data.missingId > 0 && <span className="badge warn">{q.data.missingId} without PAN</span>}
            {q.data.missingAddress > 0 && <span className="badge warn">{q.data.missingAddress} without address</span>}
            {q.data.cashOverLimit.gifts > 0 && <span className="badge gray">{q.data.cashOverLimit.gifts} cash gifts over ₹2,000 left out</span>}
            {q.data.foreignLeftOut.gifts > 0 && <span className="badge gray">{q.data.foreignLeftOut.gifts} foreign gifts left out</span>}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead><tr><th>Giver</th><th>PAN</th><th>Mode</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
              <tbody>
                {(all ? q.data.rows : q.data.rows.slice(0, 12)).map((r) => (
                  <tr key={r.key}>
                    <td>{r.name}{r.missing.includes('address') && <span className="badge warn" style={{ marginLeft: 6 }}>no address</span>}</td>
                    <td className="mono">{r.idNumber || <span className="badge warn">missing</span>}</td>
                    <td className="small">{r.mode === 'Cash' ? 'Cash' : 'Bank, UPI or cheque'}</td>
                    <td style={{ textAlign: 'right' }}>{m(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {q.data.rows.length > 12 && <button className="btn sm ghost" onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show all ${q.data.rows.length}`}</button>}
          <span className="small muted">The download follows the column order of the income tax portal's 10BD template, with section 80G and ID code 1 for PAN. Add a PAN or address on the gift or the person, then download again.</span>
        </>
      )}
    </section>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return <div className="card" style={{ padding: 10 }}><div className="small muted">{label}</div><b>{value}</b></div>;
}
