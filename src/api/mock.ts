// Demo backend used while VITE_USE_MOCKS=true. It runs the real church engine (src/core,
// the same code as the API server) in the browser against a sample church saved to
// localStorage, so edits in the church office show up in the member portal and survive
// a reload. Nothing leaves the browser: gifts succeed instantly and messages are logged.
import { createChurchEngine, Db, type Dump } from '@/core';
import { createDemoEnv, readDemoToken } from '@/core/demo';
import { seedDemo } from '@/core/seed';

import type { Session } from './types';

export { DEMO_CODE as DEMO_OTP } from '@/core';

const DB_KEY = 'fw.demoDb.v2';
const RESEED_AFTER_DAYS = 7; // event dates are relative to the seed day
const DAY = 86_400_000;

const env = createDemoEnv({ webUrl: typeof location !== 'undefined' ? `${location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}` : '' });
const db = new Db();
const engine = createChurchEngine(db, env);
let loadedRaw: string | null = null;

function freshSeed() {
  db.load({});
  seedDemo(db, env);
  db.put('meta', { id: 'seededAt', value: String(Date.now()) });
}

function load() {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(DB_KEY);
  } catch {
    /* storage blocked: keep the in-memory church */
  }
  if (raw && raw === loadedRaw) return;
  if (raw) {
    try {
      const dump = JSON.parse(raw) as Dump;
      const seededAt = Number(dump.meta?.find((m) => m.id === 'seededAt')?.value ?? 0);
      if (Date.now() - seededAt < RESEED_AFTER_DAYS * DAY) {
        db.load(dump);
        loadedRaw = raw;
        return;
      }
    } catch {
      /* fall through to a fresh seed */
    }
  }
  if (!loadedRaw && db.count('people')) return; // already seeded in memory and storage is blocked
  freshSeed();
  save();
}

function save() {
  try {
    loadedRaw = JSON.stringify(db.dump());
    localStorage.setItem(DB_KEY, loadedRaw);
  } catch {
    /* storage full or blocked: keep working in memory */
  }
}

export function resetDemoData() {
  freshSeed();
  save();
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function mockRequest<T>(scope: 'admin' | 'member', method: string, path: string, body: unknown, current: Session | null): Promise<T> {
  await wait(120 + Math.random() * 140);
  load(); // pick up changes made in another tab (e.g. admin and member side by side)
  const [pathname, search = ''] = path.split('?');
  const claims = readDemoToken(current?.accessToken);
  const auth = claims && claims.scope === scope ? claims : null;
  try {
    const result = await engine.handle({ method, path: pathname, query: Object.fromEntries(new URLSearchParams(search)), body: body ?? {}, auth });
    // Hand back a copy so screens can't mutate the demo database by accident.
    return (result === undefined ? undefined : structuredClone(result)) as T;
  } finally {
    if (method !== 'GET') {
      await engine.tick().catch(() => undefined);
      save();
    }
  }
}

/** Messages "sent" in demo mode, newest first (shown in the Messages screen). */
export const demoOutbox = () => [...env.outbox].reverse();
