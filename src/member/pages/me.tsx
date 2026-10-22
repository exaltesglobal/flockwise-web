import { LogOut, QrCode as QrIcon } from 'lucide-react';

import { memberSession } from '@/api/client';
import { MemberApi } from '@/api/endpoints';
import type { Consent } from '@/api/admin-types';
import type { LanguageCode } from '@/api/types';
import { QrCode } from '@/components/qr';
import { ServerSettings } from '@/components/server-settings';
import { Avatar, Loading, useToast } from '@/components/ui';
import { languages, useT } from '@/i18n';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/use-api';

export function MemberMePage() {
  const { t } = useT();
  const session = useSession(memberSession)!;
  const m = session.member;
  const code = useApi(MemberApi.me.checkinCode);
  const prefs = useApi(MemberApi.me.preferences);
  const campuses = useApi(MemberApi.campuses);
  const toast = useToast();

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
      <div className="card card-pad row">
        <Avatar name={`${m.firstName} ${m.lastName}`} size="lg" />
        <div className="grow">
          <h2>{m.firstName} {m.lastName}</h2>
          <div className="small muted">{[m.phone, m.email].filter(Boolean).join(' · ')}</div>
          {m.householdName && <div className="small muted">{t('household')}: {m.householdName}</div>}
        </div>
      </div>

      <div id="qr" className="card card-pad qr-card">
        <div className="stack" style={{ gap: 6 }}>
          <h3 className="row" style={{ gap: 8 }}><QrIcon size={18} /> {t('myQr')}</h3>
          <p className="small muted">{t('myQrBody')}</p>
          {code.data && <div className="qr-code-text">{code.data.code}</div>}
        </div>
        {code.data ? <QrCode value={code.data.qr} size={168} label={t('myQr')} /> : <Loading />}
      </div>

      <div className="card card-pad stack">
        <h3>{t('privacy')}</h3>
        {!prefs.data ? <Loading /> : consentRows.map((r) => (
          <label key={r.key} className="toggle-row">
            <span>{r.label}</span>
            <input type="checkbox" className="switch" checked={prefs.data!.consent[r.key]} onChange={(e) => setConsent(r.key, e.target.checked)} />
          </label>
        ))}
      </div>

      {campuses.data && campuses.data.length > 1 && prefs.data && (
        <div className="card card-pad stack">
          <h3>{t('campus')}</h3>
          <select className="select" value={prefs.data.campusId ?? ''} onChange={(e) => setCampus(e.target.value || null)}>
            <option value="">—</option>
            {campuses.data.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}

      <div className="card card-pad stack">
        <h3>{t('language')}</h3>
        <div className="row wrap">
          {(Object.keys(languages) as LanguageCode[]).map((lc) => (
            <button key={lc} className={`btn ${m.language === lc ? 'primary' : ''}`} onClick={() => setLanguage(lc)}>
              {languages[lc].label}
            </button>
          ))}
        </div>
      </div>

      <div className="card card-pad">
        <ServerSettings labels={{ title: t('server'), body: t('serverBody'), url: t('serverUrl'), save: t('save'), reset: t('resetToDefault'), demo: t('usingDemoData') }} />
      </div>

      <button className="btn danger lg" onClick={signOut}><LogOut size={17} /> {t('signOut')}</button>
      <p className="small muted" style={{ textAlign: 'center' }}>{t('version', { version: '1.0.0 (web)' })}</p>
    </>
  );
}
