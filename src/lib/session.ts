import { useSyncExternalStore } from 'react';

import type { SessionStore } from '@/api/client';

export function useSession(store: SessionStore) {
  return useSyncExternalStore(
    (cb) => store.subscribe(cb),
    () => store.get(),
  );
}
