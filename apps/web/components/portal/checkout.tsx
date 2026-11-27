'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { keepPreviousData } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, Card, CardBody, CardHeader, PageHeader } from '@/components/ui/card';
import { SelectField, TextAreaField, TextField } from '@/components/ui/field';
import { errorMessage } from '@/lib/errors';
import { rupees } from '@/lib/format';
import { trpc } from '@/lib/trpc';
import { useCart } from './cart';

export function CartCheckout() {
  const cart = useCart();
  const router = useRouter();
  const utils = trpc.useUtils();
  const ids = Object.keys(cart.items);
  // Removing an item changes the ids: keep the last lines on screen meanwhile instead of "Loading your cart…".
  const lines = trpc.portal.cart.useQuery({ variantIds: ids }, { enabled: ids.length > 0, placeholderData: keepPreviousData });
  const info = trpc.portal.checkout.useQuery();
  const [v, setV] = useState({ shippingAddressId: '', forDoctorId: '', patientName: '', surgeryDate: '', customerNote: '' });
  // One request id per checkout, so a double click or a retry never places two orders.
  const requestId = useRef(`web-${crypto.randomUUID()}`);
  const [placed, setPlaced] = useState(false);
  const place = trpc.portal.placeOrder.useMutation({
    // Head to the order first; emptying the cart while still here would flash "Your cart is empty".
    onSuccess: (r) => { setPlaced(true); router.push(`/portal/orders/${r.id}?new=1`); cart.clear(); void utils.portal.invalidate(); },
  });
  const rows = useMemo(() => (lines.data ?? []).map((l) => ({ ...l, qty: cart.items[l.variantId] ?? 0 })).filter((l) => l.qty > 0), [lines.data, cart.items]);
  const unavailable = lines.isPlaceholderData ? [] : ids.filter((id) => lines.data && !lines.data.some((l) => l.variantId === id));
  const subtotal = rows.reduce((t, l) => t + l.qty * l.price, 0);
  const gst = rows.reduce((t, l) => t + (l.qty * l.price * l.gstRate) / 100, 0);
  const shipping = info.data?.addresses.filter((a) => a.kind === 'SHIPPING') ?? [];
  const billing = info.data?.addresses.find((a) => a.kind === 'BILLING');

  if (placed) return (<><PageHeader title="Cart" /><p className="text-sm text-muted">Order placed. Opening it…</p></>);
  if (!cart.ready || (ids.length > 0 && !lines.data && !lines.error)) return (<><PageHeader title="Cart" /><p className="text-sm text-muted">Loading your cart…</p></>);
  if (ids.length > 0 && !lines.data) return (<><PageHeader title="Cart" /><Alert>{errorMessage(lines.error)} <button className="font-semibold underline" onClick={() => void lines.refetch()}>Try again</button></Alert></>);
  if (!ids.length) return (<><PageHeader title="Cart" /><Card><CardBody className="py-12 text-center text-sm text-muted">Your cart is empty. <Link className="text-teal-700 hover:underline" href="/portal/catalogue">Browse the catalogue</Link>.</CardBody></Card></>);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Cart & checkout" description="Prices are your own rates. The final GST invoice is raised when your order is dispatched." />
      {unavailable.length > 0 && <Alert tone="warn">{unavailable.length} item(s) in your cart are no longer available and will be left out. <button className="underline" onClick={() => unavailable.forEach((id) => cart.set(id, 0))}>Remove them</button></Alert>}
      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader title={`${rows.length} item(s)`} />
          <ul className="divide-y divide-line">
            {rows.map((l) => (
              <li key={l.variantId} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1"><p className="font-medium text-navy">{l.name}</p><p className="text-xs text-muted">{l.label ?? ''} · {rupees(l.price)} / {l.unit}</p></div>
                <QtyInput qty={l.qty} name={`${l.name} ${l.label ?? ''}`.trim()} onChange={(n) => cart.set(l.variantId, n)} onRemove={() => cart.set(l.variantId, 0)} />
                <p className="w-28 text-right font-semibold">{rupees(l.qty * l.price)}</p>
                <button aria-label={`Remove ${l.name} ${l.label ?? ''}`} onClick={() => cart.set(l.variantId, 0)} className="rounded p-1.5 text-muted hover:bg-danger-50 hover:text-danger"><Trash2 className="size-4" /></button>
              </li>
            ))}
          </ul>
          <div className="flex justify-end border-t border-line px-5 py-4">
            <dl className="grid w-64 grid-cols-2 gap-y-1 text-sm">
              <dt className="text-muted">Items</dt><dd className="num">{rupees(subtotal)}</dd>
              <dt className="text-muted">GST (approx.)</dt><dd className="num">{rupees(Math.round(gst * 100) / 100)}</dd>
              <dt className="border-t border-line pt-1 font-semibold">Estimated total</dt><dd className="num border-t border-line pt-1 font-semibold">{rupees(Math.round((subtotal + gst) * 100) / 100)}</dd>
            </dl>
          </div>
        </Card>
        <Card>
          <CardHeader title="Delivery" />
          <CardBody className="flex flex-col gap-3">
            <SelectField label="Deliver to" value={v.shippingAddressId} onChange={(e) => setV({ ...v, shippingAddressId: e.target.value })}>
              <option value="">{shipping.find((a) => a.isDefault)?.text ?? billing?.text ?? 'Default address'}</option>
              {shipping.filter((a) => !a.isDefault).map((a) => <option key={a.id} value={a.id}>{a.label ? `${a.label}: ` : ''}{a.text}</option>)}
            </SelectField>
            {!!info.data?.doctors.length && (
              <SelectField label="For doctor (optional)" value={v.forDoctorId} onChange={(e) => setV({ ...v, forDoctorId: e.target.value })}>
                <option value="">—</option>{info.data.doctors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </SelectField>
            )}
            <div className="grid grid-cols-2 gap-3">
              <TextField label="Patient name (optional)" value={v.patientName} onChange={(e) => setV({ ...v, patientName: e.target.value })} />
              <TextField label="Surgery date (optional)" type="date" value={v.surgeryDate} onChange={(e) => setV({ ...v, surgeryDate: e.target.value })} />
            </div>
            <TextAreaField label="Note for us (optional)" rows={3} value={v.customerNote} onChange={(e) => setV({ ...v, customerNote: e.target.value })} />
            {lines.error && <Alert>{errorMessage(lines.error)}</Alert>}
            {place.error && <Alert>{errorMessage(place.error)}</Alert>}
            <Button size="lg" disabled={!rows.length} loading={place.isPending}
              onClick={() => place.mutate({ clientRequestId: requestId.current, shippingAddressId: v.shippingAddressId || null, forDoctorId: v.forDoctorId || null, patientName: v.patientName || null, surgeryDate: v.surgeryDate || null, customerNote: v.customerNote || null, lines: rows.map((l) => ({ variantId: l.variantId, qty: l.qty })) })}>
              Place order
            </Button>
            <p className="text-xs text-muted">Addresses are kept on your account by Kush Enterprise. Need another one? <Link className="text-teal-700 hover:underline" href="/portal/profile">Ask us from your profile</Link>.</p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

/** The box can be cleared to retype a number; the item only goes with the bin button, or when 0 is confirmed. */
function QtyInput({ qty, name, onChange, onRemove }: { qty: number; name: string; onChange: (n: number) => void; onRemove: () => void }) {
  const [text, setText] = useState(String(qty));
  const [editing, setEditing] = useState(false);
  useEffect(() => { if (!editing) setText(String(qty)); }, [qty, editing]);
  return (
    <input type="number" inputMode="numeric" min={0} max={500} aria-label={`Quantity of ${name}`} value={text}
      onFocus={() => setEditing(true)}
      onChange={(e) => { setText(e.target.value); const n = Math.floor(Number(e.target.value)); if (n > 0) onChange(n); }}
      onBlur={() => { setEditing(false); if (!(Math.floor(Number(text)) > 0) && window.confirm(`Remove ${name} from your cart?`)) onRemove(); }}
      className="h-9 w-20 rounded-md border border-line px-2 text-sm" />
  );
}
