// Bank reconciliation: upload the bank's statement, see each line matched to a gift, a batch
// deposit or a voucher, and record the ones the office missed. The file is read in the browser;
// only tidy lines go to the server.
import { AlertTriangle, Check, FileSpreadsheet, Landmark, Trash2, Undo2, Upload, X } from 'lucide-react';
import Papa from 'papaparse';
import { useMemo, useRef, useState, type DragEvent, type FormEvent } from 'react';
import { Link } from 'react-router';

import { adminSession } from '@/api/client';
import { AdminApi } from '@/api/endpoints';
import type { Currency } from '@/api/types';
import { BANK_TARGETS, detectBank, findHeaderRow, guessBankColumns, narrationVpa, rowsToBankLines, type BankLineInput, type BankTarget } from '@/core/bank-presets';
import type { BankAccountId, BankLineView, BankSuggestion } from '@/core/types';
import { Empty, ErrorState, Field, FormError, Loading, Modal, Segmented, useToast } from '@/components/ui';
import { formatDate, formatMoney } from '@/lib/format';
import { useCan } from '@/lib/perms';
import { useAction, useApi } from '@/lib/use-api';

import { PersonField, type PickedPerson } from '../components/person-picker';
import { PageHeader } from '../layout';

const KIND_LABEL: Record<BankLineView['kind'], string> = { razorpay: 'Razorpay', upi: 'UPI', cheque: 'Cheque', cash: 'Cash', neft: 'NEFT / IMPS', charges: 'Charges', interest: 'Interest', other: '' };
const iso = (d: Date) => d.toISOString().slice(0, 10);

export function BankPage() {
  const [account, setAccount] = useState<BankAccountId>('main');
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const view = useApi(() => AdminApi.bank.view({ account, ...(range ?? {}) }), [account, range?.from, range?.to]);
  const can = useCan();
  const currency = (adminSession.get()?.church.currency ?? 'INR') as Currency;
  const [uploading, setUploading] = useState(false);
  const [giftFor, setGiftFor] = useState<BankLineView | null>(null);
  const [expenseFor, setExpenseFor] = useState<BankLineView | null>(null);
  const toast = useToast();
  const act = useAction(async (fn: () => Promise<unknown>, msg?: string) => { await fn(); if (msg) toast(msg); view.reload(); });

  if (view.error) return <><PageHeader title="Bank reconciliation" /><ErrorState error={view.error} onRetry={view.reload} /></>;
  const d = view.data;
  const editable = can('giving.edit');
  const matchedShare = d && d.totals.lines ? Math.round(((d.totals.lines - d.totals.unmatched) / d.totals.lines) * 100) : 0;

  return (
    <>
      <PageHeader
        title="Bank reconciliation"
        subtitle="Upload the bank's statement. Each line is matched to a gift, a batch deposit or a voucher; what the office missed can be recorded from here."
        actions={editable && <button className="btn primary" onClick={() => setUploading(true)}><Upload size={15} /> Upload statement</button>}
      />
      {!d ? <Loading /> : (
        <div className="stack bank">
          <div className="row wrap" style={{ gap: 12, justifyContent: 'space-between' }}>
            <div className="row wrap" style={{ gap: 10 }}>
              {d.accounts.length > 1 && <Segmented value={account} onChange={setAccount} options={d.accounts.map((a) => ({ value: a.id, label: a.label }))} />}
              <label className="row small" style={{ gap: 6 }}>From <input type="date" value={d.from} onChange={(e) => setRange({ from: e.target.value, to: d.to })} /></label>
              <label className="row small" style={{ gap: 6 }}>to <input type="date" value={d.to} onChange={(e) => setRange({ from: d.from, to: e.target.value })} /></label>
              <button className="btn sm ghost" onClick={() => setRange({ from: iso(new Date(Date.now() - 90 * 86400000)), to: iso(new Date()) })}>Last 90 days</button>
            </div>
            {d.statements.length > 0 && <span className="muted small">{d.statements.length} statement{d.statements.length === 1 ? '' : 's'} uploaded · latest {d.statements[0].bankName} {formatDate(d.statements[0].from)} – {formatDate(d.statements[0].to)}</span>}
          </div>

          {!d.lines.length ? (
            <Empty icon={<Landmark size={28} />} title="No statement lines in this period" body="Download the statement from net banking as CSV or Excel and upload it here. Lines already uploaded are never added twice." action={editable ? <button className="btn primary" onClick={() => setUploading(true)}><Upload size={15} /> Upload statement</button> : undefined} />
          ) : (
            <>
              <div className="stat-row">
                <div className="card card-pad stat"><span className="muted small">Credits in</span><b>{formatMoney(d.totals.credits, currency)}</b><span className="muted small">{formatMoney(d.totals.matchedCredits, currency)} explained</span></div>
                <div className="card card-pad stat"><span className="muted small">Debits out</span><b>{formatMoney(d.totals.debits, currency)}</b><span className="muted small">{formatMoney(d.totals.matchedDebits, currency)} explained</span></div>
                <div className="card card-pad stat"><span className="muted small">Lines matched</span><b>{matchedShare}%</b><span className="muted small">{d.totals.lines - d.totals.unmatched} of {d.totals.lines}</span></div>
                <div className={`card card-pad stat ${d.totals.unmatched ? 'bank-attn' : ''}`}><span className="muted small">To look at</span><b>{d.totals.unmatched}</b><span className="muted small">{d.totals.unmatched ? 'lines need a decision' : 'all explained'}</span></div>
              </div>

              <div className="card table-wrap">
                <table className="table bank-table">
                  <thead><tr><th>Date</th><th>Narration</th><th className="num">Credit</th><th className="num">Debit</th><th>Flockwise</th>{editable && <th />}</tr></thead>
                  <tbody>
                    {d.lines.map((l) => (
                      <tr key={l.id} className={l.match ? '' : 'bank-open'}>
                        <td className="nowrap">{formatDate(l.date)}</td>
                        <td className="bank-narr"><div>{l.narration}</div><div className="small muted">{KIND_LABEL[l.kind]}{l.ref ? ` · ${l.ref}` : ''}</div></td>
                        <td className="num">{l.amount > 0 ? formatMoney(l.amount, currency) : ''}</td>
                        <td className="num">{l.amount < 0 ? formatMoney(-l.amount, currency) : ''}</td>
                        <td>
                          {l.match ? (
                            <div className="bank-match">
                              <span className={`badge ${l.match.kind === 'gift' || l.match.kind === 'batch' ? 'ok' : l.match.kind === 'expense' ? '' : 'gray'}`}><Check size={12} /> {l.match.kind === 'gift' ? 'Gift' : l.match.kind === 'expense' ? 'Voucher' : l.match.kind === 'batch' ? 'Batch' : l.match.kind === 'settlement' ? 'Settlement' : l.match.kind === 'charges' ? 'Charges' : l.match.kind === 'interest' ? 'Interest' : 'Set aside'}</span>
                              <span className="small">{l.match.label}</span>
                              {l.match.note && <span className="small muted">{l.match.by === 'auto' ? 'Matched by itself: ' : ''}{l.match.note}</span>}
                            </div>
                          ) : l.suggestions.length ? (
                            <div className="bank-sugg">
                              <span className="small muted">Could be:</span>
                              {l.suggestions.map((s) => <SuggestionChip key={s.kind + s.id} s={s} currency={currency} disabled={!editable || act.busy} onPick={() => act.run(() => AdminApi.bank.match(l.id, s.kind, s.id), 'Matched.')} />)}
                            </div>
                          ) : (
                            <span className="small muted"><AlertTriangle size={13} /> Nothing recorded for this amount</span>
                          )}
                        </td>
                        {editable && (
                          <td className="nowrap bank-actions">
                            {l.match ? (
                              <button className="btn sm ghost" title="Undo" onClick={() => act.run(() => AdminApi.bank.unmatch(l.id))} disabled={act.busy}><Undo2 size={14} /></button>
                            ) : (
                              <div className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
                                {l.amount > 0 ? <button className="btn sm" onClick={() => setGiftFor(l)}>Record gift</button> : <button className="btn sm" onClick={() => setExpenseFor(l)}>Record expense</button>}
                                <select className="bank-ignore" value="" onChange={(e) => { const v = e.target.value as 'charges' | 'interest' | 'settlement' | 'ignored' | ''; if (v) void act.run(() => AdminApi.bank.ignore(l.id, v)); }} disabled={act.busy} aria-label="Set aside as">
                                  <option value="">Set aside…</option>
                                  {l.amount < 0 && <option value="charges">Bank charges</option>}
                                  {l.amount > 0 && <option value="interest">Bank interest</option>}
                                  {l.amount > 0 && <option value="settlement">Razorpay settlement</option>}
                                  <option value="ignored">Not a gift or expense</option>
                                </select>
                              </div>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {act.error && <FormError error={act.error} />}

          {(d.missing.gifts.length > 0 || d.missing.expenses.length > 0) && (
            <div className="card card-pad stack" style={{ gap: 8 }}>
              <h3 style={{ margin: 0 }}>Recorded in Flockwise but not seen on the statement</h3>
              <p className="muted small" style={{ margin: 0 }}>Cheque, NEFT and UPI gifts and paid vouchers in this period that no statement line explains. Usually the bank has not cleared them yet, or the statement for those days is not uploaded.</p>
              <table className="table">
                <thead><tr><th>Date</th><th>What</th><th className="num">Amount</th><th /></tr></thead>
                <tbody>
                  {d.missing.gifts.map((g) => <tr key={g.id}><td className="nowrap">{formatDate(g.date)}</td><td>Gift · {g.label}</td><td className="num">{formatMoney(g.amount, currency)}</td><td><Link className="small" to="/admin/giving">Giving</Link></td></tr>)}
                  {d.missing.expenses.map((e) => <tr key={e.id}><td className="nowrap">{formatDate(e.date)}</td><td>Voucher · {e.label}</td><td className="num">{formatMoney(e.amount, currency)}</td><td><Link className="small" to="/admin/accounts">Accounts</Link></td></tr>)}
                </tbody>
              </table>
            </div>
          )}

          {d.statements.length > 0 && editable && (
            <details className="card card-pad">
              <summary>Uploaded statements ({d.statements.length})</summary>
              <table className="table" style={{ marginTop: 10 }}>
                <thead><tr><th>Bank</th><th>Period</th><th className="num">Lines</th><th>Uploaded</th><th /></tr></thead>
                <tbody>{d.statements.map((s) => <tr key={s.id}><td>{s.bankName}</td><td>{formatDate(s.from)} – {formatDate(s.to)}</td><td className="num">{s.lines}</td><td className="muted small">{formatDate(s.uploadedAt)} · {s.uploadedBy}</td><td><button className="btn sm ghost" onClick={() => { if (confirm('Remove this statement and its lines? Gifts and vouchers recorded from it stay.')) void act.run(() => AdminApi.bank.removeStatement(s.id), 'Statement removed.'); }}><Trash2 size={14} /></button></td></tr>)}</tbody>
              </table>
            </details>
          )}
        </div>
      )}

      {uploading && d && <UploadDialog account={account} accounts={d.accounts} currency={currency} onClose={() => setUploading(false)} onDone={(r) => { setUploading(false); toast(`${r.added} lines added, ${r.matched} matched by themselves${r.skipped ? `, ${r.skipped} already there` : ''}.`); setRange(null); view.reload(); }} />}
      {giftFor && d && <RecordGiftDialog line={giftFor} funds={d.funds} currency={currency} onClose={() => setGiftFor(null)} onDone={() => { setGiftFor(null); toast('Gift recorded with a receipt number.'); view.reload(); }} />}
      {expenseFor && d && <RecordExpenseDialog line={expenseFor} heads={d.heads} currency={currency} onClose={() => setExpenseFor(null)} onDone={() => { setExpenseFor(null); toast('Voucher recorded.'); view.reload(); }} />}
    </>
  );
}

function SuggestionChip({ s, currency, disabled, onPick }: { s: BankSuggestion; currency: Currency; disabled: boolean; onPick: () => void }) {
  return (
    <button className={`bank-chip ${s.why.includes('(strong)') ? 'strong' : ''}`} onClick={onPick} disabled={disabled} title={s.why}>
      <b>{s.kind === 'gift' ? 'Gift' : s.kind === 'expense' ? 'Voucher' : 'Batch'}</b> {s.label} · {formatDate(s.date)} · {formatMoney(s.amount, currency)}
    </button>
  );
}

type Sheet = { headers: string[]; rows: string[][]; fileName: string; bank: string };

function UploadDialog({ account, accounts, currency, onClose, onDone }: { account: BankAccountId; accounts: { id: BankAccountId; label: string }[]; currency: Currency; onClose: () => void; onDone: (r: { added: number; skipped: number; matched: number }) => void }) {
  const [acct, setAcct] = useState<BankAccountId>(account);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [mapping, setMapping] = useState<BankTarget[]>([]);
  const [readError, setReadError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const parsed = useMemo(() => (sheet ? rowsToBankLines(mapping, sheet.rows) : { lines: [] as BankLineInput[], problems: [] as string[] }), [sheet, mapping]);
  const upload = useAction(async () => onDone(await AdminApi.bank.upload({ account: acct, bankName: sheet?.bank ?? 'Bank', lines: parsed.lines })));

  async function readFile(file: File) {
    setReadError(null);
    try {
      let table: string[][];
      if (/\.xlsx$/i.test(file.name)) {
        const { readSheet } = await import('read-excel-file/browser');
        const data = await readSheet(file);
        table = data.map((r) => r.map((c) => (c instanceof Date ? c.toISOString().slice(0, 10) : c === null || c === undefined ? '' : String(c))));
      } else if (/\.(csv|txt)$/i.test(file.name)) {
        table = Papa.parse<string[]>(await file.text(), { skipEmptyLines: true }).data;
      } else {
        throw new Error('Please upload the statement as .csv or .xlsx. For a PDF statement, download the Excel or CSV version from net banking instead.');
      }
      const h = findHeaderRow(table);
      const headers = table[h] ?? [];
      const rows = table.slice(h + 1);
      if (!rows.length) throw new Error('No statement lines under the heading row.');
      const m = guessBankColumns(headers);
      setSheet({ headers, rows, fileName: file.name, bank: detectBank(headers, rows.slice(0, 20).map((r) => r.join(' '))) });
      setMapping(m);
    } catch (e) {
      setReadError(e instanceof Error ? e.message : 'Could not read that file.');
    }
  }
  function onDrop(e: DragEvent) { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) void readFile(f); }
  const credits = parsed.lines.filter((l) => l.amount > 0).reduce((s, l) => s + l.amount, 0);
  const debits = parsed.lines.filter((l) => l.amount < 0).reduce((s, l) => s - l.amount, 0);
  const ok = mapping.includes('date') && (mapping.includes('amount') || mapping.includes('credit') || mapping.includes('debit'));

  return (
    <Modal title="Upload a bank statement" onClose={onClose} wide>
      <div className="stack">
        {accounts.length > 1 && <Field label="Which account"><Segmented value={acct} onChange={setAcct} options={accounts.map((a) => ({ value: a.id, label: a.label }))} /></Field>}
        {!sheet ? (
          <>
            <div className={`dropzone ${over ? 'over' : ''}`} onClick={() => fileRef.current?.click()} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={onDrop}>
              <FileSpreadsheet size={32} />
              <b>Drop the statement here, or click to choose</b>
              <span className="muted small">CSV or Excel export from net banking (SBI, HDFC, ICICI, Axis, Kotak, Canara and others). Account details above the table are skipped.</span>
              <input ref={fileRef} type="file" accept=".csv,.xlsx,.txt" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void readFile(f); }} />
            </div>
            {readError && <div className="alert error">{readError}</div>}
          </>
        ) : (
          <>
            <div className="row wrap" style={{ justifyContent: 'space-between' }}>
              <span><b>{sheet.fileName}</b> <span className="muted small">· looks like {sheet.bank} · {sheet.rows.length} rows</span></span>
              <button className="btn sm ghost" onClick={() => setSheet(null)}><X size={14} /> Choose another file</button>
            </div>
            <div className="bank-map">
              {sheet.headers.map((h, i) => (
                <label key={i} className="small">
                  <span className="muted">{h || `Column ${i + 1}`}</span>
                  <select value={mapping[i] ?? ''} onChange={(e) => { const m = [...mapping]; const t = e.target.value as BankTarget; m.forEach((x, j) => { if (x === t && t) m[j] = ''; }); m[i] = t; setMapping(m); }}>
                    <option value="">Skip</option>
                    {BANK_TARGETS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                </label>
              ))}
            </div>
            {!ok && <div className="alert warn"><AlertTriangle size={16} /> Choose the Date column and the Credit/Debit (or Amount) columns.</div>}
            {parsed.problems.length > 0 && <div className="alert warn"><AlertTriangle size={16} /> {parsed.problems.length} row{parsed.problems.length === 1 ? '' : 's'} skipped: {parsed.problems.slice(0, 3).join('; ')}{parsed.problems.length > 3 ? '…' : ''}</div>}
            <div className="row wrap small" style={{ gap: 16 }}>
              <span><b>{parsed.lines.length}</b> lines</span>
              <span>Credits <b>{formatMoney(credits, currency)}</b></span>
              <span>Debits <b>{formatMoney(debits, currency)}</b></span>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Date</th><th>Narration</th><th className="num">Credit</th><th className="num">Debit</th></tr></thead>
                <tbody>{parsed.lines.slice(0, 6).map((l, i) => <tr key={i}><td className="nowrap">{formatDate(l.date)}</td><td className="bank-narr">{l.narration}</td><td className="num">{l.amount > 0 ? formatMoney(l.amount, currency) : ''}</td><td className="num">{l.amount < 0 ? formatMoney(-l.amount, currency) : ''}</td></tr>)}</tbody>
              </table>
              {parsed.lines.length > 6 && <p className="muted small" style={{ margin: '6px 0 0' }}>…and {parsed.lines.length - 6} more</p>}
            </div>
            <FormError error={upload.error} />
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn" onClick={onClose}>Cancel</button>
              <button className="btn primary" onClick={() => upload.run()} disabled={!ok || !parsed.lines.length || upload.busy}>Add {parsed.lines.length} lines</button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

function RecordGiftDialog({ line, funds, currency, onClose, onDone }: { line: BankLineView; funds: { id: string; name: string }[]; currency: Currency; onClose: () => void; onDone: () => void }) {
  const [fundId, setFundId] = useState(funds[0]?.id ?? '');
  const [person, setPerson] = useState<PickedPerson | null>(null);
  const vpa = narrationVpa(line.narration);
  const [name, setName] = useState(vpa ? `UPI ${vpa}` : '');
  const save = useAction(async (e: FormEvent) => { e.preventDefault(); await AdminApi.bank.recordGift(line.id, { fundId, donorId: person?.id ?? null, donorName: person ? person.name : name.trim() }); onDone(); });
  return (
    <Modal title={`Record ${formatMoney(line.amount, currency)} as a gift`} onClose={onClose}>
      <form className="stack" onSubmit={save.run}>
        <p className="small muted" style={{ margin: 0 }}>{formatDate(line.date)} · {line.narration}</p>
        <Field label="Fund"><select value={fundId} onChange={(e) => setFundId(e.target.value)} required>{funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></Field>
        <Field label="Who gave it" hint="Pick the member so it goes on their statement and 80G receipt; or type a name."><PersonField value={person} onChange={setPerson} placeholder="Search members" /></Field>
        {!person && <Field label="Or a name"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="As on the statement" /></Field>}
        <FormError error={save.error} />
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={save.busy || !fundId || (!person && !name.trim())}>Record gift</button>
        </div>
      </form>
    </Modal>
  );
}

function RecordExpenseDialog({ line, heads, currency, onClose, onDone }: { line: BankLineView; heads: { id: string; name: string }[]; currency: Currency; onClose: () => void; onDone: () => void }) {
  const [headId, setHeadId] = useState(heads[0]?.id ?? '');
  const [payee, setPayee] = useState('');
  const [description, setDescription] = useState('');
  const save = useAction(async (e: FormEvent) => { e.preventDefault(); await AdminApi.bank.recordExpense(line.id, { headId, payee: payee.trim() || undefined, description: description.trim() || undefined }); onDone(); });
  return (
    <Modal title={`Record ${formatMoney(-line.amount, currency)} as a paid voucher`} onClose={onClose}>
      <form className="stack" onSubmit={save.run}>
        <p className="small muted" style={{ margin: 0 }}>{formatDate(line.date)} · {line.narration}</p>
        <Field label="Expense head"><select value={headId} onChange={(e) => setHeadId(e.target.value)} required>{heads.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select></Field>
        <Field label="Paid to"><input value={payee} onChange={(e) => setPayee(e.target.value)} placeholder={line.narration.slice(0, 60)} /></Field>
        <Field label="What for"><input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="From the bank statement" /></Field>
        <FormError error={save.error} />
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={save.busy || !headId}>Record voucher</button>
        </div>
      </form>
    </Modal>
  );
}
