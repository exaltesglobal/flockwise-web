import { CheckCircle2, Clock, Minus, Plus } from 'lucide-react';
import { useState } from 'react';

import type { FormAnswer, FormField, FormSubmission, FormSubmitResult, PublicForm } from '@/api/admin-types';
import { FormError } from '@/components/ui';
import { useT } from '@/i18n';
import { formatMoney } from '@/lib/format';
import { useAction } from '@/lib/use-api';

/** The sign-up form members and visitors fill in. Signed-in members skip the name and contact questions. */
export function RegistrationForm({ form, askContact, submit, onDone }: {
  form: PublicForm;
  askContact: boolean;
  submit: (input: FormSubmission) => Promise<FormSubmitResult>;
  onDone?: (r: FormSubmitResult) => void;
}) {
  const { t, locale } = useT();
  const [contact, setContact] = useState({ name: '', email: '', phone: '' });
  const [answers, setAnswers] = useState<Record<string, FormAnswer>>({});
  const [qty, setQty] = useState<Record<string, number>>(() => (form.ticketTypes.length === 1 ? { [form.ticketTypes[0].id]: 1 } : {}));
  const [code, setCode] = useState('');
  const [missing, setMissing] = useState<string[]>([]);
  const [result, setResult] = useState<FormSubmitResult | null>(null);

  const total = form.ticketTypes.reduce((s, tt) => s + tt.price * (qty[tt.id] ?? 0), 0);
  const ticketCount = Object.values(qty).reduce((s, n) => s + n, 0);
  const full = form.spotsLeft === 0;

  const send = useAction(async () => {
    const empty = form.fields.filter((f) => f.required && isEmpty(answers[f.id])).map((f) => f.id);
    if (askContact && !contact.name.trim()) empty.push('_name');
    if (askContact && !/^\S+@\S+\.\S+$/.test(contact.email.trim())) empty.push('_contact');
    setMissing(empty);
    if (empty.length) throw new Error(t('fieldRequired'));
    if (form.ticketTypes.length && ticketCount === 0) throw new Error(t('chooseTicket'));
    const r = await submit({
      ...(askContact ? { name: contact.name.trim(), email: contact.email.trim() || undefined, phone: contact.phone.trim() || undefined } : {}),
      answers,
      tickets: form.ticketTypes.length ? Object.entries(qty).filter(([, n]) => n > 0).map(([ticketTypeId, n]) => ({ ticketTypeId, qty: n })) : undefined,
      discountCode: code.trim() || undefined,
    });
    // Paid registrations go to Razorpay; the demo settles instantly and comes straight back.
    if (r.checkoutUrl) { window.location.href = r.checkoutUrl; return r; }
    setResult(r);
    onDone?.(r);
    return r;
  });

  if (result) {
    const waiting = result.response.status === 'waitlisted';
    return (
      <div className="stack" style={{ alignItems: 'flex-start' }}>
        <div className="row" style={{ gap: 8, fontWeight: 700, color: waiting ? 'var(--warn, #b7791f)' : 'var(--ok)', fontSize: 18 }}>
          {waiting ? <Clock size={20} /> : <CheckCircle2 size={20} />} {waiting ? t('waitlisted') : t('registered')}
        </div>
        {result.message && <p style={{ whiteSpace: 'pre-wrap' }}>{result.message}</p>}
        {askContact && <button className="btn" onClick={() => { setResult(null); setAnswers({}); setContact({ name: '', email: '', phone: '' }); }}>{t('registerAnother')}</button>}
      </div>
    );
  }

  if (!form.isOpen && !(full && form.waitlist)) {
    return <div className="alert info">{form.closedReason ?? t('registrationClosed')}</div>;
  }

  const err = (id: string) => (missing.includes(id) ? t('fieldRequired') : undefined);
  return (
    <form className="stack" onSubmit={(e) => { e.preventDefault(); void send.run(); }} noValidate>
      {askContact && (
        <>
          <Q label={t('yourName')} required error={err('_name')}>
            <input className="input" autoComplete="name" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} />
          </Q>
          <div className="grid cols-2">
            <Q label={t('email')} required error={err('_contact')}>
              <input className="input" type="email" autoComplete="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} />
            </Q>
            <Q label={t('mobile')}>
              <input className="input" type="tel" autoComplete="tel" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} />
            </Q>
          </div>
        </>
      )}

      {form.fields.map((f) => (
        <Q key={f.id} label={f.label} required={f.required} hint={f.helpText} error={err(f.id)}>
          <Answer field={f} value={answers[f.id] ?? null} onChange={(v) => setAnswers((a) => ({ ...a, [f.id]: v }))} />
        </Q>
      ))}

      {form.ticketTypes.length > 0 && (
        <div className="stack" style={{ gap: 8 }}>
          <strong>{t('tickets')}</strong>
          {form.ticketTypes.map((tt) => {
            const n = qty[tt.id] ?? 0;
            const soldOut = tt.remaining === 0;
            return (
              <div key={tt.id} className="ticket-row">
                <div className="grow">
                  <div style={{ fontWeight: 600 }}>{tt.name}</div>
                  <div className="small muted">
                    {tt.price ? formatMoney(tt.price, form.currency, locale) : t('free')}
                    {tt.remaining !== null && ` · ${soldOut ? t('soldOut') : t('ticketsLeft', { count: tt.remaining })}`}
                  </div>
                </div>
                <div className="stepper">
                  <button type="button" className="btn icon sm" disabled={n === 0} onClick={() => setQty({ ...qty, [tt.id]: n - 1 })} aria-label="−"><Minus size={14} /></button>
                  <span>{n}</span>
                  <button type="button" className="btn icon sm" disabled={soldOut && !form.waitlist || (tt.remaining !== null && n >= tt.remaining && !form.waitlist) || n >= 20} onClick={() => setQty({ ...qty, [tt.id]: n + 1 })} aria-label="+"><Plus size={14} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {form.hasDiscounts && total > 0 && (
        <Q label={t('discountCode')}><input className="input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} style={{ maxWidth: 220 }} /></Q>
      )}

      <FormError error={send.error} />
      <div className="row wrap" style={{ gap: 10 }}>
        <button className="btn lg primary" disabled={send.busy} type="submit">
          {full ? t('joinWaitlist') : total > 0 ? t('payAndRegister', { amount: formatMoney(total, form.currency, locale) }) : t('register')}
        </button>
        {form.spotsLeft !== null && !full && <span className="small muted">{t('spotsLeft', { count: form.spotsLeft })}</span>}
      </div>
    </form>
  );
}

function Q({ label, required, hint, error, children }: { label: string; required?: boolean; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <span>{label}{required && <span style={{ color: 'var(--danger)' }}> *</span>}</span>
      {children}
      {error ? <span className="err">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

function Answer({ field: f, value, onChange }: { field: FormField; value: FormAnswer; onChange: (v: FormAnswer) => void }) {
  const { t } = useT();
  switch (f.type) {
    case 'textarea':
      return <textarea className="input" rows={3} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />;
    case 'select':
      return (
        <select className="input" value={String(value ?? '')} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">{t('choose')}</option>
          {f.options.map((o) => <option key={o}>{o}</option>)}
        </select>
      );
    case 'multiselect': {
      const picked = Array.isArray(value) ? value : [];
      return (
        <div className="row wrap" style={{ gap: 6 }}>
          {f.options.map((o) => (
            <button key={o} type="button" className={`opt-chip ${picked.includes(o) ? 'on' : ''}`}
              onClick={() => onChange(picked.includes(o) ? picked.filter((x) => x !== o) : [...picked, o])}>{o}</button>
          ))}
        </div>
      );
    }
    case 'checkbox':
      return <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} /> {t('yes')}</label>;
    case 'number':
      return <input className="input" type="number" value={value === null ? '' : String(value)} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} />;
    case 'date':
      return <input className="input" type="date" value={String(value ?? '')} onChange={(e) => onChange(e.target.value || null)} />;
    case 'email':
      return <input className="input" type="email" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />;
    case 'phone':
      return <input className="input" type="tel" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />;
    default:
      return <input className="input" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />;
  }
}

const isEmpty = (v: FormAnswer | undefined) => v === undefined || v === null || v === '' || v === false || (Array.isArray(v) && v.length === 0);
