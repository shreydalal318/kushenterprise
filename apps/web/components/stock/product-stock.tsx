'use client';
import { Fragment, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronDown, ChevronRight, SlidersHorizontal } from 'lucide-react';
import { formatDate } from '@kush/core';
import { Alert, Badge, Card, PageHeader } from '@/components/ui/card';
import { EmptyRow, Table, Td, Th, THead, Tr } from '@/components/ui/table';
import { errorMessage } from '@/lib/errors';
import { rupees } from '@/lib/format';
import { trpc } from '@/lib/trpc';
import { useMe } from '@/lib/use-me';
import { AdjustDialog } from './adjust-dialog';
import { StockBadge } from './status-badge';

export function ProductStock({ id }: { id: string }) {
  const { can } = useMe();
  const q = trpc.inventory.productStock.useQuery({ productId: id });
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [hideEmpty, setHideEmpty] = useState(true);
  const [adjust, setAdjust] = useState<{ variantId: string; batchId?: string } | null>(null);
  if (q.error) return <Alert>{errorMessage(q.error)}</Alert>;
  if (!q.data) return <p className="text-sm text-muted">Loading…</p>;
  const { product, variants } = q.data;
  const shown = variants.filter((v) => !hideEmpty || v.qty > 0);
  const total = variants.reduce((t, v) => t + v.qty, 0);

  return (
    <div className="flex flex-col gap-5">
      <Link href="/app/stock" className="flex w-fit items-center gap-1 text-sm text-teal-700 hover:underline"><ArrowLeft className="size-4" aria-hidden /> Stock</Link>
      <PageHeader title={product.name} description={<>{product.code} · {product.category} · <strong className="text-ink">{total} {product.unit}</strong> on hand</>}
        actions={<Link href={`/app/products/${product.id}`} className="text-sm text-teal-700 hover:underline">Product details →</Link>} />
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3 text-sm">
          {variants.length > 1 && <label className="flex items-center gap-2 text-muted"><input type="checkbox" className="accent-teal-700" checked={hideEmpty} onChange={(e) => setHideEmpty(e.target.checked)} /> Hide powers with no stock ({variants.length - variants.filter((v) => v.qty > 0).length})</label>}
          <span className="text-muted">Batches are listed first-expiry-first-out (FEFO).</span>
        </div>
        <Table minWidth={760}>
          <THead><tr><Th className="w-8" /><Th>{product.isLens ? 'Power' : 'Variant'}</Th><Th className="text-right">On hand</Th><Th className="text-right">Reorder at</Th><Th>Nearest expiry</Th><Th>Status</Th><Th /></tr></THead>
          <tbody>
            {shown.length === 0 && <EmptyRow cols={7}>No stock yet.</EmptyRow>}
            {shown.map((v) => {
              const isOpen = open.has(v.id);
              return (
                <Fragment key={v.id}>
                  <Tr className="cursor-pointer hover:bg-aqua-50/60" onClick={() => { const s = new Set(open); if (isOpen) s.delete(v.id); else s.add(v.id); setOpen(s); }}>
                    <Td>{v.batches.length > 0 && (isOpen ? <ChevronDown className="size-4" aria-label="Collapse" /> : <ChevronRight className="size-4" aria-label="Expand" />)}</Td>
                    <Td className="font-medium">{v.label ?? 'Standard'}<div className="font-mono text-xs font-normal text-muted">{v.gtin ?? (v.aliasCount ? `${v.aliasCount} linked code(s)` : 'No manufacturer barcode')}</div></Td>
                    <Td className="num text-base font-semibold">{v.qty}</Td>
                    <Td className="num text-muted">{v.reorderLevel}</Td>
                    <Td>{v.nearestExpiry ? formatDate(v.nearestExpiry) : '—'}</Td>
                    <Td><StockBadge status={v.status} /></Td>
                    <Td className="whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
                      {can('MANAGE_STOCK') && <Link className="mr-3 text-sm text-teal-700 hover:underline" href={`/app/stock/ledger/${v.id}`}>Ledger</Link>}
                      {can('MANAGE_STOCK') && <button className="text-sm text-teal-700 hover:underline" onClick={() => setAdjust({ variantId: v.id })}>Adjust</button>}
                    </Td>
                  </Tr>
                  {isOpen && v.batches.map((b, i) => (
                    <tr key={`${v.id}-${b.batchId}-${b.location.id}`} className="bg-canvas/60 text-sm">
                      <td />
                      <td className="px-3 py-2" colSpan={1}>
                        <span className="font-mono">{b.batchNo}</span> {i === 0 && <Badge tone="teal" className="ml-1">Pick first</Badge>} {b.expired && <Badge tone="danger">Expired</Badge>}
                        <div className="text-xs text-muted">{b.location.name}{b.unitCost !== undefined ? ` · cost ${rupees(b.unitCost)}` : ''}</div>
                      </td>
                      <td className="num px-3 py-2 font-medium">{b.qty}</td>
                      <td />
                      <td className="px-3 py-2">{b.expiryDate ? formatDate(b.expiryDate) : '—'}</td>
                      <td className="px-3 py-2 text-xs text-muted" colSpan={1}>{b.serials.length ? <details><summary className="cursor-pointer">{b.serials.length} serial(s)</summary><p className="mt-1 font-mono">{b.serials.join(', ')}</p></details> : null}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">
                        {can('MANAGE_STOCK') && <button className="inline-flex items-center gap-1 text-teal-700 hover:underline" onClick={() => setAdjust({ variantId: v.id, batchId: b.batchId })}><SlidersHorizontal className="size-3.5" aria-hidden /> Adjust</button>}
                      </td>
                    </tr>
                  ))}
                </Fragment>
              );
            })}
          </tbody>
        </Table>
      </Card>
      {adjust && <AdjustDialog productId={product.id} variant={variants.find((v) => v.id === adjust.variantId)!} batchId={adjust.batchId} trackSerial={product.trackSerial} trackBatch={product.trackBatch} trackExpiry={product.trackExpiry} productName={product.name} onClose={() => setAdjust(null)} />}
    </div>
  );
}
