import { memberSession } from '@/api/client';
import type { LanguageCode } from '@/api/types';
import { useSession } from '@/lib/session';

import { en, type Strings } from './en';
import { hi } from './hi';
import { kn } from './kn';
import { ml } from './ml';
import { ta } from './ta';
import { te } from './te';

// Same strings as the mobile app. Add a language: create xx.ts typed as Strings and register it here.
export const languages: Record<LanguageCode, { label: string; locale: string; strings: Strings }> = {
  en: { label: 'English', locale: 'en-IN', strings: en },
  hi: { label: 'हिन्दी', locale: 'hi-IN', strings: hi },
  ta: { label: 'தமிழ்', locale: 'ta-IN', strings: ta },
  te: { label: 'తెలుగు', locale: 'te-IN', strings: te },
  ml: { label: 'മലയാളം', locale: 'ml-IN', strings: ml },
  kn: { label: 'ಕನ್ನಡ', locale: 'kn-IN', strings: kn },
};

export type StringKey = keyof Strings;

export function useT() {
  const session = useSession(memberSession);
  const lang = languages[session?.member.language ?? 'en'] ?? languages.en;
  const t = (key: StringKey, vars?: Record<string, string | number>) =>
    lang.strings[key].replace(/\{(\w+)\}/g, (_, k) => String(vars?.[k] ?? `{${k}}`));
  return { t, locale: lang.locale };
}
