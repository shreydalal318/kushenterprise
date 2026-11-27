import { useRef, useState } from 'react';
import { router } from 'expo-router';
import { useCart } from '@/lib/cart';
import { openPdf } from '@/lib/documents';
import { errorText } from '@/lib/format';
import { trpc } from '@/lib/trpc';
import { useToast } from './toast';

/** What went wrong, and how to try again (nothing to retry when it can never work). */
type Failure = { text: string; retry?: () => void };

/**
 * "Order again": put an earlier order's lines in the cart (leaving out anything no longer sold),
 * say how many went in, and open the cart. `fromDetail`: called from a screen above the tabs, which
 * must go back to the tabs rather than open a second copy of them.
 */
export function useOrderAgain(fromDetail = false) {
  const cart = useCart();
  const toast = useToast();
  const utils = trpc.useUtils();
  const busy = useRef(false); // a double tap must not add the order twice
  const [pending, setPending] = useState<string | null>(null);
  const [failed, setFailed] = useState<Failure | null>(null);
  const run = async (orderId: string) => {
    if (busy.current) return;
    busy.current = true; setPending(orderId); setFailed(null);
    try {
      const lines = await utils.portal.reorderLines.fetch({ orderId });
      // The cart query only returns variants still on sale, each with this customer's current price.
      const sold = await utils.portal.cart.fetch({ variantIds: [...new Set(lines.map((l) => l.variantId))] });
      const ok = new Set(sold.filter((v) => v.price != null).map((v) => v.variantId));
      const keep = lines.filter((l) => ok.has(l.variantId));
      if (!keep.length) { setFailed({ text: 'Nothing from this order is sold any more, so nothing was added.' }); return; }
      cart.add(keep);
      const units = keep.reduce((t, l) => t + l.qty, 0), left = lines.length - keep.length;
      toast(`${units} item${units === 1 ? '' : 's'} added to cart`, left ? `${left} item${left === 1 ? ' is' : 's are'} no longer sold, so we left ${left === 1 ? 'it' : 'them'} out.` : 'Check them, then tap Place order.', left ? 5000 : 2500);
      if (fromDetail) router.dismissTo('/customer/cart'); else router.navigate('/customer/cart');
    } catch (e) {
      setFailed({ text: errorText(e), retry: () => void run(orderId) });
    } finally {
      busy.current = false; setPending(null);
    }
  };
  return { run, pending, failed };
}

/** Download a PDF with a spinner on its button, then a "done" banner — or an error to try again. */
export function usePdf() {
  const toast = useToast();
  const busyRef = useRef(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<Failure | null>(null);
  const open = (path: string, filename: string, done: string) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(path); setFailed(null);
    openPdf(path, filename)
      .then(() => toast(done, 'You can open, save, print or send it.'))
      .catch((e) => setFailed({ text: errorText(e), retry: () => open(path, filename, done) }))
      .finally(() => { busyRef.current = false; setBusy(null); });
  };
  return { open, busy, failed };
}
