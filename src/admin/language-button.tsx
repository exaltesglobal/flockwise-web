// The office language, per browser: the globe beside the theme button at the foot of the menu.
import { Languages } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { LANGUAGES } from '@/core/languages';

import { setOfficeLanguage, useOfficeT } from './i18n';

const REGIONS = [
  { id: 'world', label: 'English' },
  { id: 'india', label: 'India' },
  { id: 'asia', label: 'Asia' },
] as const;

export function LanguagePicker({ id }: { id?: string }) {
  const { lang, tr } = useOfficeT();
  return (
    <select id={id} className="select" value={lang} onChange={(e) => setOfficeLanguage(e.target.value)} aria-label={tr('Office language')}>
      {REGIONS.map((r) => (
        <optgroup key={r.id} label={r.label}>
          {LANGUAGES.filter((l) => l.region === r.id).map((l) => (
            <option key={l.code} value={l.code}>{l.code === 'en' ? 'English' : `${l.label} · ${l.english}`}</option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

export function LanguageButton() {
  const { tr } = useOfficeT();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <div className="lang-button" ref={box}>
      <button className="btn ghost icon sm" onClick={() => setOpen(!open)} title={tr('Office language')} aria-label={tr('Office language')} aria-expanded={open}>
        <Languages size={17} />
      </button>
      {open && (
        <div className="lang-pop card">
          <label className="small muted" htmlFor="office-lang">{tr('Office language')}</label>
          <LanguagePicker id="office-lang" />
          <p className="small muted">{tr('Menus and everyday words change now; more of each page follows in coming updates.')}</p>
        </div>
      )}
    </div>
  );
}
