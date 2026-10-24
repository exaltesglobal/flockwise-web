// /register: the public family registration form, where the QR on the notice board or the screen
// lands. One person fills in everyone in the house; the office checks it and approves them into
// People. No sign-in.
import { CheckCircle2, Plus, Trash2, UsersRound } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';

import type { RegistrationMember, RegistrationRelation } from '@/api/admin-types';
import { PublicApi } from '@/api/endpoints';
import { ErrorState, Field, FormError, Loading } from '@/components/ui';
import { useAction, useApi } from '@/lib/use-api';

import { Shell } from './public';

type Row = Pick<RegistrationMember, 'firstName' | 'lastName' | 'relation' | 'baptised'> & { gender: '' | 'male' | 'female'; birthDate: string; phone: string; email: string };
const RELATION_LABEL: Record<RegistrationRelation, string> = { head: 'Myself', spouse: 'Husband / wife', child: 'Son / daughter', parent: 'Father / mother', other: 'Other relative' };
const blank = (relation: RegistrationRelation, lastName = ''): Row => ({ firstName: '', lastName, relation, gender: '', birthDate: '', phone: '', email: '', baptised: false });

export function RegisterPage() {
  const { data, error, reload } = useApi(PublicApi.registrationForm);
  const [rows, setRows] = useState<Row[]>([blank('head')]);
  const [f, setF] = useState({ householdName: '', phone: '', email: '', address: '', area: '', previousChurch: '', howHeard: '', note: '', wantsMembership: false, agree: false, website: '' });
  const [consent, setConsent] = useState({ whatsapp: true, email: true, directory: false });
  const [done, setDone] = useState<{ count: number } | null>(null);
  useEffect(() => { if (data) document.title = `Register · ${data.church.name}`; }, [data]);
  const send = useAction(async (e: FormEvent) => {
    e.preventDefault();
    const members = rows.map((r) => ({ ...r, gender: r.gender || null, birthDate: r.birthDate || null, phone: r.phone || null, email: r.email || null }));
    const r = await PublicApi.register({ ...f, consent, members });
    setDone({ count: r.count ?? rows.length });
    window.scrollTo({ top: 0 });
  });
  const fields = (send.error as { fields?: Record<string, string> } | null)?.fields ?? {};
  const set = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, n) => (n === i ? { ...r, ...patch } : r)));
  const surname = rows[0]?.lastName ?? '';

  if (error) return <Shell><ErrorState error={error} onRetry={reload} /></Shell>;
  if (!data) return <Shell><Loading /></Shell>;
  return (
    <Shell churchName={data.church.name} logoUrl={data.church.logoUrl}>
      <article className="card card-pad stack lg pub-form reg-form" style={{ alignItems: 'stretch' }}>
        <div className="row" style={{ gap: 10 }}><UsersRound size={26} color="var(--primary)" /><h1 style={{ fontSize: 24 }}>Register your family</h1></div>
        {done ? (
          <div className="stack" style={{ alignItems: 'center', textAlign: 'center', gap: 10, padding: '20px 0' }}>
            <CheckCircle2 size={44} color="var(--ok)" />
            <h2 style={{ fontSize: 22 }}>Thank you, we have your details</h2>
            <p className="muted" style={{ maxWidth: 460 }}>The church office will look at it in the next few days and add {done.count === 1 ? 'you' : `all ${done.count} of you`} to the church family. Once that is done you can sign in to the member app with the same phone or email.</p>
          </div>
        ) : !data.enabled ? (
          <p className="muted">Online registration is closed at the moment. Please speak to someone at the welcome desk or the church office.</p>
        ) : (
          <form className="stack lg" onSubmit={send.run} noValidate>
            <p className="muted" style={{ margin: 0, whiteSpace: 'pre-line' }}>{data.intro}</p>
            <FormError error={send.error} />

            <section className="stack">
              <h2 className="reg-h">Your family</h2>
              {rows.map((r, i) => (
                <fieldset key={i} className="reg-person">
                  <legend>{i === 0 ? 'You' : `Person ${i + 1}`}</legend>
                  {i > 0 && <button type="button" className="btn sm ghost reg-remove" aria-label="Remove this person" onClick={() => setRows((rs) => rs.filter((_, n) => n !== i))}><Trash2 size={14} /></button>}
                  <div className="grid cols-2">
                    <Field label="First name *" error={fields[`members.${i}.firstName`]}><input className="input" required maxLength={60} autoComplete={i === 0 ? 'given-name' : 'off'} value={r.firstName} onChange={(e) => set(i, { firstName: e.target.value })} /></Field>
                    <Field label="Last name *" error={fields[`members.${i}.lastName`]}><input className="input" required maxLength={60} autoComplete={i === 0 ? 'family-name' : 'off'} value={r.lastName} onChange={(e) => set(i, { lastName: e.target.value })} /></Field>
                  </div>
                  <div className="grid cols-3">
                    {i > 0 && (
                      <Field label="Relation to you">
                        <select className="input" value={r.relation} onChange={(e) => set(i, { relation: e.target.value as RegistrationRelation })}>
                          {(['spouse', 'child', 'parent', 'other'] as const).map((k) => <option key={k} value={k}>{RELATION_LABEL[k]}</option>)}
                        </select>
                      </Field>
                    )}
                    <Field label="Gender">
                      <select className="input" value={r.gender} onChange={(e) => set(i, { gender: e.target.value as Row['gender'] })}><option value="">Choose</option><option value="male">Male</option><option value="female">Female</option></select>
                    </Field>
                    <Field label="Date of birth" error={fields[`members.${i}.birthDate`]}><input className="input" type="date" value={r.birthDate} onChange={(e) => set(i, { birthDate: e.target.value })} /></Field>
                  </div>
                  {i > 0 && r.relation !== 'child' && (
                    <div className="grid cols-2">
                      <Field label="Their mobile (optional)"><input className="input" type="tel" value={r.phone} onChange={(e) => set(i, { phone: e.target.value })} /></Field>
                      <Field label="Their email (optional)" error={fields[`members.${i}.email`]}><input className="input" type="email" value={r.email} onChange={(e) => set(i, { email: e.target.value })} /></Field>
                    </div>
                  )}
                  {data.askBaptism && <label className="row small" style={{ gap: 8 }}><input type="checkbox" checked={r.baptised} onChange={(e) => set(i, { baptised: e.target.checked })} /> Baptised</label>}
                </fieldset>
              ))}
              {rows.length < 12 && (
                <div className="row wrap" style={{ gap: 8 }}>
                  {!rows.some((r) => r.relation === 'spouse') && <button type="button" className="btn sm" onClick={() => setRows((rs) => [...rs, blank('spouse', surname)])}><Plus size={14} /> Add husband / wife</button>}
                  <button type="button" className="btn sm" onClick={() => setRows((rs) => [...rs, blank('child', surname)])}><Plus size={14} /> Add a child</button>
                  <button type="button" className="btn sm ghost" onClick={() => setRows((rs) => [...rs, blank('other', surname)])}><Plus size={14} /> Someone else</button>
                </div>
              )}
            </section>

            <section className="stack">
              <h2 className="reg-h">How to reach you</h2>
              <div className="grid cols-2">
                <Field label="Mobile number" hint="WhatsApp, if you use it" error={fields.phone}><input className="input" type="tel" autoComplete="tel" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
                <Field label="Email" error={fields.email}><input className="input" type="email" autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
              </div>
              <Field label="Home address"><textarea className="input" rows={2} autoComplete="street-address" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
              <Field label="Area or locality" hint="Helps us put you in the nearest prayer cell"><input className="input" value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })} /></Field>
              {/* Bots fill this in; people never see it. */}
              <input className="reg-hp" tabIndex={-1} autoComplete="off" aria-hidden="true" value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} name="website" />
            </section>

            {(data.askPreviousChurch || data.askHowHeard) && (
              <section className="stack">
                <h2 className="reg-h">A little more</h2>
                <div className="grid cols-2">
                  {data.askPreviousChurch && <Field label="Church you came from (if any)"><input className="input" value={f.previousChurch} onChange={(e) => setF({ ...f, previousChurch: e.target.value })} /></Field>}
                  {data.askHowHeard && <Field label="How did you hear about us?"><input className="input" value={f.howHeard} onChange={(e) => setF({ ...f, howHeard: e.target.value })} placeholder="A friend, Google, walked past…" /></Field>}
                </div>
                <Field label="Anything you would like the pastor to know"><textarea className="input" rows={3} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
                <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={f.wantsMembership} onChange={(e) => setF({ ...f, wantsMembership: e.target.checked })} /> We would like to become members of the church</label>
              </section>
            )}

            <section className="stack" style={{ gap: 8 }}>
              <h2 className="reg-h">Keeping in touch</h2>
              <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={consent.whatsapp} onChange={(e) => setConsent({ ...consent, whatsapp: e.target.checked })} /> WhatsApp and SMS updates from the church</label>
              <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={consent.email} onChange={(e) => setConsent({ ...consent, email: e.target.checked })} /> Email updates</label>
              <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={consent.directory} onChange={(e) => setConsent({ ...consent, directory: e.target.checked })} /> Show us in the church directory for other members</label>
              <p className="small muted" style={{ margin: '6px 0 0' }}>{data.privacyNotice}</p>
              <label className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
                <input type="checkbox" checked={f.agree} onChange={(e) => setF({ ...f, agree: e.target.checked })} style={{ marginTop: 4 }} />
                <span>I agree to {data.church.name} keeping these details for the family above. {fields.agree && <span className="small" style={{ color: 'var(--danger)' }}>{fields.agree}</span>}</span>
              </label>
            </section>

            <button className="btn primary lg" type="submit" disabled={send.busy} style={{ alignSelf: 'flex-start' }}>Send registration</button>
          </form>
        )}
      </article>
    </Shell>
  );
}
