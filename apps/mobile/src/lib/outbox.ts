import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Network from 'expo-network';
import { useEffect, useSyncExternalStore } from 'react';
import { useAuth } from './auth';
import { errorText, isUnreachable } from './format';
import { vanilla, type RouterInputs } from './trpc';

/**
 * Offline outbox. Orders and invoices made with no signal are saved on the phone and sent when the
 * connection returns. Each carries a clientRequestId, so a resend after a dropped reply never
 * creates a duplicate on the server. Every signed-in user has their own queue, so another account
 * on the same phone never sends it.
 */
export type OutboxItem =
  | { id: string; kind: 'placeOrder'; label: string; createdAt: number; error?: string; input: RouterInputs['portal']['placeOrder'] }
  | { id: string; kind: 'createInvoice'; label: string; createdAt: number; error?: string; input: RouterInputs['invoices']['create'] };
type NewItem = OutboxItem extends infer T ? (T extends OutboxItem ? Omit<T, 'id' | 'createdAt' | 'error'> : never) : never;

const keyFor = (userId: string) => `ke-outbox-v2-${userId}`;
let owner: string | null = null; // whose queue is in memory
let loading: Promise<void> = Promise.resolve();
let items: OutboxItem[] = [];
let flushing = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const persist = () => (owner ? AsyncStorage.setItem(keyFor(owner), JSON.stringify(items)).catch(() => {}) : Promise.resolve());

/** Switch to this user's queue (null when signed out). */
function load(userId: string | null) {
  if (userId === owner) return loading;
  owner = userId; items = []; emit();
  loading = userId
    ? AsyncStorage.getItem(keyFor(userId)).then((v) => { if (owner === userId) { items = v ? JSON.parse(v) : []; emit(); } }).catch(() => {})
    : Promise.resolve();
  return loading;
}

export async function enqueue(item: NewItem) {
  await loading;
  if (!owner) throw new Error('Please sign in again');
  items = [...items, { ...item, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, createdAt: Date.now() } as OutboxItem];
  await persist(); emit();
}

export async function discard(id: string) { items = items.filter((i) => i.id !== id); await persist(); emit(); }

/** A failure that a resend could fix (no signal, timeout, server restarting): the same test errorText uses. */
export const isNetworkError = isUnreachable;

export async function flush() {
  await loading;
  const user = owner;
  if (flushing || !user || !items.length) return;
  const state = await Network.getNetworkStateAsync().catch(() => null);
  if (state && state.isInternetReachable === false) return;
  flushing = true;
  try {
    for (const it of [...items]) {
      if (owner !== user) break;
      let sent = false, err: unknown;
      try {
        if (it.kind === 'placeOrder') await vanilla.portal.placeOrder.mutate(it.input);
        else await vanilla.invoices.create.mutate(it.input);
        sent = true;
      } catch (e) { err = e; }
      // Signed out or switched account meanwhile: that user's queue resends next time (deduplicated by request id).
      if (owner !== user) break;
      if (!sent && isUnreachable(err)) break; // still offline: try again later
      items = sent ? items.filter((x) => x.id !== it.id) : items.map((x) => (x.id === it.id ? { ...x, error: errorText(err) } : x)); // error: needs attention
      await persist(); emit();
    }
  } finally { flushing = false; }
}

export function useOutbox() {
  const userId = useAuth().me?.id ?? null;
  useEffect(() => {
    void load(userId);
    if (!userId) return;
    void loading.then(flush);
    const sub = Network.addNetworkStateListener((s) => { if (s.isConnected) void flush(); });
    const timer = setInterval(() => void flush(), 30_000);
    return () => { sub.remove(); clearInterval(timer); };
  }, [userId]);
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => items, () => items);
}
