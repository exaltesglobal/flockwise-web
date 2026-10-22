// A song's chart colours (background, words, chords, headings) as CSS variables, plus ready-made sets.
import type { CSSProperties } from 'react';

import type { SongColours } from '@/core/types';

export const COLOUR_PARTS: { key: keyof SongColours; label: string }[] = [
  { key: 'background', label: 'Background' },
  { key: 'lyrics', label: 'Lyrics' },
  { key: 'chords', label: 'Chords' },
  { key: 'headings', label: 'Section headings' },
];

/** What the chart uses when a part has no colour of its own (matches the printed sheet). */
export const DEFAULT_COLOURS: Required<SongColours> = { background: '#ffffff', lyrics: '#14211f', chords: '#b5650d', headings: '#1f6b5c' };

export const COLOUR_PRESETS: { name: string; colours: Required<SongColours> }[] = [
  { name: 'Flockwise', colours: DEFAULT_COLOURS },
  { name: 'Stage dark', colours: { background: '#0c1110', lyrics: '#eef3f1', chords: '#f2a93b', headings: '#8fd6c2' } },
  { name: 'High contrast', colours: { background: '#000000', lyrics: '#ffffff', chords: '#ffd400', headings: '#5ce1ff' } },
  { name: 'Black and white', colours: { background: '#ffffff', lyrics: '#000000', chords: '#000000', headings: '#000000' } },
  { name: 'Warm paper', colours: { background: '#fbf5e9', lyrics: '#2b2410', chords: '#c0392b', headings: '#0f3f36' } },
];

export const hasColours = (c?: SongColours | null) => !!c && Object.values(c).some(Boolean);

/** CSS variables for a chart wrapper; parts left empty fall back to the page's own colours. */
export function colourVars(c?: SongColours | null): CSSProperties | undefined {
  if (!hasColours(c)) return undefined;
  const v: Record<string, string> = {};
  if (c!.background) v['--sc-bg'] = c!.background;
  if (c!.lyrics) v['--sc-lyrics'] = c!.lyrics;
  if (c!.chords) v['--sc-chords'] = c!.chords;
  if (c!.headings) v['--sc-head'] = c!.headings;
  return v as CSSProperties;
}
