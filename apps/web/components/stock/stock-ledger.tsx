'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { ADJUSTMENT_REASON_LABELS, MOVEMENT_LABELS, formatDate, formatDateTime, type AdjustmentReason } from '@kush/core';
import { Alert, Badge, Card, PageHeader } from '@/components/ui/card';
import { EmptyRow, Table, Td, Th, THead, Tr } from '@/components/ui/table';
import { errorMessage } from '@/lib/errors';
import { trpc } from '@/lib/trpc';

export function StockLedger({ variantId }: { variantId: string }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const q = trpc.inventory.ledger.useQuery({ variantId, from: from || undefined, to: to || undefined });
  if (q.error) return <Alert>{errorMessage(q.error)}</Alert>;
  const d = q.data;
  const t = (k: string) => d?.totals[k] ?? 0;
  const input = 'h-9 rounded-lg border border-line bg-white px-3 text-sm';
  return (
    <div className="flex flex-col gap-5">
      {d && <Link href={`/app/stock/product/${d.variant.productId}`} className="flex w-fit items-center gap-1 text-sm text-teal-700 hover:underline"><ArrowLeft className="size-4" aria-hidden /> {d.variant.productName}</Link>}
      <PageHeader title="Stock ledger" description={d ? `${d.variant.productName} ${d.variant.label ?? ''} · ${d.variant.sku}` : 'Loading…'} />
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">From<br /><input aria-label="From date" type="date" className={input} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="text-sm">To<br /><input aria-label="To date" type="date" className={input} value={to} onChange={(e) => setTo(e.target.value)} /></label>
      </div>
      {d && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
          {[['Opening', d.opening], ['Purchases (GRN)', t('GRN') + t('OPENING')], ['Sales', -t('SALE')], ['Returns', t('SALES_RETURN') + t('PURCHASE_RETURN')], ['Adjustments', t('ADJUSTMENT')], ['Closing', d.closing]].map(([label, value]) => (
            <Card key={label as string} className="px-4 py-3"><p className="text-xs text-muted">{label}</p><p className="num text-left text-xl font-semibold">{value as number}</p></Card>
          ))}
        </div>
      )}
      <Card className="overflow-hidden">
        <Table minWidth={900}>
          <THead><tr><Th>When</Th><Th>Movement</Th><Th>Reference</Th><Th>Batch</Th><Th className="text-right">In</Th><Th className="text-right">Out</Th><Th className="text-right">Balance</Th><Th>By</Th></tr></THead>
          <tbody>
            {d && <Tr className="bg-canvas"><Td colSpan={6} className="font-medium">Opening balance{from ? ` on ${formatDate(from)}` : ''}</Td><Td className="num font-semibold">{d.opening}</Td><Td /></Tr>}
            {d?.rows.length === 0 && <EmptyRow cols={8}>No movements in this period.</EmptyRow>}
            {d?.rows.map((r) => (
              <Tr key={r.id}>
                <Td className="whitespace-nowrap text-xs text-muted">{formatDateTime(r.at)}</Td>
                <Td><Badge tone={r.qtyIn ? 'ok' : 'neutral'}>{MOVEMENT_LABELS[r.type] ?? r.type}</Badge>{r.reason && <div className="text-xs text-muted">{ADJUSTMENT_REASON_LABELS[r.reason as AdjustmentReason]}</div>}</Td>
                <Td className="font-mono text-xs">{r.ref ?? ''}</Td>
                <Td className="text-xs"><span className="font-mono">{r.batchNo}</span>{r.expiryDate && <div className="text-muted">exp {formatDate(r.expiryDate)}</div>}{r.serialNos.length > 0 && <div className="text-muted" title={r.serialNos.join(', ')}>{r.serialNos.length} serial(s)</div>}</Td>
                <Td className="num text-ok">{r.qtyIn || ''}</Td>
                <Td className="num text-danger">{r.qtyOut || ''}</Td>
                <Td className="num font-semibold">{r.balance}</Td>
                <Td className="text-sm">{r.by}</Td>
              </Tr>
            ))}
            {d && d.rows.length > 0 && <Tr className="bg-canvas"><Td colSpan={6} className="font-medium">Closing balance</Td><Td className="num font-semibold">{d.closing}</Td><Td /></Tr>}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
