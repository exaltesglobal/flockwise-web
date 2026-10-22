// Choosing the church: /c/<slug>/... links, and the "which church?" line on sign-in screens.
import { Building2, Search } from 'lucide-react';
import { useEffect, useState, useSyncExternalStore, type FormEvent } from 'react';
import { Navigate, useLocation, useParams } from 'react-router';

import { adminSession, memberSession } from '@/api/client';
import { ChurchesApi, type ChurchPublic } from '@/api/endpoints';
import { Field, FormError, Loading } from '@/components/ui';
import { getChurch, onChurchChange, setChurch } from '@/lib/church';
import { useAction } from '@/lib/use-api';

export const useChurchSlug = () => useSyncExternalStore(onChurchChange, getChurch);

/** Signs out sessions that belong to a different church than the one just chosen. */
function forgetOtherChurch(id: string) {
  for (const store of [adminSession, memberSession]) {
    const s = store.get();
    if (s && s.church.id !== id) store.set(null);
  }
}

/** /c/:slug/rest → remembers the church, then opens /rest. */
export function ChurchRoute() {
  const { slug = '' } = useParams();
  const location = useLocation();
  const [state, setState] = useState<{ ok: boolean; message?: string } | null>(null);
  const rest = location.pathname.replace(/^\/c\/[^/]+/, '') || '/app';

  useEffect(() => {
    let live = true;
    ChurchesApi.get(slug)
      .then((c) => {
        if (!live) return;
        forgetOtherChurch(c.id);
        setChurch(c.isDefault ? null : c.slug);
        setState({ ok: true });
      })
      .catch((e: Error) => live && setState({ ok: false, message: e.message }));
    return () => {
      live = false;
    };
  }, [slug]);

  if (!state) return <Loading />;
  if (!state.ok)
    return (
      <div className="auth-page">
        <div className="auth-center">
          <div className="card auth-card">
            <h1>Church not found</h1>
            <p className="muted">{state.message} The link may be mistyped, or the church may have changed its address.</p>
            <a className="btn" href="/">Go to Flockwise</a>
          </div>
        </div>
      </div>
    );
  return <Navigate to={`${rest === '/' ? '/app' : rest}${location.search}`} replace />;
}

/** The church being signed in to, with a way to switch or to find your church by email. */
export function ChurchLine() {
  const slug = useChurchSlug();
  const [church, setInfo] = useState<ChurchPublic | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let live = true;
    setInfo(null);
    if (slug) ChurchesApi.get(slug).then((c) => live && setInfo(c)).catch(() => live && setChurch(null));
    return () => {
      live = false;
    };
  }, [slug]);

  if (open) return <ChurchFinder onDone={() => setOpen(false)} />;
  return (
    <div className="church-line">
      <Building2 size={16} />
      <span className="grow ellipsis">{church ? <><strong>{church.name}</strong>{church.city ? `, ${church.city}` : ''}</> : slug ? '…' : 'Signing in to your church'}</span>
      <button type="button" className="link-btn" onClick={() => setOpen(true)}>{slug ? 'Change' : 'Another church?'}</button>
    </div>
  );
}

function ChurchFinder({ onDone }: { onDone: () => void }) {
  const [address, setAddress] = useState('');
  const [email, setEmail] = useState('');
  const [mode, setMode] = useState<'address' | 'email'>('address');
  const lookup = useAction(ChurchesApi.get);
  const find = useAction(ChurchesApi.find);
  const [found, setFound] = useState<{ sent: boolean; churches?: { slug: string; name: string; city: string }[] } | null>(null);

  function choose(c: { id?: string; slug: string; isDefault?: boolean }) {
    if (c.id) forgetOtherChurch(c.id);
    setChurch(c.isDefault ? null : c.slug);
    onDone();
  }

  async function onAddress(e: FormEvent) {
    e.preventDefault();
    // Accept a pasted link as well as the bare address.
    const slug = address.trim().toLowerCase().replace(/^.*\/c\//, '').replace(/[/?#].*$/, '');
    const c = await lookup.run(slug);
    if (c) choose(c);
  }

  async function onEmail(e: FormEvent) {
    e.preventDefault();
    const r = await find.run(email.trim());
    if (r) setFound(r);
  }

  return (
    <div className="church-finder stack">
      {mode === 'address' ? (
        <form className="stack" onSubmit={onAddress}>
          <Field label="Church address" hint="The part after /c/ in your church's Flockwise link, e.g. grace-hyderabad">
            <input className="input" autoFocus value={address} onChange={(e) => setAddress(e.target.value)} placeholder="your-church" autoCapitalize="none" />
          </Field>
          <FormError error={lookup.error} />
          <div className="row">
            <button className="btn primary" disabled={!address.trim() || lookup.busy}>Use this church</button>
            <button type="button" className="btn ghost" onClick={onDone}>Cancel</button>
          </div>
          <button type="button" className="link-btn left" onClick={() => setMode('email')}><Search size={14} /> Don’t know the address? Find it by email</button>
        </form>
      ) : found ? (
        <div className="stack">
          {found.churches ? (
            found.churches.length ? (
              found.churches.map((c) => (
                <button key={c.slug} type="button" className="church-choice" onClick={() => choose(c)}>
                  <strong>{c.name}</strong>
                  <span className="small muted">{c.city}</span>
                </button>
              ))
            ) : (
              <p className="muted">No church on Flockwise uses that email yet.</p>
            )
          ) : (
            <p className="muted">If a church on Flockwise uses <strong>{email}</strong>, we have emailed you its link. Open the email on this device.</p>
          )}
          <button type="button" className="btn ghost" onClick={onDone}>Back</button>
        </div>
      ) : (
        <form className="stack" onSubmit={onEmail}>
          <Field label="Your email" hint="We will email you the churches that use this address">
            <input className="input" type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </Field>
          <FormError error={find.error} />
          <div className="row">
            <button className="btn primary" disabled={!email.trim() || find.busy}>Find my church</button>
            <button type="button" className="btn ghost" onClick={() => setMode('address')}>Back</button>
          </div>
        </form>
      )}
    </div>
  );
}
