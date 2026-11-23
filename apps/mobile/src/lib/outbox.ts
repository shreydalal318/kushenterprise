import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Network from 'expo-network';
import { useEffect, useSyncExternalStore } from 'react';
import { vanilla, type RouterInputs } from './trpc';

/**
 * Offline outbox. Orders and invoices made with no signal are saved on the phone and sent when the
 * connection returns. Each carries a clientRequestId, so a resend after a dropped reply never
 * creates a duplicate on the server.
 */
export type OutboxItem =
  | { id: string; kind: 'placeOrder'; label: string; createdAt: number; error?: string; input: RouterInputs['portal']['placeOrder'] }
  | { id: string; kind: 'createInvoice'; label: string; createdAt: number; error?: string; input: RouterInputs['invoices']['create'] }
  | { id: string; kind: 'createOrder'; label: string; createdAt: number; error?: string; input: RouterInputs['orders']['create'] };
type NewItem = OutboxItem extends infer T ? (T extends OutboxItem ? Omit<T, 'id' | 'createdAt' | 'error'> : never) : never;

const KEY = 'ke-outbox-v1';
let items: OutboxItem[] = [];
let loaded = false;
let flushing = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const persist = () => AsyncStorage.setItem(KEY, JSON.stringify(items)).catch(() => {});

async function load() {
  if (loaded) return;
  loaded = true;
  try { items = JSON.parse((await AsyncStorage.getItem(KEY)) ?? '[]'); } catch { items = []; }
  emit();
}

export async function enqueue(item: NewItem) {
  await load();
  items = [...items, { ...item, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, createdAt: Date.now() } as OutboxItem];
  await persist(); emit();
}

export async function discard(id: string) { items = items.filter((i) => i.id !== id); await persist(); emit(); }

/** A failure that a resend could fix (no signal, timeout, server restarting). */
export function isNetworkError(e: unknown) {
  const msg = String((e as { message?: string })?.message ?? e);
  const code = (e as { data?: { code?: string } })?.data?.code;
  return !code && /network|fetch|timeout|Failed to fetch|connection/i.test(msg);
}

export async function flush() {
  await load();
  if (flushing || !items.length) return;
  const state = await Network.getNetworkStateAsync().catch(() => null);
  if (state && state.isInternetReachable === false) return;
  flushing = true;
  try {
    for (const it of [...items]) {
      try {
        if (it.kind === 'placeOrder') await vanilla.portal.placeOrder.mutate(it.input);
        else if (it.kind === 'createInvoice') await vanilla.invoices.create.mutate(it.input);
        else await vanilla.orders.create.mutate(it.input);
        items = items.filter((x) => x.id !== it.id);
      } catch (e) {
        if (isNetworkError(e)) break; // still offline: try again later
        items = items.map((x) => (x.id === it.id ? { ...x, error: String((e as Error).message) } : x)); // needs attention
      }
      await persist(); emit();
    }
  } finally { flushing = false; }
}

export function useOutbox() {
  useEffect(() => {
    void load().then(flush);
    const sub = Network.addNetworkStateListener((s) => { if (s.isConnected) void flush(); });
    const timer = setInterval(() => void flush(), 30_000);
    return () => { sub.remove(); clearInterval(timer); };
  }, []);
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => items, () => items);
}
