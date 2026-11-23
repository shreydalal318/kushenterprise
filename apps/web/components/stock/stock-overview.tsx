'use client';
import { useState } from 'react';
import Link from 'next/link';
import { PackagePlus, Search } from 'lucide-react';
import { formatDate, type StockStatus } from '@kush/core';
import { Badge, Card, PageHeader } from '@/components/ui/card';
import { LinkButton } from '@/components/ui/link-button';
import { EmptyRow, Table, Td, Th, THead, Tr } from '@/components/ui/table';
import { rupees } from '@/lib/format';
import { trpc } from '@/lib/trpc';
import { useMe } from '@/lib/use-me';
import { StockBadge } from './status-badge';
import { StockTabs } from './stock-tabs';

const select = 'h-10 rounded-lg border border-line bg-white px-3 text-sm';

export function StockOverview() {
  const { can } = useMe();
  const [q, setQ] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [status, setStatus] = useState('');
  const [onlyInStock, setOnlyInStock] = useState(false);
  const categories = trpc.settings.categories.useQuery();
  const rows = trpc.inventory.overview.useQuery({ q: q || undefined, categoryId: categoryId || undefined, status: (status || undefined) as StockStatus | undefined, onlyInStock });
  const showValue = can('VIEW_PRICES_MARGINS');
  const total = rows.data?.reduce((t, r) => t + (r.value ?? 0), 0);

  return (
    <>
      <PageHeader title="Stock" description="What is on the shelf, by product. Open a product for powers, batches, expiry and serials."
        actions={can('MANAGE_STOCK') && <LinkButton href="/app/stock/receive"><PackagePlus className="size-4" aria-hidden /> Receive goods</LinkButton>} />
      <StockTabs />
      <div className="mb-4 flex flex-wrap gap-2">
        <label className="relative flex-1 sm:max-w-xs">
          <span className="sr-only">Search</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Product name or code" className={`${select} w-full pl-9`} />
        </label>
        <select aria-label="Category" className={select} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">All categories</option>
          {categories.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select aria-label="Status" className={select} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Any status</option>
          <option value="IN_STOCK">In stock</option><option value="LOW_STOCK">Low stock</option><option value="OUT_OF_STOCK">Out of stock</option><option value="EXPIRING_SOON">Expiring soon</option>
        </select>
        <label className="flex items-center gap-2 px-1 text-sm text-muted"><input type="checkbox" className="accent-teal-700" checked={onlyInStock} onChange={(e) => setOnlyInStock(e.target.checked)} /> Only items in stock</label>
        {showValue && total != null && <span className="ml-auto self-center text-sm text-muted">Value at cost: <strong className="text-ink">{rupees(total)}</strong></span>}
      </div>
      <Card className="overflow-hidden">
        <Table minWidth={820}>
          <THead><tr><Th>Product</Th><Th className="text-right">On hand</Th><Th>Powers / variants</Th><Th>Alerts</Th><Th>Status</Th>{showValue && <Th className="text-right">Value</Th>}</tr></THead>
          <tbody>
            {rows.data?.length === 0 && <EmptyRow cols={6}>Nothing matches.</EmptyRow>}
            {rows.data?.map((r) => (
              <Tr key={r.productId} className="hover:bg-aqua-50/60">
                <Td><Link href={`/app/stock/product/${r.productId}`} className="font-medium text-navy hover:underline">{r.name}</Link><div className="text-xs text-muted">{r.code} · {r.category}</div></Td>
                <Td className="num text-base font-semibold">{r.qty} <span className="text-xs font-normal text-muted">{r.unit}</span></Td>
                <Td className="text-sm">{r.isLens ? `${r.variantsInStock} of ${r.variantCount} powers in stock` : r.variantCount > 1 ? `${r.variantsInStock} of ${r.variantCount}` : '—'}</Td>
                <Td className="flex flex-wrap gap-1">
                  {r.lowCount > 0 && <Badge tone="warn">{r.lowCount} low</Badge>}
                  {r.outCount > 0 && r.qty > 0 && <Badge tone="danger">{r.outCount} out</Badge>}
                  {r.expiringCount > 0 && <Badge tone="teal">Expiry {formatDate(r.nearestExpiry)}</Badge>}
                </Td>
                <Td><StockBadge status={r.status} /></Td>
                {showValue && <Td className="num text-muted">{rupees(r.value)}</Td>}
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
