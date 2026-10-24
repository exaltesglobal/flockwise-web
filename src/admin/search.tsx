// Search everything from anywhere (Ctrl/Cmd + K): pages, people, services and events, songs and
// groups. Typing "Priya" finds her record, "Christmas" the event, "Amazing Grace" the song.
import { CalendarDays, CornerDownLeft, Music, Search, User, UsersRound } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';

import { AdminApi } from '@/api/endpoints';
import type { AdminEvent, AdminGroup } from '@/api/admin-types';
import { useCan } from '@/lib/perms';

import { useOfficeT } from './i18n';

export type SearchPage = { to: string; label: string; icon: typeof Search; hub?: string };
type Hit = { key: string; to: string; label: string; detail?: string; icon: typeof Search; kind: string };

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');

// Events and groups change rarely during a search, so they load once each time search opens.
function useOnce<T>(load: () => Promise<T>, when: boolean) {
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    if (!when) return;
    let live = true;
    load().then((d) => live && setData(d)).catch(() => live && setData(null));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [when]);
  return data;
}

export function SearchButton({ onOpen }: { onOpen: () => void }) {
  const { tr } = useOfficeT();
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  return (
    <button className="nav-find" onClick={onOpen} aria-label={tr('Search')}>
      <Search size={15} />
      <span className="grow">{tr('Search')}</span>
      <kbd>{mac ? '⌘' : 'Ctrl'} K</kbd>
    </button>
  );
}

export function SearchPalette({ pages, onClose }: { pages: SearchPage[]; onClose: () => void }) {
  const { tr } = useOfficeT();
  const can = useCan();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [at, setAt] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => input.current?.focus(), []);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 180);
    return () => clearTimeout(t);
  }, [q]);

  const events = useOnce(async () => {
    const [up, past] = await Promise.all([AdminApi.events.list('upcoming'), AdminApi.events.list('past').catch(() => ({ data: [] as AdminEvent[] }))]);
    return [...up.data.map((e) => ({ e, past: false })), ...past.data.map((e) => ({ e, past: true }))];
  }, can('events'));
  const groups = useOnce(async () => (await AdminApi.groups.list()).data as AdminGroup[], can('groups'));
  const [people, setPeople] = useState<{ id: string; name: string; detail: string }[]>([]);
  const [songs, setSongs] = useState<{ id: string; title: string; author: string }[]>([]);

  useEffect(() => {
    if (debounced.length < 2) {
      setPeople([]);
      setSongs([]);
      return;
    }
    let live = true;
    if (can('people.view'))
      AdminApi.people
        .list({ q: debounced })
        .then((r) => live && setPeople(r.data.slice(0, 6).map((p) => ({ id: p.id, name: `${p.firstName} ${p.lastName}`.trim(), detail: [p.phone, p.email].filter(Boolean).join(' · ') }))))
        .catch(() => live && setPeople([]));
    if (can('services'))
      AdminApi.services
        .songs(debounced)
        .then((r) => live && setSongs(r.slice(0, 5).map((s) => ({ id: s.id, title: s.title, author: s.author }))))
        .catch(() => live && setSongs([]));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const hits = useMemo<Hit[]>(() => {
    const n = norm(q.trim());
    const out: Hit[] = [];
    const pageHits = pages.filter((p) => !n || norm(tr(p.label)).includes(n) || norm(p.label).includes(n) || (p.hub && norm(tr(p.hub)).includes(n)));
    out.push(...pageHits.slice(0, n ? 6 : 8).map((p) => ({ key: `page:${p.to}`, to: p.to, label: tr(p.label), detail: p.hub && p.hub !== p.label ? tr(p.hub) : undefined, icon: p.icon, kind: tr('Pages') })));
    if (!n) return out;
    out.push(...people.map((p) => ({ key: `person:${p.id}`, to: `/admin/people/${p.id}`, label: p.name, detail: p.detail, icon: User, kind: tr('People') })));
    const evs = (events ?? []).filter(({ e }) => norm(e.title).includes(n)).slice(0, 5);
    out.push(
      ...evs.map(({ e, past }) => ({
        key: `event:${e.id}`,
        to: e.kind === 'service' && can('services') ? `/admin/services?plan=${e.id}` : `/admin/events?open=${e.id}${past ? '&when=past' : ''}`,
        label: e.title,
        detail: new Date(e.startsAt).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }),
        icon: CalendarDays,
        kind: tr('Services & events'),
      })),
    );
    out.push(...songs.map((s) => ({ key: `song:${s.id}`, to: `/admin/services?song=${s.id}`, label: s.title, detail: s.author, icon: Music, kind: tr('Songs') })));
    out.push(
      ...(groups ?? [])
        .filter((g) => norm(g.name).includes(n))
        .slice(0, 5)
        .map((g) => ({ key: `group:${g.id}`, to: `/admin/groups?open=${g.id}`, label: g.name, detail: g.leaderName ?? undefined, icon: UsersRound, kind: tr('Groups') })),
    );
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, pages, people, songs, events, groups, tr]);

  useEffect(() => setAt(0), [q]);
  useEffect(() => {
    list.current?.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
  }, [at]);

  function go(hit: Hit | undefined) {
    if (!hit) return;
    onClose();
    navigate(hit.to);
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setAt((a) => Math.min(a + 1, hits.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setAt((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(hits[at]);
    } else if (e.key === 'Escape') onClose();
  }

  let lastKind = '';
  return (
    <div className="palette-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-label={tr('Search')}>
        <label className="palette-input">
          <Search size={18} />
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder={tr('Search people, events, songs, groups and pages')} />
          <kbd>Esc</kbd>
        </label>
        <div className="palette-list" ref={list}>
          {hits.map((h, i) => {
            const head = h.kind !== lastKind ? h.kind : null;
            lastKind = h.kind;
            const Icon = h.icon;
            return (
              <div key={h.key}>
                {head && <div className="palette-head">{head}</div>}
                <button className={`palette-row ${i === at ? 'on' : ''}`} onMouseEnter={() => setAt(i)} onClick={() => go(h)}>
                  <Icon size={16} />
                  <span className="grow ellipsis"><b>{h.label}</b>{h.detail && <span className="muted small"> · {h.detail}</span>}</span>
                  {i === at && <CornerDownLeft size={14} className="muted" />}
                </button>
              </div>
            );
          })}
          {q.trim() && !hits.length && <p className="palette-none muted">{tr('Nothing found for “{q}”.', { q: q.trim() })}</p>}
        </div>
      </div>
    </div>
  );
}

/** Ctrl/Cmd + K anywhere in the office opens search. */
export function useSearchShortcut(open: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        open();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
}
