// Office › Annual report: the general body meeting pack for the financial year, made from the
// records. Add the pastor's letter (AI can draft it), highlights, thanks and photos; print it as a
// PDF, or show it as slides in the church's own colours and print those too.
import { ChevronLeft, ChevronRight, ImagePlus, MonitorPlay, Pencil, Plus, Printer, Sparkles, Trash2, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

import { AdminApi } from '@/api/endpoints';
import type { AnnualReport, AnnualReportDraft, AnnualReportSection, Currency } from '@/core/types';
import { ErrorState, Field, FormError, Loading, Modal, useToast } from '@/components/ui';
import { brandVars } from '@/lib/brand';
import { formatDate, formatMoney, formatNumber } from '@/lib/format';
import { useAction, useApi } from '@/lib/use-api';

import { useAi } from '../ai';
import { PageHeader } from '../layout';
import { uploadMedia } from './media';
import '../annual-report.css';

const SECTION_LABEL: Record<AnnualReportSection, string> = {
  letter: "Pastor's letter", membership: 'Membership', attendance: 'Sunday attendance', rites: 'Baptisms, weddings and funerals', giving: 'Giving',
  expenses: 'Expenses', ministries: 'Ministries', highlights: 'Highlights', photos: 'Photos', thanks: 'Thanks',
};
const mon = (m: string) => new Date(`${m}-15T12:00:00`).toLocaleDateString('en-IN', { month: 'short' });
const pct = (now: number, before: number) => (before ? Math.round(((now - before) / before) * 100) : null);
const change = (now: number, before: number, label: string) => {
  const c = pct(now, before);
  return c === null ? '' : `${c >= 0 ? 'up' : 'down'} ${Math.abs(c)}% on ${label}`;
};
function years() {
  const d = new Date();
  const start = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return [start, start - 1, start - 2, start - 3].map((y) => ({ value: String(y), label: `${y}-${String(y + 1).slice(2)}` }));
}

export function AnnualReportPage() {
  const [year, setYear] = useState<string>('');
  const q = useApi(() => AdminApi.annualReport.get(year || undefined), [year]);
  const [editing, setEditing] = useState(false);
  const [deck, setDeck] = useState(false);
  const r = q.data;
  const title = 'Annual report';
  if (q.error) return <><PageHeader title={title} /><ErrorState error={q.error} onRetry={q.reload} /></>;
  if (!r) return <><PageHeader title={title} /><Loading /></>;
  const show = (s: AnnualReportSection) => !r.draft.hide.includes(s);
  return (
    <div className="ar" style={brandVars(r.church.brand, false)}>
      <div className="no-print">
        <PageHeader
          title={title}
          subtitle="The general body meeting pack, made from your records: membership, attendance, baptisms, giving by fund, expenses and ministries. Add the pastor's letter, highlights and photos, then print it as a PDF or show it as slides."
          actions={<>
            <select className="input" style={{ width: 'auto' }} value={year || r.year.label.slice(0, 4)} onChange={(e) => setYear(e.target.value)} aria-label="Financial year">
              {years().map((y) => <option key={y.value} value={y.value}>{y.label}</option>)}
            </select>
            <button className="btn" onClick={() => setEditing(true)}><Pencil size={15} /> Letter, highlights and photos</button>
            <button className="btn" onClick={() => setDeck(true)}><MonitorPlay size={15} /> Slides</button>
            <button className="btn primary" onClick={() => window.print()}><Printer size={15} /> Print or PDF</button>
          </>}
        />
        {!r.year.complete && <div className="card card-pad small muted" style={{ marginBottom: 12 }}>The {r.year.label} year is not over yet, so the figures run to today.</div>}
      </div>
      <ReportDoc r={r} show={show} />
      {editing && <EditModal r={r} onClose={() => setEditing(false)} onSaved={(n) => { q.setData(n); setEditing(false); }} />}
      {deck && <Deck r={r} show={show} onClose={() => setDeck(false)} />}
    </div>
  );
}

function useMoney(r: AnnualReport) {
  return (n: number) => formatMoney(n, r.currency as Currency);
}

function Bars({ data, label }: { data: { month: string; value: number }[]; label: (v: number) => string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="ar-bars" role="img" aria-label={data.map((d) => `${mon(d.month)} ${label(d.value)}`).join(', ')}>
      {data.map((d) => (
        <div key={d.month} className="ar-bar" title={`${mon(d.month)}: ${label(d.value)}`}>
          <i style={{ height: `${(d.value / max) * 100}%` }} />
          <small>{mon(d.month)}</small>
        </div>
      ))}
    </div>
  );
}

function Rows({ rows, money }: { rows: { label: string; amount: number }[]; money: (n: number) => string }) {
  const max = Math.max(1, ...rows.map((x) => x.amount));
  return (
    <div className="ar-rows">
      {rows.slice(0, 10).map((x) => (
        <div key={x.label} className="ar-row"><span>{x.label}</span><span className="track"><i style={{ width: `${(x.amount / max) * 100}%` }} /></span><b>{money(x.amount)}</b></div>
      ))}
    </div>
  );
}

const Kpi = ({ n, label }: { n: ReactNode; label: string }) => <div className="ar-kpi"><b>{n}</b><span>{label}</span></div>;

function ReportDoc({ r, show }: { r: AnnualReport; show: (s: AnnualReportSection) => boolean }) {
  const money = useMoney(r);
  const m = r.ministries;
  return (
    <div className="ar-doc">
      <section className="ar-page ar-cover">
        {r.church.logoUrl && <img src={r.church.logoDarkUrl ?? r.church.logoUrl} alt="" />}
        <span className="ar-year">Annual report {r.year.label}</span>
        <h1>{r.church.name}</h1>
        {r.church.tagline && <span style={{ opacity: 0.85 }}>{r.church.tagline}</span>}
        <span className="small" style={{ opacity: 0.75 }}>{formatDate(`${r.year.from}T12:00:00`)} to {formatDate(`${r.year.to}T12:00:00`)}{r.church.city && ` · ${r.church.city}`}</span>
      </section>
      {show('letter') && r.draft.letter && <section className="ar-page"><h2>From the pastor</h2><div className="ar-letter">{r.draft.letter}</div></section>}
      <section className="ar-page">
        <h2>The year at a glance</h2>
        <div className="ar-kpis">
          <Kpi n={formatNumber(r.membership.members)} label="members" />
          <Kpi n={formatNumber(r.membership.families)} label="families" />
          <Kpi n={formatNumber(r.attendance.average)} label="on an average Sunday" />
          <Kpi n={formatNumber(r.rites.baptisms)} label={r.rites.baptisms === 1 ? 'baptism' : 'baptisms'} />
          {r.giving && show('giving') && <Kpi n={money(r.giving.total)} label="given" />}
          <Kpi n={formatNumber(m.groups)} label="small groups" />
        </div>
      </section>
      {show('membership') && (
        <section className="ar-page">
          <h2>Membership</h2>
          <p style={{ margin: 0 }}>We began the year with about {formatNumber(r.membership.startMembers)} members and end it with {formatNumber(r.membership.members)}: {formatNumber(r.membership.joinedMembers)} joined as members and {formatNumber(r.membership.newVisitors)} new visitors came. {formatNumber(r.membership.total)} people in {formatNumber(r.membership.families)} families are part of the church family.</p>
          <Bars data={r.membership.byMonth.map((x) => ({ month: x.month, value: x.joined }))} label={(v) => `${v} joined`} />
        </section>
      )}
      {show('attendance') && (
        <section className="ar-page">
          <h2>Sunday attendance</h2>
          <p style={{ margin: 0 }}>{formatNumber(r.attendance.average)} people on an average Sunday{r.attendance.previousAverage ? `, ${change(r.attendance.average, r.attendance.previousAverage, r.year.previousLabel)}` : ''}.{r.attendance.highest && ` The fullest Sunday was ${formatDate(`${r.attendance.highest.date}T12:00:00`)} with ${formatNumber(r.attendance.highest.count)}.`}</p>
          <Bars data={r.attendance.byMonth.map((x) => ({ month: x.month, value: x.average }))} label={(v) => `${v} average`} />
        </section>
      )}
      {show('rites') && (
        <section className="ar-page">
          <h2>Baptisms, weddings and funerals</h2>
          <div className="ar-kpis">
            <Kpi n={r.rites.baptisms} label="baptisms" /><Kpi n={r.rites.marriages} label="weddings" /><Kpi n={r.rites.dedications} label="child dedications" /><Kpi n={r.rites.burials} label="funerals" />
          </div>
          {r.rites.baptismNames.length > 0 && <><b>Baptised this year</b><div className="ar-names">{r.rites.baptismNames.map((n) => <div key={n}>{n}</div>)}</div></>}
        </section>
      )}
      {show('giving') && r.giving && (
        <section className="ar-page">
          <h2>Giving</h2>
          <p style={{ margin: 0 }}>{money(r.giving.total)} was given by {formatNumber(r.giving.givers)} givers{r.giving.previous ? `, ${change(r.giving.total, r.giving.previous, r.year.previousLabel)}` : ''}. Thank you for your faithfulness.</p>
          <Rows rows={r.giving.byFund.map((f) => ({ label: f.fund, amount: f.amount }))} money={money} />
          <Bars data={r.giving.byMonth.map((x) => ({ month: x.month, value: x.amount }))} label={money} />
        </section>
      )}
      {show('expenses') && r.expenses && (
        <section className="ar-page">
          <h2>Expenses</h2>
          <p style={{ margin: 0 }}>{money(r.expenses.total)} was spent{r.expenses.previous ? `, ${change(r.expenses.total, r.expenses.previous, r.year.previousLabel)}` : ''}{r.giving ? `. Giving less expenses: ${money(r.giving.total - r.expenses.total)}` : ''}.</p>
          {r.expenses.byHead.length > 0 && <Rows rows={r.expenses.byHead.map((h) => ({ label: h.head, amount: h.amount }))} money={money} />}
        </section>
      )}
      {show('ministries') && (
        <section className="ar-page">
          <h2>Ministries</h2>
          <div className="ar-kpis">
            <Kpi n={m.groupMeetings} label={`small group meetings in ${m.groups} groups`} />
            <Kpi n={m.sundaySchoolChildren} label={`children in ${m.sundaySchoolClasses} Sunday school classes`} />
            <Kpi n={m.volunteers} label="people served on Sundays" />
            <Kpi n={m.coursesCompleted} label="finished a course" />
            {m.outreachDays > 0 && <Kpi n={m.outreachHelped} label={`neighbours helped at ${m.outreachDays} outreach days`} />}
            <Kpi n={m.visits} label="home and hospital visits" />
            <Kpi n={m.prayers} label="prayer requests prayed for" />
            <Kpi n={m.sermons} label="sermons preached" />
            <Kpi n={m.events} label="events" />
          </div>
        </section>
      )}
      {show('highlights') && r.draft.highlights.length > 0 && <section className="ar-page"><h2>Highlights of the year</h2><ul className="ar-highlights">{r.draft.highlights.map((h) => <li key={h}>{h}</li>)}</ul></section>}
      {show('photos') && r.draft.photos.length > 0 && (
        <section className="ar-page"><h2>The year in pictures</h2><div className="ar-photos">{r.draft.photos.map((p) => <figure key={p.url}><img src={p.url} alt={p.caption} />{p.caption && <figcaption>{p.caption}</figcaption>}</figure>)}</div></section>
      )}
      {show('thanks') && r.draft.thanks && <section className="ar-page"><h2>Thank you</h2><div className="ar-letter">{r.draft.thanks}</div></section>}
    </div>
  );
}

function Deck({ r, show, onClose }: { r: AnnualReport; show: (s: AnnualReportSection) => boolean; onClose: () => void }) {
  const money = useMoney(r);
  const [i, setI] = useState(0);
  const foot = <div className="foot">{r.church.logoUrl && <img src={r.church.logoUrl} alt="" />}{r.church.name} · Annual report {r.year.label}</div>;
  const slides: { key: string; dark?: boolean; body: ReactNode }[] = [
    { key: 'cover', dark: true, body: <><span style={{ letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--ar-accent)' }}>Annual report {r.year.label}</span><h1>{r.church.name}</h1>{r.church.tagline && <span>{r.church.tagline}</span>}</> },
    ...(show('letter') && r.draft.letter ? [{ key: 'letter', body: <><h2>From the pastor</h2><div className="ar-letter">{r.draft.letter}</div></> }] : []),
    { key: 'glance', body: <><h2>The year at a glance</h2><div className="big"><div><b>{formatNumber(r.membership.members)}</b>members</div><div><b>{formatNumber(r.attendance.average)}</b>on an average Sunday</div><div><b>{r.rites.baptisms}</b>baptisms</div>{r.giving && show('giving') && <div><b>{money(r.giving.total)}</b>given</div>}</div></> },
    ...(show('membership') ? [{ key: 'members', body: <><h2>{formatNumber(r.membership.joinedMembers)} new members, {formatNumber(r.membership.newVisitors)} new visitors</h2><Bars data={r.membership.byMonth.map((x) => ({ month: x.month, value: x.joined }))} label={(v) => `${v}`} /></> }] : []),
    ...(show('attendance') ? [{ key: 'attendance', body: <><h2>{formatNumber(r.attendance.average)} on an average Sunday</h2>{r.attendance.previousAverage > 0 && <span>{change(r.attendance.average, r.attendance.previousAverage, r.year.previousLabel)}</span>}<Bars data={r.attendance.byMonth.map((x) => ({ month: x.month, value: x.average }))} label={(v) => `${v}`} /></> }] : []),
    ...(show('rites') ? [{ key: 'rites', body: <><h2>Baptisms, weddings and funerals</h2><div className="big"><div><b>{r.rites.baptisms}</b>baptisms</div><div><b>{r.rites.marriages}</b>weddings</div><div><b>{r.rites.dedications}</b>dedications</div><div><b>{r.rites.burials}</b>funerals</div></div></> }] : []),
    ...(show('giving') && r.giving ? [{ key: 'giving', body: <><h2>{money(r.giving.total)} given</h2><Rows rows={r.giving.byFund.slice(0, 6).map((f) => ({ label: f.fund, amount: f.amount }))} money={money} /></> }] : []),
    ...(show('expenses') && r.expenses && r.expenses.byHead.length ? [{ key: 'expenses', body: <><h2>{money(r.expenses.total)} spent</h2><Rows rows={r.expenses.byHead.slice(0, 6).map((h) => ({ label: h.head, amount: h.amount }))} money={money} /></> }] : []),
    ...(show('ministries') ? [{ key: 'ministries', body: <><h2>Ministries</h2><div className="big"><div><b>{r.ministries.groupMeetings}</b>small group meetings</div><div><b>{r.ministries.sundaySchoolChildren}</b>Sunday school children</div><div><b>{r.ministries.volunteers}</b>served on Sundays</div><div><b>{r.ministries.visits}</b>visits</div></div></> }] : []),
    ...(show('highlights') && r.draft.highlights.length ? [{ key: 'highlights', body: <><h2>Highlights</h2><ul className="ar-highlights" style={{ fontSize: '1.1em' }}>{r.draft.highlights.slice(0, 7).map((h) => <li key={h}>{h}</li>)}</ul></> }] : []),
    ...(show('photos') && r.draft.photos.length ? [{ key: 'photos', body: <><h2>The year in pictures</h2><div className="ar-photos">{r.draft.photos.slice(0, 6).map((p) => <img key={p.url} src={p.url} alt={p.caption} />)}</div></> }] : []),
    { key: 'end', dark: true, body: <><h1>Thank you</h1><span style={{ whiteSpace: 'pre-wrap' }}>{show('thanks') && r.draft.thanks ? r.draft.thanks : 'To God be the glory.'}</span></> },
  ];
  const n = slides.length;
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') setI((x) => Math.min(n - 1, x + 1));
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') setI((x) => Math.max(0, x - 1));
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [n, onClose]);
  const printSlides = () => {
    document.body.classList.add('ar-print-deck');
    const done = () => { document.body.classList.remove('ar-print-deck'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    window.print();
  };
  return (
    <div className="ar-deck" role="dialog" aria-label="Annual report slides">
      {slides.map((s, k) => <section key={s.key} className={`ar-slide ${s.dark ? 'dark' : ''} ${k === i ? 'on' : ''}`} onClick={() => setI((x) => Math.min(n - 1, x + 1))}>{s.body}{!s.dark && foot}<span className="ribbon" /></section>)}
      <div className="ar-deck-bar">
        <button className="btn sm" onClick={() => setI(Math.max(0, i - 1))} disabled={i === 0} aria-label="Previous slide"><ChevronLeft size={16} /></button>
        <span className="small">{i + 1} / {n}</span>
        <button className="btn sm" onClick={() => setI(Math.min(n - 1, i + 1))} disabled={i === n - 1} aria-label="Next slide"><ChevronRight size={16} /></button>
        <button className="btn sm" onClick={printSlides}><Printer size={14} /> Print slides or PDF</button>
        <button className="btn sm" onClick={onClose}><X size={14} /> Close</button>
      </div>
    </div>
  );
}

function EditModal({ r, onClose, onSaved }: { r: AnnualReport; onClose: () => void; onSaved: (n: AnnualReport) => void }) {
  const ai = useAi();
  const toast = useToast();
  const [d, setD] = useState<Omit<AnnualReportDraft, 'id' | 'by' | 'updatedAt'>>({ letter: r.draft.letter, highlights: r.draft.highlights.length ? r.draft.highlights : [''], thanks: r.draft.thanks, photos: r.draft.photos, hide: r.draft.hide, baptismNames: r.draft.baptismNames });
  const [url, setUrl] = useState('');
  const [uploading, setUploading] = useState<number | null>(null);
  const year = r.year.label.slice(0, 4);
  const save = useAction(async () => onSaved(await AdminApi.annualReport.save(year, { ...d, highlights: d.highlights.filter((h) => h.trim()) })));
  const letter = useAction(async () => { const out = await AdminApi.annualReport.letter(year, 'en'); setD((x) => ({ ...x, letter: out.letter })); });
  const upload = useAction(async (files: FileList | null) => {
    for (const f of Array.from(files ?? []).slice(0, 12 - d.photos.length)) {
      const item = await uploadMedia(f, 'events', setUploading);
      setD((x) => ({ ...x, photos: [...x.photos, { url: item.url, caption: '' }] }));
    }
    setUploading(null);
    toast('Photos added');
  });
  const toggle = (s: AnnualReportSection) => setD({ ...d, hide: d.hide.includes(s) ? d.hide.filter((x) => x !== s) : [...d.hide, s] });
  return (
    <Modal title={`Annual report ${r.year.label}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><span style={{ flex: 1 }} /><button className="btn primary" disabled={save.busy} onClick={() => void save.run()}>Save</button></>}>
      <div className="stack">
        <Field label="Pastor's letter" hint="Opens the report. About 200 words.">
          <textarea className="input" rows={8} value={d.letter} onChange={(e) => setD({ ...d, letter: e.target.value })} maxLength={6000} />
        </Field>
        {ai && <div><button className="btn sm" disabled={letter.busy} onClick={() => void letter.run()}><Sparkles size={14} /> {letter.busy ? 'Writing…' : d.letter ? 'Draft again with AI' : 'Draft it with AI from the figures'}</button></div>}
        <FormError error={letter.error} />
        <Field label="Highlights of the year">
          <div className="stack" style={{ gap: 6 }}>
            {d.highlights.map((h, i) => (
              <div key={i} className="row" style={{ gap: 6 }}>
                <input className="input grow" value={h} onChange={(e) => setD({ ...d, highlights: d.highlights.map((x, n) => (n === i ? e.target.value : x)) })} maxLength={240} placeholder="e.g. The new hall roof was finished before the monsoon" />
                <button className="btn ghost icon sm" aria-label="Remove" onClick={() => setD({ ...d, highlights: d.highlights.filter((_, n) => n !== i) })}><Trash2 size={13} /></button>
              </div>
            ))}
            {d.highlights.length < 12 && <div><button className="btn ghost sm" onClick={() => setD({ ...d, highlights: [...d.highlights, ''] })}><Plus size={13} /> Add a highlight</button></div>}
          </div>
        </Field>
        <Field label="Photos" hint="Up to 12. Upload from your computer or paste a link to a picture.">
          <div className="stack" style={{ gap: 6 }}>
            {d.photos.map((p, i) => (
              <div key={p.url} className="ar-edit-photo">
                <img src={p.url} alt="" />
                <input className="input sm" value={p.caption} onChange={(e) => setD({ ...d, photos: d.photos.map((x, n) => (n === i ? { ...x, caption: e.target.value } : x)) })} placeholder="Caption (optional)" maxLength={140} />
                <button className="btn ghost icon sm" aria-label="Remove photo" onClick={() => setD({ ...d, photos: d.photos.filter((_, n) => n !== i) })}><Trash2 size={13} /></button>
              </div>
            ))}
            {d.photos.length < 12 && (
              <div className="row wrap" style={{ gap: 6 }}>
                <label className="btn sm"><ImagePlus size={14} /> {uploading !== null ? `Uploading ${uploading}%` : 'Upload photos'}<input type="file" accept="image/*" multiple hidden onChange={(e) => void upload.run(e.target.files)} /></label>
                <input className="input sm grow" style={{ minWidth: 180 }} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://… link to a picture" />
                <button className="btn sm" disabled={!/^https:\/\//.test(url)} onClick={() => { setD({ ...d, photos: [...d.photos, { url, caption: '' }] }); setUrl(''); }}>Add link</button>
              </div>
            )}
            <FormError error={upload.error} />
          </div>
        </Field>
        <Field label="Thank you note" hint="Closes the report: to volunteers, leaders, the committee."><textarea className="input" rows={3} value={d.thanks} onChange={(e) => setD({ ...d, thanks: e.target.value })} maxLength={2000} /></Field>
        <Field label="What to include">
          <div className="row wrap" style={{ gap: 6 }}>
            {(Object.keys(SECTION_LABEL) as AnnualReportSection[]).map((s) => <label key={s} className="row small" style={{ gap: 6 }}><input type="checkbox" checked={!d.hide.includes(s)} onChange={() => toggle(s)} /> {SECTION_LABEL[s]}</label>)}
          </div>
        </Field>
        <label className="row small" style={{ gap: 8 }}><input type="checkbox" checked={d.baptismNames} onChange={(e) => setD({ ...d, baptismNames: e.target.checked })} /> List the names of those baptised</label>
        <FormError error={save.error} />
      </div>
    </Modal>
  );
}
