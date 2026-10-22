import { Cake, Check, Droplets, Heart, MessageCircle, Send } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';

import type { Celebration, CelebrationKind, Channel } from '@/api/admin-types';
import { AdminApi } from '@/api/endpoints';
import { Avatar, Empty, ErrorState, Field, FormError, Loading, Modal, Segmented, useToast } from '@/components/ui';
import { formatDay } from '@/lib/format';
import { useCan } from '@/lib/perms';
import { useSession } from '@/lib/session';
import { adminSession } from '@/api/client';
import { useAction, useApi } from '@/lib/use-api';

import { PageHeader } from '../layout';

const KIND_INFO: Record<CelebrationKind, { label: string; icon: typeof Cake; badge: string }> = {
  birthday: { label: 'Birthday', icon: Cake, badge: '' },
  anniversary: { label: 'Wedding anniversary', icon: Heart, badge: 'warn' },
  baptism: { label: 'Baptism anniversary', icon: Droplets, badge: 'gray' },
};

const CHANNELS: { value: Channel; label: string }[] = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'sms', label: 'SMS' },
  { value: 'email', label: 'Email' },
];

function whenLabel(c: Celebration) {
  if (c.daysAway === 0) return 'Today';
  if (c.daysAway === 1) return 'Tomorrow';
  return formatDay(`${c.date}T12:00:00`);
}

function yearsLabel(c: Celebration) {
  if (!c.years) return null;
  if (c.kind === 'birthday') return `Turns ${c.years}`;
  return `${c.years} year${c.years === 1 ? '' : 's'}`;
}

export function greetingText(c: Celebration, church: string, from: string) {
  const first = c.name.split(' ')[0];
  if (c.kind === 'birthday' && c.isChild) return `Happy birthday, ${first}! 🎉 Everyone at ${church} is thanking God for you today. Have a wonderful day!\n\n${from}`;
  if (c.kind === 'birthday') return `Happy birthday, ${first}! 🎂 We thank God for you and pray for a blessed year ahead, full of His goodness.\n\n${from}, ${church}`;
  if (c.kind === 'anniversary') return `Happy wedding anniversary, ${first}! 💐 ${c.years ? `${c.years} years of God’s faithfulness. ` : ''}We pray the Lord keeps blessing your family.\n\n${from}, ${church}`;
  return `Dear ${first}, today marks ${c.years ? `${c.years} year${c.years === 1 ? '' : 's'}` : 'another year'} since your baptism. Rejoicing with you in all God has done!\n\n${from}, ${church}`;
}

/** Indian mobile numbers get the 91 country code so the WhatsApp link opens the right chat. */
const waNumber = (phone: string) => {
  const d = phone.replace(/\D/g, '');
  return d.length === 10 ? `91${d}` : d;
};

/** Upcoming birthdays and anniversaries, with one-tap greetings from the church or from your own WhatsApp. */
export function CelebrationsPage() {
  const [days, setDays] = useState<'7' | '30' | '90'>('7');
  const [kind, setKind] = useState<CelebrationKind | 'all'>('all');
  const { data, error, reload } = useApi(() => AdminApi.celebrations.list(Number(days), kind === 'all' ? undefined : kind), [days, kind]);
  const [greeting, setGreeting] = useState<Celebration | null>(null);
  const session = useSession(adminSession);
  const can = useCan();
  const church = session?.church.name ?? 'our church';
  const me = session ? `${session.member.firstName} ${session.member.lastName}`.trim() : 'Pastor';

  const today = (data ?? []).filter((c) => c.daysAway === 0);
  const later = (data ?? []).filter((c) => c.daysAway > 0);

  const row = (c: Celebration) => {
    const info = KIND_INFO[c.kind];
    const Icon = info.icon;
    return (
      <div key={`${c.personId}-${c.kind}`} className="list-row">
        <Avatar name={c.name} />
        <div className="grow" style={{ minWidth: 0 }}>
          <Link to={`/admin/people/${c.personId}`} style={{ fontWeight: 600, color: 'inherit' }}>{c.name}</Link>
          <div className="small muted row wrap" style={{ gap: 6 }}>
            <span className="row" style={{ gap: 4 }}><Icon size={13} /> {info.label}</span>
            {yearsLabel(c) && <span>· {yearsLabel(c)}</span>}
            {c.isChild && <span>· child</span>}
            {c.householdName && <span>· {c.householdName}</span>}
          </div>
        </div>
        <span className={`badge ${c.daysAway === 0 ? 'ok' : 'gray'}`}>{whenLabel(c)}</span>
        {c.wishes > 0 && <span className="small muted" title="Wishes from members in the app">{c.wishes} 💬</span>}
        {c.greeted ? (
          <span className="badge ok row" style={{ gap: 4 }}><Check size={12} /> Greeted</span>
        ) : can('comms') ? (
          <button className="btn sm" onClick={() => setGreeting(c)}><Send size={14} /> Greet</button>
        ) : null}
        {c.phone && (
          <a className="btn ghost icon sm" title="Open in your WhatsApp" aria-label="Open in your WhatsApp" target="_blank" rel="noreferrer"
            href={`https://wa.me/${waNumber(c.phone)}?text=${encodeURIComponent(greetingText(c, church, me))}`}><MessageCircle size={15} /></a>
        )}
      </div>
    );
  };

  return (
    <>
      <PageHeader title="Celebrations" subtitle="Birthdays, wedding anniversaries and baptism anniversaries coming up. Greet people from the church or from your own WhatsApp." />
      <div className="row wrap" style={{ gap: 10, marginBottom: 14 }}>
        <Segmented value={days} onChange={setDays} options={[{ value: '7', label: 'This week' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }]} />
        <Segmented value={kind} onChange={setKind} options={[{ value: 'all', label: 'All' }, { value: 'birthday', label: 'Birthdays' }, { value: 'anniversary', label: 'Anniversaries' }, { value: 'baptism', label: 'Baptisms' }]} />
      </div>
      {error ? <ErrorState error={error} onRetry={reload} /> : !data ? <Loading /> : data.length === 0 ? (
        <div className="card"><Empty icon={<Cake size={28} />} title="Nothing coming up" body="Add birth dates, wedding anniversaries and baptism dates to people’s profiles and they’ll appear here." /></div>
      ) : (
        <div className="stack">
          {today.length > 0 && <div className="card"><div className="card-head"><h2>Today</h2></div>{today.map(row)}</div>}
          {later.length > 0 && <div className="card"><div className="card-head"><h2>Coming up</h2></div>{later.map(row)}</div>}
        </div>
      )}
      {greeting && <GreetModal c={greeting} text={greetingText(greeting, church, me)} onClose={() => setGreeting(null)} onSent={() => { setGreeting(null); reload(); }} />}
    </>
  );
}

function GreetModal({ c, text, onClose, onSent }: { c: Celebration; text: string; onClose: () => void; onSent: () => void }) {
  const [channel, setChannel] = useState<Channel>(c.phone ? 'whatsapp' : 'email');
  const [body, setBody] = useState(text);
  const toast = useToast();
  const send = useAction(() => AdminApi.celebrations.greet({ personId: c.personId, kind: c.kind, channel, body }));
  const unreachable = channel === 'email' ? !c.email : !c.phone;
  return (
    <Modal title={`Greet ${c.name}`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={send.busy || !body.trim() || unreachable} onClick={async () => { if (await send.run()) { toast('Greeting sent'); onSent(); } }}><Send size={15} /> Send</button></>}>
      <div className="stack">
        <FormError error={send.error} />
        <Field label="Send by" error={unreachable ? `No ${channel === 'email' ? 'email address' : 'mobile number'} on their profile.` : undefined}>
          <Segmented value={channel} options={CHANNELS} onChange={setChannel} />
        </Field>
        <Field label="Message"><textarea className="textarea" rows={6} value={body} onChange={(e) => setBody(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
