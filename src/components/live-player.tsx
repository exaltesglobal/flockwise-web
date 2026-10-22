// The church's YouTube live stream, and the once-a-minute ping that counts who is watching.
// Used by the member app (/app/live) and the public church page (/live).
import { ExternalLink, Radio } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { LiveNow, LiveStatus } from '@/api/admin-types';
import { PublicApi } from '@/api/endpoints';
import { Empty, ErrorState, Loading } from '@/components/ui';
import { formatDay, formatTime } from '@/lib/format';
import { useApi } from '@/lib/use-api';

const VIEWER_KEY = 'fw.viewer';
const PING_MS = 60_000;

/** A random id for this browser, so a guest who reloads still counts once. */
function viewerId() {
  try {
    let id = localStorage.getItem(VIEWER_KEY);
    if (!id) {
      id = `v-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)}`;
      localStorage.setItem(VIEWER_KEY, id);
    }
    return id;
  } catch {
    return `v-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  }
}

/** Pings while the stream is live and the page is on screen. Returns how many are watching. */
export function useLiveHeartbeat(streamId: string | null, status: LiveStatus | null, initial = 0) {
  const [watching, setWatching] = useState(initial);
  const [ended, setEnded] = useState(false);
  useEffect(() => setEnded(false), [streamId]);
  useEffect(() => {
    if (!streamId || status !== 'live') return;
    const viewer = viewerId();
    let stopped = false;
    const ping = () => {
      if (document.visibilityState !== 'visible' || stopped) return;
      PublicApi.livePing(streamId, viewer)
        .then((r) => {
          if (r.ok) setWatching(r.watching);
          else if (r.status === 'ended') {
            stopped = true;
            setEnded(true);
          }
        })
        .catch(() => undefined);
    };
    ping();
    const t = setInterval(ping, PING_MS);
    document.addEventListener('visibilitychange', ping);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', ping);
    };
  }, [streamId, status]);
  return { watching, ended };
}

/** The video itself. A channel id alone shows whatever the channel has live right now. */
export function LivePlayer({ youtubeId, channelId, title }: { youtubeId?: string | null; channelId?: string | null; title: string }) {
  // Sample data has no real video: show where the church's stream will appear.
  if (youtubeId?.startsWith('DEMOSTREAM') || (!youtubeId && channelId?.startsWith('UCgracechurch')))
    return (
      <div className="live-frame live-demo">
        <Radio size={40} />
        <b>{title}</b>
        <span className="small">Your church's YouTube live stream plays here.</span>
      </div>
    );
  const src = youtubeId
    ? `https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&rel=0&modestbranding=1&playsinline=1`
    : `https://www.youtube.com/embed/live_stream?channel=${channelId}&autoplay=1&playsinline=1`;
  return (
    <div className="live-frame">
      <iframe src={src} title={title} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
    </div>
  );
}

export const watchUrl = (now: LiveNow) => (now.stream ? `https://www.youtube.com/watch?v=${now.stream.youtubeId}` : now.channelId ? `https://www.youtube.com/channel/${now.channelId}/live` : null);

export type LiveLabels = { live: string; watching: (n: number) => string; starts: (when: string) => string; openYoutube: string; none: string; noneBody: string; ended: string };

/** The whole watch screen: player, live badge, viewer count. Re-checks every minute until it is live. */
export function LiveWatch({ labels, locale = 'en-IN' }: { labels: LiveLabels; locale?: string }) {
  const { data, error, reload } = useApi(PublicApi.live);
  const s = data?.stream ?? null;
  const { watching, ended } = useLiveHeartbeat(s?.id ?? null, s?.status ?? null, s?.watching ?? 0);
  useEffect(() => {
    if (s?.status === 'live' && !ended) return;
    const t = setInterval(() => void reload(), 60_000);
    return () => clearInterval(t);
  }, [s?.status, ended, reload]);
  useEffect(() => {
    if (ended) void reload();
  }, [ended, reload]);

  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const url = watchUrl(data);
  if (!s && !data.channelId) return <div className="card"><Empty icon={<Radio size={28} />} title={labels.none} body={labels.noneBody} /></div>;
  return (
    <div className="stack">
      <LivePlayer youtubeId={s?.youtubeId} channelId={data.channelId} title={s?.title ?? data.church} />
      <div className="row wrap" style={{ gap: 10 }}>
        {s?.status === 'live' && !ended && <span className="live-pill"><i /> {labels.live}</span>}
        <div className="grow" style={{ minWidth: 0 }}>
          <b>{s?.title ?? data.church}</b>
          <div className="small muted">
            {!s ? labels.noneBody : ended ? labels.ended : s.status === 'live' ? labels.watching(Math.max(1, watching)) : labels.starts(`${formatDay(s.startsAt, locale)} · ${formatTime(s.startsAt, locale)}`)}
          </div>
        </div>
        {url && <a className="btn sm ghost" href={url} target="_blank" rel="noreferrer"><ExternalLink size={14} /> {labels.openYoutube}</a>}
      </div>
    </div>
  );
}
