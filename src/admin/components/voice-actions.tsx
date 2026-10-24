// The cards the voice assistant prepares: a family to add, a gift to record, a care follow-up.
// The office checks the details (names come from speech, so they may need a fix), then confirms;
// only then is anything saved, through the normal office endpoints.
import { Check, HandCoins, HeartHandshake, Plus, Trash2, UsersRound, X } from 'lucide-react';
import { useState } from 'react';

import { AdminApi } from '@/api/endpoints';
import type { VoiceAction, VoiceDone, VoiceMember } from '@/core/types';
import { FormError } from '@/components/ui';
import { useAction } from '@/lib/use-api';

const RELATIONS: { value: VoiceMember['relation']; label: string }[] = [
  { value: 'head', label: 'Head of family' }, { value: 'spouse', label: 'Husband / wife' }, { value: 'child', label: 'Son / daughter' }, { value: 'parent', label: 'Father / mother' }, { value: 'other', label: 'Other' },
];
const METHODS = [['cash', 'Cash'], ['cheque', 'Cheque'], ['upi', 'UPI'], ['bank_transfer', 'Bank transfer'], ['card', 'Card'], ['netbanking', 'Net banking']] as const;

export function VoiceActionCard({ action }: { action: VoiceAction }) {
  const [a, setA] = useState<VoiceAction>(action);
  const [state, setState] = useState<'open' | 'dismissed' | VoiceDone>('open');
  const go = useAction(async () => setState(await AdminApi.ai.voiceDo(a)));
  if (state === 'dismissed') return <div className="small muted">Left out.</div>;
  if (state !== 'open') return <div className="card card-pad row" style={{ gap: 8 }}><Check size={16} style={{ color: 'var(--primary)' }} /> <span className="grow">{state.text}</span>{state.link && <a className="btn sm" href={state.link}>Open</a>}</div>;
  const footer = (
    <>
      <FormError error={go.error} />
      <div className="row" style={{ gap: 8 }}>
        <button className="btn primary sm" disabled={go.busy} onClick={() => void go.run()}><Check size={14} /> Confirm</button>
        <button className="btn sm" onClick={() => setState('dismissed')}><X size={14} /> Leave it</button>
      </div>
    </>
  );
  if (a.kind === 'add_family') {
    // A new surname for the head carries to the others who shared the old one, and to the family name.
    const setM = (i: number, patch: Partial<VoiceMember>) => {
      const old = a.members[i];
      const surname = i === 0 && patch.lastName !== undefined ? patch.lastName : null;
      const members = a.members.map((m, n) => (n === i ? { ...m, ...patch } : surname !== null && m.lastName === old.lastName ? { ...m, lastName: surname } : m));
      const auto = a.householdName === `${old.firstName}'s family` || a.householdName === `${old.lastName} family`;
      setA({ ...a, members, householdName: surname !== null && auto ? (surname.trim() ? `${surname.trim()} family` : `${old.firstName}'s family`) : a.householdName });
    };
    return (
      <div className="card card-pad stack" style={{ gap: 8 }}>
        <b className="row" style={{ gap: 6 }}><UsersRound size={16} /> Add a family</b>
        <div className="row wrap" style={{ gap: 6 }}>
          <input className="input sm" style={{ width: 200 }} value={a.householdName} onChange={(e) => setA({ ...a, householdName: e.target.value })} aria-label="Family name" />
          <select className="input sm" style={{ width: 'auto' }} value={a.status} onChange={(e) => setA({ ...a, status: e.target.value as typeof a.status })} aria-label="Status"><option value="visitor">Visitor</option><option value="regular">Regular</option><option value="member">Member</option></select>
          <input className="input sm" style={{ width: 180 }} value={a.area} onChange={(e) => setA({ ...a, area: e.target.value })} placeholder="Area (optional)" aria-label="Area" />
        </div>
        {a.members.map((m, i) => (
          <div key={i} className="row wrap" style={{ gap: 6 }}>
            <input className="input sm" style={{ width: 130 }} value={m.firstName} onChange={(e) => setM(i, { firstName: e.target.value })} placeholder="First name" aria-label="First name" />
            <input className="input sm" style={{ width: 130 }} value={m.lastName} onChange={(e) => setM(i, { lastName: e.target.value })} placeholder="Surname" aria-label="Surname" />
            <select className="input sm" style={{ width: 'auto' }} value={m.relation} onChange={(e) => setM(i, { relation: e.target.value as VoiceMember['relation'] })} aria-label="Relation">{RELATIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</select>
            <input className="input sm" style={{ width: 130 }} value={m.phone ?? ''} onChange={(e) => setM(i, { phone: e.target.value || null })} placeholder="Mobile (optional)" aria-label="Mobile" />
            {a.members.length > 1 && <button className="btn ghost icon sm" aria-label="Remove person" onClick={() => setA({ ...a, members: a.members.filter((_, n) => n !== i) })}><Trash2 size={13} /></button>}
          </div>
        ))}
        <div><button className="btn ghost sm" onClick={() => setA({ ...a, members: [...a.members, { firstName: '', lastName: a.members[0]?.lastName ?? '', relation: 'child', gender: null, birthDate: null, phone: null }] })}><Plus size={13} /> Add a person</button></div>
        {footer}
      </div>
    );
  }
  if (a.kind === 'record_gift') {
    return (
      <div className="card card-pad stack" style={{ gap: 8 }}>
        <b className="row" style={{ gap: 6 }}><HandCoins size={16} /> Record a gift to {a.fundName}</b>
        <div className="row wrap" style={{ gap: 6 }}>
          <input className="input sm" style={{ width: 180 }} value={a.donorName} onChange={(e) => setA({ ...a, donorName: e.target.value })} aria-label="Given by" />
          <input className="input sm" type="number" min={1} style={{ width: 120 }} value={a.amount} onChange={(e) => setA({ ...a, amount: Number(e.target.value) })} aria-label="Amount in rupees" />
          <select className="input sm" style={{ width: 'auto' }} value={a.method} onChange={(e) => setA({ ...a, method: e.target.value as typeof a.method })} aria-label="How it was given">{METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <input className="input sm" type="date" style={{ width: 'auto' }} value={a.date} onChange={(e) => setA({ ...a, date: e.target.value })} aria-label="Date" />
        </div>
        {footer}
      </div>
    );
  }
  return (
    <div className="card card-pad stack" style={{ gap: 8 }}>
      <b className="row" style={{ gap: 6 }}><HeartHandshake size={16} /> Care follow-up{a.personName && ` for ${a.personName}`}</b>
      <input className="input sm" value={a.title} onChange={(e) => setA({ ...a, title: e.target.value })} aria-label="What needs follow-up" />
      <textarea className="input" rows={2} value={a.note} onChange={(e) => setA({ ...a, note: e.target.value })} placeholder="Details (optional)" aria-label="Details" />
      {footer}
    </div>
  );
}
