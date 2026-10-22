// Settings › Giving › assisted Razorpay setup: the church pays Flockwise once, opens its Razorpay
// account through our partner link and uploads its papers; our team does the KYC.
import { Check, CheckCircle2, ExternalLink, FileText, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';

import { AdminApi } from '@/api/endpoints';
import { ErrorState, Field, FormError, Loading, useToast } from '@/components/ui';
import { DOC_KINDS, MAX_DOC_BYTES, ORG_TYPES, requiredDocs } from '@/core/modules/razorpay-setup';
import type { ChurchOrgType, KycDocKind, RazorpaySetupView } from '@/core/types';
import { formatDate } from '@/lib/format';
import { useCan } from '@/lib/perms';
import { useAction, useApi } from '@/lib/use-api';

import { PageHeader } from '../layout';

const rupees = (paise: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(paise / 100);
const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export function RazorpaySetupPage() {
  const q = useApi(AdminApi.payments.setup);
  const can = useCan();
  return (
    <>
      <PageHeader title="Razorpay setup" subtitle="Let our team open your church’s Razorpay account and do the KYC for you" actions={<Link to="/admin/settings#giving" className="btn ghost">Back to giving settings</Link>} />
      {q.error ? <ErrorState error={q.error} onRetry={q.reload} /> : !q.data ? <Loading /> : !can('settings') ? (
        <div className="card card-body"><p className="muted">Ask the church owner or an admin to set up Razorpay.</p></div>
      ) : (
        <SetupBody v={q.data} onChange={q.setData} />
      )}
    </>
  );
}

function SetupBody({ v, onChange }: { v: RazorpaySetupView; onChange: (v: RazorpaySetupView) => void }) {
  const s = v.setup;
  if (s?.status === 'done') return <Done note={s.teamNote} />;
  if (s && (s.status === 'paid' || s.status === 'in_progress')) return <Working v={v} onChange={onChange} />;
  return <Offer v={v} onChange={onChange} />;
}

function Offer({ v, onChange }: { v: RazorpaySetupView; onChange: (v: RazorpaySetupView) => void }) {
  const buy = useAction(AdminApi.payments.buySetup);
  const toast = useToast();
  const pending = v.setup?.status === 'pending_payment';
  async function start() {
    const r = await buy.run();
    if (!r) return;
    if (r.checkoutUrl) window.location.href = r.checkoutUrl;
    else if (r.view) {
      onChange(r.view);
      toast('Paid. Let’s get you live.');
    }
  }
  return (
    <div className="grid cols-2" style={{ alignItems: 'start' }}>
      <div className="card card-body stack">
        <h2>We’ll set up Razorpay for you</h2>
        <p>Agape Labs, the team behind Flockwise, is a Razorpay partner. Skip the paperwork: our team fills in every form, does your church’s KYC and gets the account approved, usually <strong>within 48 hours</strong> of getting your documents.</p>
        <ul className="setup-ticks">
          <li><Check size={16} /> Upload your trust or society papers once, securely</li>
          <li><Check size={16} /> Partner-assisted KYC is usually approved about twice as fast</li>
          <li><Check size={16} /> Help with the FCRA account too, if your church has one</li>
          <li><Check size={16} /> Gifts go straight to the church’s bank. Flockwise never holds the money and takes nothing per gift</li>
        </ul>
        <div className="setup-price">{rupees(v.price)} <small>one-time</small></div>
        <FormError error={buy.error} />
        <div className="row wrap">
          <button className="btn primary" disabled={buy.busy || !v.online} onClick={start}>{buy.busy ? 'Opening Razorpay…' : pending ? 'Complete payment' : `Get assisted setup for ${rupees(v.price)}`}</button>
        </div>
        {!v.online && <p className="small muted">Online payment isn’t switched on for this server yet. Write to hello@flockwise.church and we’ll set it up for you.</p>}
        <p className="small muted">Paid to Agape Labs (Exaltes Global Private Limited) by UPI, card or netbanking through Razorpay.</p>
      </div>
      <div className="card card-body stack">
        <h2>What you’ll need</h2>
        <p className="small muted">Keep clear photos or PDFs of these ready. You upload them after paying.</p>
        <ul className="setup-docs">
          {requiredDocs(null).map((k) => <li key={k}><FileText size={15} /> {DOC_KINDS[k]}</li>)}
          <li className="muted"><FileText size={15} /> If the church is under a diocese or parent body: their letter allowing the church to collect gifts</li>
          <li className="muted"><FileText size={15} /> Optional: 12A or 80G certificate, FCRA certificate</li>
        </ul>
        <p className="small muted">Already have a Razorpay account? <Link to="/admin/settings#giving">Connect it yourself</Link> for free.</p>
      </div>
    </div>
  );
}

function Working({ v, onChange }: { v: RazorpaySetupView; onChange: (v: RazorpaySetupView) => void }) {
  const s = v.setup!;
  const toast = useToast();
  const update = useAction(AdminApi.payments.updateSetup);
  const upload = useAction(AdminApi.payments.uploadDoc);
  const remove = useAction(AdminApi.payments.removeDoc);
  const submit = useAction(AdminApi.payments.submitSetup);
  const [phone, setPhone] = useState(s.contactPhone);
  const need = requiredDocs(s.orgType);
  const have = new Set(s.docs.map((d) => d.kind));
  const [kind, setKind] = useState<KycDocKind>(need.find((k) => !have.has(k)) ?? 'other');
  const [tooBig, setTooBig] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => setKind(need.find((k) => !have.has(k)) ?? 'other'), [s.docs.length, s.orgType]); // eslint-disable-line react-hooks/exhaustive-deps

  async function onUpload(e: FormEvent) {
    e.preventDefault();
    const f = fileRef.current?.files?.[0];
    if (!f) return;
    if (f.size > MAX_DOC_BYTES) {
      setTooBig('Each file must be under 3 MB. Take a photo instead of a scan, or compress the PDF.');
      return;
    }
    setTooBig('');
    const data = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ''));
      r.onerror = () => reject(r.error);
      r.readAsDataURL(f);
    });
    const out = await upload.run({ kind, fileName: f.name, data });
    if (out) {
      onChange(out);
      if (fileRef.current) fileRef.current.value = '';
      toast(`${DOC_KINDS[kind]} uploaded`);
    }
  }

  return (
    <div className="stack">
      {s.teamNote && <div className="callout"><strong className="small">From the Flockwise team:</strong> <span className="small">{s.teamNote}</span></div>}
      <div className="grid cols-2" style={{ alignItems: 'start' }}>
        <div className="card card-body stack">
          <h2>Thank you! Let’s get you live</h2>
          <ol className="setup-steps">
            <li><strong>Open the church’s Razorpay account</strong> with our partner link. It takes two minutes: email, phone and the church’s name.
              {v.partnerUrl && <div style={{ marginTop: 8 }}><a href={v.partnerUrl} target="_blank" rel="noreferrer" className="btn primary sm">Open Razorpay account <ExternalLink size={13} /></a></div>}
            </li>
            <li><strong>Approve Flockwise</strong> when Razorpay asks whether your partner may do your KYC.</li>
            <li><strong>Upload your documents</strong> here and press “Send to our team”. We fill in every form and message you on WhatsApp within one working day if anything is missing.</li>
            <li><strong>Paste your API keys</strong> in <Link to="/admin/settings#giving">Settings › Giving</Link> once Razorpay activates the account.</li>
          </ol>
          <p className="small muted">Paid {formatDate(s.paidAt!)} · {s.status === 'in_progress' ? 'our team is working on it' : s.docsSubmittedAt ? 'documents received, our team starts within one working day' : 'waiting for your documents'}</p>
        </div>

        <div className="card card-body stack" id="kyc-docs">
          <h2>Your documents</h2>
          <p className="small muted">PDF, JPG or PNG, up to 3 MB each. Files are encrypted, only the Flockwise KYC team can open them, and they are deleted once your account is live.</p>
          {s.docsSubmittedAt && <div className="callout small"><CheckCircle2 size={14} /> Sent to our team on {formatDate(s.docsSubmittedAt)}. You can still add files if we ask for more.</div>}
          <div className="grid cols-2">
            <Field label="How is the church registered?">
              <select className="select" value={s.orgType ?? ''} onChange={async (e) => { const r = await update.run({ orgType: e.target.value as ChurchOrgType }); if (r) onChange(r); }}>
                <option value="" disabled>Choose…</option>
                {(Object.keys(ORG_TYPES) as ChurchOrgType[]).map((k) => <option key={k} value={k}>{ORG_TYPES[k]}</option>)}
              </select>
            </Field>
            <Field label="WhatsApp number for our team">
              <input className="input" value={phone} inputMode="tel" onChange={(e) => setPhone(e.target.value)} onBlur={async () => { if (phone !== s.contactPhone) { const r = await update.run({ contactPhone: phone }); if (r) onChange(r); } }} placeholder="+91 98480 12345" />
            </Field>
          </div>
          <FormError error={update.error} />

          <ul className="setup-checklist">
            {need.map((k) => <li key={k} className={have.has(k) ? 'ok' : ''}>{have.has(k) ? <CheckCircle2 size={16} /> : <span className="dot" />} {DOC_KINDS[k]}</li>)}
          </ul>

          <form className="stack" style={{ gap: 8 }} onSubmit={onUpload}>
            <div className="grid cols-2">
              <Field label="This file is">
                <select className="select" value={kind} onChange={(e) => setKind(e.target.value as KycDocKind)}>
                  {(Object.keys(DOC_KINDS) as KycDocKind[]).map((k) => <option key={k} value={k}>{DOC_KINDS[k]}</option>)}
                </select>
              </Field>
              <Field label="File"><input ref={fileRef} className="input" type="file" accept="application/pdf,image/jpeg,image/png" /></Field>
            </div>
            {tooBig && <p className="small danger-text">{tooBig}</p>}
            <FormError error={upload.error} />
            <div><button className="btn sm" disabled={upload.busy}><Upload size={15} /> {upload.busy ? 'Uploading…' : 'Upload'}</button></div>
          </form>

          {s.docs.length > 0 && (
            <ul className="list setup-files">
              {s.docs.map((d) => (
                <li key={d.id} className="list-row">
                  <FileText size={16} className="muted" />
                  <div className="grow" style={{ minWidth: 0 }}><div className="ellipsis">{d.fileName}</div><div className="small muted">{DOC_KINDS[d.kind]} · {kb(d.size)}</div></div>
                  <button className="btn ghost icon sm" aria-label={`Remove ${d.fileName}`} disabled={remove.busy} onClick={async () => { const r = await remove.run(d.id); if (r) onChange(r); }}><Trash2 size={15} /></button>
                </li>
              ))}
            </ul>
          )}
          <FormError error={submit.error ?? remove.error} />
          <div><button className="btn primary" disabled={submit.busy} onClick={async () => { const r = await submit.run(); if (r) { onChange(r); toast('Sent. We’ll be in touch within one working day.'); } }}><ShieldCheck size={16} /> {s.docsSubmittedAt ? 'Send again' : 'Send to our team'}</button></div>
        </div>
      </div>
    </div>
  );
}

function Done({ note }: { note: string }) {
  return (
    <div className="card card-body stack" style={{ maxWidth: 640 }}>
      <h2><CheckCircle2 size={20} className="ok-text" /> Your Razorpay account is ready</h2>
      <p>Our team finished your KYC.{note ? ` ${note}` : ''} Paste your Razorpay API keys in giving settings and the church can start receiving gifts online.</p>
      <div><Link to="/admin/settings#giving" className="btn primary">Connect Razorpay keys</Link></div>
      <p className="small muted">Your uploaded documents have been deleted from Flockwise.</p>
    </div>
  );
}
