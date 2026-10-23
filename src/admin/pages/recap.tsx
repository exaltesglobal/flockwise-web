// "Sunday in 60 seconds": one button after the service writes the week up from the records
// (one AI request); the office edits the words, sees the card and slides in the church's colours,
// downloads them for WhatsApp status, records the reel, and publishes to the member app.
import { Check, Clapperboard, Copy, Download, ExternalLink, Film, Megaphone, Sparkles, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { Recap, RecapFacts, RecapSlide } from '@/api/admin-types';
import { adminSession } from '@/api/client';
import { AdminApi } from '@/api/endpoints';
import { Empty, ErrorState, Field, FormError, Loading, Modal, useToast } from '@/components/ui';
import { formatDate, formatRelative } from '@/lib/format';
import { download, recordReel, renderRecapCard, renderRecapSlide, pngUrl } from '@/lib/recap-card';
import { useSession } from '@/lib/session';
import { useAction, useApi } from '@/lib/use-api';

import { PageHeader } from '../layout';

const LANGS: { value: string; label: string }[] = [
  { value: 'en', label: 'English' }, { value: 'hi', label: 'हिन्दी Hindi' }, { value: 'te', label: 'తెలుగు Telugu' }, { value: 'ta', label: 'தமிழ் Tamil' }, { value: 'ml', label: 'മലയാളം Malayalam' }, { value: 'kn', label: 'ಕನ್ನಡ Kannada' },
];
const money = (minor: number) => `₹${(minor / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

export function RecapPage() {
  const { data, error, reload } = useApi(AdminApi.recaps.list);
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const current = data.find((r) => r.id === open) ?? null;
  return (
    <>
      <PageHeader
        title="Sunday in 60 seconds"
        subtitle="After the service, one button turns the week's records into a recap card and a short reel for WhatsApp status and the member app. The numbers come from check-ins, the plan and the sermon; the AI only writes the words."
        actions={<button className="btn primary" onClick={() => setCreating(true)}><Sparkles size={16} /> Write this Sunday's recap</button>}
      />
      {data.length === 0 ? (
        <div className="card"><Empty icon={<Clapperboard size={28} />} title="No recap yet" body="Write one after Sunday's service. You get a headline, a status caption and five slides to check before anyone sees them." action={<button className="btn primary" onClick={() => setCreating(true)}>Write this Sunday's recap</button>} /></div>
      ) : (
        <div className="grid cols-3">
          {data.map((r) => (
            <button key={r.id} className="card card-pad stack text-left" style={{ gap: 8, cursor: 'pointer' }} onClick={() => setOpen(r.id)}>
              <div className="row between wrap" style={{ gap: 8 }}>
                <span className={`badge ${r.status === 'published' ? 'ok' : 'gray'}`}>{r.status === 'published' ? 'Published' : 'Draft'}</span>
                <span className="small muted">{formatDate(r.date)}</span>
              </div>
              <h3>{r.headline}</h3>
              <span className="small muted">{r.eventTitle} · {r.slides.length} slides · {LANGS.find((l) => l.value === r.language)?.label ?? r.language}</span>
              <span className="small muted">{r.stats.attendance ? `${r.stats.attendance} worshipped` : ''}{r.stats.firstTimers ? ` · ${r.stats.firstTimers} new` : ''}{r.status === 'published' && r.publishedAt ? ` · told ${r.notified} people ${formatRelative(r.publishedAt)}` : ''}</span>
            </button>
          ))}
        </div>
      )}
      {current && <Detail r={current} onClose={() => setOpen(null)} onChange={reload} onDeleted={() => { setOpen(null); reload(); }} />}
      {creating && <WriteForm onClose={() => setCreating(false)} onSaved={(r) => { setCreating(false); reload(); setOpen(r.id); }} />}
    </>
  );
}

function WriteForm({ onClose, onSaved }: { onClose: () => void; onSaved: (r: Recap) => void }) {
  const sundays = useApi(AdminApi.recaps.sundays);
  const [eventId, setEventId] = useState('');
  const [language, setLanguage] = useState('en');
  const [includeGiving, setIncludeGiving] = useState(false);
  const chosen = eventId || sundays.data?.[0]?.eventId || '';
  const facts = useApi(() => (chosen ? AdminApi.recaps.facts(chosen, includeGiving) : Promise.resolve(null)), [chosen, includeGiving]);
  const write = useAction(() => AdminApi.recaps.create({ eventId: chosen, language, includeGiving }));
  const f: RecapFacts | null = facts.data ?? null;
  return (
    <Modal title="Write this Sunday's recap" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={write.busy || !chosen} onClick={async () => { const r = await write.run(); if (r) onSaved(r); }}><Sparkles size={16} /> {write.busy ? 'Writing…' : 'Write it (1 AI request)'}</button></>}>
      <div className="stack">
        <Field label="Which Sunday"><select className="input" value={chosen} onChange={(e) => setEventId(e.target.value)}>{(sundays.data ?? []).map((s) => <option key={s.eventId} value={s.eventId}>{formatDate(s.date)} · {s.title}{s.attendance ? ` · ${s.attendance}` : ''}{s.recapId ? ' · has a recap' : ''}</option>)}</select></Field>
        <Field label="Language"><select className="input" value={language} onChange={(e) => setLanguage(e.target.value)}>{LANGS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}</select></Field>
        <label className="row small" style={{ gap: 8 }}><input type="checkbox" checked={includeGiving} onChange={(e) => setIncludeGiving(e.target.checked)} /> Include the week's giving total (off by default; members and the share page never see money unless you put it in the words)</label>
        {f && (
          <div className="card card-pad stack" style={{ gap: 6 }}>
            <b>What the recap will be written from</b>
            <span className="small">{f.attendance ? `${f.attendance} worshipped${f.children ? `, ${f.children} children` : ''}` : 'No attendance recorded yet'}</span>
            <span className="small">{f.sermon ? `Sermon: "${f.sermon.title}" · ${f.sermon.speaker} · ${f.sermon.scripture}` : 'No sermon on record for this service'}</span>
            <span className="small">{f.songs.length ? `Songs: ${f.songs.join(', ')}` : 'No service plan with songs'}</span>
            <span className="small">{f.firstTimers.length ? `First Sunday: ${f.firstTimers.join(', ')}` : 'No first-timers found'} · {f.prayers.prayed} prayers for {f.prayers.requests} requests · {f.celebrations.length} celebrations this week</span>
            <span className="small">{f.nextEvents.length ? `Coming up: ${f.nextEvents.map((e) => e.title).join(', ')}` : 'Nothing else on the calendar this week'}{f.giving != null ? ` · Giving ${money(f.giving)}` : ''}</span>
          </div>
        )}
        <FormError error={write.error} />
      </div>
    </Modal>
  );
}

function Detail({ r, onClose, onChange, onDeleted }: { r: Recap; onClose: () => void; onChange: () => void; onDeleted: () => void }) {
  const toast = useToast();
  const session = useSession(adminSession);
  const church = { name: session?.church.name ?? '', logoUrl: session?.church.logoUrl ?? null, brand: session?.church.brand, tagline: session?.church.brand?.tagline };
  const [headline, setHeadline] = useState(r.headline);
  const [caption, setCaption] = useState(r.caption);
  const [slides, setSlides] = useState<RecapSlide[]>(r.slides);
  const [preview, setPreview] = useState<{ card: string; slides: string[] } | null>(null);
  const [reel, setReel] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const dirty = headline !== r.headline || caption !== r.caption || JSON.stringify(slides) !== JSON.stringify(r.slides);
  const draft = { headline, date: r.date, slides, stats: r.stats, eventTitle: r.eventTitle };
  const link = `${location.origin}/r/${r.id}`;
  useEffect(() => {
    let live = true;
    const h = setTimeout(async () => {
      const card = await pngUrl(await renderRecapCard({ church, recap: draft, footer: link }));
      const imgs = await Promise.all(slides.map((_, i) => renderRecapSlide({ church, recap: draft }, i).then(pngUrl)));
      if (live) setPreview({ card, slides: imgs });
    }, 300);
    return () => { live = false; clearTimeout(h); };
  }, [headline, JSON.stringify(slides), church.name, church.logoUrl]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = useAction(async () => { await AdminApi.recaps.update(r.id, { headline, caption, slides }); onChange(); toast('Saved'); });
  const publish = useAction(async () => { if (dirty) await AdminApi.recaps.update(r.id, { headline, caption, slides }); const p = await AdminApi.recaps.publish(r.id); onChange(); toast(`Published. ${p.notified} people told in the app.`); });
  const remove = useAction(async () => { await AdminApi.recaps.remove(r.id); onDeleted(); });
  const setSlide = (i: number, patch: Partial<RecapSlide>) => setSlides(slides.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  const dl = async (what: 'card' | 'slides') => {
    if (what === 'card') { const c = await renderRecapCard({ church, recap: draft, footer: link }); c.toBlob((b) => b && download(b, `sunday-${r.date}-card.png`), 'image/png'); return; }
    for (let i = 0; i < slides.length; i++) { const c = await renderRecapSlide({ church, recap: draft }, i); await new Promise<void>((res) => c.toBlob((b) => { if (b) download(b, `sunday-${r.date}-${i + 1}.png`); res(); }, 'image/png')); }
  };
  const record = async () => {
    setReel(0);
    try {
      const blob = await recordReel({ church, recap: draft }, 10, setReel);
      if (!blob) toast('This browser cannot record video. Use the slide images instead.');
      else download(blob, `sunday-${r.date}-reel.webm`);
    } finally { setReel(null); }
  };
  const copy = async () => { try { await navigator.clipboard.writeText(`${caption}\n${link}`); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { toast('Select the caption and copy it.'); } };
  return (
    <Modal title={r.headline} onClose={onClose} side wide footer={
      <>
        <button className="btn danger" onClick={() => remove.run()} disabled={remove.busy}><Trash2 size={16} /> Delete</button>
        <span style={{ flex: 1 }} />
        <button className="btn" onClick={() => save.run()} disabled={!dirty || save.busy}>Save</button>
        {r.status !== 'published' && <button className="btn primary" onClick={() => publish.run()} disabled={publish.busy}><Megaphone size={16} /> Publish to members</button>}
      </>
    }>
      <div className="grid cols-2" style={{ alignItems: 'start' }}>
        <div className="stack">
          <div className="row wrap small muted" style={{ gap: 8 }}>
            <span className={`badge ${r.status === 'published' ? 'ok' : 'gray'}`}>{r.status === 'published' ? 'Published' : 'Draft'}</span>
            <span>{formatDate(r.date)} · {r.eventTitle} · written by {r.createdBy || 'the office'}</span>
          </div>
          {r.status === 'published' && <div className="row wrap small" style={{ gap: 8 }}><a href={link} target="_blank" rel="noreferrer" className="btn sm"><ExternalLink size={14} /> Share page</a><span className="muted">{link}</span></div>}
          <Field label="Headline"><input className="input" value={headline} maxLength={120} onChange={(e) => setHeadline(e.target.value)} /></Field>
          <Field label="WhatsApp status caption" hint="Paste this under the card or the reel. The share link is added when you copy."><textarea className="input" rows={5} value={caption} maxLength={600} onChange={(e) => setCaption(e.target.value)} /></Field>
          <div className="row wrap" style={{ gap: 8 }}>
            <button className="btn sm" onClick={copy}>{copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy caption'}</button>
            <button className="btn sm" onClick={() => dl('card')}><Download size={14} /> Card (PNG)</button>
            <button className="btn sm" onClick={() => dl('slides')}><Download size={14} /> {slides.length} slides (PNG)</button>
            <button className="btn sm" onClick={record} disabled={reel !== null}><Film size={14} /> {reel === null ? 'Record reel (WebM, ~1 min)' : `Recording… ${Math.round(reel * 100)}%`}</button>
          </div>
          <b>Slides</b>
          {slides.map((s, i) => (
            <div key={i} className="card card-pad stack" style={{ gap: 6 }}>
              <div className="row" style={{ gap: 8 }}>
                <span className="small muted" style={{ width: 20 }}>{i + 1}</span>
                <input className="input" value={s.title} maxLength={60} placeholder="Title" onChange={(e) => setSlide(i, { title: e.target.value })} />
                <input className="input" style={{ width: 150 }} value={s.stat ?? ''} maxLength={40} placeholder="Big number" onChange={(e) => setSlide(i, { stat: e.target.value || null })} />
              </div>
              <textarea className="input" rows={2} value={s.text} maxLength={300} onChange={(e) => setSlide(i, { text: e.target.value })} />
            </div>
          ))}
          <FormError error={save.error ?? publish.error ?? remove.error} />
        </div>
        <div className="stack">
          <b>Status card</b>
          {preview ? <img src={preview.card} alt="Recap card" style={{ width: '100%', maxWidth: 300, borderRadius: 12, border: '1px solid var(--border)' }} /> : <Loading />}
          <b>Reel slides</b>
          <div className="row wrap" style={{ gap: 8 }}>{preview?.slides.map((src, i) => <img key={i} src={src} alt={`Slide ${i + 1}`} style={{ width: 120, borderRadius: 8, border: '1px solid var(--border)' }} />)}</div>
          <p className="small muted">Post the card to WhatsApp status with the caption, or the five slides one after another for the reel. Members get a push and watch it in the app; the share page works for anyone.</p>
        </div>
      </div>
    </Modal>
  );
}
