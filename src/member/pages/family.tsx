// My family: one parent's login looks after the household. Check everyone in to the service from the
// phone (the pickup code shows here), keep the children's allergies and details up to date, add a child.
import { CheckCircle2, Pencil, Plus, ScanLine, ShieldAlert } from 'lucide-react';
import { useState } from 'react';

import type { FamilyCheckinEvent, FamilyCheckinResult, FamilyMember } from '@/api/admin-types';
import { MemberApi, type FamilyMemberInput } from '@/api/endpoints';
import { Avatar, ErrorState, Field, FormError, Loading, Modal, useToast } from '@/components/ui';
import { useT } from '@/i18n';
import { formatDay, formatTime } from '@/lib/format';
import { useAction, useApi } from '@/lib/use-api';

export function MemberFamilyPage() {
  const { t } = useT();
  const fam = useApi(MemberApi.family.get);
  const events = useApi(MemberApi.family.checkinEvents);
  const [editing, setEditing] = useState<FamilyMember | 'new' | null>(null);
  return (
    <>
      <div>
        <h1>{t('familyTitle')}</h1>
        <p className="muted">{t('familyBody')}</p>
      </div>
      {events.data?.map((e) => <CheckinCard key={e.id} event={e} onDone={() => { void events.reload(); }} />)}
      {fam.error ? <ErrorState error={fam.error} onRetry={fam.reload} /> : !fam.data ? <Loading /> : (
        <section className="stack">
          <div className="section-head">
            <h2>{fam.data.householdName ?? t('familyTitle')}</h2>
            <button className="btn sm" onClick={() => setEditing('new')}><Plus size={15} /> {t('familyAddChild')}</button>
          </div>
          {fam.data.members.map((m) => <MemberRow key={m.id} m={m} onEdit={() => setEditing(m)} />)}
        </section>
      )}
      {editing && (
        <MemberModal
          member={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void fam.reload(); void events.reload(); }}
        />
      )}
    </>
  );
}

function MemberRow({ m, onEdit }: { m: FamilyMember; onEdit: () => void }) {
  const { t } = useT();
  return (
    <div className="card card-pad row fam-row" style={{ gap: 12 }}>
      <Avatar name={m.name} person={m} />
      <div className="grow" style={{ minWidth: 0 }}>
        <b>{m.name}</b>
        <div className="small muted">
          {[m.age !== null ? t('familyAge', { n: m.age }) : null, m.isChild && m.roomName ? t('familyRoom', { room: m.roomName }) : null, !m.isMe && !m.isChild && m.hasLogin ? t('familyOwnLogin') : null].filter(Boolean).join(' · ')}
        </div>
        {(m.allergies || m.medicalNotes) && (
          <div className="row wrap" style={{ gap: 6, marginTop: 4 }}>
            {m.allergies && <span className="badge danger"><ShieldAlert size={12} /> {m.allergies}</span>}
            {m.medicalNotes && <span className="badge warn">{t('familyMedical')}</span>}
          </div>
        )}
      </div>
      {m.editable && <button className="btn sm ghost" onClick={onEdit}><Pencil size={14} /> {t('familyEdit')}</button>}
    </div>
  );
}

/** One service: who is coming, then the pickup code once they are in. */
function CheckinCard({ event, onDone }: { event: FamilyCheckinEvent; onDone: () => void }) {
  const { t, locale } = useT();
  const waiting = event.members.filter((m) => !m.checkedIn);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(waiting.filter((m) => m.isChild).map((m) => m.id)));
  const [result, setResult] = useState<FamilyCheckinResult | null>(null);
  const run = useAction(MemberApi.family.checkIn);
  const ev = result?.event ?? event;
  // Children already in show their code even after a reload.
  const code = result?.securityCode ?? ev.members.find((m) => m.isChild && m.securityCode)?.securityCode ?? null;
  const kidsIn = ev.members.filter((m) => m.isChild && m.checkedIn);
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const left = ev.members.filter((m) => !m.checkedIn);

  return (
    <section className="card card-pad stack fam-checkin">
      <div className="row" style={{ gap: 10 }}>
        <ScanLine size={20} />
        <div className="grow" style={{ minWidth: 0 }}>
          <b>{t('familyCheckinTitle')} · {ev.title}</b>
          <div className="small muted">{formatDay(ev.startsAt, locale)} · {formatTime(ev.startsAt, locale)}{ev.location ? ` · ${ev.location}` : ''}</div>
        </div>
      </div>
      {code && (
        <div className="fam-code">
          <span className="small muted">{t('familyPickupCode')}</span>
          <span className="fam-code-value">{code}</span>
          {kidsIn.map((k) => <span key={k.id} className="small">{k.name} → <b>{k.roomName ?? '—'}</b>{k.allergies ? <span className="badge danger" style={{ marginLeft: 6 }}>{k.allergies}</span> : null}</span>)}
          <span className="small muted" style={{ textAlign: 'center' }}>{t('familyPickupHelp')}</span>
        </div>
      )}
      {left.length > 0 && (ev.open ? (
        <>
          <span className="small muted">{t('familyWho')}</span>
          <div className="stack" style={{ gap: 0 }}>
            {left.map((m) => (
              <label key={m.id} className="list-row check" style={{ paddingInline: 0 }}>
                <input type="checkbox" checked={picked.has(m.id)} onChange={() => toggle(m.id)} />
                <span className="grow">
                  <b>{m.name}</b>
                  {m.isChild && <span className="small muted" style={{ display: 'block' }}>{m.roomName ? t('familyRoom', { room: m.roomName }) : ''}</span>}
                </span>
              </label>
            ))}
          </div>
          <FormError error={run.error} />
          {picked.size > 0 && <button className="btn primary block" disabled={run.busy} onClick={async () => {
            const r = await run.run(ev.id, [...picked]);
            if (r) { setResult(r); setPicked(new Set()); onDone(); }
          }}><CheckCircle2 size={16} /> {t('familyCheckinNow', { n: picked.size })}</button>}
        </>
      ) : <p className="small muted" style={{ margin: 0 }}>{new Date(ev.opensAt) > new Date() ? t('familyCheckinOpens', { time: formatTime(ev.opensAt, locale) }) : t('familyDesk')}</p>)}
      {left.length === 0 && !code && <span className="badge ok" style={{ alignSelf: 'flex-start' }}>✓ {t('familyCheckedIn')}</span>}
    </section>
  );
}

function MemberModal({ member, onClose, onSaved }: { member: FamilyMember | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useT();
  const toast = useToast();
  const [f, setF] = useState<FamilyMemberInput>({
    firstName: member?.firstName ?? '',
    lastName: member?.lastName ?? '',
    birthDate: member?.birthDate ?? null,
    gender: member?.gender ?? null,
    allergies: member?.allergies ?? '',
    medicalNotes: member?.medicalNotes ?? '',
    ...(member && !member.isChild ? { phone: member.phone ?? '' } : {}),
  });
  const save = useAction((input: FamilyMemberInput) => (member ? MemberApi.family.update(member.id, input) : MemberApi.family.add(input)));
  const set = (k: keyof FamilyMemberInput, v: string | null) => setF((x) => ({ ...x, [k]: v }));
  return (
    <Modal
      title={member ? member.name : t('familyAddChild')}
      onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>{t('cancel')}</button><button className="btn primary" disabled={!f.firstName.trim() || save.busy} onClick={async () => { if (await save.run(f)) { toast(t('saved')); onSaved(); } }}>{t('save')}</button></>}
    >
      <div className="stack">
        <div className="grid cols-2">
          <Field label={t('familyFirstName')}><input className="input" autoFocus value={f.firstName} onChange={(e) => set('firstName', e.target.value)} /></Field>
          <Field label={t('familyLastName')}><input className="input" required value={f.lastName ?? ''} onChange={(e) => set('lastName', e.target.value)} /></Field>
        </div>
        <Field label={t('familyBirthDate')}><input className="input" type="date" max={new Date().toISOString().slice(0, 10)} value={f.birthDate ?? ''} onChange={(e) => set('birthDate', e.target.value || null)} /></Field>
        {'phone' in f && <Field label={t('mobile')}><input className="input" type="tel" value={f.phone ?? ''} onChange={(e) => set('phone', e.target.value)} /></Field>}
        <Field label={t('familyAllergies')}><input className="input" value={f.allergies ?? ''} placeholder="Peanuts, dairy…" onChange={(e) => set('allergies', e.target.value)} /></Field>
        <Field label={t('familyMedical')} hint={t('familyMedicalHelp')}><textarea className="input" rows={3} value={f.medicalNotes ?? ''} onChange={(e) => set('medicalNotes', e.target.value)} /></Field>
        <FormError error={save.error} />
      </div>
    </Modal>
  );
}
