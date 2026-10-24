// The office in other languages. The menu, page names, the "+ New" menu, search, the Today panel
// and other everyday words are translated; the rest of each page stays in English for now.
// Each office/xx.ts file lists translations in the order of office-phrases.ts, so a missing phrase
// simply shows in English. The choice is per browser (each staff member picks their own).
import { useEffect, useSyncExternalStore } from 'react';

import { languageInfo } from '@/core/languages';

import { OFFICE_PHRASES } from './office-phrases';

const KEY = 'fw.office.lang';
const files = import.meta.glob<{ default: string[] }>('./office/*.ts');
const loaded = new Map<string, Record<string, string>>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

let current = (() => {
  try {
    return localStorage.getItem(KEY) || 'en';
  } catch {
    return 'en';
  }
})();

function load(code: string) {
  if (code === 'en' || loaded.has(code)) return;
  const file = files[`./office/${code}.ts`];
  if (!file) return;
  void file().then((m) => {
    const dict: Record<string, string> = {};
    OFFICE_PHRASES.forEach((p, i) => {
      if (m.default[i]) dict[p] = m.default[i];
    });
    loaded.set(code, dict);
    notify();
  });
}

export function officeLanguage() {
  return current;
}

export function setOfficeLanguage(code: string) {
  current = code;
  try {
    localStorage.setItem(KEY, code);
  } catch {
    /* private window */
  }
  load(code);
  notify();
}

/** `tr('People')` gives the office word in the chosen language, `{n}` style blanks filled in. */
export function useOfficeT() {
  const subscribe = (cb: () => void) => {
    listeners.add(cb);
    return () => void listeners.delete(cb);
  };
  const lang = useSyncExternalStore(subscribe, () => current);
  const dict = useSyncExternalStore(subscribe, () => loaded.get(lang));
  useEffect(() => load(lang), [lang]);
  const info = languageInfo(lang);
  const tr = (text: string, vars?: Record<string, string | number>) =>
    (dict?.[text] ?? text).replace(/\{(\w+)\}/g, (_, k) => String(vars?.[k] ?? `{${k}}`));
  return { tr, lang, locale: info.locale, dir: ('rtl' in info && info.rtl ? 'rtl' : 'ltr') as 'rtl' | 'ltr' };
}
