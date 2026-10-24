// Sing it in my language. While the projector shows a song, each phone shows the same lines at the
// same moment in the language its owner picked: the song's own words, its second language, the
// words in English letters, or (with AI) a translation of their meaning. Members open it in the app;
// visitors open the public page without signing in.
import { LANGUAGES } from '../languages.js';
import type { Ctx, Router } from '../engine.js';
import { ApiError } from '../errors.js';
import { featureOn } from '../features.js';
import { scriptOf, type IndicScript } from '../transliterate.js';
import type { LiveSong, LiveSongVersion } from '../types.js';
import { church, settings } from '../util.js';
import { translateLyrics } from './ai.js';
import { deckNow } from './present.js';

const SCRIPT_LANG: Record<IndicScript, string> = { devanagari: 'hi', bengali: 'bn', gurmukhi: 'pa', gujarati: 'gu', odia: 'or', tamil: 'ta', telugu: 'te', kannada: 'kn', malayalam: 'ml' };
const label = (code: string) => (code === 'en' ? 'English' : LANGUAGES.find((l) => l.code === code)?.label ?? code);
/** The language a few lines are written in, from their script; Latin letters count as English. */
export const languageOf = (lines: string[]) => { const s = scriptOf(lines.join(' ')); return s ? SCRIPT_LANG[s] : 'en'; };

// The deck is worked out once per change of slide; phones ask every few seconds.
type Now = { at: string; eventTitle: string; songTitle: string; copyright: string | null; label: string; lines: string[]; alt: string[]; roman: string[]; slide: number; slides: number; next: string | null } | null;
const showing = new Map<string, { at: string; now: Now }>();
const meanings = new Map<string, string[]>();

function songNow(ctx: Ctx): Now {
  const since = ctx.now.getTime() - 3 * 60 * 60_000;
  const recent = ctx.db.all('presentations').filter((p) => Date.parse(p.updatedAt) > since).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  if (!recent) return null;
  const key = `${church(ctx).id}:${recent.eventId}`;
  const stamp = `${recent.updatedAt}|${recent.index}|${recent.mode}|${(recent.added ?? []).length}`;
  const hit = showing.get(key);
  if (hit && hit.at === stamp) return hit.now;
  const ev = ctx.db.get('events', recent.eventId);
  let now: Now = null;
  if (ev && recent.mode === 'live') {
    const { items, slides, index } = deckNow(ctx, ev);
    const sl = slides[index];
    const item = sl ? items[sl.itemIndex] : undefined;
    const song = item?.songId ? ctx.db.get('songs', item.songId) : undefined;
    if (sl && song && (sl.kind === 'lyrics' || sl.kind === 'title')) {
      const mine = slides.filter((x) => x.itemIndex === sl.itemIndex && x.kind === 'lyrics');
      const at = mine.findIndex((x) => x.id === sl.id);
      const nextSlide = at >= 0 ? mine[at + 1] : mine[0];
      now = {
        at: recent.updatedAt, eventTitle: ev.title, songTitle: song.title, copyright: song.copyright?.trim() || null,
        label: sl.kind === 'title' ? '' : sl.label, lines: sl.lines, alt: sl.alt, roman: sl.roman,
        slide: at + 1, slides: mine.length, next: nextSlide && nextSlide.id !== sl.id ? nextSlide.label : null,
      };
    }
  }
  showing.set(key, { at: stamp, now });
  if (showing.size > 500) showing.delete(showing.keys().next().value as string);
  return now;
}

export async function liveSong(ctx: Ctx, want: string): Promise<LiveSong | null> {
  if (!featureOn(settings(ctx).features, 'sing-along')) throw new ApiError(404, 'not_found', 'Sing-along is switched off for this church.');
  const now = songNow(ctx);
  if (!now) return null;
  const main = languageOf(now.lines);
  const second = now.alt.length ? languageOf(now.alt) : null;
  const versions: LiveSongVersion[] = [{ key: main, label: label(main), kind: 'original' }];
  if (second && second !== main) versions.push({ key: second, label: label(second), kind: 'second' });
  if (now.roman.length) versions.push({ key: 'roman', label: 'English letters', kind: 'roman' });
  const base = { eventTitle: now.eventTitle, at: now.at, songTitle: now.songTitle, copyright: now.copyright, label: now.label, versions, slide: now.slide, slides: now.slides, next: now.next };

  const pick = versions.find((v) => v.key === want) ?? null;
  if (pick?.kind === 'second') return { ...base, lines: now.alt, kind: 'second', language: pick.key, sung: now.lines };
  if (pick?.kind === 'roman') return { ...base, lines: now.roman, kind: 'roman', language: main, sung: now.lines };
  if (pick || !want || !now.label) return { ...base, lines: now.lines, kind: 'original', language: main, sung: [] };

  // Another language: its meaning, when the church has AI. Otherwise the nearest the phone can read.
  if (want === 'en' || LANGUAGES.some((l) => l.code === want)) {
    const cacheKey = `${church(ctx).id}:${want}:${now.lines.join('\n')}`;
    let lines = meanings.get(cacheKey);
    if (!lines && ctx.env.ai) {
      lines = await translateLyrics(ctx, now.lines, want).catch(() => undefined);
      if (lines?.length) { meanings.set(cacheKey, lines); if (meanings.size > 3000) meanings.delete(meanings.keys().next().value as string); }
    }
    if (lines?.length) return { ...base, lines, kind: 'meaning', language: want, sung: now.roman.length ? now.roman : now.lines };
  }
  return now.roman.length ? { ...base, lines: now.roman, kind: 'roman', language: main, sung: now.lines } : { ...base, lines: now.lines, kind: 'original', language: main, sung: [] };
}

export function registerSingAlong(r: Router) {
  r.get('/me/live-song', {}, async (ctx) => ({ live: await liveSong(ctx, String(ctx.query.lang ?? '')) }));
  r.get('/public/live-song', { public: true }, async (ctx) => ({ live: await liveSong(ctx, String(ctx.query.lang ?? '')), churchName: settings(ctx).name }));
}
