import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

type Cart = Record<string, number>;
interface CartApi { items: Cart; count: number; set: (variantId: string, qty: number) => void; add: (l: { variantId: string; qty: number }[]) => void; setMany: (q: Record<string, number>) => void; clear: () => void }
const Ctx = createContext<CartApi | null>(null);

/** Customer cart: variant id → quantity, saved on the phone (prices are always fetched fresh). */
export function CartProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const key = `ke-cart-${userId}`;
  const [items, setItems] = useState<Cart>({});
  // Updates build on the newest cart, so one made after an await (Order again) never loses a change made meanwhile.
  const latest = useRef(items);
  useEffect(() => { if (userId === 'pending') return; void AsyncStorage.getItem(key).then((v) => { let n: Cart = {}; try { n = v ? JSON.parse(v) : {}; } catch { /* keep empty */ } latest.current = n; setItems(n); }); }, [key]);
  const api = useMemo<CartApi>(() => {
    const save = (n: Cart) => { latest.current = n; setItems(n); if (userId !== 'pending') void AsyncStorage.setItem(key, JSON.stringify(n)); };
    return {
      items, count: Object.values(items).reduce((t, n) => t + n, 0),
      set: (id, q) => { const n = { ...latest.current }; if (q > 0) n[id] = Math.min(500, q); else delete n[id]; save(n); },
      // Several quantities at once (a lens power grid); 0 removes the line.
      setMany: (qs) => { const n = { ...latest.current }; for (const [id, q] of Object.entries(qs)) { if (q > 0) n[id] = Math.min(500, q); else delete n[id]; } save(n); },
      add: (ls) => { const n = { ...latest.current }; for (const l of ls) if (l.qty > 0) n[l.variantId] = Math.min(500, (n[l.variantId] ?? 0) + l.qty); save(n); },
      clear: () => save({}),
    };
  }, [items, key, userId]);
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
export function useCart() { const c = useContext(Ctx); if (!c) throw new Error('useCart outside CartProvider'); return c; }
