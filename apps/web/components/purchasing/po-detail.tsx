'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Ban, PackageCheck, Pencil, Send, XCircle } from 'lucide-react';
import { formatDate, formatDateTime } from '@kush/core';
import { Button } from '@/components/ui/button';
import { Alert, Card, CardBody, CardHeader, PageHeader } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { TextAreaField } from '@/components/ui/field';
import { LinkButton } from '@/components/ui/link-button';
import { EmptyRow, Table, Td, Th, THead, Tr } from '@/components/ui/table';
import { DocViewer } from '@/components/sales/doc-viewer';
import { cn } from '@/lib/cn';
import { errorMessage, fieldErrors } from '@/lib/errors';
import { rupees } from '@/lib/format';
import { trpc } from '@/lib/trpc';
import { useMe } from '@/lib/use-me';
import { PoBadge } from './po-status';

export function PoDetail({ id, isNew }: { id: string; isNew: boolean }) {
  const { can } = useMe();
  const utils = trpc.useUtils();
  const q = trpc.purchaseOrders.get.useQuery({ id });
  const send = trpc.purchaseOrders.markSent.useMutation({ onSuccess: () => utils.purchaseOrders.invalidate() });
  const [reasonFor, setReasonFor] = useState<'cancel' | 'close' | null>(null);
  if (q.error) return <Alert>{errorMessage(q.error)}</Alert>;
  if (!q.data) return <p className="text-sm text-muted">Loading…</p>;
  const p = q.data;
  const buyer = can('CREATE_PURCHASE_ORDERS');
  const open = p.status === 'SENT' || p.status === 'PARTIALLY_RECEIVED';
  const anyReceived = p.lines.some((l) => l.qtyReceived > 0);
  const pending = p.lines.reduce((t, l) => t + l.pending, 0);
  return (
    <div className="flex flex-col gap-5">
      <Link href="/app/purchase-orders" className="flex w-fit items-center gap-1 text-sm text-teal-700 hover:underline"><ArrowLeft className="size-4" aria-hidden /> All purchase orders</Link>
      <PageHeader title={p.number}
        description={<span className="flex flex-wrap items-center gap-2">{p.supplier.name} · {formatDate(p.date)}{p.expectedDate ? ` · expected ${formatDate(p.expectedDate)}` : ''} <PoBadge status={p.status} /></span>}
        actions={<div className="flex flex-wrap gap-2">
          {p.status === 'DRAFT' && buyer && <LinkButton variant="secondary" href={`/app/purchase-orders/${p.id}/edit`}><Pencil className="size-4" aria-hidden /> Edit</LinkButton>}
          {p.status === 'DRAFT' && buyer && <Button loading={send.isPending} onClick={() => send.mutate({ id: p.id })}><Send className="size-4" aria-hidden /> Mark as sent</Button>}
          {open && can('MANAGE_STOCK') && <LinkButton href={`/app/stock/receive?po=${p.id}`}><PackageCheck className="size-4" aria-hidden /> Receive goods</LinkButton>}
          {open && anyReceived && buyer && <Button variant="secondary" onClick={() => setReasonFor('close')}><XCircle className="size-4" aria-hidden /> Short-close</Button>}
          {(p.status === 'DRAFT' || p.status === 'SENT') && !anyReceived && buyer && <Button variant="danger" onClick={() => setReasonFor('cancel')}><Ban className="size-4" aria-hidden /> Cancel PO</Button>}
        </div>} />
      {isNew && <Alert tone="ok">Saved as a draft. Check the PDF, then mark it as sent once it has gone to the supplier.</Alert>}
      {send.error && <Alert>{errorMessage(send.error)}</Alert>}
      {p.status === 'CANCELLED' && <Alert>Cancelled{p.cancelledAt ? ` on ${formatDateTime(p.cancelledAt)}` : ''}: {p.cancelReason}</Alert>}
      {p.status === 'CLOSED' && <Alert tone="info">Short-closed{p.closedAt ? ` on ${formatDateTime(p.closedAt)}` : ''}: {p.closeReason}. Nothing more is expected on this PO.</Alert>}

      <Card className="overflow-hidden">
        <CardHeader title="Items" description={open ? `${pending} unit(s) still to come` : undefined} />
        <Table minWidth={760}>
          <THead><tr><Th>Item</Th><Th className="text-right">Ordered</Th><Th className="text-right">Received</Th><Th className="text-right">Pending</Th>{p.canSeeRates && <><Th className="text-right">Rate</Th><Th className="text-right">Amount</Th></>}</tr></THead>
          <tbody>
            {p.lines.map((l) => (
              <Tr key={l.id}>
                <Td><div className="font-medium">{l.name}</div><div className="text-xs text-muted">{l.label ?? l.sku} · HSN {l.hsnCode} · GST {l.gstRate}%</div></Td>
                <Td className="num">{l.qtyOrdered}</Td>
                <Td className={cn('num', l.qtyReceived >= l.qtyOrdered && 'text-ok')}>{l.qtyReceived}</Td>
                <Td className={cn('num font-semibold', l.pending > 0 && open ? 'text-warn' : 'text-muted')}>{l.pending || '—'}</Td>
                {p.canSeeRates && <><Td className="num">{rupees(l.rate)}{l.discPct ? <div className="text-xs text-muted">less {l.discPct}%</div> : null}</Td><Td className="num">{rupees(l.amount)}</Td></>}
              </Tr>
            ))}
          </tbody>
        </Table>
        {p.canSeeRates && (
          <div className="flex justify-end border-t border-line px-5 py-4">
            <dl className="grid w-72 grid-cols-2 gap-y-1 text-sm">
              <dt className="text-muted">Taxable value</dt><dd className="num">{rupees(p.taxableTotal)}</dd>
              {p.taxType === 'INTER_STATE' ? <><dt className="text-muted">IGST</dt><dd className="num">{rupees(p.igstTotal)}</dd></> : <><dt className="text-muted">CGST</dt><dd className="num">{rupees(p.cgstTotal)}</dd><dt className="text-muted">SGST</dt><dd className="num">{rupees(p.sgstTotal)}</dd></>}
              {p.roundOff ? <><dt className="text-muted">Round off</dt><dd className="num">{rupees(p.roundOff)}</dd></> : null}
              <dt className="border-t border-line pt-1 font-semibold">Total</dt><dd className="num border-t border-line pt-1 font-semibold">{rupees(p.grandTotal)}</dd>
            </dl>
          </div>
        )}
      </Card>

      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        {buyer ? <DocViewer kind="purchase-order" id={p.id} /> : <div />}
        <div className="flex flex-col gap-5">
          <Card className="overflow-hidden">
            <CardHeader title="Goods received" />
            <Table minWidth={300}>
              <tbody>
                {p.grns.length === 0 && <EmptyRow cols={3}>Nothing received yet.</EmptyRow>}
                {p.grns.map((g) => <Tr key={g.id}><Td><Link className="font-mono text-sm text-teal-700 hover:underline" href={`/app/stock/receipts/${g.id}`}>{g.number}</Link><div className="text-xs text-muted">{g.date ? formatDate(g.date) : ''}{g.supplierInvoiceNo ? ` · inv ${g.supplierInvoiceNo}` : ''}</div></Td><Td className="num">{g.units} units</Td></Tr>)}
              </tbody>
            </Table>
          </Card>
          <Card>
            <CardHeader title="Details" />
            <CardBody className="flex flex-col gap-1 text-sm">
              <p><span className="text-muted">Supplier:</span> <Link className="text-teal-700 hover:underline" href={`/app/suppliers/${p.supplier.id}`}>{p.supplier.name}</Link> ({p.supplier.code})</p>
              <p><span className="text-muted">GST:</span> {p.taxType === 'INTER_STATE' ? 'IGST' : 'CGST + SGST'}</p>
              {p.terms && <p className="whitespace-pre-line"><span className="text-muted">Terms:</span> {p.terms}</p>}
              <p className="text-xs text-muted">Created by {p.createdBy} on {formatDateTime(p.createdAt)}{p.sentAt ? ` · sent ${formatDateTime(p.sentAt)}` : ''}</p>
            </CardBody>
          </Card>
        </div>
      </div>
      {reasonFor && <ReasonDialog id={p.id} kind={reasonFor} onClose={() => setReasonFor(null)} />}
    </div>
  );
}

function ReasonDialog({ id, kind, onClose }: { id: string; kind: 'cancel' | 'close'; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [reason, setReason] = useState('');
  const opts = { onSuccess: async () => { await utils.purchaseOrders.invalidate(); onClose(); } };
  const cancel = trpc.purchaseOrders.cancel.useMutation(opts);
  const close = trpc.purchaseOrders.close.useMutation(opts);
  const m = kind === 'cancel' ? cancel : close;
  const fe = fieldErrors(m.error);
  return (
    <Dialog open onClose={onClose} title={kind === 'cancel' ? 'Cancel purchase order' : 'Short-close purchase order'} size="sm"
      description={kind === 'cancel' ? 'The PO is kept for the record, marked cancelled.' : 'What has arrived stays booked; the rest is no longer expected.'}
      footer={<><Button variant="secondary" onClick={onClose}>Back</Button><Button variant={kind === 'cancel' ? 'danger' : 'primary'} loading={m.isPending} onClick={() => m.mutate({ id, reason })}>{kind === 'cancel' ? 'Cancel PO' : 'Short-close'}</Button></>}>
      <TextAreaField label="Reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} error={fe.reason} />
      {m.error && !fe.reason && <Alert>{errorMessage(m.error)}</Alert>}
    </Dialog>
  );
}
