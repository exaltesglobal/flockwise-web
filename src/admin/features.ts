// The church's feature switches (Settings › Features) in the office: which menu items show.
// Loaded once per sign-in with the church settings; the Features tab calls setFeatures().
import { useEffect, useSyncExternalStore } from 'react';

import { adminSession } from '@/api/client';
import { AdminApi } from '@/api/endpoints';
import { featureOn } from '@/core/features';

type Choices = Partial<Record<string, boolean>>;

let cached: Promise<void> | null = null;
let current: Choices | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function load() {
  if (!adminSession.get()) return;
  cached ??= AdminApi.settings
    .get()
    .then((s) => {
      current = s.features ?? {};
      notify();
    })
    .catch(() => {
      cached = null;
    });
}

export function setFeatures(next: Choices) {
  current = next;
  cached = Promise.resolve();
  notify();
}

adminSession.subscribe(() => {
  cached = null;
  current = null;
  notify();
  load();
});

/** Whether a feature is on; while loading, the defaults apply. */
export function useFeatures() {
  const choices = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
    () => current,
  );
  useEffect(load, []);
  return { choices: choices ?? {}, on: (key?: string) => !key || featureOn(choices, key) };
}
