// One "Filter" button instead of a row of dropdowns: the choices open underneath, and whatever is
// switched on shows as a chip you can clear with one tap.
import { SlidersHorizontal, X } from 'lucide-react';
import { useState } from 'react';

export type FilterDef = {
  key: string;
  label: string;
  value: string;
  /** The first option with value '' is the "any" choice. */
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  hidden?: boolean;
};

export function FilterButton({ filters, labels = {} }: { filters: FilterDef[]; labels?: { filter?: string; clear?: string } }) {
  const shown = filters.filter((f) => !f.hidden);
  const active = shown.filter((f) => f.value);
  const [open, setOpen] = useState(false);
  if (!shown.length) return null;
  return (
    <>
      <button className={`btn filter-btn ${open ? 'on' : ''}`} onClick={() => setOpen(!open)} aria-expanded={open}>
        <SlidersHorizontal size={15} /> {labels.filter ?? 'Filter'}
        {active.length > 0 && <span className="filter-count">{active.length}</span>}
      </button>
      {active.map((f) => (
        <span key={f.key} className="filter-chip">
          <span className="muted">{f.label}:</span> {f.options.find((o) => o.value === f.value)?.label ?? f.value}
          <button onClick={() => f.onChange('')} aria-label={`Clear ${f.label}`}><X size={13} /></button>
        </span>
      ))}
      {active.length > 1 && <button className="link-btn small" onClick={() => active.forEach((f) => f.onChange(''))}>{labels.clear ?? 'Clear all'}</button>}
      {open && (
        <div className="filter-panel">
          {shown.map((f) => (
            <label key={f.key} className="field">
              <span>{f.label}</span>
              <select className="select" value={f.value} onChange={(e) => f.onChange(e.target.value)}>
                {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
          ))}
        </div>
      )}
    </>
  );
}
