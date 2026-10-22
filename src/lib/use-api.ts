import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError } from '@/api/errors';

/** Loads data on mount (and when deps change). `reload` refetches without clearing the screen. */
export function useApi<T>(load: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const loadRef = useRef(load);
  loadRef.current = load;
  const seq = useRef(0);

  const reload = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(true);
    try {
      const result = await loadRef.current();
      if (mine === seq.current) {
        setData(result);
        setError(null);
      }
    } catch (e) {
      if (mine === seq.current) setError(toApiError(e));
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error, loading, reload, setData };
}

export function toApiError(e: unknown) {
  return e instanceof ApiError ? e : new ApiError(0, 'unknown', e instanceof Error ? e.message : 'Something went wrong');
}

/** Wraps a mutation with a busy flag and error capture. */
export function useAction<A extends unknown[], R>(fn: (...args: A) => Promise<R>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const run = useCallback(
    async (...args: A): Promise<R | undefined> => {
      setBusy(true);
      setError(null);
      try {
        return await fn(...args);
      } catch (e) {
        setError(toApiError(e));
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [fn],
  );
  return { run, busy, error, setError };
}
