'use client';
import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui/card';
import { errorMessage } from '@/lib/errors';
import { trpc } from '@/lib/trpc';
import { DocBuilder, type BuilderMode, type BuilderPrefill } from './doc-builder';

/** Opens the builder pre-filled from an order (remaining / back-ordered quantities, order rates). */
export function BuilderFromOrder({ mode, orderId, thenDispatch = false }: { mode: BuilderMode; orderId: string | null; thenDispatch?: boolean }) {
  const utils = trpc.useUtils();
  const order = trpc.orders.get.useQuery({ id: orderId! }, { enabled: !!orderId });
  const [prefill, setPrefill] = useState<BuilderPrefill | null>(orderId ? null : {});
  useEffect(() => {
    if (!order.data) return;
    const o = order.data;
    void (async () => {
      const lines = [];
      const taken = new Set<string>();
      for (const l of o.lines) {
        const qty = mode === 'invoice' ? l.backorder : l.qty;
        if (qty <= 0) continue;
        const p = await utils.products.get.fetch({ id: l.variant.product.id });
        const v = p.variants.find((x) => x.id === l.variant.id);
        // Lenses are billed by serial: tick the earliest-expiring ones in stock, up to what is still owed.
        let serials: string[] = [];
        if (mode === 'invoice' && p.trackSerial) {
          const st = (await utils.inventory.productStock.fetch({ productId: p.id }).catch(() => null))?.variants.find((x) => x.id === l.variant.id);
          serials = (st?.batches ?? []).filter((b) => !b.expired).flatMap((b) => b.serials).filter((s) => !taken.has(s)).slice(0, qty);
          serials.forEach((s) => taken.add(s));
        }
        lines.push({
          variantId: l.variant.id, productId: p.id, name: p.name, label: l.variant.label, unit: p.unit, hsn: p.hsnCode, gstRate: p.gstRate,
          mrp: v?.mrp ?? p.mrp, trackSerial: p.trackSerial, qty: mode === 'invoice' && p.trackSerial ? serials.length : qty, rate: l.rate, discPct: 0, batchId: null, serials, wanted: qty,
        });
      }
      setPrefill({ customerId: o.customer.id, shippingAddressId: o.shippingAddressId, forDoctorId: o.forDoctor?.id ?? null, orderId: o.id, thenDispatch, lines });
    })();
  }, [order.data]); // eslint-disable-line react-hooks/exhaustive-deps
  if (order.error) return <Alert>{errorMessage(order.error)}</Alert>;
  if (!prefill) return <p className="text-sm text-muted">Loading order…</p>;
  return (
    <>
      {order.data && <Alert tone="info">From order <strong>{order.data.number}</strong>{mode === 'invoice' ? ' (quantities still to invoice). Rates are the ones locked on the order. Lenses: the earliest-expiring serials in stock are ticked; change them if you are sending others.' : '.'}</Alert>}
      <div className="mt-4"><DocBuilder mode={mode} prefill={prefill} /></div>
    </>
  );
}
