// The pastor's greeting page: opened from the link in the birthday message, no sign-in. The
// person's name, the recording, a line from the pastor, and a box to say thank you. Nothing else
// about the church's data is on it, so the link can be forwarded.
import { Cake, Heart, PlayCircle, Send } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router';

import { PublicApi } from '@/api/endpoints';
import { useBrandStyle } from '@/components/brand';
import { ErrorState, Loading, Logo } from '@/components/ui';
import { useAction, useApi } from '@/lib/use-api';

/** YouTube links become an embed; anything else plays in the browser's own player. */
function youtubeId(url: string) {
  const m = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([\w-]{6,})/.exec(url);
  return m?.[1] ?? null;
}

export function GreetingPage() {
  const { token = '' } = useParams();
  const { data, error, reload } = useApi(() => PublicApi.greeting(token), [token]);
  const style = useBrandStyle(data ? { brand: data.church.brand } : null);
  const [reply, setReply] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  const watched = useRef(false);
  const send = useAction(async () => { const r = await PublicApi.greetingReply(token, reply.trim()); setSent(r.message); });
  useEffect(() => { document.title = data ? `For ${data.firstName} · ${data.church.name}` : 'A greeting for you'; }, [data]);
  const markWatched = () => { if (!watched.current) { watched.current = true; void PublicApi.greetingWatched(token).catch(() => undefined); } };
  if (error) return <div className="greet"><div className="greet-card"><ErrorState error={error} onRetry={reload} /></div></div>;
  if (!data) return <div className="greet"><Loading /></div>;
  const yt = youtubeId(data.videoUrl);
  const title = data.kind === 'anniversary' ? `Happy anniversary, ${data.firstName}!` : `Happy birthday, ${data.firstName}!`;
  const sub = data.years ? (data.kind === 'anniversary' ? `${data.years} years together` : data.years <= 18 ? `Turning ${data.years} today` : `${data.years} today`) : null;
  return (
    <div className="greet" style={style}>
      <div className="greet-card">
        <div className="greet-church">
          {data.church.logoUrl && <img src={data.church.logoUrl} alt="" />}
          <span>{data.church.name}</span>
        </div>
        <div className="greet-head">
          {data.kind === 'anniversary' ? <Heart size={30} /> : <Cake size={30} />}
          <h1>{title}</h1>
          {sub && <span className="greet-sub">{sub}</span>}
        </div>
        <div className="greet-video">
          {yt ? (
            <iframe title={title} src={`https://www.youtube-nocookie.com/embed/${yt}?rel=0&playsinline=1`} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen onLoad={markWatched} />
          ) : (
            <video controls playsInline preload="metadata" poster={data.posterUrl ?? undefined} src={data.videoUrl} onPlay={markWatched} />
          )}
        </div>
        <p className="greet-message">{data.message}</p>
        <p className="greet-from">With love, <b>{data.fromName}</b> and everyone at {data.church.name}</p>
        {sent || data.reply ? (
          <div className="greet-reply done"><PlayCircle size={16} /> {sent ?? 'You replied: '}{!sent && <i>“{data.reply}”</i>}</div>
        ) : (
          <form className="greet-reply" onSubmit={(e) => { e.preventDefault(); if (reply.trim()) void send.run(); }}>
            <input className="input" value={reply} maxLength={500} placeholder={`Say thank you to ${data.fromName.split(' ')[0] === 'Pastor' ? data.fromName : data.fromName.split(' ')[0]}…`} onChange={(e) => setReply(e.target.value)} />
            <button className="btn primary" type="submit" disabled={send.busy || !reply.trim()}><Send size={15} /> Send</button>
          </form>
        )}
        {send.error && <span className="small" style={{ color: 'var(--danger, #b42318)' }}>{send.error.message}</span>}
        <a href="https://flockwise.church" className="greet-powered">Sent with <Logo height={14} /></a>
      </div>
    </div>
  );
}
