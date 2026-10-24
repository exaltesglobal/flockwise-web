import { CheckCircle2, Download, FileSpreadsheet, Upload } from 'lucide-react';
import Papa from 'papaparse';
import { useRef, useState, type DragEvent } from 'react';
import { Link } from 'react-router';

import type { Currency, GiftImportResult, ImportResult, ImportSource } from '@/api/admin-types';
import { adminSession } from '@/api/client';
import { AdminApi } from '@/api/endpoints';
import { Field, FormError, Segmented } from '@/components/ui';
import {
  detectKind,
  GIFT_TARGETS,
  guessColumns,
  IMPORT_SOURCES,
  PEOPLE_TARGETS,
  rowsToGifts,
  rowsToPeople,
  type GiftTarget,
  type ImportKind,
  type PeopleTarget,
} from '@/core/import-presets';
import { downloadCsv, formatMoney } from '@/lib/format';
import { useAction } from '@/lib/use-api';

import { PageHeader } from '../layout';

type Sheet = { headers: string[]; rows: string[][]; fileName: string };
type Target = PeopleTarget | GiftTarget;

const KIND_HELP: Record<ImportKind, string> = {
  people: 'One person per row. Households, groups and campuses in the file are created for you.',
  gifts: 'One gift per row. Funds are created by name, donors are matched to people already in Flockwise, and nothing is imported twice.',
};

const TEMPLATES: Record<ImportKind, string[][]> = {
  people: [
    ['First name', 'Last name', 'Mobile', 'Email', 'Status', 'Gender', 'Date of birth', 'Family ID', 'Family relationship', 'Address', 'Groups', 'Campus', 'Tags'],
    ['Priya', 'Thomas', '9876543210', 'priya@example.com', 'Member', 'Female', '24/10/1991', 'THOMAS', 'Primary', 'Kondapur, Hyderabad', 'Choir, Ushers', '', 'Youth'],
    ['Arun', 'Thomas', '9876543211', '', 'Member', 'Male', '02/05/1989', 'THOMAS', 'Spouse', 'Kondapur, Hyderabad', '', '', ''],
  ],
  gifts: [
    ['Date', 'Donor name', 'Mobile', 'Email', 'Amount', 'Fund', 'Payment method', 'Receipt number'],
    ['05/04/2026', 'Priya Thomas', '9876543210', 'priya@example.com', '2500', 'Tithes & Offerings', 'UPI', '2026-27/00012'],
    ['12/04/2026', 'Ravi Kumar', '', '', '1000', 'Building Fund', 'Cheque', '2026-27/00013'],
  ],
};

export function ImportPage() {
  const [source, setSource] = useState<ImportSource>('excel');
  const [kind, setKind] = useState<ImportKind>('people');
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [mapping, setMapping] = useState<Target[]>([]);
  const [dedupeBy, setDedupeBy] = useState<'phone' | 'email'>('phone');
  const [over, setOver] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [result, setResult] = useState<{ kind: 'people'; r: ImportResult } | { kind: 'gifts'; r: GiftImportResult } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const importPeople = useAction(AdminApi.people.import);
  const importGifts = useAction(AdminApi.giving.import);
  const currency = (adminSession.get()?.church.currency ?? 'INR') as Currency;

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
      const detected = detectKind(headers);
      setKind(detected);
      setSheet({ headers, rows, fileName: file.name });
      setMapping(guessColumns(detected, headers));
    } catch (e) {
      setReadError(e instanceof Error ? e.message : 'Could not read that file.');
    }
  }

  function switchKind(k: ImportKind) {
    setKind(k);
    if (sheet) setMapping(guessColumns(k, sheet.headers));
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setOver(false);
    const f = e.dataTransfer.files[0];
    if (f) void readFile(f);
  }

  const people = sheet && kind === 'people' ? rowsToPeople(source, mapping as PeopleTarget[], sheet.rows) : [];
  const gifts = sheet && kind === 'gifts' ? rowsToGifts(source, mapping as GiftTarget[], sheet.rows) : { gifts: [], problems: [] };
  const hasName = mapping.includes('firstName') || mapping.includes('fullName');
  const missingName = people.filter((p) => !p.firstName).length;
  const households = new Set(people.map((p) => p.householdKey?.trim().toLowerCase()).filter(Boolean)).size;
  const groupNames = new Set(people.flatMap((p) => p.groups ?? []).map((g) => g.toLowerCase())).size;
  const giftTotal = gifts.gifts.reduce((s, g) => s + g.amount, 0);
  const fundNames = [...new Set(gifts.gifts.map((g) => g.fundName))];
  const hasAmount = mapping.includes('amount') && mapping.includes('date');
  const targets = kind === 'people' ? PEOPLE_TARGETS : GIFT_TARGETS;
  const step = result ? 3 : sheet ? 2 : 1;
  const busy = importPeople.busy || importGifts.busy;
  const help = IMPORT_SOURCES.find((s) => s.value === source)!;

  return (
    <>
      <PageHeader title="Import" subtitle="Bring your member list and past gifts across from Excel, Google Sheets, Planning Center or Elvanto. Nothing is changed until you press Import." />

      <div className="steps">
        <span className={step >= 1 ? 'on' : ''}><b>1</b> Upload</span><i />
        <span className={step >= 2 ? 'on' : ''}><b>2</b> Match columns</span><i />
        <span className={step >= 3 ? 'on' : ''}><b>3</b> Done</span>
      </div>

      {result ? (
        <div className="card card-pad stack" style={{ alignItems: 'flex-start' }}>
          <div className="row"><CheckCircle2 color="var(--ok)" /><h2>Import finished</h2></div>
          {result.kind === 'people' ? (
            <>
              <p>
                <b>{result.r.created}</b> added, <b>{result.r.updated}</b> updated, <b>{result.r.skipped}</b> unchanged
                {result.r.errors.length > 0 && <>, <b style={{ color: 'var(--danger)' }}>{result.r.errors.length}</b> skipped with problems</>}.
              </p>
              {(result.r.households || result.r.groups?.length || result.r.campuses?.length) ? (
                <p className="small muted">
                  {result.r.households ? `${result.r.households} households linked. ` : ''}
                  {result.r.groups?.length ? `Groups created: ${result.r.groups.join(', ')}. ` : ''}
                  {result.r.campuses?.length ? `Campuses created: ${result.r.campuses.join(', ')}.` : ''}
                </p>
              ) : null}
            </>
          ) : (
            <>
              <p>
                <b>{result.r.created}</b> gifts added worth <b>{formatMoney(result.r.total, currency)}</b>, <b>{result.r.duplicates}</b> already there
                {result.r.errors.length > 0 && <>, <b style={{ color: 'var(--danger)' }}>{result.r.errors.length}</b> skipped with problems</>}.
              </p>
              <p className="small muted">
                {result.r.matched} matched to people in Flockwise, {result.r.unmatched} kept by name only.
                {result.r.funds.length ? ` Funds created: ${result.r.funds.join(', ')}.` : ''} Imported gifts keep the receipt numbers in your file; none are issued again.
              </p>
            </>
          )}
          {result.r.errors.length > 0 && (
            <ul className="small muted">
              {result.r.errors.slice(0, 10).map((er) => <li key={er.row}>Row {er.row + 1}: {er.message}</li>)}
            </ul>
          )}
          <div className="row">
            <Link to={result.kind === 'people' ? '/admin/people' : '/admin/giving'} className="btn primary">{result.kind === 'people' ? 'See people' : 'See giving'}</Link>
            <button className="btn" onClick={() => { setSheet(null); setResult(null); }}>Import another file</button>
          </div>
        </div>
      ) : !sheet ? (
        <div className="card card-pad stack lg">
          <Field label="Where is your file coming from?">
            <div><Segmented value={source} onChange={setSource} options={IMPORT_SOURCES.map(({ value, label }) => ({ value, label }))} /></div>
          </Field>
          <Field label="What is in it?">
            <div><Segmented value={kind} onChange={switchKind} options={[{ value: 'people', label: 'People' }, { value: 'gifts', label: 'Past gifts' }]} /></div>
          </Field>
          <p className="small muted">{kind === 'people' ? help.people : help.gifts} {KIND_HELP[kind]}</p>
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
            <button className="btn ghost sm" onClick={() => downloadCsv(kind === 'people' ? 'flockwise-people-template.csv' : 'flockwise-gifts-template.csv', TEMPLATES[kind])}>Download a template</button>
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
              <div className="row">
                <Segmented value={kind} onChange={switchKind} options={[{ value: 'people', label: 'People' }, { value: 'gifts', label: 'Past gifts' }]} />
                <button className="btn sm" onClick={() => setSheet(null)}>Choose a different file</button>
              </div>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Column in your file</th>
                    <th>Example</th>
                    <th style={{ width: 260 }}>Flockwise field</th>
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
                          {targets.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                        {targets.find((t) => t.value === mapping[i])?.hint && <div className="small muted">{targets.find((t) => t.value === mapping[i])!.hint}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {kind === 'people' ? (
            <div className="card">
              <div className="card-head">
                <h2>Preview</h2>
                <span className="small muted">
                  First 5 of {people.length}{households ? ` · ${households} households` : ''}{groupNames ? ` · ${groupNames} groups` : ''}
                </span>
              </div>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Name</th><th>Mobile</th><th>Email</th><th>Status</th><th>Household</th><th>Groups</th><th>Birth date</th></tr></thead>
                  <tbody>
                    {people.slice(0, 5).map((p, i) => (
                      <tr key={i}>
                        <td>{p.firstName || <span style={{ color: 'var(--danger)' }}>Missing</span>} {p.lastName || <span style={{ color: 'var(--danger)' }}>Missing</span>}</td>
                        <td className="mono">{p.phone ?? '—'}</td>
                        <td>{p.email ?? '—'}</td>
                        <td>{p.status ?? 'visitor'}</td>
                        <td>{p.householdName ?? (p.householdKey ? `#${p.householdKey}` : '—')}</td>
                        <td>{p.groups?.join(', ') ?? '—'}</td>
                        <td>{p.birthDate ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="card">
              <div className="card-head">
                <h2>Preview</h2>
                <span className="small muted">First 5 of {gifts.gifts.length} · {formatMoney(giftTotal, currency)}{fundNames.length ? ` · funds: ${fundNames.join(', ')}` : ''}</span>
              </div>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Date</th><th>Donor</th><th>Amount</th><th>Fund</th><th>Method</th><th>Receipt / ref</th></tr></thead>
                  <tbody>
                    {gifts.gifts.slice(0, 5).map((g, i) => (
                      <tr key={i}>
                        <td>{g.date}</td>
                        <td>{g.donorName}{g.donorEmail ? <span className="small muted"> · {g.donorEmail}</span> : g.donorPhone ? <span className="small muted mono"> · {g.donorPhone}</span> : null}</td>
                        <td className="mono">{formatMoney(g.amount, currency)}</td>
                        <td>{g.fundName}</td>
                        <td>{g.method.replace('_', ' ')}</td>
                        <td className="mono">{g.reference ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="card card-pad stack">
            {kind === 'people' ? (
              <>
                <Field label="If someone is already in Flockwise, match them by" hint="Matched people are updated instead of added twice. A column matched to “ID from the old system” is checked first.">
                  <div><Segmented value={dedupeBy} onChange={setDedupeBy} options={[{ value: 'phone', label: 'Mobile number' }, { value: 'email', label: 'Email' }]} /></div>
                </Field>
                {!hasName && <div className="alert warn">Match a column to First name or Full name to continue.</div>}
                {hasName && missingName > 0 && <div className="alert warn">{missingName} rows have no name and will be skipped.</div>}
              </>
            ) : (
              <>
                {!hasAmount && <div className="alert warn">Match a column to Date and one to Amount to continue.</div>}
                {hasAmount && gifts.problems.length > 0 && <div className="alert warn">{gifts.problems.length} rows will be skipped (no amount, or a date that could not be read).</div>}
                <p className="small muted">Donors are matched to people already in Flockwise by their old ID, email, mobile or exact name, so import people first. Gifts keep the receipt numbers in the file and get no new ones.</p>
              </>
            )}
            <FormError error={importPeople.error ?? importGifts.error} />
            <div>
              {kind === 'people' ? (
                <button className="btn primary lg" disabled={!hasName || busy} onClick={async () => {
                  const r = await importPeople.run(people, source, dedupeBy);
                  if (r) setResult({ kind: 'people', r });
                }}>
                  <Upload size={16} /> {busy ? 'Importing…' : `Import ${people.length} people`}
                </button>
              ) : (
                <button className="btn primary lg" disabled={!hasAmount || gifts.gifts.length === 0 || busy} onClick={async () => {
                  const r = await importGifts.run(gifts.gifts, source);
                  if (r) setResult({ kind: 'gifts', r });
                }}>
                  <Upload size={16} /> {busy ? 'Importing…' : `Import ${gifts.gifts.length} gifts`}
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
