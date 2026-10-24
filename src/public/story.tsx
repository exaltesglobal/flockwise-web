// A Bible story to listen to, for people who cannot read. The link comes by WhatsApp or SMS: one
// big play button, then two big buttons, "I listened" and "Please pray for me". Words are few and
// in the listener's language; the pictures carry the meaning.
import { Check, HandHeart, Pause, Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router';

import { PublicApi } from '@/api/endpoints';
import type { StoryListen } from '@/core/types';
import { Loading } from '@/components/ui';
import { useStrings } from '@/i18n';

import './story.css';

export function PublicStoryPage() {
  const { token = '' } = useParams();
  const [story, setStory] = useState<StoryListen | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [heard, setHeard] = useState(false);
  const [prayed, setPrayed] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const { t } = useStrings(story?.language ?? 'en');

  useEffect(() => {
    PublicApi.story(token).then((s) => { setStory(s); setHeard(s.listened); setPrayed(s.prayer); document.title = s.title; }, (e: Error) => setError(e.message));
  }, [token]);

  const listened = () => { if (heard) return; setHeard(true); void PublicApi.storyListened(token).catch(() => setHeard(false)); };
  const pray = () => { if (prayed) return; setPrayed(true); void PublicApi.storyPrayer(token).catch(() => setPrayed(false)); };
  const toggle = () => {
    const a = audio.current;
    if (!a) return;
    if (a.paused) void a.play().catch(() => undefined); else a.pause();
  };

  if (error) return <div className="story-page"><p className="story-error">{error}</p></div>;
  if (!story) return <div className="story-page"><Loading /></div>;
  return (
    <div className="story-page">
      <div className="story-top">
        <span className="story-church">{t('storyFrom', { church: story.church })}</span>
        <h1>{story.title}</h1>
        {story.reference && <span className="story-ref">{story.reference}</span>}
      </div>
      <audio
        ref={audio}
        src={story.audioUrl}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => { const a = e.currentTarget; if (a.duration) setProgress(a.currentTime / a.duration); }}
        onEnded={() => { setPlaying(false); setProgress(1); listened(); }}
      />
      <button className={`story-play ${playing ? 'on' : ''}`} onClick={toggle} aria-label={playing ? 'Pause' : t('storyTap')}>
        <svg viewBox="0 0 100 100" className="story-ring" aria-hidden="true"><circle cx="50" cy="50" r="46" /><circle cx="50" cy="50" r="46" style={{ strokeDashoffset: 289 - 289 * progress }} /></svg>
        {playing ? <Pause size={64} /> : <Play size={64} style={{ marginLeft: 8 }} />}
      </button>
      <span className="story-hint">{t('storyTap')}</span>
      <div className="story-actions">
        <button className={`story-btn heard ${heard ? 'done' : ''}`} onClick={listened}><Check size={34} /><span>{t('storyHeard')}</span></button>
        <button className={`story-btn pray ${prayed ? 'done' : ''}`} onClick={pray}><HandHeart size={34} /><span>{t('storyPray')}</span></button>
      </div>
      {(heard || prayed) && <p className="story-thanks" role="status">{prayed ? t('storyPrayThanks') : t('storyThanks')}</p>}
    </div>
  );
}
