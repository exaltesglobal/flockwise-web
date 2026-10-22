// Appearance: light/dark mode and a brand colour scheme, saved per browser.
// Applied to <html data-theme data-scheme> before React renders so there is no flash.
import { useSyncExternalStore } from 'react';

export type ThemeMode = 'system' | 'light' | 'dark';
export type ThemeScheme = 'pasture' | 'midnight' | 'deep' | 'sunrise' | 'mist';

export const SCHEMES: { value: ThemeScheme; label: string; hint: string; swatch: [string, string] }[] = [
  { value: 'pasture', label: 'Pasture', hint: 'Green with a deep green menu', swatch: ['#1F6B5C', '#0F3F36'] },
  { value: 'midnight', label: 'Midnight', hint: 'Green with an ink menu', swatch: ['#1F6B5C', '#14211F'] },
  { value: 'deep', label: 'Deep', hint: 'Deep green buttons with an ink menu', swatch: ['#0F3F36', '#14211F'] },
  { value: 'sunrise', label: 'Sunrise', hint: 'Saffron menu with green buttons', swatch: ['#1F6B5C', '#F2A93B'] },
  { value: 'mist', label: 'Mist', hint: 'Light menu with green buttons', swatch: ['#1F6B5C', '#F4F7F6'] },
];

const KEY = 'fw.appearance';
type Appearance = { mode: ThemeMode; scheme: ThemeScheme };
const DEFAULT: Appearance = { mode: 'system', scheme: 'pasture' };

function read(): Appearance {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Appearance> | null;
    return {
      mode: v?.mode === 'light' || v?.mode === 'dark' ? v.mode : 'system',
      scheme: SCHEMES.some((s) => s.value === v?.scheme) ? (v!.scheme as ThemeScheme) : 'pasture',
    };
  } catch {
    return DEFAULT;
  }
}

let current = typeof window === 'undefined' ? DEFAULT : read();
const listeners = new Set<() => void>();

function apply(a: Appearance) {
  const root = document.documentElement;
  if (a.mode === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', a.mode);
  root.setAttribute('data-scheme', a.scheme);
}

export function initAppearance() {
  apply(current);
}

export function setAppearance(next: Partial<Appearance>) {
  current = { ...current, ...next };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* private mode: still applies for this visit */
  }
  apply(current);
  listeners.forEach((l) => l());
}

export function useAppearance() {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => current,
  );
}
