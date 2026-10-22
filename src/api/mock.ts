// Demo backend used while VITE_USE_MOCKS=true. It runs the real church engine (src/core,
// the same code as the API server) in the browser against a sample church saved to
// localStorage, so edits in the church office show up in the member portal and survive
// a reload. Nothing leaves the browser: gifts succeed instantly and messages are logged.
// Like the server, it hosts many churches: churches made on the sign-up page, a few sample
// churches for the Flockwise team panel, and the directory itself.
import { getApiUrl } from '@/lib/config';
import { bootstrapChurch, createChurchEngine, createPlatform, Db, saveSubscription, startTrial, type Dump } from '@/core';
import { createDemoEnv, readDemoToken } from '@/core/demo';
import { seedDemo } from '@/core/seed';
import { newPerson } from '@/core/util';

import type { Session } from './types';
import type { BotIntent } from '@/core/types';

export { DEMO_CODE as DEMO_OTP } from '@/core';

const DB_KEY = 'fw.demoDb.v2';
const PLATFORM_KEY = 'fw.demoPlatform.v1';
const churchKey = (id: string) => `fw.demoChurch.${id}`;
const MAIN = 'ch_demo';
const RESEED_AFTER_DAYS = 7; // event dates are relative to the seed day
const DAY = 86_400_000;

const webUrl = typeof location !== 'undefined' ? `${location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}` : '';
const env = createDemoEnv({ webUrl, apiUrl: getApiUrl() });

type Engine = ReturnType<typeof createChurchEngine>;
const engines = new Map<string, Engine>();
const loadedRaw = new Map<string, string | null>();

/** Each church's tokens name the church, like the server's. */
function churchEnv(id: string) {
  const e = Object.create(env) as typeof env;
  e.signAccess = (claims) => ({ token: `demo.${btoa(JSON.stringify({ ...claims, church: id }))}`, expiresAt: new Date(Date.now() + 30 * DAY).toISOString() });
  e.network = networkHost(id);
  return e;
}

/** Church networks live in the directory, like on the server (server.ts). */
function networkHost(id: string): NonNullable<typeof env.network> {
  const h = () => platform.networks.hostFor(id);
  return { list: () => h().list(), preview: (c) => h().preview(c), join: (c, s, by) => h().join(c, s, by), update: (n, s) => h().update(n, s), leave: (n) => h().leave(n) };
}
env.network = networkHost(MAIN);
// Team additions to the shared song database (Team panel > Songs), shared by every demo church.
env.songCatalog = { stored: () => platform.songs() };

function makeEngine(id: string, db = new Db()) {
  const engine = createChurchEngine(db, id === MAIN ? env : churchEnv(id));
  engines.set(id, engine);
  return engine;
}

const main = makeEngine(MAIN);
const db = main.db;
const platformDb = new Db();

const platform = createPlatform({
  db: platformDb,
  env,
  admins: [],
  host: {
    defaultId: MAIN,
    get: (id) => engines.get(id) ?? restore(id),
    create: async (id) => makeEngine(id),
  },
});

function readStore(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStore(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage full or blocked: keep working in memory */
  }
}

/** Loads a church made on the sign-up page from storage. */
function restore(id: string): Engine | undefined {
  const raw = readStore(churchKey(id));
  if (!raw) return undefined;
  try {
    const engine = makeEngine(id, new Db(JSON.parse(raw) as Dump));
    loadedRaw.set(id, raw);
    return engine;
  } catch {
    return undefined;
  }
}

/** A few small churches so the Flockwise team panel has something to show. */
function sampleChurches() {
  const samples = [
    { id: 'ch_sample1', slug: 'bethel-pune', name: 'Bethel Assembly', city: 'Pune', people: 64, plan: 'trial' as const, days: 12 },
    { id: 'ch_sample2', slug: 'living-word-chennai', name: 'Living Word Church', city: 'Chennai', people: 310, plan: 'grow' as const, days: 70 },
    { id: 'ch_sample3', slug: 'mar-thoma-kochi', name: 'St Thomas Mar Thoma Parish', city: 'Kochi', people: 1420, plan: 'thrive' as const, days: 140 },
    { id: 'ch_sample4', slug: 'new-life-delhi', name: 'New Life Fellowship', city: 'New Delhi', people: 38, plan: 'seed' as const, days: 25 },
  ];
  const first = ['Asha', 'Ravi', 'Priya', 'John', 'Mary', 'Samuel', 'Grace', 'David', 'Ruth', 'Joseph', 'Esther', 'Daniel'];
  const last = ['Kumar', 'Thomas', 'George', 'Reddy', 'Das', 'Mathew', 'Paul', 'Singh', 'Varghese', 'Raj'];
  for (const s of samples) {
    const created = new Date(Date.now() - s.days * DAY);
    const engine = makeEngine(s.id);
    bootstrapChurch(engine.db, engine.env, { id: s.id, name: s.name, country: 'IN', currency: 'INR', city: s.city, ownerEmail: `pastor@${s.slug}.example`, ownerName: 'Pastor' });
    const ctx = engine.systemCtx();
    for (let i = 0; i < s.people; i++) engine.db.put('people', { ...newPerson(ctx, { firstName: first[i % first.length], lastName: last[(i * 7) % last.length], status: i % 9 === 0 ? 'visitor' : 'member' }), joinedAt: new Date(Date.now() - (((i * 53) % 1800) + 20) * DAY).toISOString() });
    // Twelve Sundays of attendance, so a church network has numbers to add up.
    for (let w = 12; w >= 1; w--) {
      const d = new Date(Date.now() - w * 7 * DAY);
      d.setUTCDate(d.getUTCDate() - d.getUTCDay());
      const date = d.toISOString().slice(0, 10);
      engine.db.put('attendanceHistory', { id: date, date, count: Math.round(s.people * (0.62 + ((w * 37 + s.people) % 17) / 100) + (12 - w) * s.people * 0.004) });
    }
    const owner = engine.db.all('staff')[0];
    engine.db.put('staff', { ...owner, status: 'active', lastActiveAt: new Date(Date.now() - (s.days % 5) * DAY).toISOString() });
    if (s.plan === 'trial') startTrial(engine.db, new Date(Date.now() - 18 * DAY));
    else saveSubscription(engine.db, { plan: s.plan, status: 'active', interval: s.plan === 'thrive' ? 'yearly' : 'monthly', trialEndsAt: null, currentPeriodEnd: new Date(Date.now() + 20 * DAY).toISOString(), providerRef: s.plan === 'seed' ? null : `sub_demo_${s.id}`, updatedAt: created.toISOString() });
    platform.ensureChurch({ id: s.id, slug: s.slug, name: s.name, city: s.city, country: 'IN', currency: 'INR', ownerEmail: `pastor@${s.slug}.example`, ownerName: 'Pastor', createdAt: created.toISOString(), source: 'signup' });
    // Two churches bought assisted Razorpay setup, so the team's KYC queue has work in it.
    if (s.id === 'ch_sample1' || s.id === 'ch_sample4') {
      const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
      const kinds = s.id === 'ch_sample1' ? (['pan', 'registration', 'bank_proof', 'signatory_id'] as const) : (['pan', 'bank_proof'] as const);
      const paidAt = new Date(Date.now() - (s.id === 'ch_sample1' ? 1.5 : 3) * DAY).toISOString();
      const docs = kinds.map((kind, i) => ({ id: `kyc_${s.id}_${i}`, kind, fileName: `${kind.replace('_', '-')}.png`, mime: 'image/png', size: 68, uploadedAt: paidAt, uploadedBy: 'Pastor' }));
      for (const d of docs) engine.db.put('kycFiles', { id: d.id, sealed: env.seal(png) });
      engine.db.put('integrations', {
        id: 'razorpaySetup', status: s.id === 'ch_sample1' ? 'paid' : 'in_progress', amount: 199_900, paymentRef: `plink_demo_${s.id}`, paymentUrl: null,
        requestedBy: 'Pastor', requestedByEmail: `pastor@${s.slug}.example`, createdAt: paidAt, paidAt, doneAt: null, orgType: s.id === 'ch_sample1' ? 'trust' : 'society',
        contactPhone: s.id === 'ch_sample1' ? '+91 98220 41230' : '+91 98110 55210', docs, docsSubmittedAt: s.id === 'ch_sample1' ? paidAt : null,
        teamNote: s.id === 'ch_sample4' ? 'Please upload the society registration certificate and the secretary’s Aadhaar.' : '',
      });
    }
  }
}

function freshSeed() {
  db.load({});
  seedDemo(db, env);
  // A few WhatsApp assistant conversations, shown once the office turns the assistant on.
  const chats: [number, string, string, string, BotIntent][] = [
    [0.1, '+919848011122', 'Anil Thomas', '1', 'services'],
    [0.4, '+919848011122', 'Anil Thomas', 'Please pray for my job interview on Monday', 'prayer'],
    [1.2, '+919701255501', 'Kavya R', 'Hi, I’m new here', 'new'],
    [2.5, '+919440098765', 'Joseph M', 'give', 'give'],
    [3.1, '+919000312345', 'Sarah', 'can pastor call me', 'talk'],
    [4.0, '+919848011122', 'Anil Thomas', 'hello', 'menu'],
  ];
  for (const [days, phone, name, text, intent] of chats) {
    db.put('botMessages', { id: `bm_demo_${Math.round(days * 10)}`, at: new Date(Date.now() - days * DAY).toISOString(), phone, name, personId: null, text, intent, reply: '', sent: true });
  }
  db.put('meta', { id: 'seededAt', value: String(Date.now()) });
}

let platformRaw: string | null = null;
function loadPlatform() {
  const raw = readStore(PLATFORM_KEY);
  if (raw && raw === platformRaw) return;
  if (raw) {
    try {
      platformDb.load(JSON.parse(raw) as Dump);
      platformRaw = raw;
    } catch {
      /* start a fresh directory */
    }
  }
  if (!platformDb.count('meta')) {
    platform.ensureChurch({ id: MAIN, slug: 'grace', name: 'Grace Community Church', city: 'Hyderabad', country: 'IN', currency: 'INR', ownerEmail: 'pastor@gracecommunity.in', ownerName: 'Pastor' });
  }
  // Sample churches live in memory only; they are remade on each visit.
  if (!engines.has('ch_sample1')) sampleChurches();
  demoNetwork();
}

const DEMO_NETWORK = 'net_demo';
/** A diocese with Grace and three sample churches in it, for the /network demo. */
function demoNetwork() {
  if (platform.networks.get(DEMO_NETWORK)) return;
  const now = new Date().toISOString();
  platformDb.put('meta', { id: `network:${DEMO_NETWORK}`, value: JSON.stringify({ id: DEMO_NETWORK, name: 'South India Fellowship of Churches', kind: 'network', code: 'SIFC-2026', admins: [], createdAt: now, createdBy: 'demo' }) });
  for (const [churchId, shareGiving, days] of [[MAIN, true, 60], ['ch_sample2', false, 40], ['ch_sample3', false, 90], ['ch_sample1', false, 8]] as const) {
    platformDb.put('meta', { id: `netchurch:${DEMO_NETWORK}:${churchId}`, value: JSON.stringify({ networkId: DEMO_NETWORK, churchId, joinedAt: new Date(Date.now() - days * DAY).toISOString(), joinedBy: 'Pastor', shareGiving }) });
  }
}

/** Demo only: whoever signs in to /network leads the sample network too. */
function joinDemoNetwork(email: string) {
  const m = platformDb.get('meta', `network:${DEMO_NETWORK}`);
  if (!m) return;
  const n = JSON.parse(m.value) as { admins: string[] };
  if (!n.admins.includes(email)) platformDb.put('meta', { ...m, value: JSON.stringify({ ...n, admins: [...n.admins, email] }) });
}

function load() {
  loadPlatform();
  let raw: string | null = readStore(DB_KEY);
  if (raw && raw === loadedRaw.get(MAIN)) return;
  if (raw) {
    try {
      const dump = JSON.parse(raw) as Dump;
      const seededAt = Number(dump.meta?.find((m) => m.id === 'seededAt')?.value ?? 0);
      if (Date.now() - seededAt < RESEED_AFTER_DAYS * DAY) {
        db.load(dump);
        loadedRaw.set(MAIN, raw);
        return;
      }
    } catch {
      /* fall through to a fresh seed */
    }
  }
  raw = null;
  if (!loadedRaw.get(MAIN) && db.count('people')) return; // already seeded in memory and storage is blocked
  freshSeed();
  save(MAIN);
}

function save(id: string) {
  const engine = engines.get(id);
  if (!engine || id.startsWith('ch_sample')) return;
  const raw = JSON.stringify(engine.db.dump());
  loadedRaw.set(id, raw);
  writeStore(id === MAIN ? DB_KEY : churchKey(id), raw);
}

function savePlatform() {
  // The sample churches are rebuilt on load, so they are left out of storage.
  const dump = platformDb.dump();
  dump.meta = (dump.meta ?? []).filter((m) => !m.id.startsWith('church:ch_sample'));
  platformRaw = JSON.stringify(dump);
  writeStore(PLATFORM_KEY, platformRaw);
}

export function resetDemoData() {
  freshSeed();
  save(MAIN);
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const PLATFORM_RE = /^\/(platform|signup|churches|networks)(\/|$)/;

export async function mockRequest<T>(scope: 'admin' | 'member' | 'platform', method: string, path: string, body: unknown, current: Session | { token: string } | null, churchRef?: string | null): Promise<T> {
  await wait(120 + Math.random() * 140);
  load(); // pick up changes made in another tab (e.g. admin and member side by side)
  const [pathname, search = ''] = path.split('?');
  const query = Object.fromEntries(new URLSearchParams(search));

  if (PLATFORM_RE.test(pathname)) {
    const token = current && 'token' in current ? current.token : null;
    try {
      const result = await platform.handle({ method, path: pathname, query, body: body ?? {}, auth: null, token });
      if (pathname === '/networks/auth/verify') joinDemoNetwork((result as { email: string }).email);
      return (result === undefined ? undefined : structuredClone(result)) as T;
    } finally {
      if (method !== 'GET') {
        savePlatform();
        for (const id of engines.keys()) save(id);
      }
    }
  }

  const access = current && 'accessToken' in current ? current.accessToken : null;
  const claims = readDemoToken(access) as (Record<string, unknown> & { scope?: string; church?: string }) | null;
  const auth = claims && claims.scope === scope ? (claims as never) : null;
  const ref = (auth && claims?.church) || churchRef || null;
  const { engine } = platform.resolve(ref);
  const id = [...engines].find(([, e]) => e === engine)?.[0] ?? MAIN;
  try {
    const result = await engine.handle({ method, path: pathname, query, body: body ?? {}, auth });
    // Hand back a copy so screens can't mutate the demo database by accident.
    return (result === undefined ? undefined : structuredClone(result)) as T;
  } finally {
    if (method !== 'GET') {
      await engine.tick().catch(() => undefined);
      save(id);
    }
  }
}

/** Messages "sent" in demo mode, newest first (shown in the Messages screen). */
export const demoOutbox = () => [...env.outbox].reverse();
