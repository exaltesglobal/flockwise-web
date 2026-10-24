// Times in a sermon transcript, and links that open the recording at a moment.

export const clock = (s: number) => {
  const t = Math.max(0, Math.floor(s));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = t % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
};

/** "1:35" or "95" → 95 seconds; null when it does not read as a time. */
export const parseClock = (s: string): number | null => {
  const v = s.trim();
  if (!v) return 0;
  if (/^\d+$/.test(v)) return Number(v);
  const m = /^(?:(\d+):)?(\d{1,2}):(\d{2})$/.exec(v);
  return m ? Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
};

export const youTubeId = (url: string) => /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|live\/|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/.exec(url)?.[1] ?? null;
export const isMediaFile = (url: string) => /\.(mp3|m4a|aac|ogg|oga|wav|mp4|webm|m4v)(\?|#|$)/i.test(url);

/** The recording opened at a moment: YouTube and Vimeo take a start time, and so do plain media files. */
export function linkAt(url: string, seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const yt = youTubeId(url);
  if (yt) return `https://www.youtube.com/watch?v=${yt}&t=${s}s`;
  if (/vimeo\.com/.test(url)) return `${url.split('#')[0]}#t=${s}s`;
  if (/facebook\.com/.test(url)) return url;
  return `${url.split('#')[0]}#t=${s}`;
}
