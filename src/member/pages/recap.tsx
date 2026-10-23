// "Sunday in 60 seconds" in the member app: the published recaps as cards, and a story player
// (progress bars, tap to advance, hold to pause) that runs about a minute. The same player serves
// the public share page at /r/:id, so a WhatsApp status link opens without signing in.
import { ArrowLeft, Clapperboard, Download, Pause, Play, Share2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';

import type { MemberRecap } from '@/api/admin-types';
import { MemberApi, PublicApi } from '@/api/endpoints';
import { ChurchLogo } from '@/components/brand';
import { ErrorState, Loading } from '@/components/ui';
import { useT } from '@/i18n';
import { DEFAULT_BRAND, fontStack, mix, onColour } from '@/lib/brand';
import { formatDate } from '@/lib/format';
import { shareCard } from '@/lib/invitation';
import { renderRecapCard } from '@/lib/recap-card';
import { useApi } from '@/lib/use-api';

const SLIDE_MS = 10_000;

export function MemberRecapPage() {
  const { t, locale } = useT();
  const { data, error, reload } = useApi(MemberApi.recaps.list);
  return (
    <>
      <div>
        <h1>{t('recapTitle')}</h1>
        <p className="muted">{t('recapBody')}</p>
      </div>
      {error ? <ErrorState error={error} onRetry={reload} /> : !data ? <Loading /> : data.length === 0 ? (
        <div className="card card-pad stack" style={{ alignItems: 'center', textAlign: 'center' }}><Clapperboard size={28} /><p className="muted" style={{ margin: 0 }}>{t('recapNone')}</p></div>
      ) : (
        <div className="stack">
          {data.map((r) => (
            <article key={r.id} className="card card-pad stack recap-card" style={{ gap: 8 }}>
              <span className="small muted">{formatDate(r.date, locale)} · {r.eventTitle}</span>
              <h2 style={{ margin: 0, fontSize: 20 }}>{r.headline}</h2>
              <p className="small muted" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{r.slides[1]?.text ?? r.caption}</p>
              <div className="row wrap" style={{ gap: 8 }}>
                <Link to={`/app/recap/${r.id}`} className="btn primary sm"><Play size={15} /> {t('recapWatch')}</Link>
                <ShareButton r={r} label={t('recapShare')} path={`/app/recap/${r.id}`} />
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

export function MemberRecapStoryPage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const { data, error, reload } = useApi(() => MemberApi.recaps.get(id), [id]);
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <Loading />;
  return <Story r={data} onClose={() => nav('/app/recap')} sharePath={`/r/${data.id}`} />;
}

/** The share page anyone can open from a status link. */
export function PublicRecapPage() {
  const { id = '' } = useParams();
  const { data, error, reload } = useApi(() => PublicApi.recap(id), [id]);
  useEffect(() => { document.title = data ? `${data.headline} · ${data.church.name}` : 'Sunday in 60 seconds'; }, [data]);
  if (error) return <div style={{ padding: 24 }}><ErrorState error={error} onRetry={reload} /></div>;
  if (!data) return <Loading />;
  return <Story r={data} sharePath={`/r/${data.id}`} />;
}

function ShareButton({ r, label, path }: { r: MemberRecap; label: string; path: string }) {
  const [busy, setBusy] = useState(false);
  const share = async () => {
    setBusy(true);
    try {
      const canvas = await renderRecapCard({ church: r.church, recap: r, footer: `${location.origin}/r/${r.id}` });
      await shareCard(canvas, `sunday-${r.date}.png`, `${r.caption}\n${location.origin}${path.startsWith('/app') ? `/r/${r.id}` : path}`);
    } finally { setBusy(false); }
  };
  return <button type="button" className="btn sm" onClick={share} disabled={busy}><Share2 size={15} /> {label}</button>;
}

export function Story({ r, onClose, sharePath }: { r: MemberRecap; onClose?: () => void; sharePath: string }) {
  const { t, locale } = useT();
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [busy, setBusy] = useState(false);
  const n = r.slides.length;
  const brand = r.church.brand ?? DEFAULT_BRAND;
  const style = useMemo(() => ({ '--story-a': brand.primary, '--story-b': mix(brand.primary, onColour(brand.primary) === '#ffffff' ? '#0b1412' : '#ffffff', 0.45), '--story-accent': brand.accent, '--font-heading': fontStack(brand.font) }) as React.CSSProperties, [brand]);
  useEffect(() => {
    if (paused || i >= n - 1) return;
    const h = setTimeout(() => setI((x) => Math.min(n - 1, x + 1)), SLIDE_MS);
    return () => clearTimeout(h);
  }, [i, paused, n]);
  const slide = r.slides[i];
  const link = `${location.origin}${sharePath}`;
  const share = async () => {
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (nav.share) { try { await nav.share({ title: r.headline, text: r.caption, url: link }); return; } catch { /* cancelled, fall through to copy */ } }
    try { await navigator.clipboard.writeText(`${r.caption}\n${link}`); } catch { /* nothing to do */ }
  };
  const saveCard = async () => {
    setBusy(true);
    try { await shareCard(await renderRecapCard({ church: r.church, recap: r, footer: link }), `sunday-${r.date}.png`, `${r.caption}\n${link}`); } finally { setBusy(false); }
  };
  return (
    <div className={`story ${paused ? 'paused' : ''}`} style={style} data-slide={i}>
      <div className="story-bars" aria-hidden>{r.slides.map((_, k) => <i key={`${k}-${k === i ? i : 'x'}`} className={k < i ? 'done' : k === i ? 'on' : ''} style={{ '--story-ms': `${SLIDE_MS}ms` } as React.CSSProperties}><b /></i>)}</div>
      <div className="story-top">
        <ChurchLogo church={{ name: r.church.name, logoUrl: r.church.logoUrl, brand: r.church.brand }} size={30} dark />
        <span className="name">{r.church.name}</span>
        <span className="small">{formatDate(r.date, locale)}</span>
        <button type="button" aria-label={paused ? 'Play' : 'Pause'} onClick={() => setPaused((p) => !p)}>{paused ? <Play size={16} /> : <Pause size={16} />}</button>
        {onClose && <button type="button" aria-label={t('recapBack')} onClick={onClose}><X size={18} /></button>}
      </div>
      <div className="story-slide" key={i}>
        <span className="kicker">{i + 1} / {n} · {t('recapTitle')}</span>
        <h2>{slide.title}</h2>
        {slide.stat && <div className="stat">{slide.stat}</div>}
        <p>{slide.text}</p>
      </div>
      <button type="button" className="story-tap left" aria-label="Previous" onClick={() => setI((x) => Math.max(0, x - 1))} />
      <button type="button" className="story-tap right" aria-label="Next" onClick={() => setI((x) => Math.min(n - 1, x + 1))} />
      <div className="story-actions">
        <button type="button" className="btn sm primary" onClick={share}><Share2 size={15} /> {t('recapShare')}</button>
        <button type="button" className="btn sm" onClick={saveCard} disabled={busy}><Download size={15} /> {t('recapSaveCard')}</button>
        {!onClose && <Link to="/church" className="btn sm"><ArrowLeft size={15} /> {r.church.name}</Link>}
      </div>
      <div className="story-hint">{t('recapTap')}</div>
    </div>
  );
}
