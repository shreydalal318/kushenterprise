import { createContext, useContext, type ReactNode } from 'react';
import { showDone } from '@/components/done';
import { useCart } from '@/lib/cart';

type Show = (title: string, detail?: string, ms?: number) => void;
const Ctx = createContext<Show>(showDone);

/**
 * "Yes, that's done" after every action (added to cart, request sent, order placed): the same centred
 * confirmation the staff app uses. A new one replaces the old, so quick taps never pile up.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  return <Ctx.Provider value={showDone}>{children}</Ctx.Provider>;
}

export const useToast = () => useContext(Ctx);

/** Change a cart quantity and say so: "Added to cart — 2 × BSS 500 ml". */
export function useCartQty() {
  const cart = useCart();
  const toast = useToast();
  return (variantId: string, name: string, qty: number) => {
    const before = cart.items[variantId] ?? 0;
    const n = Math.max(0, Math.min(500, qty));
    cart.set(variantId, n);
    if (!n) toast('Removed from cart', name);
    else toast(n > before ? 'Added to cart' : 'Cart updated', `${n} × ${name}`);
  };
}
