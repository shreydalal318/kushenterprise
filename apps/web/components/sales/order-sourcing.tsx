'use client';
import { useState } from 'react';
import Link from 'next/link';
import { formatDate, istDateString } from '@kush/core';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Checkbox, TextField } from '@/components/ui/field';
import { Table, Td, Th, THead, Tr } from '@/components/ui/table';
import { errorMessage } from '@/lib/errors';
import { trpc, type RouterOutputs } from '@/lib/trpc';

export type Shortfall = RouterOutputs['orders']['shortfall'];

/** Raise POs to the supplier for items on a customer order that are not in stock. */
export function OrderFromSupplierDialog({ s, onClose }: { s: Shortfall; onClose: () => void }) {
  const utils = trpc.useUtils();
  const suppliers = trpc.suppliers.list.useQuery();
  const candidates = s.lines.filter((l) => l.backorder > 0);
  const [rows, setRows] = useState(() => Object.fromEntries(candidates.map((l) => [l.variantId, { qty: String(l.toOrder || ''), supplierId: l.usualSupplier?.id ?? '' }])));
  const [expectedDate, setExpectedDate] = useState('');
  const [send, setSend] = useState(true);
  const [tell, setTell] = useState(true);
  const [done, setDone] = useState<{ id: string; number: string }[] | null>(null);
  const create = trpc.purchaseOrders.createForOrder.useMutation({
    onSuccess: async (r) => { setDone(r.purchaseOrders); await Promise.all([utils.orders.invalidate(), utils.purchaseOrders.invalidate()]); },
  });
  const items = candidates.map((l) => ({ variantId: l.variantId, qty: Math.floor(Number(rows[l.variantId]?.qty) || 0), supplierId: rows[l.variantId]?.supplierId ?? '' })).filter((i) => i.qty > 0);
  const missingSupplier = items.some((i) => !i.supplierId);
  const set = (variantId: string, patch: Partial<{ qty: string; supplierId: string }>) => setRows((r) => ({ ...r, [variantId]: { ...r[variantId]!, ...patch } }));

  if (done) {
    return (
      <Dialog open onClose={onClose} title="Purchase order raised" size="sm" footer={<Button onClick={onClose}>Done</Button>}>
        <Alert tone="ok">
          {done.length === 1 ? 'One PO was' : `${done.length} POs were`} {send ? 'raised and marked as sent' : 'saved as drafts'}. Use Share on the PO to send the PDF to the supplier on WhatsApp.
          {tell ? ' The customer has been told.' : ''}
        </Alert>
        <ul className="mt-3 flex flex-col gap-1">
          {done.map((p) => <li key={p.id}><Link className="font-mono text-teal-700 hover:underline" href={`/app/purchase-orders/${p.id}`}>{p.number}</Link></li>)}
        </ul>
      </Dialog>
    );
  }

  return (
    <Dialog open onClose={onClose} title="Order from supplier" size="lg"
      description={`For ${s.number}: one purchase order per supplier at the last purchase rate. Each line stays linked to this order, so the team is alerted when the goods arrive.`}
      footer={<><Button variant="secondary" onClick={onClose}>Back</Button><Button disabled={!items.length || missingSupplier} loading={create.isPending}
        onClick={() => create.mutate({ orderId: s.orderId, items, expectedDate: expectedDate || null, send, tellCustomer: tell })}>{send ? 'Raise & mark sent' : 'Save as draft'}</Button></>}>
      <Table minWidth={620}>
        <THead><tr><Th>Item</Th><Th className="text-right">Short</Th><Th className="text-right">On PO</Th><Th className="w-24">Order qty</Th><Th>Supplier</Th></tr></THead>
        <tbody>
          {candidates.map((l) => (
            <Tr key={l.variantId}>
              <Td><div className="font-medium">{l.name}</div><div className="text-xs text-muted">{l.label ?? l.sku} · in stock {l.available}</div></Td>
              <Td className="num">{l.short}</Td>
              <Td className="num">{l.onOrder || '—'}</Td>
              <Td><input aria-label={`Order qty for ${l.name}`} inputMode="numeric" className="h-9 w-20 rounded-lg border border-line px-2 text-right" value={rows[l.variantId]?.qty ?? ''} onChange={(e) => set(l.variantId, { qty: e.target.value.replace(/\D/g, '') })} /></Td>
              <Td>
                <select aria-label={`Supplier for ${l.name}`} className="h-9 w-full min-w-40 rounded-lg border border-line bg-white px-2 text-sm" value={rows[l.variantId]?.supplierId ?? ''} onChange={(e) => set(l.variantId, { supplierId: e.target.value })}>
                  <option value="">Choose…</option>
                  {suppliers.data?.map((sp) => <option key={sp.id} value={sp.id}>{sp.name}{sp.id === l.usualSupplier?.id ? ' (usual)' : ''}</option>)}
                </select>
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <TextField label="Expected by (optional)" type="date" min={istDateString()} value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
        <div className="flex flex-col">
          <Checkbox label="Mark as sent now" description="Untick to keep it as a draft and review the PO first." checked={send} onChange={(e) => setSend(e.target.checked)} />
          <Checkbox label="Tell the customer" description={`“Being ordered from the manufacturer${expectedDate ? `, expected by ${formatDate(expectedDate)}` : ''}.”`} checked={tell} onChange={(e) => setTell(e.target.checked)} />
        </div>
      </div>
      {missingSupplier && <p className="mt-2 text-sm text-warn">Choose a supplier for every item you are ordering.</p>}
      {create.error && <Alert>{errorMessage(create.error)}</Alert>}
    </Dialog>
  );
}
