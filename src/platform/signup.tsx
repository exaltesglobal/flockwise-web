// Self sign-up: a church creates its own Flockwise account with a 30-day trial of every feature.
import { Check, Mail } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';

import { adminSession, memberSession } from '@/api/client';
import { SignupApi } from '@/api/endpoints';
import type { OtpRequest } from '@/api/types';
import { DemoBanner } from '@/components/server-settings';
import { Field, FormError, Logo } from '@/components/ui';
import { PLANS, TRIAL_DAYS } from '@/core/plans';
import { slugify } from '@/core/platform';
import { LegalFooter } from '@/legal/legal';
import { setChurch } from '@/lib/church';
import { isUsingMocks } from '@/lib/config';
import { useAction } from '@/lib/use-api';

const COUNTRIES: [string, string][] = [
  ['IN', 'India'],
  ['AE', 'United Arab Emirates'],
  ['GB', 'United Kingdom'],
  ['US', 'United States'],
  ['CA', 'Canada'],
  ['AU', 'Australia'],
  ['SG', 'Singapore'],
  ['NP', 'Nepal'],
  ['LK', 'Sri Lanka'],
  ['OTHER', 'Another country'],
];

export function SignupPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ churchName: '', city: '', country: 'IN', ownerName: '', email: '', phone: '', slug: '' });
  const [slugTouched, setSlugTouched] = useState(false);
  const [slugState, setSlugState] = useState<{ slug: string; available: boolean; problem: string | null } | null>(null);
  const [otp, setOtp] = useState<OtpRequest | null>(null);
  const [code, setCode] = useState('');
  const start = useAction(SignupApi.start);
  const complete = useAction(SignupApi.complete);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  // The church address follows the name until it is edited by hand.
  const slug = slugTouched ? form.slug : slugify(form.churchName);
  useEffect(() => {
    if (!slug || slug.length < 3) return setSlugState(null);
    let live = true;
    const t = setTimeout(() => {
      SignupApi.slug(slug, form.churchName, form.city)
        .then((r) => live && setSlugState(r))
        .catch(() => undefined);
    }, 350);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [slug, form.churchName, form.city]);

  const ready = form.churchName.trim().length >= 3 && form.ownerName.trim() && /\S+@\S+\.\S+/.test(form.email) && slugState?.available && slugState.slug === slug;

  async function onStart(e: FormEvent) {
    e.preventDefault();
    const r = await start.run(form.email.trim());
    if (r) setOtp(r);
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!otp) return;
    const out = await complete.run({ requestId: otp.requestId, code: code.trim(), churchName: form.churchName.trim(), ownerName: form.ownerName.trim(), city: form.city.trim(), country: form.country === 'OTHER' ? 'US' : form.country, slug, phone: form.phone.trim() || undefined });
    if (!out) return;
    memberSession.set(null);
    setChurch(out.church.slug);
    adminSession.set(out.session);
    navigate('/admin?welcome=1', { replace: true });
  }

  return (
    <div className="auth-page signup-page">
      <DemoBanner text="Demo mode: the church is made in this browser only, and the code is 123456." />
      <div className="signup-wrap">
        <div className="card signup-card">
          <Logo height={30} />
          {!otp ? (
            <form className="stack" onSubmit={onStart}>
              <div>
                <h1>Start your church on Flockwise</h1>
                <p className="muted">Every feature free for {TRIAL_DAYS} days. No card needed. Afterwards, stay free on Seed or pick a plan.</p>
              </div>
              <div className="grid cols-2">
                <Field label="Church name" error={complete.error?.fields?.churchName}>
                  <input className="input" autoFocus value={form.churchName} onChange={(e) => set('churchName', e.target.value)} placeholder="Grace Community Church" />
                </Field>
                <Field label="City">
                  <input className="input" value={form.city} onChange={(e) => set('city', e.target.value)} placeholder="Hyderabad" />
                </Field>
                <Field label="Country">
                  <select className="input" value={form.country} onChange={(e) => set('country', e.target.value)}>
                    {COUNTRIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </Field>
                <Field label="Church address" hint={slugState && !slugState.available ? undefined : `app.flockwise.church/c/${slug || 'your-church'}`} error={slugState && !slugState.available ? slugState.problem ?? undefined : undefined}>
                  <input className="input mono" value={slug} onChange={(e) => { setSlugTouched(true); set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')); }} placeholder="grace-hyderabad" autoCapitalize="none" />
                </Field>
                <Field label="Your name">
                  <input className="input" value={form.ownerName} onChange={(e) => set('ownerName', e.target.value)} placeholder="Pastor Ravi Kumar" autoComplete="name" />
                </Field>
                <Field label="Your email" hint="You sign in with this email">
                  <input className="input" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="you@church.org" autoComplete="email" />
                </Field>
                <Field label="Church phone (optional)">
                  <input className="input" type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+91 98765 43210" autoComplete="tel" />
                </Field>
              </div>
              <FormError error={start.error} />
              <button className="btn primary lg block" disabled={!ready || start.busy}>
                <Mail size={17} /> {start.busy ? 'Sending…' : 'Email me a code'}
              </button>
              <p className="small muted">
                By starting you agree to the <Link to="/legal/terms">terms</Link> and <Link to="/legal/privacy">privacy policy</Link>. Already on Flockwise? <Link to="/admin/sign-in">Sign in</Link>
              </p>
            </form>
          ) : (
            <form className="stack" onSubmit={onCreate}>
              <div>
                <h1>Check your email</h1>
                <p className="muted">We sent a 6-digit code to <strong>{form.email}</strong>. Enter it to create {form.churchName}.</p>
              </div>
              <Field label="Code">
                <input className="input otp-input" inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="••••••" />
              </Field>
              {isUsingMocks() && <p className="small muted">Demo mode: the code is 123456.</p>}
              <FormError error={complete.error} />
              <button className="btn primary lg block" disabled={code.length !== 6 || complete.busy}>{complete.busy ? 'Setting up your church…' : 'Create my church'}</button>
              <button type="button" className="btn ghost block" onClick={() => { setOtp(null); setCode(''); complete.setError(null); }}>Change details</button>
            </form>
          )}
        </div>
        <aside className="signup-aside">
          <h2>Your trial includes everything</h2>
          <ul className="signup-list">
            {['People, families and the member app in 6 Indian languages', 'Online giving with UPI, 80G receipts and FCRA safeguards, with no platform fee', 'Kids check-in, volunteers, groups and registrations', 'Worship planning, lyrics on the projector and a live-stream studio', 'WhatsApp, SMS and email messages, birthdays and follow-ups', 'AI assistant and message writer in Indian languages'].map((t) => (
              <li key={t}><Check size={16} /> <span>{t}</span></li>
            ))}
          </ul>
          <div className="signup-plans">
            {(['seed', 'grow', 'thrive', 'cathedral'] as const).map((p) => (
              <div key={p}>
                <strong>{PLANS[p].name}</strong>
                <span className="small muted">{PLANS[p].price.INR.monthly ? `₹${(PLANS[p].price.INR.monthly / 100).toLocaleString('en-IN')}/month` : 'Free'} · up to {PLANS[p].limits.people.toLocaleString('en-IN')} people</span>
              </div>
            ))}
          </div>
          <p className="small muted">Moving from Planning Center, Elvanto or Excel? Import your people on day one.</p>
        </aside>
      </div>
      <LegalFooter />
    </div>
  );
}
