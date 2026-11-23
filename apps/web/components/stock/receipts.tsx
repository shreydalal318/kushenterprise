'use client';
import Link from 'next/link';
import { ArrowLeft, PackagePlus } from 'lucide-react';
import { formatDate } from '@kush/core';
import { Alert, Badge, Card, CardBody, PageHeader } from '@/components/ui/card';
import { LinkButton } from '@/components/ui/link-button';
import { EmptyRow, Table, Td, Th, THead, Tr } from '@/components/ui/table';
import { errorMessage } from '@/lib/errors';
import { rupees } from '@/lib/format';
import { trpc } from '@/lib/trpc';
import { useMe } from '@/lib/use-me';
import { StockTabs } from './stock-tabs';

export function ReceiptList() {
  const { can } = useMe();
  const q = trpc.inventory.receipts.useQuery({ kind: 'ALL', limit: 100 });
  return (
    <>
      <PageHeader title="Stock" actions={can('MANAGE_STOCK') && <div className="flex gap-2"><LinkButton variant="secondary" href="/app/stock/receive?opening=1">Opening stock</LinkButton><LinkButton href="/app/stock/receive"><PackagePlus className="size-4" aria-hidden /> Receive goods</LinkButton></div>} />
      <StockTabs />
      <Card className="overflow-hidden">
        <Table minWidth={720}>
          <THead><tr><Th>Number</Th><Th>Date</Th><Th>From</Th><Th>Supplier invoice</Th><Th className="text-right">Lines</Th><Th className="text-right">Units</Th><Th>By</Th></tr></THead>
          <tbody>
            {q.data?.length === 0 && <EmptyRow cols={7}>No receipts yet.</EmptyRow>}
            {q.data?.map((r) => (
              <Tr key={r.id} className="hover:bg-aqua-50/60">
                <Td><Link href={`/app/stock/receipts/${r.id}`} className="font-mono text-sm font-medium text-navy hover:underline">{r.number}</Link></Td>
                <Td>{formatDate(r.date)}</Td>
                <Td>{r.isOpening ? <Badge tone="navy">Opening stock</Badge> : r.supplier?.name}</Td>
                <Td className="text-sm text-muted">{r.supplierInvoiceNo ?? ''}</Td>
                <Td className="num">{r.lines}</Td>
                <Td className="num font-semibold">{r.units}</Td>
                <Td className="text-sm">{r.by}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}

export function ReceiptDetail({ id, isNew }: { id: string; isNew: boolean }) {
  const { can } = useMe();
  const q = trpc.inventory.receipt.useQuery({ id });
  if (q.error) return <Alert>{errorMessage(q.error)}</Alert>;
  if (!q.data) return <p className="text-sm text-muted">Loading…</p>;
  const g = q.data;
  const showRate = g.lines.some((l) => l.rate !== undefined);
  return (
    <div className="flex flex-col gap-5">
      <Link href="/app/stock/receipts" className="flex w-fit items-center gap-1 text-sm text-teal-700 hover:underline"><ArrowLeft className="size-4" aria-hidden /> All receipts</Link>
      <PageHeader title={g.number} description={<>{g.isOpening ? 'Opening stock' : `From ${g.supplier?.name}`} · {formatDate(g.date)} · by {g.by}{g.supplierInvoiceNo ? ` · supplier invoice ${g.supplierInvoiceNo}${g.supplierInvoiceDate ? ` dt. ${formatDate(g.supplierInvoiceDate)}` : ''}` : ''}{g.po && <> · against <Link className="font-mono text-teal-700 hover:underline" href={`/app/purchase-orders/${g.po.id}`}>{g.po.number}</Link></>}</>}
      />
      {isNew && <Alert tone="ok">Saved. Stock is updated.</Alert>}
      {g.lines.some((l) => !l.hasBarcode) && (
        <Alert tone="warn">
          <p className="font-medium">These items have no manufacturer barcode linked, so they can&apos;t be scanned yet:</p>
          <ul className="mt-1 list-disc pl-5">
            {[...new Map(g.lines.filter((l) => !l.hasBarcode).map((l) => [l.variantId, l])).values()].map((l) => (
              <li key={l.variantId}>{l.productName} {l.label ?? ''}{can('MANAGE_PRODUCTS') && <> · <Link className="underline" href={`/app/products/${l.productId}`}>link barcode</Link></>}</li>
            ))}
          </ul>
          <p className="mt-1 text-xs">Tip: scan the box on the Scan screen; unknown codes can be linked there in one step.</p>
        </Alert>
      )}
      {g.note && <Card><CardBody className="text-sm">{g.note}</CardBody></Card>}
      <Card className="overflow-hidden">
        <Table minWidth={780}>
          <THead><tr><Th>Item</Th><Th>Batch</Th><Th>Expiry</Th><Th className="text-right">Qty</Th><Th>Serials</Th>{showRate && <Th className="text-right">Rate</Th>}{showRate && <Th className="text-right">Amount</Th>}</tr></THead>
          <tbody>
            {g.lines.map((l) => (
              <Tr key={l.id}>
                <Td><div className="font-medium">{l.productName}</div><div className="text-xs text-muted">{l.label ?? l.sku}</div></Td>
                <Td className="font-mono text-sm">{l.batchNo}</Td>
                <Td>{l.expiryDate ? formatDate(l.expiryDate) : '—'}</Td>
                <Td className="num font-semibold">{l.qty}</Td>
                <Td className="max-w-72 font-mono text-xs text-muted">{l.serialNos.join(', ')}</Td>
                {showRate && <Td className="num">{rupees(l.rate)}</Td>}
                {showRate && <Td className="num">{rupees((l.rate ?? 0) * l.qty)}</Td>}
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
