// "+ New" at the top of the office menu: start the everyday jobs from anywhere, without first
// finding the right page. Each item opens its page with ?new=1 so the form is already open.
import { CalendarPlus, Gift, HeartHandshake, Megaphone, MessageSquarePlus, Plus, UserPlus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';

import type { Permission } from '@/api/admin-types';
import { useCan } from '@/lib/perms';

import { useFeatures } from './features';
import { useOfficeT } from './i18n';

const ITEMS: { to: string; label: string; icon: typeof Plus; perm: Permission[]; feature: string }[] = [
  { to: '/admin/people?new=1', label: 'Person', icon: UserPlus, perm: ['people.edit'], feature: 'people' },
  { to: '/admin/events?new=1', label: 'Event or service', icon: CalendarPlus, perm: ['events'], feature: 'events' },
  { to: '/admin/messages?new=1', label: 'Message', icon: MessageSquarePlus, perm: ['comms'], feature: 'messages' },
  { to: '/admin/announcements?new=1', label: 'Announcement', icon: Megaphone, perm: ['comms'], feature: 'announcements' },
  { to: '/admin/giving?new=1', label: 'Cash or cheque gift', icon: Gift, perm: ['giving.edit'], feature: 'giving' },
  { to: '/admin/care?new=1', label: 'Care case', icon: HeartHandshake, perm: ['care'], feature: 'care' },
];

export function NewMenu() {
  const can = useCan();
  const { tr } = useOfficeT();
  const features = useFeatures();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname, location.search]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  const items = ITEMS.filter((i) => can(...i.perm) && features.on(i.feature));
  if (!items.length) return null;
  return (
    <div className="new-menu" ref={box}>
      <button className="new-menu-btn" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu">
        <Plus size={17} /> {tr('New')}
      </button>
      {open && (
        <div className="new-menu-pop" role="menu">
          {items.map(({ to, label, icon: Icon }) => (
            <Link key={to} to={to} role="menuitem"><Icon size={16} /> {tr(label)}</Link>
          ))}
        </div>
      )}
    </div>
  );
}
