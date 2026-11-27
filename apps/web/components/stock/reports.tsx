'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ADJUSTMENT_REASON_LABELS, formatDate, formatDateTime, type AdjustmentReason } from '@kush/core';
import { Badge, Card, CardHeader, PageHeader } from '@/components/ui/card';
import { EmptyRow, LoadingRow, Table, Td, Th, THead, Tr } from '@/components/ui/table';
import { rupees } from '@/lib/format';
import { trpc } from '@/lib/trpc';
import { useMe } from '@/lib/use-me';
import { LinkButton } from '@/components/ui/link-button';
import { StockTabs } from './stock-tabs';

export function ExpiringReport() {
  const [days, setDays] = useState<number | undefined>(undefined);
  const q = trpc.inventory.expiring.useQuery(days ? { days } : undefined);
  const rows = q.data?.rows ?? [];
  const buckets = [...new Set(rows.map((r) => r.bucket))];
  const showValue = rows.some((r) => r.value !== undefined);
  return (
    <>
      <PageHeader title="Stock" />
      <StockTabs />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted">Show stock expiring within</span>
        {[...(q.data?.alertDays ?? [30, 60, 90]), 180].map((d) => (
          <button key={d} onClick={() => setDays(d)} className={`rounded-full border px-3 py-1 text-sm ${(days ?? Math.max(...(q.data?.alertDays ?? [90]))) === d ? 'border-teal bg-aqua-100 font-semibold' : 'border-line bg-white'}`}>{d} days</button>
        ))}
      </div>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {buckets.map((b) => {
          const r = rows.filter((x) => x.bucket === b);
          return <Card key={b} className="px-4 py-3"><p className="text-xs text-muted">{b}</p><p className="text-xl font-semibold">{r.reduce((t, x) => t + x.qty, 0)} units</p>{showValue && <p className="text-xs text-muted">{rupees(r.reduce((t, x) => t + (x.value ?? 0), 0))} at cost</p>}</Card>;
        })}
      </div>
      <Card className="overflow-hidden">
        <Table minWidth={760}>
          <THead><tr><Th>Item</Th><Th>Batch</Th><Th>Expiry</Th><Th>When</Th><Th className="text-right">Qty</Th><Th>Location</Th>{showValue && <Th className="text-right">Value</Th>}</tr></THead>
          <tbody>
            {rows.length === 0 && <EmptyRow cols={7}>Nothing expiring in this window.</EmptyRow>}
            {rows.map((r) => (
              <Tr key={`${r.batchId}-${r.location}`}>
                <Td><Link href={`/app/stock/product/${r.productId}`} className="font-medium text-navy hover:underline">{r.productName}</Link><div className="text-xs text-muted">{r.label ?? r.sku}</div></Td>
                <Td className="font-mono text-sm">{r.batchNo}</Td>
                <Td>{formatDate(r.expiryDate)}</Td>
                <Td><Badge tone={r.bucket === 'Expired' ? 'danger' : r.bucket.startsWith('0') ? 'warn' : 'teal'}>{r.bucket}</Badge></Td>
                <Td className="num font-semibold">{r.qty}</Td>
                <Td className="text-sm">{r.location}</Td>
                {showValue && <Td className="num text-muted">{rupees(r.value)}</Td>}
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}

export function LowStockReport() {
  const { can } = useMe();
  const buyer = can('CREATE_PURCHASE_ORDERS');
  const [all, setAll] = useState(false);
  const q = trpc.inventory.lowStock.useQuery({ includeNeverStocked: all });
  return (
    <>
      <PageHeader title="Stock" />
      <StockTabs />
      <label className="mb-4 flex items-center gap-2 text-sm text-muted"><input type="checkbox" className="accent-teal-700" checked={all} onChange={(e) => setAll(e.target.checked)} /> Include lens powers that have never been stocked</label>
      <Card className="overflow-hidden">
        <CardHeader title={`${q.data?.length ?? 0} item(s) at or below reorder level`} description="Create a purchase order with these pre-filled (quantities already on order are taken off)."
          actions={buyer && <LinkButton href="/app/purchase-orders/new?suggest=1">Create purchase order</LinkButton>} />
        <Table minWidth={720}>
          <THead><tr><Th>Item</Th><Th className="text-right">On hand</Th><Th className="text-right">Reorder at</Th><Th className="text-right">Suggested order</Th><Th>Usual supplier</Th></tr></THead>
          <tbody>
            {!q.data && <LoadingRow cols={5} />}{q.data?.length === 0 && <EmptyRow cols={5}>Nothing is low. </EmptyRow>}
            {q.data?.map((r) => (
              <Tr key={r.variantId}>
                <Td><Link href={`/app/stock/product/${r.productId}`} className="font-medium text-navy hover:underline">{r.productName}</Link><div className="text-xs text-muted">{r.label ?? r.sku}</div></Td>
                <Td className={`num font-semibold ${r.qty === 0 ? 'text-danger' : 'text-warn'}`}>{r.qty}</Td>
                <Td className="num text-muted">{r.reorderLevel}</Td>
                <Td className="num">{r.suggestedOrder}</Td>
                <Td className="text-sm">{r.supplier ? <Link className="text-teal-700 hover:underline" href={`/app/suppliers/${r.supplier.id}`}>{r.supplier.name}</Link> : <span className="text-muted">—</span>}
                  {r.supplier && buyer && <div><Link className="text-xs text-teal-700 hover:underline" href={`/app/purchase-orders/new?supplier=${r.supplier.id}&suggest=1`}>PO to this supplier</Link></div>}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}

export function AdjustmentsList() {
  const q = trpc.inventory.adjustments.useQuery();
  return (
    <>
      <PageHeader title="Stock" description="Adjust stock from a product's stock page (Stock → product → Adjust). Every adjustment needs a reason." />
      <StockTabs />
      <Card className="overflow-hidden">
        <Table minWidth={760}>
          <THead><tr><Th>When</Th><Th>Item</Th><Th>Batch</Th><Th className="text-right">Change</Th><Th>Reason</Th><Th>Note</Th><Th>By</Th></tr></THead>
          <tbody>
            {!q.data && <LoadingRow cols={7} />}{q.data?.length === 0 && <EmptyRow cols={7}>No adjustments yet.</EmptyRow>}
            {q.data?.map((r) => (
              <Tr key={r.id}>
                <Td className="whitespace-nowrap text-xs text-muted">{formatDateTime(r.at)}</Td>
                <Td>{r.product}<div className="text-xs text-muted">{r.label ?? ''}</div></Td>
                <Td className="font-mono text-xs">{r.batchNo}</Td>
                <Td className={`num font-semibold ${r.qty < 0 ? 'text-danger' : 'text-ok'}`}>{r.qty > 0 ? `+${r.qty}` : r.qty}</Td>
                <Td><Badge>{r.reason ? ADJUSTMENT_REASON_LABELS[r.reason as AdjustmentReason] : '—'}</Badge></Td>
                <Td className="max-w-64 text-sm text-muted">{r.note ?? ''}</Td>
                <Td className="text-sm">{r.by}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}

export function ValuationReport() {
  const q = trpc.inventory.valuation.useQuery();
  const d = q.data;
  return (
    <>
      <PageHeader title="Stock" description={d ? `Valued at cost (batch landed cost, else product cost) as on ${formatDate(d.asOn)}. Owner only.` : undefined} />
      <StockTabs />
      {d && (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-4">
            <Card className="px-4 py-3"><p className="text-xs text-muted">Total stock value</p><p className="text-2xl font-semibold text-navy">{rupees(d.total)}</p></Card>
            {d.categories.map((c) => <Card key={c.category} className="px-4 py-3"><p className="text-xs text-muted">{c.category}</p><p className="text-lg font-semibold">{rupees(c.value)}</p><p className="text-xs text-muted">{c.qty} units</p></Card>)}
          </div>
          <Card className="overflow-hidden">
            <Table minWidth={700}>
              <THead><tr><Th>Product</Th><Th>Category</Th><Th className="text-right">Units</Th><Th className="text-right">Value at cost</Th><Th className="text-right">At default rate</Th><Th className="text-right">Potential margin</Th></tr></THead>
              <tbody>
                {d.products.length === 0 && <EmptyRow cols={6}>No stock.</EmptyRow>}
                {d.products.map((p) => (
                  <Tr key={p.productId}>
                    <Td><Link href={`/app/stock/product/${p.productId}`} className="font-medium text-navy hover:underline">{p.name}</Link><div className="text-xs text-muted">{p.code}</div></Td>
                    <Td className="text-sm">{p.category}</Td>
                    <Td className="num">{p.qty}</Td>
                    <Td className="num font-semibold">{rupees(p.value)}</Td>
                    <Td className="num text-muted">{rupees(p.atDefaultRate)}</Td>
                    <Td className="num text-muted">{p.atDefaultRate ? `${(((p.atDefaultRate - p.value) / p.atDefaultRate) * 100).toFixed(1)}%` : '—'}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </>
      )}
    </>
  );
}
