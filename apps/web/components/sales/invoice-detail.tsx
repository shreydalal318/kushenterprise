'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Ban, CreditCard, Undo2 } from 'lucide-react';
import { formatDate, formatDateTime, PAYMENT_MODE_LABEL, istDateString, type PaymentMode } from '@kush/core';
import { Button } from '@/components/ui/button';
import { Alert, Card, CardBody, CardHeader, PageHeader } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Checkbox, TextAreaField, TextField } from '@/components/ui/field';
import { LinkButton } from '@/components/ui/link-button';
import { Table, Td, Th, THead, Tr } from '@/components/ui/table';
import { cn } from '@/lib/cn';
import { errorMessage, fieldErrors } from '@/lib/errors';
import { rupees } from '@/lib/format';
import { trpc, type RouterOutputs } from '@/lib/trpc';
import { useMe } from '@/lib/use-me';
import { DocViewer } from './doc-viewer';
import { GstFiling } from './gst-filing';
import { ShareButton } from './share-button';
import { PaymentBadge } from './status';

type Inv = RouterOutputs['invoices']['get'];

export function InvoiceDetail({ id, isNew }: { id: string; isNew: boolean }) {
  const { can, isOwner } = useMe();
  const q = trpc.invoices.get.useQuery({ id });
  const company = trpc.sales.companyReady.useQuery(undefined, { enabled: can('CREATE_TAX_INVOICE') });
  const [cancelOpen, setCancelOpen] = useState(false);
  const [creditOpen, setCreditOpen] = useState(false);
  if (q.error) return <Alert>{errorMessage(q.error)}</Alert>;
  if (!q.data) return <p className="text-sm text-muted">Loading…</p>;
  const i = q.data;
  const cancelled = i.status === 'CANCELLED';
  return (
    <div className="flex flex-col gap-5">
      <Link href="/app/invoices" className="flex w-fit items-center gap-1 text-sm text-teal-700 hover:underline"><ArrowLeft className="size-4" aria-hidden /> All invoices</Link>
      <PageHeader title={i.number}
        description={<span className="flex flex-wrap items-center gap-2">{i.customer.name} · {formatDate(i.date)} · {i.taxType === 'INTER_STATE' ? 'IGST' : 'CGST + SGST'} <PaymentBadge status={i.paymentStatus} /></span>}
        actions={<div className="flex flex-wrap gap-2">
          {!cancelled && i.due > 0 && can('RECORD_PAYMENTS') && <LinkButton href={`/app/payments?customer=${i.customer.id}&invoice=${i.id}`}><CreditCard className="size-4" aria-hidden /> Record payment</LinkButton>}
          <ShareButton kind="invoice" id={i.id} />
          {!cancelled && can('CREATE_TAX_INVOICE') && <Button variant="secondary" onClick={() => setCreditOpen(true)}><Undo2 className="size-4" aria-hidden /> Credit note (return)</Button>}
          {!cancelled && isOwner && <Button variant="danger" onClick={() => setCancelOpen(true)}><Ban className="size-4" aria-hidden /> Cancel invoice</Button>}
        </div>} />
      {isNew && <Alert tone="ok">Invoice saved and stock updated. Print or download it below.</Alert>}
      {cancelled && <Alert>Cancelled{i.cancelledBy ? ` by ${i.cancelledBy}` : ''}{i.cancelledAt ? ` on ${formatDateTime(i.cancelledAt)}` : ''}: {i.cancelReason}. Stock was returned.</Alert>}

      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <DocViewer kind="invoice" id={i.id} withCopies defaultCopies={(company.data?.defaultCopies as never) ?? ['ORIGINAL']} />
        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader title="Amounts" />
            <CardBody>
              <dl className="grid grid-cols-2 gap-y-1 text-sm">
                <dt className="text-muted">Taxable value</dt><dd className="num">{rupees(i.taxableTotal)}</dd>
                {i.taxType === 'INTER_STATE' ? <><dt className="text-muted">IGST</dt><dd className="num">{rupees(i.igstTotal)}</dd></> : <><dt className="text-muted">CGST</dt><dd className="num">{rupees(i.cgstTotal)}</dd><dt className="text-muted">SGST</dt><dd className="num">{rupees(i.sgstTotal)}</dd></>}
                {i.roundOff !== 0 && <><dt className="text-muted">Round off</dt><dd className="num">{rupees(i.roundOff)}</dd></>}
                <dt className="border-t border-line pt-1 font-semibold">Total</dt><dd className="num border-t border-line pt-1 font-semibold">{rupees(i.grandTotal)}</dd>
                <dt className="text-muted">Received</dt><dd className="num text-ok">{rupees(i.amountPaid)}</dd>
                {i.credited > 0 && <><dt className="text-muted">Credit notes</dt><dd className="num text-ok">{rupees(i.credited)}</dd></>}
                <dt className="font-semibold">Due{i.dueDate ? ` by ${formatDate(i.dueDate)}` : ''}</dt><dd className={cn('num font-semibold', i.due > 0 ? 'text-danger' : 'text-ok')}>{rupees(i.due)}</dd>
              </dl>
            </CardBody>
          </Card>
          {can('CREATE_TAX_INVOICE') && <GstFiling invoice={{ id: i.id, number: i.number, grandTotal: i.grandTotal, status: i.status, irn: i.irn, ackNo: i.ackNo, ackDate: i.ackDate, ewayBillNo: i.ewayBillNo, ewayBillDate: i.ewayBillDate, buyerGstin: i.buyer.gstin }} />}
          <Card>
            <CardHeader title="Details" />
            <CardBody className="flex flex-col gap-2 text-sm">
              <p><span className="text-muted">Ship to:</span> {i.consignee.name}{i.consignee.attn ? ` (${i.consignee.attn})` : ''}, {i.consignee.addressLines.join(', ')}</p>
              <p><span className="text-muted">Bill to:</span> {i.buyer.name}{i.buyer.gstin ? ` · GSTIN ${i.buyer.gstin}` : ''}</p>
              {i.order && <p><span className="text-muted">Order:</span> <Link className="text-teal-700 hover:underline" href={`/app/orders/${i.order.id}`}>{i.order.number}</Link></p>}
              {i.proforma && <p><span className="text-muted">From proforma:</span> <Link className="text-teal-700 hover:underline" href={`/app/proforma/${i.proforma.id}`}>{i.proforma.number}</Link></p>}
              {i.dispatch && <p><span className="text-muted">Dispatched:</span> {formatDate(i.dispatch.dispatchDate)} {i.dispatch.courier ?? ''} {i.dispatch.docketNo ?? ''}</p>}
              <p className="text-xs text-muted">Created by {i.createdBy} on {formatDateTime(i.createdAt)}</p>
            </CardBody>
          </Card>
          {(i.payments.length > 0 || i.creditNotes.length > 0) && (
            <Card>
              <CardHeader title="Settlement" />
              <ul className="divide-y divide-line text-sm">
                {i.payments.map((p) => <li key={p.id} className="flex justify-between px-5 py-2"><span>{p.number} · {formatDate(p.date)} · {PAYMENT_MODE_LABEL[p.mode as PaymentMode]}</span><span className="num">{rupees(p.amount)}</span></li>)}
                {i.creditNotes.map((c) => <li key={c.id} className="flex justify-between px-5 py-2"><a className="text-teal-700 hover:underline" href={`/api/documents/credit-note/${c.id}`} target="_blank" rel="noreferrer">{c.number} · {c.reason}</a><span className="num">{rupees(c.grandTotal)}</span></li>)}
              </ul>
            </Card>
          )}
        </div>
      </div>
      {cancelOpen && <CancelDialog inv={i} onClose={() => setCancelOpen(false)} />}
      {creditOpen && <CreditNoteDialog inv={i} onClose={() => setCreditOpen(false)} />}
    </div>
  );
}

function CancelDialog({ inv, onClose }: { inv: Inv; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [reason, setReason] = useState('');
  const cancel = trpc.invoices.cancel.useMutation({ onSuccess: async () => { await utils.invalidate(); onClose(); } });
  const fe = fieldErrors(cancel.error);
  return (
    <Dialog open onClose={onClose} title={`Cancel ${inv.number}?`} description="The invoice stays on record marked CANCELLED; its stock and serial numbers go back on the shelf. This cannot be undone." size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Keep invoice</Button><Button variant="danger" loading={cancel.isPending} onClick={() => cancel.mutate({ id: inv.id, reason })}>Cancel invoice</Button></>}>
      <TextAreaField label="Reason (kept for audit)" value={reason} onChange={(e) => setReason(e.target.value)} error={fe.reason} />
      {cancel.error && !Object.keys(fe).length && <p className="mt-2 text-sm text-danger">{errorMessage(cancel.error)}</p>}
    </Dialog>
  );
}

function CreditNoteDialog({ inv, onClose }: { inv: Inv; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [date, setDate] = useState(istDateString());
  const [reason, setReason] = useState('');
  const [restock, setRestock] = useState(true);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [serials, setSerials] = useState<Record<string, string[]>>({});
  const create = trpc.creditNotes.create.useMutation({ onSuccess: async (r) => { await utils.invalidate(); onClose(); window.open(`/api/documents/credit-note/${r.id}`, '_blank'); } });
  const fe = fieldErrors(create.error);
  const total = inv.lines.reduce((t, l) => t + (qty[l.id] ?? 0) * l.rate * (1 - l.discPct / 100) * (1 + l.gstRate / 100), 0);
  return (
    <Dialog open onClose={onClose} title="Credit note for returned goods" description={`Against ${inv.number}. Same rates and GST as the invoice.`} size="xl"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={create.isPending} onClick={() => create.mutate({ invoiceId: inv.id, date, reason, restock, lines: inv.lines.map((l) => ({ invoiceLineId: l.id, qty: qty[l.id] ?? 0, serialNos: serials[l.id] ?? [] })) })}>Create credit note (≈ {rupees(total)})</Button></>}>
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <TextField label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <TextField label="Reason" placeholder="Wrong power, damaged, not used…" value={reason} onChange={(e) => setReason(e.target.value)} error={fe.reason} wrapperClassName="sm:col-span-2" />
        </div>
        <Checkbox label="Put the returned goods back into stock" description="Untick for damaged goods that will be written off" checked={restock} onChange={(e) => setRestock(e.target.checked)} />
        <Table minWidth={640}>
          <THead><tr><Th>Item</Th><Th className="text-right">Sold</Th><Th className="text-right">Already credited</Th><Th className="w-28">Return</Th></tr></THead>
          <tbody>
            {inv.lines.map((l) => {
              const left = l.qty - l.creditedQty;
              return (
                <Tr key={l.id}>
                  <Td><div className="font-medium">{l.description}</div><div className="text-xs text-muted">{l.powerLabel ?? ''}{l.batchNo && l.batchNo !== 'NA' ? ` · batch ${l.batchNo}` : ''}</div>
                    {l.serialNos.length > 0 && (qty[l.id] ?? 0) > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {l.serialNos.map((s) => { const on = (serials[l.id] ?? []).includes(s); return <button key={s} type="button" onClick={() => setSerials({ ...serials, [l.id]: on ? (serials[l.id] ?? []).filter((x) => x !== s) : [...(serials[l.id] ?? []), s] })} className={cn('rounded-full border px-2 py-0.5 font-mono text-[11px]', on ? 'border-teal bg-aqua-100' : 'border-line text-muted')}>{s}</button>; })}
                      </div>
                    )}
                  </Td>
                  <Td className="num">{l.qty}</Td>
                  <Td className="num text-muted">{l.creditedQty}</Td>
                  <Td><input aria-label={`Return quantity for ${l.description}`} type="number" min={0} max={left} disabled={left === 0} value={qty[l.id] ?? 0} onChange={(e) => setQty({ ...qty, [l.id]: Math.min(left, Math.max(0, Number(e.target.value))) })} className="h-9 w-20 rounded-md border border-line px-2 text-sm" /></Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
        {create.error && !Object.keys(fe).length && <Alert>{errorMessage(create.error)}</Alert>}
      </div>
    </Dialog>
  );
}
