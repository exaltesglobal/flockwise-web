import { Check, Monitor, Moon, Palette, Sun } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { SCHEMES, setAppearance, useAppearance, type ThemeMode } from '@/lib/theme';

const MODES: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'Auto', icon: Monitor },
];

/** Mode and brand colour scheme. Inline for settings pages, or as a popover button for menus. */
export function AppearancePanel() {
  const a = useAppearance();
  return (
    <div className="appearance">
      <div className="section-title">Mode</div>
      <div className="segmented appearance-modes" role="radiogroup" aria-label="Mode">
        {MODES.map(({ value, label, icon: Icon }) => (
          <button key={value} role="radio" aria-checked={a.mode === value} className={a.mode === value ? 'on' : ''} onClick={() => setAppearance({ mode: value })}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>
      <div className="section-title">Colours</div>
      <div className="appearance-schemes" role="radiogroup" aria-label="Colour scheme">
        {SCHEMES.map((s) => (
          <button key={s.value} role="radio" aria-checked={a.scheme === s.value} className={`scheme-option ${a.scheme === s.value ? 'on' : ''}`} onClick={() => setAppearance({ scheme: s.value })} title={s.hint}>
            <span className="scheme-swatch" style={{ background: `linear-gradient(135deg, ${s.swatch[1]} 0 50%, ${s.swatch[0]} 50% 100%)` }}>
              {a.scheme === s.value && <Check size={14} />}
            </span>
            <span>{s.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function ThemeButton({ className = 'btn ghost icon sm', placement = 'up' }: { className?: string; placement?: 'up' | 'down' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);
  return (
    <div className="theme-pop-wrap" ref={ref}>
      <button className={className} onClick={() => setOpen((o) => !o)} title="Appearance" aria-label="Appearance" aria-expanded={open}>
        <Palette size={17} />
      </button>
      {open && (
        <div className={`card theme-pop ${placement}`}>
          <AppearancePanel />
        </div>
      )}
    </div>
  );
}
