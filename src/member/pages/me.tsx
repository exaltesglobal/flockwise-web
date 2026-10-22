import { LogOut } from 'lucide-react';

import { memberSession } from '@/api/client';
import { MemberApi } from '@/api/endpoints';
import type { LanguageCode } from '@/api/types';
import { ServerSettings } from '@/components/server-settings';
import { Avatar } from '@/components/ui';
import { languages, useT } from '@/i18n';
import { useSession } from '@/lib/session';

export function MemberMePage() {
  const { t } = useT();
  const session = useSession(memberSession)!;
  const m = session.member;

  async function setLanguage(language: LanguageCode) {
    const member = await MemberApi.me.update({ language });
    memberSession.set({ ...session, member });
  }

  async function signOut() {
    await MemberApi.auth.signOut(session.refreshToken).catch(() => {});
    memberSession.set(null);
  }

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

      <div className="card card-pad stack">
        <h3>{t('language')}</h3>
        <div className="row wrap">
          {(Object.keys(languages) as LanguageCode[]).map((code) => (
            <button key={code} className={`btn ${m.language === code ? 'primary' : ''}`} onClick={() => setLanguage(code)}>
              {languages[code].label}
            </button>
          ))}
        </div>
      </div>

      <div className="card card-pad">
        <ServerSettings labels={{ title: t('server'), body: t('serverBody'), url: t('serverUrl'), save: t('save'), reset: t('resetToDefault'), demo: t('usingDemoData') }} />
      </div>

      <button className="btn danger lg" onClick={signOut}><LogOut size={17} /> {t('signOut')}</button>
      <p className="small muted" style={{ textAlign: 'center' }}>{t('version', { version: '0.1.0 (web)' })}</p>
    </>
  );
}
