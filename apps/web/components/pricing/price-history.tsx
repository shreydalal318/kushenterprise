'use client';
import { formatDateTime, formatDate } from '@kush/core';
import { Badge } from '@/components/ui/card';
import { EmptyRow, Table, Td, Th, THead, Tr } from '@/components/ui/table';
import { rupees } from '@/lib/format';
import { trpc } from '@/lib/trpc';

const SCOPE: Record<string, string> = { DEFAULT: 'Default rate', MRP: 'MRP', COST: 'Cost', PRICE_LIST: 'Price list', CUSTOMER: 'Special price' };

export function PriceHistory({ productId, customerId, priceListId, showProduct = false }: { productId?: string; customerId?: string; priceListId?: string; showProduct?: boolean }) {
  const q = trpc.pricing.history.useQuery({ productId, customerId, priceListId, limit: 50 });
  return (
    <Table minWidth={640}>
      <THead><tr><Th>When</Th>{showProduct && <Th>Product</Th>}<Th>What</Th><Th className="text-right">Old</Th><Th className="text-right">New</Th><Th>Validity</Th><Th>By</Th></tr></THead>
      <tbody>
        {q.data?.length === 0 && <EmptyRow cols={showProduct ? 7 : 6}>No price changes yet.</EmptyRow>}
        {q.data?.map((h) => (
          <Tr key={h.id}>
            <Td className="whitespace-nowrap text-xs text-muted">{formatDateTime(h.createdAt)}</Td>
            {showProduct && <Td><span className="font-mono text-xs">{h.product.code}</span> <span className="text-muted">{h.product.name}</span></Td>}
            <Td><Badge tone={h.scope === 'CUSTOMER' ? 'teal' : 'neutral'}>{SCOPE[h.scope] ?? h.scope}</Badge>{h.source && h.source !== 'ui' && <span className="ml-2 text-xs text-muted">{h.source}</span>}</Td>
            <Td className="num text-muted">{rupees(h.oldRate)}</Td>
            <Td className="num font-medium">{h.newRate == null ? <span className="text-danger">Removed</span> : rupees(h.newRate)}</Td>
            <Td className="whitespace-nowrap text-xs">{h.validFrom || h.validTo ? `${h.validFrom ? formatDate(h.validFrom) : '…'} → ${h.validTo ? formatDate(h.validTo) : '…'}` : '—'}</Td>
            <Td className="text-sm">{h.changedBy.name}</Td>
          </Tr>
        ))}
      </tbody>
    </Table>
  );
}
