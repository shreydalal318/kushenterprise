'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

/** Cart = variant id → quantity. Kept in this browser only (prices are always fetched fresh). */
type Cart = Record<string, number>;
interface CartApi {
  items: Cart;
  count: number;
  /** False until the saved cart has been read from this browser (so "empty" never flashes). */
  ready: boolean;
  set: (variantId: string, qty: number) => void;
  add: (lines: { variantId: string; qty: number }[]) => void;
  clear: () => void;
}
const Ctx = createContext<CartApi | null>(null);

export function CartProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const key = `ke-cart-${userId}`;
  const [items, setItems] = useState<Cart>({});
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try { const raw = localStorage.getItem(key); if (raw) setItems(JSON.parse(raw)); } catch { /* storage unavailable */ }
    setReady(true);
  }, [key]);
  const save = useCallback((next: Cart) => {
    setItems(next);
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* storage unavailable */ }
  }, [key]);
  const api = useMemo<CartApi>(() => ({
    items,
    count: Object.values(items).reduce((t, n) => t + n, 0),
    ready,
    set: (variantId, qty) => { const n = { ...items }; if (qty > 0) n[variantId] = Math.min(500, qty); else delete n[variantId]; save(n); },
    add: (lines) => { const n = { ...items }; for (const l of lines) if (l.qty > 0) n[l.variantId] = Math.min(500, (n[l.variantId] ?? 0) + l.qty); save(n); },
    clear: () => save({}),
  }), [items, ready, save]);
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useCart() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useCart outside CartProvider');
  return c;
}
