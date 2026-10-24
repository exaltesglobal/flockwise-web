import { useEffect, useSyncExternalStore } from 'react';

import { memberSession } from '@/api/client';
import type { LanguageCode } from '@/api/types';
import { LANGUAGES, languageInfo } from '@/core/languages';
import { useSession } from '@/lib/session';

import { en, type Strings } from './en';

// Same strings as the mobile app. English is built in; every other language is a file here
// (xx.ts, `export default` a Partial<Strings>) loaded the first time someone picks it. A missing
// string shows in English, so a language can be added before every line is translated.
export const languages = Object.fromEntries(LANGUAGES.map((l) => [l.code, { label: l.label, english: l.english, locale: l.locale, region: l.region, rtl: 'rtl' in l && l.rtl }])) as Record<
  LanguageCode,
  { label: string; english: string; locale: string; region: 'india' | 'asia' | 'world'; rtl: boolean }
>;

export type StringKey = keyof Strings;

const files = import.meta.glob<{ default: Partial<Strings> }>(['./*.ts', '!./index.ts', '!./en.ts']);
/** True when the member app has a translation file for this language (English always does). */
export const hasStrings = (code: string) => code === 'en' || `./${code}.ts` in files;

const loaded = new Map<string, Partial<Strings>>([['en', en]]);
const listeners = new Set<() => void>();
const asked = new Set<string>();

/** Load a language's strings once; components re-render when they arrive. */
export function loadLanguage(code: string) {
  if (asked.has(code)) return;
  asked.add(code);
  const file = files[`./${code}.ts`];
  if (!file) return;
  void file().then((m) => {
    loaded.set(code, m.default);
    listeners.forEach((l) => l());
  });
}

/** Translate with a given language: the member app passes the member's, the office its own pick. */
export function useStrings(code: string | null | undefined) {
  const lang = languages[(code ?? 'en') as LanguageCode] ? (code as LanguageCode) : 'en';
  const strings = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
    () => loaded.get(lang),
  );
  useEffect(() => loadLanguage(lang), [lang]);
  const t = (key: StringKey, vars?: Record<string, string | number>) =>
    (strings?.[key] ?? en[key]).replace(/\{(\w+)\}/g, (_, k) => String(vars?.[k] ?? `{${k}}`));
  const info = languageInfo(lang);
  return { t, locale: info.locale, lang, dir: (('rtl' in info && info.rtl) ? 'rtl' : 'ltr') as 'rtl' | 'ltr' };
}

export function useT() {
  const session = useSession(memberSession);
  return useStrings(session?.member.language);
}
