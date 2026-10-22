// Fetch wrapper shared by the admin dashboard and the member portal. Each side has its
// own signed-in session (a staff member can also be signed in as a member), so the
// client is created per "scope" with its own token store.
import { getApiUrl, isUsingMocks } from '@/lib/config';

import { ApiError } from './errors';
import { mockRequest } from './mock';
import type { ApiErrorBody, Session } from './types';

export { ApiError };

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type Scope = 'admin' | 'member';

const TIMEOUT_MS = 15_000;
const storageKey = (scope: Scope) => `fw.session.${scope}`;

type Listener = (s: Session | null) => void;

export class SessionStore {
  private session: Session | null;
  private listeners = new Set<Listener>();
  private refreshing: Promise<boolean> | null = null;

  constructor(public scope: Scope) {
    try {
      this.session = JSON.parse(localStorage.getItem(storageKey(scope)) ?? 'null');
    } catch {
      this.session = null;
    }
  }

  get = () => this.session;

  set(s: Session | null) {
    this.session = s;
    if (s) localStorage.setItem(storageKey(this.scope), JSON.stringify(s));
    else localStorage.removeItem(storageKey(this.scope));
    this.listeners.forEach((l) => l(s));
  }

  subscribe(l: Listener) {
    this.listeners.add(l);
    return () => void this.listeners.delete(l);
  }

  /** Swaps the refresh token for a new session once; concurrent 401s share the same attempt. */
  refresh(): Promise<boolean> {
    const current = this.session;
    if (!current) return Promise.resolve(false);
    this.refreshing ??= send<Session>(this, 'POST', '/auth/refresh', { refreshToken: current.refreshToken }, true)
      .then((s) => {
        this.set(s);
        return true;
      })
      .catch(() => false)
      .finally(() => {
        this.refreshing = null;
      });
    return this.refreshing;
  }
}

async function send<T>(store: SessionStore, method: Method, path: string, body?: unknown, retried = false): Promise<T> {
  if (isUsingMocks()) return mockRequest<T>(store.scope, method, path, body, store.get());

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const token = store.get()?.accessToken;

  let res: Response;
  try {
    res = await fetch(`${getApiUrl()}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'X-Client': `flockwise-web-${store.scope}`,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    const aborted = e instanceof Error && e.name === 'AbortError';
    throw new ApiError(0, aborted ? 'timeout' : 'network', aborted ? 'The server took too long to respond.' : 'Could not reach the server.');
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401 && token && !retried) {
    if (await store.refresh()) return send<T>(store, method, path, body, true);
    store.set(null);
  }

  if (res.status === 204) return undefined as T;

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (json as ApiErrorBody | null)?.error;
    throw new ApiError(res.status, err?.code ?? 'http_error', err?.message ?? `Request failed (${res.status})`, err?.fields);
  }
  return json as T;
}

export function createApi(store: SessionStore) {
  return {
    get: <T>(path: string) => send<T>(store, 'GET', path),
    post: <T>(path: string, body?: unknown) => send<T>(store, 'POST', path, body ?? {}),
    put: <T>(path: string, body?: unknown) => send<T>(store, 'PUT', path, body ?? {}),
    patch: <T>(path: string, body?: unknown) => send<T>(store, 'PATCH', path, body ?? {}),
    del: <T>(path: string) => send<T>(store, 'DELETE', path),
  };
}

export const adminSession = new SessionStore('admin');
export const memberSession = new SessionStore('member');

export function qs(params: Record<string, string | undefined | null>) {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '');
  return entries.length ? `?${new URLSearchParams(entries as [string, string][]).toString()}` : '';
}
