// The church's live service in the member app. Watching here counts the member in the online attendance.
import { LiveWatch } from '@/components/live-player';
import { useT } from '@/i18n';

export function MemberLivePage() {
  const { t, locale } = useT();
  return (
    <>
      <h1>{t('liveTitle')}</h1>
      <LiveWatch
        locale={locale}
        labels={{ live: t('liveBadge'), watching: (n) => t('liveWatching', { n }), starts: (when) => t('liveStarts', { when }), openYoutube: t('liveOpenYoutube'), none: t('liveNone'), noneBody: t('liveNoneBody'), ended: t('liveEnded') }}
      />
    </>
  );
}
