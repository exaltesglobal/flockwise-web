import { Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { Person } from '@/api/admin-types';
import { AdminApi } from '@/api/endpoints';
import { Avatar } from '@/components/ui';

export type PickedPerson = { id: string; name: string };

/** Type-ahead search over the people list. Calls onPick with the chosen person. */
export function PersonSearch({ onPick, placeholder = 'Search people by name, phone or email', exclude = [], autoFocus }: { onPick: (p: PickedPerson, full: Person) => void; placeholder?: string; exclude?: string[]; autoFocus?: boolean }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Person[]>([]);
  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    let live = true;
    const t = setTimeout(() => {
      AdminApi.people.list({ q }).then((r) => live && setResults(r.data.filter((p) => !exclude.includes(p.id)).slice(0, 8))).catch(() => undefined);
    }, 180);
    return () => {
      live = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  return (
    <div className="picker">
      <div className="search">
        <Search size={16} />
        <input className="input" autoFocus={autoFocus} value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} />
      </div>
      {results.length > 0 && (
        // Inside a <label> (Field), a click on a result would otherwise be retargeted to the search box.
        <div className="picker-menu card" onClick={(e) => e.preventDefault()}>
          {results.map((p) => (
            <button
              key={p.id}
              type="button"
              className="picker-item"
              onClick={() => {
                onPick({ id: p.id, name: `${p.firstName} ${p.lastName}`.trim() }, p);
                setQ('');
                setResults([]);
              }}
            >
              <Avatar name={`${p.firstName} ${p.lastName}`} />
              <span className="grow">
                <b>{p.firstName} {p.lastName}</b>
                <span className="small muted ellipsis" style={{ display: 'block' }}>{[p.householdName, p.phone, p.email].filter(Boolean).join(' · ')}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** A single-person field: shows the chosen person with a clear button, or the search box. */
export function PersonField({ value, onChange, placeholder }: { value: PickedPerson | null; onChange: (p: PickedPerson | null) => void; placeholder?: string }) {
  if (value)
    return (
      <div className="chip-field">
        <Avatar name={value.name} />
        <b className="grow">{value.name}</b>
        <button type="button" className="btn ghost icon sm" onClick={() => onChange(null)} aria-label="Clear"><X size={15} /></button>
      </div>
    );
  return <PersonSearch onPick={onChange} placeholder={placeholder} />;
}
