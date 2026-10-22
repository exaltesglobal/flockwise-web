import { CheckCircle2, Download, FileSpreadsheet, Upload } from 'lucide-react';
import Papa from 'papaparse';
import { useRef, useState, type DragEvent } from 'react';
import { Link } from 'react-router';

import type { ImportResult, ImportSource, PersonInput, PersonStatus } from '@/api/admin-types';
import { AdminApi } from '@/api/endpoints';
import { Field, FormError, Segmented } from '@/components/ui';
import { downloadCsv } from '@/lib/format';
import { useAction } from '@/lib/use-api';

import { PageHeader } from '../layout';

type Target = 'firstName' | 'lastName' | 'fullName' | 'phone' | 'email' | 'status' | 'gender' | 'birthDate' | 'householdName' | 'address' | 'tags' | '';

const TARGETS: { value: Target; label: string; synonyms: string[] }[] = [
  { value: 'firstName', label: 'First name', synonyms: ['first name', 'firstname', 'given name', 'first'] },
  { value: 'lastName', label: 'Last name', synonyms: ['last name', 'lastname', 'surname', 'family name', 'last'] },
  { value: 'fullName', label: 'Full name (split)', synonyms: ['name', 'full name', 'member name', 'naam'] },
  { value: 'phone', label: 'Mobile', synonyms: ['mobile', 'phone', 'mobile number', 'mobile phone number', 'mobile phone', 'contact', 'contact number', 'whatsapp', 'cell'] },
  { value: 'email', label: 'Email', synonyms: ['email', 'e-mail', 'email address', 'home email', 'primary email'] },
  { value: 'status', label: 'Status', synonyms: ['status', 'membership', 'member status', 'category'] },
  { value: 'gender', label: 'Gender', synonyms: ['gender', 'sex'] },
  { value: 'birthDate', label: 'Birth date', synonyms: ['birthdate', 'birth date', 'date of birth', 'dob', 'birthday'] },
  { value: 'householdName', label: 'Household', synonyms: ['household', 'household name', 'family', 'family name'] },
  { value: 'address', label: 'Address', synonyms: ['address', 'home address', 'street', 'area', 'locality', 'city'] },
  { value: 'tags', label: 'Tags', synonyms: ['tags', 'ministry', 'ministries', 'department'] },
];

const SOURCES: { value: ImportSource; label: string; help: string }[] = [
  { value: 'excel', label: 'Excel', help: 'Any .xlsx sheet with one person per row and column headings in the first row.' },
  { value: 'csv', label: 'CSV / Google Sheets', help: 'In Google Sheets choose File → Download → Comma-separated values (.csv).' },
  { value: 'elvanto', label: 'Elvanto', help: 'In Elvanto go to People → Export, choose all fields, and upload the file here.' },
  { value: 'planning_center', label: 'Planning Center', help: 'In Planning Center People go to Lists or People → Export to CSV, and upload the file here.' },
];

type Sheet = { headers: string[]; rows: string[][]; fileName: string };

function guess(header: string): Target {
  const h = header.trim().toLowerCase().replace(/[_*]/g, ' ').replace(/\s+/g, ' ');
  for (const t of TARGETS) if (t.synonyms.includes(h)) return t.value;
  for (const t of TARGETS) if (t.synonyms.some((s) => s.length > 3 && h.includes(s))) return t.value;
  return '';
}

function normaliseStatus(v: string): PersonStatus | undefined {
  const s = v.toLowerCase();
  if (!s) return undefined;
  if (/inactive|left|moved|deceased|archiv/.test(s)) return 'inactive';
  if (/visit|guest|first|new/.test(s)) return 'visitor';
  if (/regular|attender|attendee/.test(s)) return 'regular';
  return 'member';
}

function normaliseDate(v: string) {
  if (!v) return undefined;
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  const m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/); // Indian format DD/MM/YYYY
  if (m) {
    const y = m[3].length === 2 ? `19${m[3]}` : m[3];
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
}

function normalisePhone(v: string) {
  const digits = v.replace(/\D/g, '');
  if (!digits) return undefined;
  if (digits.length === 10) return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`; // bare Indian mobile
  if (digits.length === 12 && digits.startsWith('91')) return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  return v.trim().startsWith('+') ? v.trim() : `+${digits}`;
}

function toPeople(sheet: Sheet, mapping: Target[]): PersonInput[] {
  return sheet.rows
    .map((row) => {
      const p: Record<string, unknown> = {};
      mapping.forEach((target, i) => {
        const raw = String(row[i] ?? '').trim();
        if (!target || !raw) return;
        if (target === 'fullName') {
          const parts = raw.split(/\s+/);
          p.firstName ??= parts[0];
          p.lastName ??= parts.slice(1).join(' ') || '';
        } else if (target === 'phone') p.phone = normalisePhone(raw);
        else if (target === 'status') p.status = normaliseStatus(raw);
        else if (target === 'birthDate') p.birthDate = normaliseDate(raw);
        else if (target === 'gender') p.gender = /^f/i.test(raw) ? 'female' : /^m/i.test(raw) ? 'male' : null;
        else if (target === 'tags') p.tags = raw.split(/[,;]/).map((t) => t.trim()).filter(Boolean);
        else p[target] = raw;
      });
      return p as PersonInput;
    })
    .filter((p) => Object.keys(p).length > 0);
}

export function ImportPage() {
  const [source, setSource] = useState<ImportSource>('excel');
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [mapping, setMapping] = useState<Target[]>([]);
  const [dedupeBy, setDedupeBy] = useState<'phone' | 'email'>('phone');
  const [over, setOver] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const doImport = useAction(AdminApi.people.import);

  async function readFile(file: File) {
    setReadError(null);
    setResult(null);
    try {
      let table: string[][];
      if (/\.xlsx$/i.test(file.name)) {
        const { readSheet } = await import('read-excel-file/browser');
        const data = await readSheet(file);
        table = data.map((r) => r.map((c) => (c instanceof Date ? c.toISOString().slice(0, 10) : c === null || c === undefined ? '' : String(c))));
      } else if (/\.(csv|txt)$/i.test(file.name)) {
        const text = await file.text();
        table = Papa.parse<string[]>(text, { skipEmptyLines: true }).data;
      } else {
        throw new Error('Please upload an .xlsx or .csv file. For old .xls files, open them in Excel and save as .xlsx first.');
      }
      const [headers = [], ...rows] = table;
      if (!rows.length) throw new Error('That file has no rows under the heading row.');
      setSheet({ headers, rows, fileName: file.name });
      setMapping(headers.map(guess));
    } catch (e) {
      setReadError(e instanceof Error ? e.message : 'Could not read that file.');
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setOver(false);
    const f = e.dataTransfer.files[0];
    if (f) void readFile(f);
  }

  const people = sheet ? toPeople(sheet, mapping) : [];
  const hasName = mapping.includes('firstName') || mapping.includes('fullName');
  const missingName = people.filter((p) => !p.firstName).length;
  const step = result ? 3 : sheet ? 2 : 1;

  return (
    <>
      <PageHeader title="Import people" subtitle="Bring your existing member list across in a couple of minutes. Nothing is changed until you press Import." />

      <div className="steps">
        <span className={step >= 1 ? 'on' : ''}><b>1</b> Upload</span><i />
        <span className={step >= 2 ? 'on' : ''}><b>2</b> Match columns</span><i />
        <span className={step >= 3 ? 'on' : ''}><b>3</b> Done</span>
      </div>

      {result ? (
        <div className="card card-pad stack" style={{ alignItems: 'flex-start' }}>
          <div className="row"><CheckCircle2 color="var(--ok)" /><h2>Import finished</h2></div>
          <p>
            <b>{result.created}</b> added, <b>{result.updated}</b> updated, <b>{result.skipped}</b> unchanged
            {result.errors.length > 0 && <>, <b style={{ color: 'var(--danger)' }}>{result.errors.length}</b> skipped with problems</>}.
          </p>
          {result.errors.length > 0 && (
            <ul className="small muted">
              {result.errors.slice(0, 10).map((er) => <li key={er.row}>Row {er.row + 1}: {er.message}</li>)}
            </ul>
          )}
          <div className="row">
            <Link to="/admin/people" className="btn primary">See people</Link>
            <button className="btn" onClick={() => { setSheet(null); setResult(null); }}>Import another file</button>
          </div>
        </div>
      ) : !sheet ? (
        <div className="card card-pad stack lg">
          <Field label="Where is your list coming from?">
            <div><Segmented value={source} onChange={setSource} options={SOURCES.map(({ value, label }) => ({ value, label }))} /></div>
          </Field>
          <p className="small muted">{SOURCES.find((s) => s.value === source)!.help}</p>
          <div
            className={`dropzone ${over ? 'over' : ''}`}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={onDrop}
          >
            <FileSpreadsheet size={36} color="var(--primary)" />
            <h3>Drop your .xlsx or .csv file here</h3>
            <p className="small muted">or click to choose a file. It is read in your browser first so you can check it.</p>
            <input ref={fileRef} type="file" accept=".xlsx,.csv,.txt" hidden onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])} />
          </div>
          {readError && <div className="alert error">{readError}</div>}
          <div className="row small muted">
            <Download size={15} />
            <button className="btn ghost sm" onClick={() => downloadCsv('flockwise-import-template.csv', [
              ['First name', 'Last name', 'Mobile', 'Email', 'Status', 'Gender', 'Date of birth', 'Household', 'Address', 'Tags'],
              ['Priya', 'Thomas', '9876543210', 'priya@example.com', 'Member', 'Female', '24/10/1991', 'Thomas family', 'Kondapur, Hyderabad', 'Choir'],
            ])}>Download a template</button>
            <span>if you are starting from scratch.</span>
          </div>
        </div>
      ) : (
        <>
          <div className="card">
            <div className="card-head">
              <div>
                <h2>{sheet.fileName}</h2>
                <p className="small muted">{sheet.rows.length} rows found. Check each column is matched to the right field.</p>
              </div>
              <button className="btn sm" onClick={() => setSheet(null)}>Choose a different file</button>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Column in your file</th>
                    <th>Example</th>
                    <th style={{ width: 240 }}>Flockwise field</th>
                  </tr>
                </thead>
                <tbody>
                  {sheet.headers.map((h, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{h || <span className="muted">(no heading)</span>}</td>
                      <td className="small muted ellipsis" style={{ maxWidth: 260 }}>{sheet.rows.find((r) => r[i])?.[i] ?? ''}</td>
                      <td>
                        <select className="select" value={mapping[i]} onChange={(e) => setMapping((m) => m.map((x, j) => (j === i ? (e.target.value as Target) : x)))}>
                          <option value="">Don't import</option>
                          {TARGETS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <div className="card-head"><h2>Preview</h2><span className="small muted">First 5 of {people.length}</span></div>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Name</th><th>Mobile</th><th>Email</th><th>Status</th><th>Household</th><th>Birth date</th></tr></thead>
                <tbody>
                  {people.slice(0, 5).map((p, i) => (
                    <tr key={i}>
                      <td>{p.firstName || <span style={{ color: 'var(--danger)' }}>Missing</span>} {p.lastName}</td>
                      <td className="mono">{p.phone ?? '—'}</td>
                      <td>{p.email ?? '—'}</td>
                      <td>{p.status ?? 'visitor'}</td>
                      <td>{p.householdName ?? '—'}</td>
                      <td>{p.birthDate ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card card-pad stack">
            <Field label="If someone is already in Flockwise, match them by" hint="Matched people are updated instead of added twice.">
              <div><Segmented value={dedupeBy} onChange={setDedupeBy} options={[{ value: 'phone', label: 'Mobile number' }, { value: 'email', label: 'Email' }]} /></div>
            </Field>
            {!hasName && <div className="alert warn">Match a column to First name or Full name to continue.</div>}
            {hasName && missingName > 0 && <div className="alert warn">{missingName} rows have no name and will be skipped.</div>}
            <FormError error={doImport.error} />
            <div>
              <button className="btn primary lg" disabled={!hasName || doImport.busy} onClick={async () => {
                const r = await doImport.run(people, source, dedupeBy);
                if (r) setResult(r);
              }}>
                <Upload size={16} /> {doImport.busy ? 'Importing…' : `Import ${people.length} people`}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
