import { useRef, useState } from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { useCart } from './cart';
import { errorText } from './format';
import { trpc } from './trpc';

/** "Order again": put an earlier order's lines in the cart, leaving out anything no longer sold. */
export function useReorder() {
  const cart = useCart();
  const utils = trpc.useUtils();
  const busy = useRef(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async (orderId: string) => {
    if (busy.current) return; // a double tap must not add the order twice
    busy.current = true; setPending(orderId); setError(null);
    try {
      const lines = await utils.portal.reorderLines.fetch({ orderId });
      // The cart query only returns variants still on sale, each with this customer's current price.
      const sold = await utils.portal.cart.fetch({ variantIds: [...new Set(lines.map((l) => l.variantId))] });
      const ok = new Set(sold.filter((v) => v.price != null).map((v) => v.variantId));
      const keep = lines.filter((l) => ok.has(l.variantId));
      if (!keep.length) { setError('Nothing from this order can be ordered any more.'); return; }
      cart.add(keep);
      router.navigate('/customer/cart');
      if (keep.length < lines.length) Alert.alert('Some items left out', `${lines.length - keep.length} item(s) from that order are no longer sold, so they were not added.`);
    } catch (e) {
      setError(errorText(e));
    } finally {
      busy.current = false; setPending(null);
    }
  };
  return { run, pending, error };
}
