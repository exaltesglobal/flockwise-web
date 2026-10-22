// Church registers: baptism, confirmation, marriage and burial books, transfer letters, and
// printable certificates. Entries are never deleted; corrections are kept as marginal notes.
import { BookMarked, FilePlus2, Pencil, Printer, Search, StickyNote, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router';

import type { Certificate, RegisterEntry, RegisterField, RegisterKind } from '@/api/admin-types';
import { AdminApi } from '@/api/endpoints';
import { Empty, ErrorState, Field, FormError, Loading, Modal, Segmented, useToast } from '@/components/ui';
import { REGISTER_FIELDS, REGISTER_KINDS, REGISTER_LABELS } from '@/core/modules/registers';
import { formatDate } from '@/lib/format';
import { useCan } from '@/lib/perms';
import { useAction, useApi } from '@/lib/use-api';

import { PersonSearch, type PickedPerson } from '../components/person-picker';
import { PageHeader } from '../layout';

const SHORT: Record<RegisterKind, string> = { baptism: 'Baptisms', confirmation: 'Confirmations', marriage: 'Marriages', burial: 'Burials', transfer: 'Transfers' };
const day = (d: string) => (d ? formatDate(`${d}T12:00:00`) : '');

export function RegistersPage() {
  const can = useCan();
  const [kind, setKind] = useState<RegisterKind | 'all'>('all');
  const [q, setQ] = useState('');
  const [year, setYear] = useState('');
  const [showVoid, setShowVoid] = useState(false);
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 220);
    return () => clearTimeout(t);
  }, [q]);
  const summary = useApi(() => AdminApi.registers.summary(), []);
  const list = useApi(() => AdminApi.registers.list({ kind: kind === 'all' ? undefined : kind, q: debounced || undefined, year: year || undefined, status: showVoid ? 'void' : undefined }), [kind, debounced, year, showVoid]);
  const [open, setOpen] = useState<RegisterEntry | null>(null);
  const [creating, setCreating] = useState<RegisterKind | null>(null);
  const [cert, setCert] = useState<Certificate | null>(null);
  const years = useMemo(() => {
    const now = new Date().getFullYear();
    return Array.from({ length: 12 }, (_, i) => String(now - i));
  }, []);

  const refresh = () => {
    list.reload();
    summary.reload();
  };

  return (
    <>
      <PageHeader
        title="Registers"
        subtitle="Baptism, confirmation, marriage and burial registers, with printable certificates and membership transfer letters."
        actions={can('people.edit') && <button className="btn primary" onClick={() => setCreating(kind === 'all' ? 'baptism' : kind)}><FilePlus2 size={16} /> New entry</button>}
      />

      {summary.data && (
        <div className="register-tiles">
          {summary.data.kinds.map((k) => (
            <button key={k.kind} className={`card register-tile ${kind === k.kind ? 'on' : ''}`} onClick={() => setKind(kind === k.kind ? 'all' : k.kind)}>
              <span className="small muted">{REGISTER_LABELS[k.kind].name}</span>
              <strong>{k.total.toLocaleString('en-IN')}</strong>
              <span className="small muted">{k.thisYear} this year{k.last ? ` · last ${day(k.last)}` : ''}</span>
            </button>
          ))}
        </div>
      )}

      <div className="row wrap" style={{ gap: 10, margin: '14px 0' }}>
        <div className="seg-scroll"><Segmented value={kind} onChange={setKind} options={[{ value: 'all', label: 'All' }, ...REGISTER_KINDS.map((k) => ({ value: k, label: SHORT[k] }))]} /></div>
        <div className="search grow" style={{ minWidth: 200 }}>
          <Search size={16} />
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, entry number, parents, witnesses" />
        </div>
        <select className="input" style={{ width: 'auto' }} value={year} onChange={(e) => setYear(e.target.value)} aria-label="Year">
          <option value="">All years</option>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={showVoid} onChange={(e) => setShowVoid(e.target.checked)} /> Void entries</label>
      </div>

      {list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : !list.data ? <Loading /> : list.data.data.length === 0 ? (
        <div className="card"><Empty icon={<BookMarked size={28} />} title={showVoid ? 'No void entries' : 'No entries yet'} body="Record baptisms, marriages and burials here as they happen, or copy in entries from your old register books." /></div>
      ) : (
        <div className="card table-wrap">
          <table className="table">
            <thead><tr><th>Entry</th><th>Name</th><th className="hide-sm">Register</th><th>Date</th><th className="hide-sm">Officiant</th><th /></tr></thead>
            <tbody>
              {list.data.data.map((e) => (
                <tr key={e.id} className="clickable" onClick={() => setOpen(e)}>
                  <td className="mono small">{e.number}</td>
                  <td>
                    <strong>{e.name}</strong>
                    {e.kind === 'marriage' && e.details.brideName && <span className="muted"> &amp; {e.details.brideName}</span>}
                  </td>
                  <td className="small hide-sm">{SHORT[e.kind]}</td>
                  <td className="small nowrap">{day(e.date)}</td>
                  <td className="small muted hide-sm">{e.officiant}</td>
                  <td>{e.status === 'void' ? <span className="badge danger">Void</span> : e.notes.length > 0 ? <span className="badge gray">{e.notes.length} note{e.notes.length === 1 ? '' : 's'}</span> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.data.total > list.data.data.length && <p className="small muted" style={{ padding: 12 }}>Showing {list.data.data.length} of {list.data.total}. Narrow by year or search.</p>}
        </div>
      )}

      {creating && <EntryForm initialKind={creating} onClose={() => setCreating(null)} onSaved={(e) => { setCreating(null); refresh(); setOpen(e); }} />}
      {open && <EntryDrawer entry={open} onClose={() => setOpen(null)} onChanged={(e) => { setOpen(e); refresh(); }} onPrint={setCert} />}
      {cert && <CertificateSheet cert={cert} onClose={() => setCert(null)} />}
    </>
  );
}

function DetailInput({ f, value, onChange }: { f: RegisterField; value: string; onChange: (v: string) => void }) {
  if (f.type === 'select') {
    return (
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Choose</option>
        {f.options!.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  if (f.type === 'textarea') return <textarea className="input" rows={2} value={value} onChange={(e) => onChange(e.target.value)} />;
  return <input className="input" type={f.type === 'number' ? 'number' : f.type} value={value} onChange={(e) => onChange(e.target.value)} />;
}

function PersonLink({ label, person, onPick, onClear }: { label: string; person: PickedPerson | null; onPick: (p: PickedPerson, birthDate: string | null) => void; onClear: () => void }) {
  return (
    <Field label={label} hint="Optional. Linking updates their profile (baptism date, anniversary).">
      {person ? (
        <div className="row" style={{ gap: 8 }}>
          <span className="chip">{person.name}</span>
          <button type="button" className="btn ghost icon sm" onClick={onClear} aria-label="Remove link"><X size={14} /></button>
        </div>
      ) : (
        <PersonSearch onPick={(p, full) => onPick(p, full.birthDate)} placeholder="Find them in People" />
      )}
    </Field>
  );
}

function EntryForm({ initialKind, entry, onClose, onSaved }: { initialKind: RegisterKind; entry?: RegisterEntry; onClose: () => void; onSaved: (e: RegisterEntry) => void }) {
  const editing = !!entry;
  const [kind, setKind] = useState<RegisterKind>(entry?.kind ?? initialKind);
  const [person, setPerson] = useState<PickedPerson | null>(entry?.personId ? { id: entry.personId, name: entry.name } : null);
  const [spouse, setSpouse] = useState<PickedPerson | null>(entry?.spouseId ? { id: entry.spouseId, name: entry.details.brideName ?? '' } : null);
  const [form, setForm] = useState({ name: entry?.name ?? '', date: entry?.date ?? new Date().toISOString().slice(0, 10), place: entry?.place ?? '', officiant: entry?.officiant ?? '', remarks: entry?.remarks ?? '', reason: '' });
  const [details, setDetails] = useState<Record<string, string>>(entry?.details ?? {});
  const [markInactive, setMarkInactive] = useState(true);
  const save = useAction(async () =>
    editing
      ? AdminApi.registers.update(entry.id, { ...form, details, personId: person?.id ?? null, spouseId: spouse?.id ?? null })
      : AdminApi.registers.create({ kind, ...form, details, personId: person?.id ?? null, spouseId: spouse?.id ?? null, markInactive: kind === 'transfer' ? markInactive : undefined }),
  );
  const L = REGISTER_LABELS[kind];
  const fields = REGISTER_FIELDS[kind];
  const groups = [...new Set(fields.map((f) => f.group ?? ''))];
  const err = save.error?.fields ?? {};

  async function submit(e: FormEvent) {
    e.preventDefault();
    const out = await save.run();
    if (out) onSaved(out);
  }

  return (
    <Modal
      title={editing ? `Correct ${entry.number}` : 'New register entry'}
      onClose={onClose}
      wide
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" form="register-form" disabled={save.busy}>{save.busy ? 'Saving…' : editing ? 'Save correction' : 'Record entry'}</button></>}
    >
      <form id="register-form" className="stack" onSubmit={submit}>
        {!editing && <div className="seg-scroll"><Segmented value={kind} onChange={(k) => { setKind(k); setDetails({}); }} options={REGISTER_KINDS.map((k) => ({ value: k, label: SHORT[k] }))} /></div>}
        {editing && <p className="callout small">The register keeps the original: each change is written into the entry as a dated note with your name.</p>}
        <div className="grid cols-2">
          <PersonLink label={kind === 'marriage' ? 'Bridegroom in People' : 'Person in People'} person={person} onClear={() => setPerson(null)} onPick={(p, birthDate) => {
            setPerson(p);
            setForm((f) => ({ ...f, name: f.name || p.name }));
            if (birthDate && fields.some((x) => x.key === 'birthDate')) setDetails((d) => ({ ...d, birthDate: d.birthDate || birthDate }));
          }} />
          <Field label={L.person} error={err.name}><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          {kind === 'marriage' && <PersonLink label="Bride in People" person={spouse} onClear={() => setSpouse(null)} onPick={(p) => { setSpouse(p); setDetails((d) => ({ ...d, brideName: d.brideName || p.name })); }} />}
          <Field label={L.date} error={err.date}><input className="input" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
          <Field label="Place" hint="Leave empty for this church"><input className="input" value={form.place} onChange={(e) => setForm({ ...form, place: e.target.value })} /></Field>
          <Field label={kind === 'transfer' ? 'Signed by' : 'Officiating minister'}><input className="input" value={form.officiant} onChange={(e) => setForm({ ...form, officiant: e.target.value })} placeholder="Rev. …" /></Field>
        </div>
        {groups.map((g) => (
          <div key={g || 'main'} className="stack" style={{ gap: 8 }}>
            {g && <h3 className="small" style={{ textTransform: 'uppercase', letterSpacing: '.06em' }}>{g}</h3>}
            <div className="grid cols-2">
              {fields.filter((f) => (f.group ?? '') === g).map((f) => (
                <Field key={f.key} label={`${f.label}${f.required ? '' : ' (optional)'}`} error={err[f.key]}>
                  <DetailInput f={f} value={details[f.key] ?? ''} onChange={(v) => setDetails((d) => ({ ...d, [f.key]: v }))} />
                </Field>
              ))}
            </div>
          </div>
        ))}
        <Field label="Remarks (optional)"><textarea className="input" rows={2} value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} /></Field>
        {kind === 'transfer' && !editing && person && (
          <label className="row small" style={{ gap: 8 }}><input type="checkbox" checked={markInactive} onChange={(e) => setMarkInactive(e.target.checked)} /> Mark {person.name} as inactive (transferred)</label>
        )}
        {editing && <Field label="Reason for the correction"><input className="input" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="e.g. Spelling as in the birth certificate" /></Field>}
        <FormError error={save.error} />
      </form>
    </Modal>
  );
}

function EntryDrawer({ entry, onClose, onChanged, onPrint }: { entry: RegisterEntry; onClose: () => void; onChanged: (e: RegisterEntry) => void; onPrint: (c: Certificate) => void }) {
  const can = useCan();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState('');
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState('');
  const addNote = useAction(AdminApi.registers.note);
  const doVoid = useAction(AdminApi.registers.void);
  const print = useAction(AdminApi.registers.certificate);
  const L = REGISTER_LABELS[entry.kind];
  const isVoid = entry.status === 'void';

  return (
    <>
      <Modal side title={<span>{entry.number} {isVoid && <span className="badge danger">Void</span>}</span>} onClose={onClose}>
        <div className="stack">
          <div>
            <div className="small muted">{L.name}</div>
            <h3 style={{ margin: '2px 0' }}>{entry.name}{entry.kind === 'marriage' && entry.details.brideName ? ` & ${entry.details.brideName}` : ''}</h3>
            <div className="small muted">{day(entry.date)} · {entry.place}{entry.officiant ? ` · ${entry.officiant}` : ''}</div>
          </div>
          <div className="row wrap" style={{ gap: 8 }}>
            {!isVoid && <button className="btn primary sm" disabled={print.busy} onClick={async () => { const c = await print.run(entry.id); if (c) { onPrint(c); onChanged(c.entry); } }}><Printer size={15} /> {entry.kind === 'transfer' ? 'Print letter' : 'Print certificate'}</button>}
            {!isVoid && can('people.edit') && <button className="btn sm" onClick={() => setEditing(true)}><Pencil size={15} /> Correct</button>}
            {!isVoid && can('people.edit') && <button className="btn ghost sm" onClick={() => setVoiding(true)}><Trash2 size={15} /> Void</button>}
          </div>
          <FormError error={print.error} />
          {voiding && (
            <div className="callout stack" style={{ gap: 8 }}>
              <strong className="small">Void this entry?</strong>
              <span className="small muted">It stays in the register with its number, marked void. Only a pastor or admin can do this.</span>
              <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason, e.g. Entered twice" autoFocus />
              <FormError error={doVoid.error} />
              <div className="row" style={{ gap: 8 }}>
                <button className="btn danger sm" disabled={!reason.trim() || doVoid.busy} onClick={async () => { const e = await doVoid.run(entry.id, reason.trim()); if (e) { setVoiding(false); onChanged(e); toast(`${e.number} marked void`); } }}>Void entry</button>
                <button className="btn ghost sm" onClick={() => setVoiding(false)}>Keep</button>
              </div>
            </div>
          )}
          {isVoid && entry.voidReason && <p className="callout small">Void: {entry.voidReason}</p>}
          <dl className="register-dl">
            {REGISTER_FIELDS[entry.kind].filter((f) => entry.details[f.key]).map((f) => (
              <div key={f.key}><dt>{f.group && f.key !== 'brideName' ? `${f.label} (${f.group.toLowerCase()})` : f.label}</dt><dd>{f.type === 'date' ? day(entry.details[f.key]) : entry.details[f.key]}</dd></div>
            ))}
            {entry.remarks && <div><dt>Remarks</dt><dd>{entry.remarks}</dd></div>}
            <div><dt>Recorded</dt><dd>{formatDate(entry.createdAt)} by {entry.createdBy}</dd></div>
            <div><dt>Certificates issued</dt><dd>{entry.certificatesIssued}</dd></div>
          </dl>
          {(entry.personId || entry.spouseId) && (
            <div className="row wrap small" style={{ gap: 10 }}>
              {entry.personId && <Link to={`/admin/people/${entry.personId}`}>Open {entry.name}’s profile</Link>}
              {entry.spouseId && <Link to={`/admin/people/${entry.spouseId}`}>Open {entry.details.brideName}’s profile</Link>}
            </div>
          )}
          <div className="stack" style={{ gap: 8 }}>
            <h3 className="small" style={{ textTransform: 'uppercase', letterSpacing: '.06em' }}>Notes in the margin</h3>
            {entry.notes.length === 0 && <p className="small muted">No notes. Corrections are written here automatically.</p>}
            {entry.notes.map((n, i) => (
              <div key={i} className="callout small"><div>{n.text}</div><div className="muted">{formatDate(n.at)} · {n.by}</div></div>
            ))}
            {can('people.edit') && (
              <form className="row" style={{ gap: 8 }} onSubmit={async (e) => { e.preventDefault(); const r = await addNote.run(entry.id, note.trim()); if (r) { setNote(''); onChanged(r); } }}>
                <input className="input grow" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note, e.g. Certificate sent to the diocese" />
                <button className="btn sm" disabled={!note.trim() || addNote.busy}><StickyNote size={15} /> Add</button>
              </form>
            )}
          </div>
        </div>
      </Modal>
      {editing && <EntryForm initialKind={entry.kind} entry={entry} onClose={() => setEditing(false)} onSaved={(e) => { setEditing(false); onChanged(e); toast('Correction saved'); }} />}
    </>
  );
}

/** A full-page certificate or letter. Printing hides everything else on the page. */
function CertificateSheet({ cert, onClose }: { cert: Certificate; onClose: () => void }) {
  useEffect(() => {
    document.body.classList.add('cert-open');
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.classList.remove('cert-open');
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  const c = cert.church;
  return createPortal(
    <div className="cert-overlay">
      <div className="cert-bar no-print">
        <span className="grow small">{cert.copy > 1 ? `Copy ${cert.copy} of this ${cert.entry.kind === 'transfer' ? 'letter' : 'certificate'}` : 'Ready to print on A4'}</span>
        <button className="btn primary sm" onClick={() => window.print()}><Printer size={15} /> Print</button>
        <button className="btn ghost sm" onClick={onClose}>Close</button>
      </div>
      <article className={`cert-page ${cert.letter ? 'letter' : ''}`}>
        <header className="cert-head">
          {c.logoUrl && <img src={c.logoUrl} alt="" className="cert-logo" />}
          <h1>{c.name}</h1>
          <p>{[c.address, c.phone, c.email].filter(Boolean).join(' · ')}</p>
        </header>
        <h2 className="cert-title">{cert.title}</h2>
        {cert.letter ? (
          <>
            <p className="cert-ref">Ref. {cert.entry.number} · {day(cert.issuedAt)}</p>
            {cert.letter.split('\n\n').map((para, i) => <p key={i} className="cert-para">{para.split('\n').map((line, j) => <span key={j}>{line}<br /></span>)}</p>)}
          </>
        ) : (
          <>
            <p className="cert-lead">This is to certify that the following is a true extract from the {REGISTER_LABELS[cert.entry.kind].name.toLowerCase()} kept at {c.name}.</p>
            <table className="cert-table"><tbody>{cert.rows.map((r) => <tr key={r.label}><th>{r.label}</th><td>{r.value}</td></tr>)}</tbody></table>
          </>
        )}
        <footer className="cert-foot">
          <div><div className="cert-sign" />Seal of the church</div>
          <div><div className="cert-sign" />{cert.entry.kind === 'transfer' ? cert.entry.officiant || 'Pastor' : 'Pastor / Presbyter'}</div>
        </footer>
        <p className="cert-meta">Issued on {day(cert.issuedAt)}{cert.copy > 1 ? ` · Copy ${cert.copy}` : ''} · Entry {cert.entry.number}</p>
      </article>
    </div>,
    document.body,
  );
}
