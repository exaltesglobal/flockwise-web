// Settings › Church › Brand kit: the logo, colours and font every member-facing screen, email
// and invitation uses. Saved with the church settings.
import { ImagePlus, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';

import type { BrandKit, ChurchSettings } from '@/api/admin-types';
import { Field } from '@/components/ui';
import { BRAND_FONTS, DEFAULT_BRAND, brandVars, readLogo } from '@/lib/brand';

type Props = { form: ChurchSettings; set: <K extends keyof ChurchSettings>(k: K, v: ChurchSettings[K]) => void };

function LogoPicker({ value, onChange, label, hint, dark = false }: { value: string | null | undefined; onChange: (v: string | null) => void; label: string; hint: string; dark?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  async function pick(f: File) {
    setError(null);
    try {
      onChange(await readLogo(f));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <Field label={label} hint={error ?? hint} error={error ?? undefined}>
      <div className="row" style={{ gap: 12 }}>
        <div className={`logo-well ${dark ? 'dark' : ''}`} onClick={() => input.current?.click()} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && input.current?.click()}>
          {value ? <img src={value} alt="" /> : <ImagePlus size={22} className="muted" />}
        </div>
        <div className="stack" style={{ gap: 6 }}>
          <button type="button" className="btn sm" onClick={() => input.current?.click()}>{value ? 'Change' : 'Upload'}</button>
          {value && <button type="button" className="btn sm ghost danger" onClick={() => onChange(null)}><Trash2 size={13} /> Remove</button>}
        </div>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void pick(f); e.target.value = ''; }} />
      </div>
    </Field>
  );
}

function Colour({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint: string }) {
  const [text, setText] = useState(value);
  const commit = (v: string) => {
    setText(v);
    if (/^#[0-9a-f]{6}$/i.test(v)) onChange(v.toLowerCase());
  };
  return (
    <Field label={label} hint={hint}>
      <div className="row" style={{ gap: 8 }}>
        <input type="color" className="colour-swatch" value={/^#[0-9a-f]{6}$/i.test(text) ? text : value} onChange={(e) => commit(e.target.value)} aria-label={`${label} colour`} />
        <input className="input mono" style={{ width: 120 }} value={text} onChange={(e) => commit(e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`)} maxLength={7} />
      </div>
    </Field>
  );
}

export function BrandKitCard({ form, set }: Props) {
  const brand: BrandKit = { ...DEFAULT_BRAND, ...(form.brand ?? {}) };
  const setBrand = (patch: Partial<BrandKit>) => set('brand', { ...brand, ...patch });
  return (
    <div className="card">
      <div className="card-head"><h2>Brand kit</h2></div>
      <div className="card-body grid cols-2">
        <div className="stack">
          <LogoPicker label="Logo" hint="PNG or SVG, square works best. Shown beside the church name in the office, the member app, the public page, bulletins, certificates, emails and invitations." value={form.logoUrl} onChange={(v) => set('logoUrl', v)} />
          <LogoPicker label="Logo for dark backgrounds" hint="Optional. Used on the projector and in dark mode." value={brand.logoDarkUrl} onChange={(v) => setBrand({ logoDarkUrl: v })} dark />
          <div className="grid cols-2">
            <Colour label="Main colour" hint="Buttons, headers, emails" value={brand.primary} onChange={(v) => setBrand({ primary: v })} />
            <Colour label="Highlight colour" hint="Ribbons and accents" value={brand.accent} onChange={(v) => setBrand({ accent: v })} />
          </div>
          <Field label="Font">
            <div className="font-options">
              {BRAND_FONTS.map((f) => (
                <label key={f.id} className={`font-option ${brand.font === f.id ? 'on' : ''}`} style={{ fontFamily: f.stack }}>
                  <input type="radio" name="brand-font" checked={brand.font === f.id} onChange={() => setBrand({ font: f.id })} />
                  <b>{f.label}</b>
                  <span>{f.sample}</span>
                </label>
              ))}
            </div>
          </Field>
          <Field label="Tagline" hint="One line under the name on invitations and the public page"><input className="input" value={brand.tagline ?? ''} maxLength={120} onChange={(e) => setBrand({ tagline: e.target.value })} placeholder="A home for everyone in Hyderabad" /></Field>
        </div>
        <BrandPreview form={form} brand={brand} />
      </div>
    </div>
  );
}

function BrandPreview({ form, brand }: { form: ChurchSettings; brand: BrandKit }) {
  const light = brandVars(brand, false);
  const dark = brandVars(brand, true);
  return (
    <div className="stack">
      <span className="small muted">How it looks</span>
      <div className="brand-preview" style={light}>
        <div className="bp-head">
          {form.logoUrl ? <img src={form.logoUrl} alt="" /> : <span className="bp-logo-blank" />}
          <div><b>{form.name || 'Your church'}</b>{brand.tagline && <small>{brand.tagline}</small>}</div>
        </div>
        <div className="bp-body">
          <div className="bp-line" style={{ width: '70%' }} />
          <div className="bp-line" style={{ width: '45%' }} />
          <div className="row" style={{ gap: 8, marginTop: 8 }}>
            <span className="btn primary sm" style={{ pointerEvents: 'none' }}>I’m going</span>
            <span className="btn sm" style={{ pointerEvents: 'none', color: 'var(--primary)' }}>Give</span>
            <span className="badge accent">New</span>
          </div>
        </div>
      </div>
      <div className="brand-preview dark" style={dark}>
        <div className="bp-head">
          {(brand.logoDarkUrl || form.logoUrl) ? <img src={brand.logoDarkUrl || form.logoUrl!} alt="" /> : <span className="bp-logo-blank" />}
          <div><b>{form.name || 'Your church'}</b><small>Dark mode and projector</small></div>
        </div>
        <div className="bp-body">
          <div className="bp-line" style={{ width: '60%' }} />
          <div className="row" style={{ gap: 8, marginTop: 8 }}>
            <span className="btn primary sm" style={{ pointerEvents: 'none' }}>I’m going</span>
            <span className="badge accent">New</span>
          </div>
        </div>
      </div>
      <p className="small muted">Emails get a letterhead in the main colour with the logo beside the name. Invitations (Events › Invitation) use the same kit.</p>
    </div>
  );
}
