// Hall and ground hire for outsiders: the spaces with their rates, a request form, and the renter's
// own page (by a token in the link) where they see the decision, pay through the church's Razorpay,
// or withdraw. No sign-in anywhere here.
import { CheckCircle2, Clock, IndianRupee, KeyRound, Mail, Phone, ShieldCheck, UsersRound, XCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';

import type { Currency, PublicRentalSpace, RentalStatus } from '@/api/admin-types';
import { PublicApi, type RentalRequestInput } from '@/api/endpoints';
import { ErrorState, Field, FormError, Loading } from '@/components/ui';
import { useT } from '@/i18n';
import { formatDate, formatMoney, formatTime } from '@/lib/format';
import { useAction, useApi } from '@/lib/use-api';

import { Shell } from './public';

const STATUS: Record<RentalStatus, { label: string; tone: string; text: string }> = {
  requested: { label: 'Waiting for the church office', tone: 'warn', text: 'The office will confirm within a day or two. You will get an email with a payment link once it is approved.' },
  awaiting_payment: { label: 'Approved, waiting for payment', tone: 'accent', text: 'The date is held for you for 3 days. Pay to confirm the booking.' },
  paid: { label: 'Booked and paid', tone: 'ok', text: 'Your booking is confirmed. Please keep this page or the confirmation email for the day.' },
  declined: { label: 'Not available', tone: 'danger', text: 'Sorry, the church could not offer this space for that date. Call the office if you would like to try another.' },
  cancelled: { label: 'Withdrawn', tone: 'gray', text: 'You withdrew this request.' },
  refunded: { label: 'Refunded', tone: 'gray', text: 'This booking was cancelled and your payment refunded.' },
};

const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
const hoursBetween = (a: string, b: string) => Math.max(0, Math.round(((Date.parse(b) - Date.parse(a)) / 3_600_000) * 2) / 2);

/** /rent: what is for hire, and the request form. */
export function PublicRentPage() {
  const { data, error, reload } = useApi(PublicApi.rentals);
  const [params] = useSearchParams();
  const [picked, setPicked] = useState<string | null>(params.get('space'));
  useEffect(() => { if (data) document.title = `Hire a hall · ${data.church.name}`; }, [data]);
  if (error) return <Shell><ErrorState error={error} onRetry={reload} /></Shell>;
  if (!data) return <Shell><Loading /></Shell>;
  const { church, spaces } = data;
  const space = spaces.find((s) => s.id === picked) ?? null;
  return (
    <Shell churchName={church.name}>
      <section className="pub-hero" style={{ gap: 10 }}>
        <span className="eyebrow">Hall &amp; ground hire</span>
        <h1>Hire a space at {church.name}</h1>
        <p className="lead">For weddings, receptions, meetings, tuition classes, sports days and community events. Ask for a date below; the church office confirms and sends you a link to pay online.</p>
      </section>
      {spaces.length === 0 ? (
        <section className="pub-section"><div className="card card-pad"><p className="muted">Nothing is open for hire right now. Please call the church office{church.phone ? ` on ${church.phone}` : ''}.</p></div></section>
      ) : (
        <section className="pub-section" id="spaces">
          <h2>Spaces</h2>
          <div className="pub-grid">
            {spaces.map((s) => (
              <article key={s.id} className={`card stack rent-space${picked === s.id ? ' picked' : ''}`} style={{ gap: 8 }}>
                {s.photoUrl ? <img src={s.photoUrl} alt="" className="rent-photo" /> : <div className="rent-photo placeholder"><KeyRound size={28} /></div>}
                <div className="stack card-pad" style={{ gap: 8, paddingTop: 0 }}>
                  <h3>{s.name}</h3>
                  <span className="small muted">{s.blurb || s.description}</span>
                  <div className="row wrap small" style={{ gap: 12 }}>
                    <span className="row" style={{ gap: 5 }}><IndianRupee size={14} className="muted" /><b>{formatMoney(s.ratePerHour, s.currency)}</b>/hour</span>
                    <span className="row" style={{ gap: 5 }}><Clock size={14} className="muted" />min {s.minHours} h</span>
                    {s.capacity ? <span className="row" style={{ gap: 5 }}><UsersRound size={14} className="muted" />{s.capacity} people</span> : null}
                  </div>
                  {s.deposit > 0 && <span className="small muted row" style={{ gap: 5 }}><ShieldCheck size={14} /> Refundable deposit {formatMoney(s.deposit, s.currency)}</span>}
                  <button className={`btn sm ${picked === s.id ? '' : 'primary'}`} style={{ alignSelf: 'flex-start' }} onClick={() => { setPicked(s.id); document.getElementById('ask')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>{picked === s.id ? 'Selected' : 'Ask for a date'}</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
      {spaces.length > 0 && (
        <section className="pub-section" id="ask">
          <h2>Ask for a date</h2>
          <RequestForm spaces={spaces} space={space} onPick={setPicked} />
        </section>
      )}
      {(church.phone || church.email) && (
        <section className="pub-section">
          <h2>Questions?</h2>
          <div className="card card-pad stack" style={{ gap: 8 }}>
            {church.phone && <span className="row" style={{ gap: 8 }}><Phone size={16} className="muted" /> <a href={`tel:${church.phone}`}>{church.phone}</a></span>}
            {church.email && <span className="row" style={{ gap: 8 }}><Mail size={16} className="muted" /> <a href={`mailto:${church.email}`}>{church.email}</a></span>}
          </div>
        </section>
      )}
    </Shell>
  );
}

function RequestForm({ spaces, space, onPick }: { spaces: PublicRentalSpace[]; space: PublicRentalSpace | null; onPick: (id: string) => void }) {
  const start = useMemo(() => { const d = new Date(); d.setDate(d.getDate() + 7); d.setHours(10, 0, 0, 0); return d; }, []);
  const [f, setF] = useState({ name: '', phone: '', email: '', organisation: '', purpose: '', guests: '', startsAt: toLocalInput(start), endsAt: toLocalInput(new Date(start.getTime() + 4 * 3_600_000)) });
  const [sent, setSent] = useState<{ token: string; amount: number; deposit: number; currency: Currency } | null>(null);
  const send = useAction((input: RentalRequestInput) => PublicApi.requestRental(input));
  const hours = f.startsAt && f.endsAt ? hoursBetween(new Date(f.startsAt).toISOString(), new Date(f.endsAt).toISOString()) : 0;
  const estimate = space ? Math.round(space.ratePerHour * hours) : 0;
  const fields = (send.error as { fields?: Record<string, string> } | null)?.fields ?? {};
  if (sent) {
    return (
      <article className="card card-pad stack lg" style={{ alignItems: 'flex-start', maxWidth: 680 }}>
        <div className="row" style={{ gap: 10 }}><CheckCircle2 size={28} color="var(--ok)" /><h3>We have your request</h3></div>
        <p>The church office will confirm within a day or two and send you a link to pay {formatMoney(sent.amount, sent.currency)}{sent.deposit ? ` plus a refundable deposit of ${formatMoney(sent.deposit, sent.currency)}` : ''}. {f.email ? 'We have emailed you a link to follow it.' : 'Save the link below to follow it.'}</p>
        <Link to={`/rent/pay/${sent.token}`} className="btn primary">Follow my request</Link>
      </article>
    );
  }
  return (
    <form className="card card-pad stack rent-form" onSubmit={async (e) => {
      e.preventDefault();
      if (!space) return;
      const r = await send.run({ resourceId: space.id, name: f.name, phone: f.phone, email: f.email || undefined, organisation: f.organisation || undefined, purpose: f.purpose, guests: Number(f.guests) || undefined, startsAt: new Date(f.startsAt).toISOString(), endsAt: new Date(f.endsAt).toISOString() });
      if (r) setSent({ token: r.token, amount: r.amount, deposit: r.deposit, currency: r.currency });
    }}>
      <FormError error={send.error} />
      <Field label="Which space">
        <select className="input" value={space?.id ?? ''} onChange={(e) => onPick(e.target.value)} required>
          <option value="" disabled>Choose…</option>
          {spaces.map((s) => <option key={s.id} value={s.id}>{s.name} · {formatMoney(s.ratePerHour, s.currency)}/hour</option>)}
        </select>
      </Field>
      <div className="grid cols-2">
        <Field label="From" error={fields.startsAt}><input className="input" type="datetime-local" required value={f.startsAt} onChange={(e) => setF({ ...f, startsAt: e.target.value })} /></Field>
        <Field label="To" error={fields.endsAt} hint={space ? `Minimum ${space.minHours} hours` : undefined}><input className="input" type="datetime-local" required value={f.endsAt} onChange={(e) => setF({ ...f, endsAt: e.target.value })} /></Field>
      </div>
      <div className="grid cols-2">
        <Field label="Your name" error={fields.name}><input className="input" required autoComplete="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Mobile" error={fields.phone}><input className="input" required type="tel" autoComplete="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="Email (for the payment link)" error={fields.email}><input className="input" type="email" autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Organisation (optional)"><input className="input" value={f.organisation} onChange={(e) => setF({ ...f, organisation: e.target.value })} /></Field>
      </div>
      <div className="grid cols-2">
        <Field label="What is it for?" error={fields.purpose}><input className="input" required placeholder="Wedding reception, annual day, meeting…" value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })} /></Field>
        <Field label="How many people?"><input className="input" type="number" min={0} value={f.guests} onChange={(e) => setF({ ...f, guests: e.target.value })} /></Field>
      </div>
      {space && (
        <div className="rent-estimate">
          <span>{hours} hour{hours === 1 ? '' : 's'} × {formatMoney(space.ratePerHour, space.currency)}</span>
          <b>{formatMoney(estimate, space.currency)}</b>
          {space.deposit > 0 && <span className="small muted">+ {formatMoney(space.deposit, space.currency)} refundable deposit, {formatMoney(estimate + space.deposit, space.currency)} in all</span>}
        </div>
      )}
      {space?.terms && <details className="small muted"><summary>Terms of hire</summary><p style={{ whiteSpace: 'pre-wrap', marginTop: 6 }}>{space.terms}</p></details>}
      <button className="btn primary lg" type="submit" disabled={!space || send.busy} style={{ alignSelf: 'flex-start' }}>Send request</button>
      <span className="small muted">Nothing to pay now. You pay only after the church office confirms the date.</span>
    </form>
  );
}

/** /rent/pay/:token: the renter's own page. */
export function PublicRentalPage() {
  const { token = '' } = useParams();
  const { locale } = useT();
  const { data, error, reload, setData } = useApi(() => PublicApi.rental(token), [token]);
  const pay = useAction(() => PublicApi.payRental(token));
  const cancel = useAction(() => PublicApi.cancelRental(token));
  const [confirmCancel, setConfirmCancel] = useState(false);
  useEffect(() => { if (data) document.title = `${data.resourceName} · ${data.church.name}`; }, [data]);
  if (error) return <Shell><ErrorState error={error} onRetry={reload} /></Shell>;
  if (!data) return <Shell><Loading /></Shell>;
  const st = STATUS[data.status];
  return (
    <Shell churchName={data.church.name}>
      <article className="card card-pad stack lg pub-form" style={{ alignItems: 'stretch' }}>
        <div className="stack" style={{ gap: 4 }}>
          <span className={`badge ${st.tone}`} style={{ alignSelf: 'flex-start' }}>{st.label}</span>
          <h1>{data.resourceName}</h1>
          <span className="muted">{formatDate(data.startsAt, locale)}, {formatTime(data.startsAt, locale)} to {formatTime(data.endsAt, locale)} · {data.hours} hour{data.hours === 1 ? '' : 's'}</span>
        </div>
        <p>{st.text}</p>
        <dl className="kv">
          <dt>Booked by</dt><dd>{data.renterName}</dd>
          <dt>For</dt><dd>{data.purpose}</dd>
          <dt>Hire</dt><dd>{formatMoney(data.amount, data.currency)}</dd>
          {data.deposit > 0 && <><dt>Deposit</dt><dd>{formatMoney(data.deposit, data.currency)} <span className="small muted">refundable after the event</span></dd></>}
          <dt>Total</dt><dd><b>{formatMoney(data.total, data.currency)}</b></dd>
          {data.paidAt && <><dt>Paid on</dt><dd>{formatDate(data.paidAt, locale)}</dd></>}
        </dl>
        <FormError error={pay.error ?? cancel.error} />
        {data.status === 'awaiting_payment' && (
          <button className="btn primary lg" disabled={pay.busy} onClick={async () => {
            const r = await pay.run();
            if (!r) return;
            if (r.checkoutUrl) window.location.href = r.checkoutUrl; else setData(r.rental);
          }}>{pay.busy ? 'Opening payment…' : `Pay ${formatMoney(data.total, data.currency)}`}</button>
        )}
        {(data.status === 'requested' || data.status === 'awaiting_payment') && (
          confirmCancel ? (
            <div className="row wrap" style={{ gap: 8 }}>
              <span className="small">Withdraw this request?</span>
              <button className="btn sm danger" disabled={cancel.busy} onClick={async () => { const r = await cancel.run(); if (r) { setData(r); setConfirmCancel(false); } }}>Yes, withdraw</button>
              <button className="btn sm" onClick={() => setConfirmCancel(false)}>Keep it</button>
            </div>
          ) : <button className="link-btn small" style={{ alignSelf: 'flex-start', color: 'var(--muted)' }} onClick={() => setConfirmCancel(true)}>I no longer need this date</button>
        )}
        <div className="small muted stack" style={{ gap: 4 }}>
          <span>Questions? {data.church.phone && <a href={`tel:${data.church.phone}`}>{data.church.phone}</a>}{data.church.phone && data.church.email ? ' · ' : ''}{data.church.email && <a href={`mailto:${data.church.email}`}>{data.church.email}</a>}</span>
          <span>Payments go to {data.church.name} directly. A hire is not a donation, so no 80G receipt is issued.</span>
        </div>
      </article>
    </Shell>
  );
}

/** /rent/return: where Razorpay sends the renter back. */
export function RentalReturnPage() {
  const [params] = useSearchParams();
  const ok = params.get('payment') === 'success';
  const id = params.get('rental');
  return (
    <Shell>
      <article className="card card-pad stack lg pub-form" style={{ alignItems: 'flex-start' }}>
        <div className="row" style={{ gap: 10 }}>
          {ok ? <CheckCircle2 size={28} color="var(--ok)" /> : <XCircle size={28} color="var(--danger)" />}
          <h1>{ok ? 'Booking confirmed' : 'Payment not completed'}</h1>
        </div>
        <p>{ok ? 'Thank you. Your payment was received and the date is yours. A confirmation email is on its way.' : 'Your payment did not go through, so the date is not confirmed yet. Open the link from your email to try again, or call the church office.'}</p>
        <div className="row wrap" style={{ gap: 8 }}>
          <Link to="/church" className="btn">Church page</Link>
          {id && <Link to="/rent" className="btn ghost">Hire a space</Link>}
        </div>
      </article>
    </Shell>
  );
}
