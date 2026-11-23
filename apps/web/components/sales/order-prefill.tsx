'use client';
import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui/card';
import { errorMessage } from '@/lib/errors';
import { trpc } from '@/lib/trpc';
import { DocBuilder, type BuilderMode, type BuilderPrefill } from './doc-builder';

/** Opens the builder pre-filled from an order (remaining / back-ordered quantities, order rates). */
export function BuilderFromOrder({ mode, orderId }: { mode: BuilderMode; orderId: string | null }) {
  const utils = trpc.useUtils();
  const order = trpc.orders.get.useQuery({ id: orderId! }, { enabled: !!orderId });
  const [prefill, setPrefill] = useState<BuilderPrefill | null>(orderId ? null : {});
  useEffect(() => {
    if (!order.data) return;
    const o = order.data;
    void (async () => {
      const lines = [];
      for (const l of o.lines) {
        const qty = mode === 'invoice' ? l.backorder : l.qty;
        if (qty <= 0) continue;
        const p = await utils.products.get.fetch({ id: l.variant.product.id });
        const v = p.variants.find((x) => x.id === l.variant.id);
        lines.push({
          variantId: l.variant.id, productId: p.id, name: p.name, label: l.variant.label, unit: p.unit, hsn: p.hsnCode, gstRate: p.gstRate,
          mrp: v?.mrp ?? p.mrp, trackSerial: p.trackSerial, qty: mode === 'invoice' && p.trackSerial ? 0 : qty, rate: l.rate, discPct: 0, batchId: null, serials: [],
        });
      }
      setPrefill({ customerId: o.customer.id, shippingAddressId: o.shippingAddressId, forDoctorId: o.forDoctor?.id ?? null, orderId: o.id, lines });
    })();
  }, [order.data]); // eslint-disable-line react-hooks/exhaustive-deps
  if (order.error) return <Alert>{errorMessage(order.error)}</Alert>;
  if (!prefill) return <p className="text-sm text-muted">Loading order…</p>;
  return (
    <>
      {order.data && <Alert tone="info">From order <strong>{order.data.number}</strong>{mode === 'invoice' ? ' (remaining quantities). Rates are the ones locked on the order. Serial-tracked items: scan or tick the serials being sent.' : '.'}</Alert>}
      <div className="mt-4"><DocBuilder mode={mode} prefill={prefill} /></div>
    </>
  );
}
