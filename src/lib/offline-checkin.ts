// Keeps a check-in desk working when the church's internet drops. While online the desk keeps a
// fresh copy of everyone who can check in (the "pack"); when a request cannot reach the server it
// searches and checks people in from that copy, prints the same labels, and queues what it did.
// The queue is replayed as soon as the server answers again. Pack and queue live in localStorage,
// so a refresh of the tab while online does not lose anything.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Checkin, CheckinFamily, CheckinMethod, CheckinResult, OfflineItem, OfflinePack, OfflineSyncResult } from '@/api/admin-types';
import { adminSession } from '@/api/client';
import { AdminApi } from '@/api/endpoints';
import { offlineCheckIn, offlineSearch, QR_PREFIX } from '@/core/offline-checkin';
import { toApiError } from '@/lib/use-api';

/** Someone the desk checked in offline who had already been checked in by another desk. */
export type SyncConflict = { name: string; note: string };
type Stored = { pack: OfflinePack | null; queue: OfflineItem[]; local: Checkin[]; conflicts: SyncConflict[] };

const EMPTY: Stored = { pack: null, queue: [], local: [], conflicts: [] };
const REFRESH_MS = 5 * 60_000;
const PROBE_MS = 20_000;
const storageKey = (eventId: string) => `fw.offline.${adminSession.get()?.church.id ?? 'church'}.${eventId}`;

function load(eventId: string): Stored {
  if (!eventId) return EMPTY;
  try {
    return { ...EMPTY, ...JSON.parse(localStorage.getItem(storageKey(eventId)) ?? 'null') };
  } catch {
    return EMPTY;
  }
}

function save(eventId: string, s: Stored) {
  try {
    if (s.queue.length || s.pack) localStorage.setItem(storageKey(eventId), JSON.stringify(s));
  } catch {
    /* storage full or blocked: the desk still works for this visit */
  }
}

const isNetwork = (e: unknown) => toApiError(e).status === 0;

export type OfflineDesk = ReturnType<typeof useOfflineDesk>;

export function useOfflineDesk(eventId: string) {
  const [state, setState] = useState<Stored>(() => load(eventId));
  const [online, setOnline] = useState(() => navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const busy = useRef(false);
  const latest = useRef(state);
  latest.current = state;

  useEffect(() => setState(load(eventId)), [eventId]);

  const update = useCallback(
    (f: (s: Stored) => Stored) =>
      setState((s) => {
        const next = f(s);
        save(eventId, next);
        return next;
      }),
    [eventId],
  );

  /** Downloads a fresh pack. Doubles as the "is the server back?" probe. */
  const refresh = useCallback(async () => {
    if (!eventId) return false;
    if (!navigator.onLine) {
      setOnline(false);
      return false;
    }
    try {
      const pack = await AdminApi.checkin.offlinePack(eventId);
      update((s) => ({ ...s, pack }));
      setOnline(true);
      return true;
    } catch (e) {
      if (isNetwork(e)) setOnline(false);
      return false;
    }
  }, [eventId, update]);

  const syncNow = useCallback(async (): Promise<OfflineSyncResult[] | null> => {
    const queue = latest.current.queue;
    if (!eventId || !queue.length || busy.current) return null;
    busy.current = true;
    setSyncing(true);
    try {
      const { results } = await AdminApi.checkin.sync(eventId, queue);
      const namesOf = (ids: string[]) => ids.map((id) => latest.current.pack?.people.find((p) => p.id === id)?.name ?? 'Someone').join(', ') || 'A check-in';
      // Every returned item is settled, synced or refused; a refusal would fail the same way again.
      const settled = new Set(results.map((r) => r.clientId));
      const conflicts: SyncConflict[] = results.flatMap((r) => [
        ...r.skipped.map((x) => ({ name: x.name, note: x.securityCode ? `was already checked in at another desk with code ${x.securityCode}` : 'was already checked in at another desk' })),
        ...(r.ok ? [] : [{ name: namesOf(queue.find((i) => i.clientId === r.clientId)?.personIds ?? []), note: `could not be saved (${r.error ?? 'unknown error'})` }]),
      ]);
      update((s) => ({ ...s, queue: s.queue.filter((i) => !settled.has(i.clientId)), local: s.local.filter((c) => !settled.has(c.clientId ?? '')), conflicts: [...s.conflicts, ...conflicts] }));
      setOnline(true);
      void refresh();
      return results;
    } catch (e) {
      if (isNetwork(e)) setOnline(false);
      return null;
    } finally {
      busy.current = false;
      setSyncing(false);
    }
  }, [eventId, refresh, update]);

  // Fresh pack on open and every five minutes; a quicker probe while the server is unreachable.
  useEffect(() => {
    if (!eventId) return;
    void refresh();
    const t = setInterval(() => void refresh(), online ? REFRESH_MS : PROBE_MS);
    return () => clearInterval(t);
  }, [eventId, online, refresh]);

  useEffect(() => {
    const up = () => void refresh();
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, [refresh]);

  useEffect(() => {
    if (online && state.queue.length) void syncNow();
  }, [online, state.queue.length, syncNow]);

  const checkedIn = useMemo(() => new Set([...(state.pack?.checkedIn ?? []), ...state.queue.flatMap((i) => i.personIds)]), [state.pack, state.queue]);

  const search = useCallback((q: string): CheckinFamily[] => (state.pack ? offlineSearch(state.pack, q, checkedIn) : []), [state.pack, checkedIn]);

  const checkIn = useCallback(
    (personIds: string[], method: CheckinMethod): CheckinResult => {
      if (!state.pack) throw new Error('This desk has no offline list yet. Connect once to download it.');
      const { item, result } = offlineCheckIn(state.pack, personIds, method, checkedIn, new Date());
      if (item.personIds.length) update((s) => ({ ...s, queue: [...s.queue, item], local: [...s.local, ...result.checkins] }));
      return result;
    },
    [state.pack, checkedIn, update],
  );

  const scan = useCallback(
    (raw: string): CheckinResult & { alreadyCheckedIn?: boolean } => {
      const upper = raw.trim().toUpperCase();
      const code = upper.startsWith(QR_PREFIX) ? upper.slice(QR_PREFIX.length) : upper;
      const p = state.pack?.people.find((x) => x.code === code);
      if (!p) throw new Error('This QR code is not in the offline list.');
      if (checkedIn.has(p.id)) {
        const mine = state.local.find((c) => c.personId === p.id);
        return { checkins: [mine ?? ({ personName: p.name } as Checkin)], securityCode: mine?.securityCode ?? null, labels: [], alreadyCheckedIn: true };
      }
      return checkIn([p.id], 'qr');
    },
    [state.pack, state.local, checkedIn, checkIn],
  );

  return {
    /** False while the server cannot be reached: the desk works from its copy. */
    online,
    ready: !!state.pack,
    packAt: state.pack?.generatedAt ?? null,
    people: state.pack?.people.length ?? 0,
    queued: state.queue.reduce((n, i) => n + i.personIds.length, 0),
    /** Check-ins made here that the server has not seen yet. */
    local: state.local,
    syncing,
    conflicts: state.conflicts,
    dismissConflicts: () => update((s) => ({ ...s, conflicts: [] })),
    /** Call when a live request failed for lack of a network: switches the desk to its copy. */
    lost: (e: unknown) => {
      if (!isNetwork(e) || !state.pack) return false;
      setOnline(false);
      return true;
    },
    refresh,
    syncNow,
    search,
    checkIn,
    scan,
  };
}
