// The denomination's annual return, filled in from the records. Pick the body's form (CSI, CNI,
// AG, Methodist, Baptist, Pentecostal, Mar Thoma, Lutheran or a plain one) and the year; every
// line that the data knows is already there, the office types the few it alone knows (the
// diocesan quota, property, office bearers), overrides anything, prints the form or downloads the
// CSV, and marks it submitted, which freezes the figures for the record.
import { Download, Lock, LockOpen, Printer, RotateCcw, Save } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { adminSession } from '@/api/client';
import type { AnnualReturnView, ReturnHeader, ReturnLineView } from '@/api/admin-types';
import { AdminApi } from '@/api/endpoints';
import { ChurchLogo } from '@/components/brand';
import { ErrorState, Field, FormError, Loading, Modal, useToast } from '@/components/ui';
import { formatDate, formatMoney } from '@/lib/format';
import { useSession } from '@/lib/session';
import { useAction, useApi } from '@/lib/use-api';

import { PageHeader } from '../layout';

const HEADER_FIELDS: { key: keyof ReturnHeader; label: string; hint?: string }[] = [
  { key: 'body', label: 'Church body' },
  { key: 'above', label: 'Diocese / district / section', hint: 'The level this return goes to' },
  { key: 'unit', label: 'Pastorate / church / parish' },
  { key: 'code', label: 'Code or register number', hint: 'If the body gives one' },
  { key: 'minister', label: 'Minister in charge' },
  { key: 'preparedBy', label: 'Prepared by' },
];

/** What the input shows for a saved value: money in rupees, numbers and text as they are. */
const toInput = (l: ReturnLineView, v: number | string | null) => (v === null || v === undefined ? '' : l.kind === 'money' && typeof v === 'number' ? String(v / 100) : String(v));
const fromInput = (l: ReturnLineView, s: string): number | string | null => {
  if (s.trim() === '') return null;
  if (l.kind === 'text') return s;
  const n = Number(s);
  return Number.isFinite(n) ? (l.kind === 'money' ? Math.round(n * 100) : n) : s;
};

function yearLabel(view: AnnualReturnView, y: number) {
  return view.label.includes('-') ? `${y}-${String(y + 1).slice(2)}` : String(y);
}

export function AnnualReturnPage() {
  const session = useSession(adminSession);
  const toast = useToast();
  const [pick, setPick] = useState<{ template?: string; year?: number }>({});
  const templates = useApi(AdminApi.annualReturn.templates);
  const { data, error, reload, setData } = useApi(() => AdminApi.annualReturn.get(pick.template, pick.year), [pick.template, pick.year]);

  // The office's own figures, as typed. Empty means "use the data".
  const [values, setValues] = useState<Record<string, string>>({});
  const [header, setHeader] = useState<ReturnHeader | null>(null);
  const [notes, setNotes] = useState('');
  const [dirty, setDirty] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  useEffect(() => {
    if (!data) return;
    const next: Record<string, string> = {};
    for (const s of data.sections) for (const l of s.lines) next[l.key] = l.source === 'manual' || l.overridden ? toInput(l, l.value) : '';
    setValues(next);
    setHeader(data.header);
    setNotes(data.return?.notes ?? '');
    setDirty(false);
  }, [data]);

  const save = useAction(async () => {
    if (!data || !header) return;
    const out: Record<string, string | number | null> = {};
    for (const s of data.sections) for (const l of s.lines) out[l.key] = fromInput(l, values[l.key] ?? '');
    const v = await AdminApi.annualReturn.save({ template: data.template.id, year: data.year, values: out, header, notes });
    setData(v);
    toast('Saved');
    return v;
  });
  const submit = useAction(async () => {
    if (!data) return;
    if (dirty) { const saved = await save.run(); if (!saved) return; }
    const v = await AdminApi.annualReturn.submit(data.template.id, data.year);
    setData(v);
    setConfirmSubmit(false);
    toast('Marked as submitted. The figures are frozen.');
  });
  const reopen = useAction(async () => {
    if (!data) return;
    setData(await AdminApi.annualReturn.reopen(data.template.id, data.year));
    toast('Reopened. The figures are live again.');
  });
  const download = useAction(async () => {
    if (!data) return;
    const { csv } = await AdminApi.annualReturn.exportCsv(data.template.id, data.year);
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    Object.assign(document.createElement('a'), { href: url, download: `${data.template.id}-annual-return-${data.label}.csv` }).click();
    URL.revokeObjectURL(url);
  });

  const years = useMemo(() => {
    if (!data) return [];
    const set = new Map<number, string>();
    for (let y = data.year + 1; y >= data.year - 5; y--) set.set(y, yearLabel(data, y));
    for (const y of data.years) set.set(y.year, y.label);
    return [...set.entries()].sort((a, b) => b[0] - a[0]).map(([year, label]) => ({ year, label, status: data.years.find((x) => x.year === year)?.status }));
  }, [data]);

  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data || !header) return <Loading />;
  const frozen = data.return?.status === 'submitted';
  const setValue = (key: string, v: string) => { setValues((cur) => ({ ...cur, [key]: v })); setDirty(true); };
  const lineOf = (key: string) => data.sections.flatMap((s) => s.lines).find((l) => l.key === key);
  const show = (l: ReturnLineView, v: number | string | null) => (v === null || v === undefined || v === '' ? '—' : l.kind === 'money' && typeof v === 'number' ? formatMoney(v, data.currency) : typeof v === 'number' ? v.toLocaleString('en-IN') : String(v));
  const shown = (l: ReturnLineView) => { const own = fromInput(l, values[l.key] ?? ''); return own === null ? l.auto : own; };

  return (
    <>
      <div className="ar-screen">
        <PageHeader
          title="Annual return"
          subtitle="The statement your diocese, district or section asks for every year, filled in from your records. Check each line, type the few only the office knows, then print it or send the CSV."
          actions={
            <>
              <button className="btn" onClick={() => void download.run()} disabled={download.busy}><Download size={15} /> CSV</button>
              <button className="btn" onClick={() => window.print()}><Printer size={15} /> Print</button>
              {frozen ? (
                <button className="btn" onClick={() => void reopen.run()} disabled={reopen.busy}><LockOpen size={15} /> Reopen</button>
              ) : (
                <>
                  <button className="btn" onClick={() => void save.run()} disabled={save.busy || !dirty}><Save size={15} /> {save.busy ? 'Saving…' : dirty ? 'Save' : 'Saved'}</button>
                  <button className="btn primary" onClick={() => setConfirmSubmit(true)} disabled={submit.busy}><Lock size={15} /> Mark as submitted</button>
                </>
              )}
            </>
          }
        />
        <FormError error={save.error ?? submit.error ?? reopen.error ?? download.error} />

        <div className="card card-pad stack" style={{ gap: 14 }}>
          <div className="grid cols-3">
            <Field label="Form">
              <select value={data.template.id} onChange={(e) => setPick({ template: e.target.value, year: data.year })}>
                {(templates.data ?? [{ id: data.template.id, name: data.template.name, body: data.template.body, unit: data.template.unit, above: data.template.above, lines: 0 }]).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </Field>
            <Field label="Year" hint={`${formatDate(data.from)} to ${formatDate(data.to)}`}>
              <select value={data.year} onChange={(e) => setPick({ template: data.template.id, year: Number(e.target.value) })}>
                {years.map((y) => <option key={y.year} value={y.year}>{y.label}{y.status ? ` · ${y.status}` : ''}</option>)}
              </select>
            </Field>
            <div className="field">
              <span>Status</span>
              {frozen ? (
                <span className="small"><span className="badge ok">Submitted</span> {data.return?.submittedAt ? `${formatDate(data.return.submittedAt)} by ${data.return.submittedBy}` : ''}<br /><span className="muted">The figures are frozen as they were that day. Reopen to change them.</span></span>
              ) : data.return ? (
                <span className="small"><span className="badge warn">Draft</span> saved {formatDate(data.return.updatedAt)}<br /><span className="muted">Lines you leave blank follow the records as they change.</span></span>
              ) : (
                <span className="small"><span className="badge gray">Not started</span><br /><span className="muted">Every figure below is live from your records. Save once you have checked them.</span></span>
              )}
            </div>
          </div>
          <div className="grid cols-3">
            {HEADER_FIELDS.map((f) => (
              <Field key={f.key} label={f.label} hint={f.hint}>
                <input value={header[f.key]} disabled={frozen} onChange={(e) => { setHeader({ ...header, [f.key]: e.target.value }); setDirty(true); }} />
              </Field>
            ))}
          </div>
        </div>

        {data.sections.map((s) => (
          <div key={s.id} className="card" style={{ marginTop: 16 }}>
            <div className="card-pad row between"><h3>{s.title}</h3><span className="small muted">{s.lines.filter((l) => l.source === 'auto').length} from the data · {s.lines.filter((l) => l.source === 'manual').length} to type</span></div>
            <table className="table compact ar-table">
              <thead><tr><th>Line</th><th style={{ width: '22%' }}>From the records</th><th style={{ width: '30%' }}>On the return</th><th style={{ width: 40 }} /></tr></thead>
              <tbody>
                {s.lines.map((l) => {
                  const own = values[l.key] ?? '';
                  const overridden = l.source === 'auto' && own.trim() !== '';
                  return (
                    <tr key={l.key}>
                      <td><div>{l.label}</div>{l.hint && <div className="small muted">{l.hint}</div>}</td>
                      <td className={l.source === 'auto' ? '' : 'muted'}>{l.source === 'auto' ? <span className="ar-auto" style={overridden ? { textDecoration: 'line-through', opacity: 0.6 } : undefined}>{show(l, l.auto)}</span> : <span className="small">Office only</span>}</td>
                      <td>
                        {frozen ? (
                          <strong>{show(l, l.value)}</strong>
                        ) : l.kind === 'text' ? (
                          <textarea rows={own.length > 60 ? 3 : 1} value={own} placeholder={l.source === 'auto' ? toInput(l, l.auto) || '—' : 'Type it'} onChange={(e) => setValue(l.key, e.target.value)} />
                        ) : (
                          <div className="row" style={{ gap: 6 }}>
                            {l.kind === 'money' && <span className="muted">{formatMoney(0, data.currency).replace(/[\d.,\s]/g, '')}</span>}
                            <input type="number" inputMode="decimal" step={l.kind === 'money' ? '0.01' : '1'} value={own} placeholder={l.source === 'auto' ? toInput(l, l.auto) || '0' : '0'} onChange={(e) => setValue(l.key, e.target.value)} />
                          </div>
                        )}
                      </td>
                      <td>{overridden && !frozen && <button className="btn ghost sm" title="Back to the records' figure" onClick={() => setValue(l.key, '')}><RotateCcw size={14} /></button>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}

        <div className="card card-pad stack" style={{ marginTop: 16, gap: 8 }}>
          <Field label="Notes for the office" hint="Who checked the figures, what was left out, anything the body should know. Printed at the foot.">
            <textarea rows={3} value={notes} disabled={frozen} onChange={(e) => { setNotes(e.target.value); setDirty(true); }} />
          </Field>
        </div>
      </div>

      {/* The printed form. */}
      <div className="ar-print">
        <div className="ar-print-head">
          <ChurchLogo church={session?.church} size={56} />
          <div>
            <div className="ar-print-body">{header.body}</div>
            <h1>{data.template.name}</h1>
            <div className="ar-print-sub">{[header.above && `${data.template.above}: ${header.above}`, `${data.template.unit}: ${header.unit}`, header.code && `No. ${header.code}`].filter(Boolean).join(' · ')}</div>
            <div className="ar-print-sub">Year {data.label} ({formatDate(data.from)} to {formatDate(data.to)})</div>
          </div>
        </div>
        <div className="ar-print-church">{[data.church.name, data.church.address, data.church.city, data.church.phone, data.church.email].filter(Boolean).join(' · ')}</div>
        {data.sections.map((s) => (
          <table key={s.id} className="ar-print-table">
            <thead><tr><th colSpan={2}>{s.title}</th></tr></thead>
            <tbody>
              {s.lines.map((l) => <tr key={l.key}><td>{l.label}</td><td className="num">{show(l, frozen ? l.value : shown(l))}</td></tr>)}
            </tbody>
          </table>
        ))}
        {notes && <p className="ar-print-notes"><strong>Notes:</strong> {notes}</p>}
        <div className="ar-print-sign">
          <div><i /><span>{lineOf('minister')?.label ?? 'Minister in charge'}<br />{header.minister}</span></div>
          <div><i /><span>Secretary<br />{String(lineOf('secretary')?.value ?? '')}</span></div>
          <div><i /><span>Treasurer<br />{String(lineOf('treasurer')?.value ?? '')}</span></div>
          <div><i /><span>Prepared by<br />{header.preparedBy} · {formatDate(data.return?.submittedAt ?? new Date().toISOString())}</span></div>
        </div>
        <div className="ar-print-foot">{frozen ? `Submitted ${formatDate(data.return!.submittedAt!)} by ${data.return!.submittedBy}. ` : 'Draft. '}Figures from the church's records in Flockwise{frozen ? '' : `, as on ${formatDate(new Date().toISOString())}`}.</div>
      </div>

      {confirmSubmit && (
        <Modal
          title="Mark as submitted?"
          onClose={() => setConfirmSubmit(false)}
          footer={<><button className="btn" onClick={() => setConfirmSubmit(false)}>Not yet</button><button className="btn primary" onClick={() => void submit.run()} disabled={submit.busy}><Lock size={15} /> {submit.busy ? 'Submitting…' : 'Mark as submitted'}</button></>}
        >
          <p>Every figure on the {data.template.name} for {data.label} is frozen as it stands today{dirty ? ' (your unsaved changes are saved first)' : ''}. The records keep changing; this return will not. You can reopen it later if the body asks for a correction.</p>
          <FormError error={submit.error} />
        </Modal>
      )}
    </>
  );
}
