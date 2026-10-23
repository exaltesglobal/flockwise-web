// Prayer from anyone: /pray is where the QR on the printed prayer cards lands (a short form, no
// sign-in) and /pray/wall is the lobby kiosk, a tablet showing the shared requests with an
// "I prayed" button and a big "Add a request" button. The kiosk resets itself between people.
import { CheckCircle2, HandHeart, Plus, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';

import type { PrayerWall, PublicPrayerInfo, WallRequest } from '@/api/admin-types';
import { PublicApi } from '@/api/endpoints';
import { ErrorState, Field, FormError, Loading } from '@/components/ui';
import { formatRelative } from '@/lib/format';
import { useAction, useApi } from '@/lib/use-api';

import { Shell } from './public';

const DEVICE_KEY = 'fw.pray.device';
function deviceId() {
  try {
    let v = localStorage.getItem(DEVICE_KEY);
    if (!v) { v = Math.random().toString(36).slice(2, 12); localStorage.setItem(DEVICE_KEY, v); }
    return v;
  } catch { return 'anon'; }
}

/** The request form, shared by the card page and the kiosk. Calls onDone with the thank-you. */
function PrayForm({ info, kiosk, onDone }: { info: PublicPrayerInfo; kiosk: boolean; onDone?: () => void }) {
  const [f, setF] = useState({ text: '', name: '', phone: '', share: false });
  const [done, setDone] = useState<string | null>(null);
  const send = useAction(() => PublicApi.sendPrayer({ text: f.text, name: f.name || undefined, phone: f.phone || undefined, share: f.share, source: kiosk ? 'kiosk' : 'card' }));
  const fields = (send.error as { fields?: Record<string, string> } | null)?.fields ?? {};
  useEffect(() => { if (done && kiosk) { const id = setTimeout(() => onDone?.(), 6000); return () => clearTimeout(id); } }, [done, kiosk, onDone]);
  if (done) {
    return (
      <div className="stack" style={{ alignItems: 'center', textAlign: 'center', gap: 10, padding: '20px 0' }}>
        <CheckCircle2 size={44} color="var(--ok)" />
        <h2 style={{ fontSize: kiosk ? 28 : 22 }}>{done}</h2>
        {kiosk ? <span className="muted">This screen clears in a moment.</span> : <button className="btn" onClick={() => { setDone(null); setF({ text: '', name: '', phone: '', share: false }); }}>Send another</button>}
      </div>
    );
  }
  return (
    <form className={`stack ${kiosk ? 'pray-kiosk-form' : ''}`} onSubmit={async (e) => { e.preventDefault(); const r = await send.run(); if (r) setDone(r.message); }}>
      <FormError error={send.error} />
      <Field label="What can we pray for?" error={fields.text}><textarea className="input" rows={kiosk ? 5 : 4} autoFocus required value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} placeholder="A few words is enough." /></Field>
      <div className="grid cols-2">
        <Field label="Your name (optional)"><input className="input" autoComplete="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Phone, if you would like a call (optional)"><input className="input" type="tel" autoComplete="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
      </div>
      <label className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
        <input type="checkbox" checked={f.share} onChange={(e) => setF({ ...f, share: e.target.checked })} style={{ marginTop: 4 }} />
        <span>Share this on the church prayer wall so others can pray too. <span className="muted small">Only your first name is shown. Leave it unticked and only the pastors see it.</span></span>
      </label>
      <button className="btn primary lg" type="submit" disabled={send.busy || f.text.trim().length < 5} style={{ alignSelf: kiosk ? 'stretch' : 'flex-start' }}><HandHeart size={18} /> Send to the pastors</button>
      {!kiosk && info.church.phone && <span className="small muted">Prefer to talk? Call {info.church.phone}.</span>}
    </form>
  );
}

/** /pray: from the QR on a prayer card. ?kiosk=1 makes it a plain, large-type form for a lobby tablet without the wall. */
export function PrayPage() {
  const [params] = useSearchParams();
  const kiosk = params.get('kiosk') === '1';
  const { data, error, reload } = useApi(PublicApi.prayerInfo);
  const [key, setKey] = useState(0);
  useEffect(() => { if (data) document.title = `Prayer request · ${data.church.name}`; }, [data]);
  if (error) return <Shell><ErrorState error={error} onRetry={reload} /></Shell>;
  if (!data) return <Shell><Loading /></Shell>;
  const body = !data.enabled ? (
    <p className="muted">{data.church.name} takes prayer requests in person{data.church.phone ? `, or on ${data.church.phone}` : ''}.</p>
  ) : <PrayForm key={key} info={data} kiosk={kiosk} onDone={() => setKey((k) => k + 1)} />;
  if (kiosk) {
    return (
      <div className="pray-kiosk">
        <header className="row" style={{ gap: 12 }}>{data.church.logoUrl && <img src={data.church.logoUrl} alt="" style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'cover' }} />}<div><h1 style={{ fontSize: 30 }}>How can we pray for you?</h1><span className="muted">{data.church.name}</span></div></header>
        <div className="card card-pad" style={{ maxWidth: 760 }}>{body}</div>
      </div>
    );
  }
  return (
    <Shell churchName={data.church.name} logoUrl={data.church.logoUrl}>
      <article className="card card-pad stack lg pub-form" style={{ alignItems: 'stretch' }}>
        <div className="row" style={{ gap: 10 }}><HandHeart size={26} color="var(--primary)" /><h1 style={{ fontSize: 24 }}>How can we pray for you?</h1></div>
        <p className="muted">The pastors of {data.church.name} pray for every request this week. Nothing you write is shown to anyone else unless you choose to share it.</p>
        {body}
        {data.stats.prayedThisWeek > 0 && <span className="small muted">{data.stats.prayedThisWeek} prayers prayed by the church this week.</span>}
      </article>
    </Shell>
  );
}

/** /pray/wall?k=KEY: the lobby kiosk. */
export function PrayerWallPage() {
  const [params] = useSearchParams();
  const k = params.get('k') ?? '';
  const device = useRef(deviceId());
  const { data, error, reload, setData } = useApi(() => PublicApi.prayerWall(k, device.current), [k]);
  const [adding, setAdding] = useState(false);
  const pray = useAction((id: string) => PublicApi.prayWall(id, k, device.current));
  const close = useCallback(() => { setAdding(false); reload(); }, [reload]);
  useEffect(() => { const id = setInterval(() => { if (!adding) reload(); }, 60_000); return () => clearInterval(id); }, [adding, reload]);
  useEffect(() => { if (data) document.title = `Prayer wall · ${data.church.name}`; }, [data]);
  // Nobody should leave the form open for the next person: clear it after two idle minutes.
  useEffect(() => { if (!adding) return; let t = setTimeout(close, 120_000); const bump = () => { clearTimeout(t); t = setTimeout(close, 120_000); }; window.addEventListener('pointerdown', bump); window.addEventListener('keydown', bump); return () => { clearTimeout(t); window.removeEventListener('pointerdown', bump); window.removeEventListener('keydown', bump); }; }, [adding, close]);
  if (error) return <div className="pray-kiosk"><ErrorState error={error} onRetry={reload} /></div>;
  if (!data) return <div className="pray-kiosk"><Loading /></div>;
  const onPrayed = (r: WallRequest) => setData({ ...data, requests: data.requests.map((x) => (x.id === r.id ? r : x)) } as PrayerWall);
  return (
    <div className="pray-kiosk">
      <header className="row between wrap" style={{ gap: 12 }}>
        <div className="row" style={{ gap: 12 }}>{data.church.logoUrl && <img src={data.church.logoUrl} alt="" style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'cover' }} />}<div><h1 style={{ fontSize: 28 }}>Prayer wall</h1><span className="muted">{data.church.name} · {data.stats.prayedThisWeek} prayed this week</span></div></div>
        {data.enabled && !adding && <button className="btn primary lg" onClick={() => setAdding(true)}><Plus size={18} /> Add a prayer request</button>}
      </header>
      {adding ? (
        <div className="card card-pad stack" style={{ maxWidth: 760, gap: 10 }}>
          <div className="row between"><h2>How can we pray for you?</h2><button className="btn ghost icon" onClick={close} aria-label="Close"><X size={18} /></button></div>
          <PrayForm info={data} kiosk onDone={close} />
        </div>
      ) : data.requests.length === 0 ? (
        <div className="card card-pad" style={{ textAlign: 'center' }}><p className="muted">No shared requests yet. Be the first.</p></div>
      ) : (
        <div className="pray-grid">
          {data.requests.map((r) => (
            <div key={r.id} className={`card card-pad stack pray-item ${r.status === 'answered' ? 'answered' : ''}`} style={{ gap: 8 }}>
              <div className="row between"><b>{r.name}</b><span className="small muted">{formatRelative(r.createdAt)}</span></div>
              <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{r.text}</p>
              {r.status === 'answered' && <span className="small" style={{ color: 'var(--ok)' }}><CheckCircle2 size={13} /> Answered{r.answeredNote ? `: ${r.answeredNote}` : ''}</span>}
              <button className={`btn ${r.iPrayed ? '' : 'primary'}`} disabled={pray.busy || r.iPrayed} onClick={async () => { const x = await pray.run(r.id); if (x) onPrayed(x); }}>
                <HandHeart size={16} /> {r.iPrayed ? `You prayed · ${r.prayedCount}` : `I prayed${r.prayedCount ? ` · ${r.prayedCount}` : ''}`}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
