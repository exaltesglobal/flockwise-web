// Fetch wrapper shared by the admin dashboard and the member portal. Each side has its
// own signed-in session (a staff member can also be signed in as a member), so the
// client is created per "scope" with its own token store.
import { getChurch } from '@/lib/church';
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
  if (isUsingMocks()) return mockRequest<T>(store.scope, method, path, body, store.get(), getChurch());

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
        ...(getChurch() ? { 'X-Church': getChurch()! } : {}),
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

// ----- the Flockwise team panel (/platform): its own short session, no refresh -----
export type PlatformSession = { token: string; email: string; expiresAt: string };
const PLATFORM_KEY = 'fw.session.platform';

class PlatformStore {
  private session: PlatformSession | null = null;
  private listeners = new Set<(s: PlatformSession | null) => void>();
  constructor() {
    try {
      const s = JSON.parse(localStorage.getItem(PLATFORM_KEY) ?? 'null') as PlatformSession | null;
      this.session = s && s.expiresAt > new Date().toISOString() ? s : null;
    } catch {
      this.session = null;
    }
  }
  get = () => this.session;
  set(s: PlatformSession | null) {
    this.session = s;
    try {
      if (s) localStorage.setItem(PLATFORM_KEY, JSON.stringify(s));
      else localStorage.removeItem(PLATFORM_KEY);
    } catch {
      /* storage blocked: keep it for this visit */
    }
    this.listeners.forEach((l) => l(s));
  }
  subscribe(l: (s: PlatformSession | null) => void) {
    this.listeners.add(l);
    return () => void this.listeners.delete(l);
  }
}

export const platformSession = new PlatformStore();

async function platformSend<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const s = platformSession.get();
  if (isUsingMocks()) {
    try {
      return await mockRequest<T>('platform', method, path, body, s ? { token: s.token } : null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) platformSession.set(null);
      throw e;
    }
  }
  let res: Response;
  try {
    res = await fetch(`${getApiUrl()}${path}`, {
      method,
      headers: { Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(s ? { Authorization: `Bearer ${s.token}` } : {}), 'X-Client': 'flockwise-web-platform' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new ApiError(0, 'network', 'Could not reach the server.');
  }
  if (res.status === 401 && s) platformSession.set(null);
  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (json as ApiErrorBody | null)?.error;
    throw new ApiError(res.status, err?.code ?? 'http_error', err?.message ?? `Request failed (${res.status})`, err?.fields);
  }
  return json as T;
}

/** Requests that are not tied to a signed-in church: sign-up, church lookup and the team panel. */
export const platformApi = {
  get: <T>(path: string) => platformSend<T>('GET', path),
  post: <T>(path: string, body?: unknown) => platformSend<T>('POST', path, body ?? {}),
  patch: <T>(path: string, body?: unknown) => platformSend<T>('PATCH', path, body ?? {}),
};
