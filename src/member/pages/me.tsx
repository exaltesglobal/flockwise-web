import { ChevronRight, Download, Footprints, LogOut, MapPinned, Pencil, QrCode as QrIcon, UsersRound } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';

import { memberSession } from '@/api/client';
import { MemberApi } from '@/api/endpoints';
import type { Consent, DataRequestKind, DataRequestStatus } from '@/api/admin-types';
import type { LanguageCode } from '@/api/types';
import { QrCode } from '@/components/qr';
import { ServerSettings } from '@/components/server-settings';
import { canOverrideServer } from '@/lib/config';
import { AppearancePanel } from '@/components/theme-picker';
import { FormError, Loading, useToast } from '@/components/ui';
import { hasStrings, languages, useT, type StringKey } from '@/i18n';
import { downloadJson, formatDate } from '@/lib/format';
import { useSession } from '@/lib/session';
import { useAction, useApi } from '@/lib/use-api';
import { MyPhotoButton, NameModal } from '../profile-bits';

export function MemberMePage() {
  const { t } = useT();
  const session = useSession(memberSession)!;
  const m = session.member;
  const code = useApi(MemberApi.me.checkinCode);
  const prefs = useApi(MemberApi.me.preferences);
  const campuses = useApi(MemberApi.campuses);
  const toast = useToast();
  const [nameOpen, setNameOpen] = useState(false);

  async function setLanguage(language: LanguageCode) {
    const member = await MemberApi.me.update({ language });
    memberSession.set({ ...session, member });
  }
  async function setConsent(key: keyof Consent, value: boolean) {
    prefs.setData(await MemberApi.me.updatePreferences({ consent: { [key]: value } }));
    toast(t('saved'));
  }
  async function setCampus(campusId: string | null) {
    prefs.setData(await MemberApi.me.updatePreferences({ campusId }));
    toast(t('saved'));
  }
  async function signOut() {
    await MemberApi.auth.signOut(session.refreshToken).catch(() => {});
    memberSession.set(null);
  }

  const consentRows: { key: keyof Consent; label: string }[] = [
    { key: 'email', label: t('consentEmail') },
    { key: 'whatsapp', label: t('consentWhatsapp') },
    { key: 'sms', label: t('consentSms') },
    { key: 'directory', label: t('consentDirectory') },
  ];

  return (
    <>
      <h1>{t('tabMe')}</h1>
      <div className="cols-auto">
      <div className="col-stack">
      <div className="card card-pad row">
        <MyPhotoButton />
        <div className="grow">
          <h2 className="row" style={{ gap: 6 }}>{`${m.firstName ?? ''} ${m.lastName ?? ''}`.trim()} <button className="btn sm ghost icon" onClick={() => setNameOpen(true)} aria-label={t('nameEdit')} title={t('nameEdit')}><Pencil size={14} /></button></h2>
          <div className="small muted">{[m.phone, m.email].filter(Boolean).join(' · ')}</div>
          {m.householdName && <div className="small muted">{t('household')}: {m.householdName}</div>}
        </div>
      </div>

      {nameOpen && <NameModal onClose={() => setNameOpen(false)} />}
      <Link to="/app/family" className="card card-pad row" style={{ gap: 12 }}>
        <UsersRound size={22} className="muted" />
        <div className="grow" style={{ minWidth: 0 }}>
          <b>{t('familyTitle')}</b>
          <div className="small muted">{t('familyBody')}</div>
        </div>
        <ChevronRight size={18} className="muted" />
      </Link>
      <Link to="/app/journey" className="card card-pad row" style={{ gap: 12 }}>
        <Footprints size={22} className="muted" />
        <div className="grow" style={{ minWidth: 0 }}>
          <b>{t('journeyCard')}</b>
          <div className="small muted">{t('journeyCardBody')}</div>
        </div>
        <ChevronRight size={18} className="muted" />
      </Link>
      <Link to="/app/moving" className="card card-pad row" style={{ gap: 12 }}>
        <MapPinned size={22} className="muted" />
        <div className="grow" style={{ minWidth: 0 }}>
          <b>{t('moveCard')}</b>
          <div className="small muted">{t('moveCardBody')}</div>
        </div>
        <ChevronRight size={18} className="muted" />
      </Link>

      <div id="qr" className="card card-pad qr-card">
        <div className="stack" style={{ gap: 6 }}>
          <h3 className="row" style={{ gap: 8 }}><QrIcon size={18} /> {t('myQr')}</h3>
          <p className="small muted">{t('myQrBody')}</p>
          {code.data && <div className="qr-code-text">{code.data.code}</div>}
        </div>
        {code.data ? <QrCode value={code.data.qr} size={168} label={t('myQr')} /> : <Loading />}
      </div>

      <div className="card card-pad stack">
        <h3>{t('language')}</h3>
        <select className="select" value={m.language ?? 'en'} onChange={(e) => setLanguage(e.target.value as LanguageCode)} aria-label={t('language')}>
          {(['world', 'india', 'asia'] as const).map((region) => [region, (Object.keys(languages) as LanguageCode[]).filter((lc) => languages[lc].region === region && hasStrings(lc))] as const).filter(([, codes]) => codes.length > 0).map(([region, codes]) => (
            <optgroup key={region} label={{ world: 'English', india: 'India', asia: 'Asia' }[region]}>
              {codes.map((lc) => (
                <option key={lc} value={lc}>{lc === 'en' ? 'English' : `${languages[lc].label} · ${languages[lc].english}`}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      <div className="card card-pad stack appearance-card">
        <h3>{t('appearance')}</h3>
        <AppearancePanel />
      </div>
      </div>

      <div className="col-stack">
      <div className="card card-pad stack">
        <h3>{t('privacy')}</h3>
        {!prefs.data ? <Loading /> : consentRows.map((r) => (
          <label key={r.key} className="toggle-row">
            <span>{r.label}</span>
            <input type="checkbox" className="switch" checked={prefs.data!.consent[r.key]} onChange={(e) => setConsent(r.key, e.target.checked)} />
          </label>
        ))}
      </div>

      <MyData tick={prefs.data} />

      {campuses.data && campuses.data.length > 1 && prefs.data && (
        <div className="card card-pad stack">
          <h3>{t('campus')}</h3>
          <select className="select" value={prefs.data.campusId ?? ''} onChange={(e) => setCampus(e.target.value || null)}>
            <option value="">—</option>
            {campuses.data.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}

      {canOverrideServer() && <div className="card card-pad">
        <ServerSettings labels={{ title: t('server'), body: t('serverBody'), url: t('serverUrl'), save: t('save'), reset: t('resetToDefault'), demo: t('usingDemoData') }} />
      </div>}

      <button className="btn danger lg" onClick={signOut}><LogOut size={17} /> {t('signOut')}</button>
      </div>
      </div>
      <p className="small muted" style={{ textAlign: 'center' }}>{t('version', { version: '1.0.0 (web)' })}</p>
    </>
  );
}

const REQ: Record<DataRequestKind, StringKey> = { access: 'reqAccess', correction: 'reqCorrection', erasure: 'reqErasure', grievance: 'reqGrievance' };
const REQ_STATUS: Record<DataRequestStatus, [StringKey, string]> = { open: ['reqOpen', 'warn'], done: ['reqDone', 'ok'], declined: ['reqDeclined', 'gray'] };

/** India's DPDP Act: download your data, ask for a correction or erasure, and see your consent history. */
function MyData({ tick }: { tick: unknown }) {
  const { t, locale } = useT();
  const toast = useToast();
  const q = useApi(MemberApi.me.privacy, [tick]);
  const [asking, setAsking] = useState<DataRequestKind | null>(null);
  const [details, setDetails] = useState('');
  const send = useAction(() => MemberApi.me.privacyRequest(asking!, details));
  const dl = useAction(MemberApi.me.exportData);
  if (!q.data) return null;
  const d = q.data;
  const officer = [d.officer.name, d.officer.email, d.officer.phone].filter(Boolean).join(' · ');
  async function submit() {
    if (await send.run()) { setAsking(null); setDetails(''); q.reload(); toast(t('requestSent')); }
  }
  return (
    <div className="card card-pad stack">
      <h3>{t('myData')}</h3>
      <p className="small muted" style={{ margin: 0 }}>{d.notice}</p>
      <div className="row wrap" style={{ gap: 8 }}>
        <button className="btn sm" disabled={dl.busy} onClick={async () => { const data = await dl.run(); if (data) downloadJson(`my-data-${new Date().toISOString().slice(0, 10)}.json`, data); }}><Download size={14} /> {t('downloadMyData')}</button>
        <button className="btn sm ghost" onClick={() => setAsking('correction')}>{t('askCorrection')}</button>
        <button className="btn sm ghost" onClick={() => setAsking('erasure')}>{t('askErasure')}</button>
      </div>
      {asking && (
        <div className="stack" style={{ gap: 8 }}>
          {asking === 'erasure' ? <p className="small" style={{ margin: 0 }}>{t('erasureConfirm')}</p> : <textarea className="textarea" rows={3} value={details} onChange={(e) => setDetails(e.target.value)} placeholder={t('correctionPlaceholder')} />}
          <div className="row" style={{ gap: 8 }}>
            <button className="btn sm primary" disabled={send.busy || (asking !== 'erasure' && !details.trim())} onClick={submit}>{t('sendRequest')}</button>
            <button className="btn sm ghost" onClick={() => setAsking(null)}>{t('cancel')}</button>
          </div>
          <FormError error={send.error} />
        </div>
      )}
      {d.requests.length > 0 && (
        <div className="stack" style={{ gap: 4 }}>
          {d.requests.map((r) => (
            <div key={r.id} className="small row wrap" style={{ gap: 6 }}>
              <span className={`badge ${REQ_STATUS[r.status][1]}`}>{t(REQ_STATUS[r.status][0])}</span>
              <span>{t(REQ[r.kind])} · {formatDate(r.createdAt, locale)}</span>
              {r.response && <span className="muted">· {r.response}</span>}
            </div>
          ))}
        </div>
      )}
      {d.log.length > 0 && (
        <details className="small">
          <summary>{t('consentHistory')}</summary>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            {d.log.slice(0, 12).map((l) => <li key={l.id}>{formatDate(l.at, locale)} · {l.purpose} {l.granted ? t('consentOn') : t('consentOff')}</li>)}
          </ul>
        </details>
      )}
      {officer && <p className="small muted" style={{ margin: 0 }}>{t('privacyContact', { name: officer })}</p>}
    </div>
  );
}
