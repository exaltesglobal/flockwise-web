import { CalendarDays, CheckCircle2, Radio, ClipboardList, Clock, Gift, Mail, MapPin, Phone, Globe, UserRound, UsersRound, XCircle } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';

import type { PublicGroup } from '@/api/admin-types';
import { PublicApi } from '@/api/endpoints';
import { BulletinDoc } from '@/components/bulletin';
import { LiveWatch } from '@/components/live-player';
import { RegistrationForm } from '@/components/registration';
import { ErrorState, Field, FormError, Loading, Logo, Modal } from '@/components/ui';
import { useT } from '@/i18n';
import { formatDay, formatMoney, formatTime } from '@/lib/format';
import { useAction, useApi } from '@/lib/use-api';
import { SermonList } from '@/member/pages/sermons';

import './public.css';

function Shell({ churchName, logoUrl, children }: { churchName?: string; logoUrl?: string | null; children: ReactNode }) {
  return (
    <div className="pub">
      <header className="pub-top">
        <div className="pub-wrap row between">
          <Link to="/church" className="row pub-brand" style={{ gap: 10 }}>
            {logoUrl && <img src={logoUrl} alt="" />}
            <span>{churchName ?? ''}</span>
          </Link>
          <Link to="/app" className="btn sm">Member sign in</Link>
        </div>
      </header>
      <main className="pub-wrap pub-main">{children}</main>
      <footer className="pub-foot">
        <div className="pub-wrap row between wrap" style={{ gap: 10 }}>
          <span className="small muted">© {new Date().getFullYear()} {churchName}</span>
          <a href="https://flockwise.church" className="row small muted" style={{ gap: 6 }}>Powered by <Logo height={16} /></a>
        </div>
      </footer>
    </div>
  );
}

/** The church's public web page: service times, events with registration, sermons and a group finder. */
export function PublicChurchPage() {
  const { locale } = useT();
  const { data, error, reload } = useApi(PublicApi.church);
  const { data: live } = useApi(() => PublicApi.live().catch(() => null));
  const [joining, setJoining] = useState<PublicGroup | null>(null);
  const [zone, setZone] = useState('');
  useEffect(() => { if (data) document.title = data.church.name; }, [data]);

  if (error) return <Shell><ErrorState error={error} onRetry={reload} /></Shell>;
  if (!data) return <Shell><Loading /></Shell>;
  const { church, page, contact, events, sermons, groups, forms, campaigns = [] } = data;
  const zones = [...new Set(groups.map((g) => g.zone).filter(Boolean))].sort();
  const shownGroups = groups.filter((g) => !zone || g.zone === zone);

  return (
    <Shell churchName={church.name} logoUrl={church.logoUrl}>
      <section className="pub-hero" style={page.heroImageUrl ? { backgroundImage: `linear-gradient(rgba(10,30,28,.55), rgba(10,30,28,.75)), url("${page.heroImageUrl}")` } : undefined}>
        <span className="eyebrow">{church.city}</span>
        <h1>{church.name}</h1>
        {page.tagline && <p className="lead">{page.tagline}</p>}
        {page.serviceTimes && (
          <div className="pub-times">
            {page.serviceTimes.split('\n').filter(Boolean).map((l) => <span key={l} className="row" style={{ gap: 8 }}><Clock size={16} /> {l}</span>)}
          </div>
        )}
        <div className="row wrap" style={{ gap: 10 }}>
          {events.length > 0 && <a href="#events" className="btn accent">Upcoming events</a>}
          {page.showGiving && <Link to="/app/give" className="btn ghost-light"><Gift size={16} /> Give online</Link>}
          {live?.stream && <Link to="/live" className="btn ghost-light">{live.stream.status === 'live' ? <span className="live-pill"><i /> LIVE</span> : <Radio size={16} />} Watch online</Link>}
        </div>
      </section>

      {page.about && (
        <section className="pub-section">
          <h2>About us</h2>
          <p className="pub-prose">{page.about}</p>
        </section>
      )}

      {events.length > 0 && (
        <section className="pub-section" id="events">
          <h2>Upcoming events</h2>
          <div className="pub-grid">
            {events.map((e) => (
              <article key={e.id} className="card card-pad stack" style={{ gap: 8 }}>
                <span className="pub-date">{formatDay(e.startsAt, locale)} · {formatTime(e.startsAt, locale)}</span>
                <h3>{e.title}</h3>
                {e.location && <span className="small muted row" style={{ gap: 6 }}><MapPin size={14} /> {e.location}</span>}
                {e.description && <p className="small muted clamp3">{e.description}</p>}
                {e.formId && <Link to={`/forms/${e.formId}`} className="btn sm primary" style={{ alignSelf: 'flex-start' }}><ClipboardList size={14} /> Register</Link>}
              </article>
            ))}
          </div>
        </section>
      )}

      {campaigns.length > 0 && (
        <section className="pub-section">
          <h2>Special offerings</h2>
          <div className="pub-grid">
            {campaigns.map((c) => (
              <div key={c.id} className="card card-pad stack" style={{ gap: 8 }}>
                <h3>{c.name}</h3>
                {c.description && <p className="small muted clamp3">{c.description}</p>}
                {c.goal ? <div className="progress"><i style={{ width: `${Math.min(100, c.percent ?? 0)}%` }} /></div> : null}
                <span className="small"><b>{formatMoney(c.raised, church.currency, locale)}</b>{c.goal ? ` of ${formatMoney(c.goal, church.currency, locale)}` : ' given'} · {c.givers} givers</span>
                <Link to="/app/give" className="small" style={{ color: 'var(--primary)', fontWeight: 600 }}>Give →</Link>
              </div>
            ))}
          </div>
        </section>
      )}

      {forms.length > 0 && (
        <section className="pub-section">
          <h2>Sign up</h2>
          <div className="pub-grid">
            {forms.map((f) => (
              <Link key={f.id} to={`/forms/${f.id}`} className="card card-pad stack" style={{ gap: 6, color: 'inherit' }}>
                <h3>{f.title}</h3>
                {f.description && <p className="small muted clamp3">{f.description}</p>}
                <span className="small" style={{ color: 'var(--primary)', fontWeight: 600 }}>Register →</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {sermons.length > 0 && (
        <section className="pub-section">
          <h2>Recent sermons</h2>
          <SermonList sermons={sermons} />
        </section>
      )}

      {groups.length > 0 && (
        <section className="pub-section" id="groups">
          <div className="row between wrap" style={{ gap: 10 }}>
            <div>
              <h2>Find a group</h2>
              <p className="muted">Small groups meet in homes across the city through the week. Pick one near you and the leader will get in touch.</p>
            </div>
            {zones.length > 1 && (
              <select className="input" style={{ width: 'auto' }} value={zone} onChange={(e) => setZone(e.target.value)} aria-label="Area">
                <option value="">All areas</option>
                {zones.map((z) => <option key={z}>{z}</option>)}
              </select>
            )}
          </div>
          <div className="pub-grid">
            {shownGroups.map((g) => (
              <article key={g.id} className="card card-pad stack" style={{ gap: 8 }}>
                <h3>{g.name}</h3>
                {g.description && <p className="small muted clamp3">{g.description}</p>}
                <div className="stack small" style={{ gap: 4 }}>
                  {g.meetingSchedule && <span className="row" style={{ gap: 6 }}><Clock size={14} className="muted" /> {g.meetingSchedule}</span>}
                  {(g.location || g.zone) && <span className="row" style={{ gap: 6 }}><MapPin size={14} className="muted" /> {[...new Set([g.location, g.zone].filter(Boolean))].join(', ')}</span>}
                  {g.leaderName && <span className="row" style={{ gap: 6 }}><UserRound size={14} className="muted" /> Led by {g.leaderName}</span>}
                  <span className="row" style={{ gap: 6 }}><UsersRound size={14} className="muted" /> {g.memberCount} members</span>
                </div>
                <button className="btn sm primary" style={{ alignSelf: 'flex-start' }} onClick={() => setJoining(g)}>I’m interested</button>
              </article>
            ))}
          </div>
        </section>
      )}

      {(contact.address || contact.phone || contact.email) && (
        <section className="pub-section">
          <h2>Visit us</h2>
          <div className="card card-pad stack" style={{ gap: 8 }}>
            {contact.address && <span className="row" style={{ gap: 8 }}><MapPin size={16} className="muted" /> {contact.address}</span>}
            {contact.phone && <span className="row" style={{ gap: 8 }}><Phone size={16} className="muted" /> <a href={`tel:${contact.phone}`}>{contact.phone}</a></span>}
            {contact.email && <span className="row" style={{ gap: 8 }}><Mail size={16} className="muted" /> <a href={`mailto:${contact.email}`}>{contact.email}</a></span>}
            {contact.website && <span className="row" style={{ gap: 8 }}><Globe size={16} className="muted" /> <a href={contact.website} target="_blank" rel="noreferrer">{contact.website.replace(/^https?:\/\//, '')}</a></span>}
          </div>
        </section>
      )}

      {joining && <GroupInterest group={joining} onClose={() => setJoining(null)} />}
    </Shell>
  );
}

function GroupInterest({ group, onClose }: { group: PublicGroup; onClose: () => void }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', message: '' });
  const [done, setDone] = useState<string | null>(null);
  const send = useAction(() => PublicApi.groupInterest(group.id, { ...form, phone: form.phone || undefined, message: form.message || undefined }));
  return (
    <Modal title={done ? 'Thank you' : `Join ${group.name}`} onClose={onClose}
      footer={done ? <button className="btn primary" onClick={onClose}>Done</button> : (
        <><button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={send.busy || !form.name.trim() || !form.email.trim()} onClick={async () => { const r = await send.run(); if (r) setDone(r.message); }}>Send</button></>
      )}>
      {done ? (
        <div className="row" style={{ gap: 10 }}><CheckCircle2 size={22} color="var(--ok)" /> <p>{done}</p></div>
      ) : (
        <div className="stack">
          <FormError error={send.error} />
          <Field label="Your name"><input className="input" autoFocus autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <div className="grid cols-2">
            <Field label="Email"><input className="input" type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Mobile (optional)"><input className="input" type="tel" autoComplete="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          </div>
          <Field label="Anything the leader should know? (optional)"><textarea className="input" rows={3} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} /></Field>
        </div>
      )}
    </Modal>
  );
}

/** A public registration form anyone with the link can fill in, without signing in. */
export function PublicFormPage() {
  const { id = '' } = useParams();
  const { locale } = useT();
  const { data: form, error, reload } = useApi(() => PublicApi.form(id), [id]);
  useEffect(() => { if (form) document.title = `${form.title} · ${form.churchName}`; }, [form]);

  if (error) return <Shell><ErrorState error={error} onRetry={reload} /></Shell>;
  if (!form) return <Shell><Loading /></Shell>;
  return (
    <Shell churchName={form.churchName}>
      <article className="card card-pad stack lg pub-form">
        <div className="stack" style={{ gap: 8 }}>
          <h1>{form.title}</h1>
          {form.event && (
            <>
              <span className="row" style={{ gap: 8 }}><CalendarDays size={17} className="muted" /> {formatDay(form.event.startsAt, locale)}, {formatTime(form.event.startsAt, locale)}</span>
              {form.event.location && <span className="row" style={{ gap: 8 }}><MapPin size={17} className="muted" /> {form.event.location}</span>}
            </>
          )}
          {form.description && <p style={{ whiteSpace: 'pre-wrap' }}>{form.description}</p>}
        </div>
        <RegistrationForm form={form} askContact submit={(input) => PublicApi.submitForm(form.id, input)} />
      </article>
    </Shell>
  );
}

/** The Sunday bulletin from the WhatsApp link. The key in the link stands in for signing in. */
export function PublicBulletinPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const { data, error, reload } = useApi(() => PublicApi.bulletin(id, params.get('k') ?? ''), [id]);
  useEffect(() => { if (data) document.title = `${data.title} · ${data.church.name}`; }, [data]);

  if (error) return <Shell><ErrorState error={error} onRetry={reload} /></Shell>;
  if (!data) return <Shell><Loading /></Shell>;
  return (
    <Shell churchName={data.church.name} logoUrl={data.church.logoUrl}>
      <div className="card bulletin-card"><BulletinDoc b={data} /></div>
    </Shell>
  );
}

/** The live service for anyone with the link. Viewers here count in the online attendance as guests. */
export function PublicLivePage() {
  const church = useApi(() => PublicApi.church().catch(() => null));
  useEffect(() => { document.title = church.data ? `Watch live · ${church.data.church.name}` : 'Watch live'; }, [church.data]);
  return (
    <Shell churchName={church.data?.church.name} logoUrl={church.data?.church.logoUrl}>
      <div className="stack pub-live">
        <h1>Watch live</h1>
        <LiveWatch labels={{ live: 'LIVE', watching: (n) => `${n} watching`, starts: (when) => `Starts ${when}`, openYoutube: 'Open in YouTube', none: 'No live stream right now', noneBody: 'Our Sunday services stream here. Check back at service time.', ended: 'The stream has ended. Thank you for joining us!' }} />
        {church.data?.page.serviceTimes && <p className="small muted" style={{ whiteSpace: 'pre-wrap' }}>{church.data.page.serviceTimes}</p>}
      </div>
    </Shell>
  );
}

/** Where Razorpay sends people back after paying for a registration. */
export function FormReturnPage() {
  const [params] = useSearchParams();
  const ok = params.get('payment') === 'success';
  return (
    <Shell>
      <article className="card card-pad stack lg pub-form" style={{ alignItems: 'flex-start' }}>
        <div className="row" style={{ gap: 10 }}>
          {ok ? <CheckCircle2 size={28} color="var(--ok)" /> : <XCircle size={28} color="var(--danger)" />}
          <h1>{ok ? 'You’re registered' : 'Payment not completed'}</h1>
        </div>
        <p>{ok
          ? 'Thank you! Your payment was received and your place is confirmed. A confirmation email is on its way.'
          : 'Your payment didn’t go through, so your place isn’t confirmed yet. Unpaid places are held for 30 minutes. Go back to the form to try again.'}</p>
        <div className="row wrap" style={{ gap: 8 }}>
          <Link to="/church" className="btn">Church page</Link>
          <Link to="/app/forms" className="btn ghost">Member app</Link>
        </div>
      </article>
    </Shell>
  );
}
