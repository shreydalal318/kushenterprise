'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, Circle, RotateCcw, Truck } from 'lucide-react';
import { CUSTOMER_ORDER_STATUS_LABEL, formatDate, formatDateTime, ORDER_STEPS } from '@kush/core';
import { Button } from '@/components/ui/button';
import { Alert, Card, CardBody, CardHeader, PageHeader } from '@/components/ui/card';
import { EmptyRow, LoadingRow, Table, Td, Th, THead, Tr } from '@/components/ui/table';
import { CustomerOrderBadge } from '@/components/sales/status';
import { cn } from '@/lib/cn';
import { errorMessage } from '@/lib/errors';
import { rupees } from '@/lib/format';
import { trpc } from '@/lib/trpc';
import { useCart } from './cart';

export function MyOrders() {
  const [status, setStatus] = useState('');
  const q = trpc.portal.orders.useQuery({ status: status || undefined });
  return (
    <>
      <PageHeader title="My orders" />
      <div role="tablist" className="mb-4 flex w-fit flex-wrap rounded-lg bg-white p-0.5 ring-1 ring-line">
        {[['', 'All'], ['OPEN', 'Open'], ['DELIVERED', 'Delivered'], ['CANCELLED', 'Cancelled']].map(([k, l]) => <button key={k} role="tab" aria-selected={status === k} onClick={() => setStatus(k!)} className={cn('h-9 rounded-md px-3 text-sm', status === k ? 'bg-aqua-100 font-semibold text-navy' : 'text-muted')}>{l}</button>)}
      </div>
      {/* Phones: one card per order. */}
      <ul className="flex flex-col gap-2 sm:hidden" aria-busy={!q.data}>
        {q.error ? <li><Alert>{errorMessage(q.error)}</Alert></li> : !q.data && Array.from({ length: 3 }, (_, i) => <li key={i} className="h-20 animate-pulse rounded-xl border border-line bg-white" aria-hidden />)}
        {q.data?.length === 0 && <li><Card className="py-10 text-center text-sm text-muted">No orders here.</Card></li>}
        {q.data?.map((o) => (
          <li key={o.id}>
            <Link href={`/portal/orders/${o.id}`} className="block rounded-xl border border-line bg-white px-4 py-3 active:bg-aqua-50">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0"><p className="font-mono text-sm font-medium text-navy">{o.number}</p><p className="text-xs text-muted">{formatDateTime(o.createdAt)}</p></div>
                <CustomerOrderBadge status={o.status} />
              </div>
              <p className="mt-2 flex justify-between gap-2 text-xs text-muted"><span>{o.units} unit{o.units === 1 ? '' : 's'} · <span className="font-medium text-ink">{rupees(o.value)}</span></span><span className="truncate">{[o.forDoctor, o.surgeryDate && `Surgery ${formatDate(o.surgeryDate)}`].filter(Boolean).join(' · ')}</span></p>
            </Link>
          </li>
        ))}
      </ul>
      <Card className="hidden overflow-hidden sm:block">
        <Table minWidth={620}>
          <THead><tr><Th>Order</Th><Th>Status</Th><Th className="text-right">Units</Th><Th className="text-right">Value</Th><Th>For</Th></tr></THead>
          <tbody>
            {!q.data && <LoadingRow cols={5} error={q.error} />}{q.data?.length === 0 && <EmptyRow cols={5}>No orders here.</EmptyRow>}
            {q.data?.map((o) => (
              <Tr key={o.id}>
                <Td><Link href={`/portal/orders/${o.id}`} className="font-mono text-sm font-medium text-navy hover:underline">{o.number}</Link><div className="text-xs text-muted">{formatDateTime(o.createdAt)}</div></Td>
                <Td><CustomerOrderBadge status={o.status} /></Td><Td className="num">{o.units}</Td><Td className="num">{rupees(o.value)}</Td>
                <Td className="text-sm">{o.forDoctor ?? '—'}{o.surgeryDate && <div className="text-xs text-muted">Surgery {formatDate(o.surgeryDate)}</div>}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}

export function MyOrder({ id, isNew }: { id: string; isNew: boolean }) {
  const q = trpc.portal.order.useQuery({ id });
  if (q.error) return <Alert>Order not found.</Alert>;
  if (!q.data) return <p className="text-sm text-muted">Loading…</p>;
  const o = q.data;
  const at = (s: string) => o.events.filter((e) => e.status === s).at(-1)?.at;
  const backorder = o.lines.reduce((t, l) => t + l.backorder, 0);
  return (
    <div className="flex flex-col gap-5">
      <Link href="/portal/orders" className="flex w-fit items-center gap-1 text-sm text-teal-700 hover:underline"><ArrowLeft className="size-4" aria-hidden /> My orders</Link>
      <PageHeader title={o.number} description={<span className="flex flex-wrap items-center gap-2">Placed {formatDateTime(o.createdAt)}{o.forDoctor ? ` · for ${o.forDoctor}` : ''} <CustomerOrderBadge status={o.status} /></span>} />
      {isNew && <Alert tone="ok">Thank you, your order is placed. We will let you know when it is invoiced, dispatched and delivered.</Alert>}
      {o.status === 'CANCELLED' && <Alert>This order was cancelled{o.events.find((e) => e.status === 'CANCELLED')?.note ? `: ${o.events.find((e) => e.status === 'CANCELLED')!.note}` : '.'}</Alert>}
      {o.status === 'ON_HOLD' && <Alert tone="warn">On hold{o.events.filter((e) => e.status === 'ON_HOLD').at(-1)?.note ? `: ${o.events.filter((e) => e.status === 'ON_HOLD').at(-1)!.note}` : '.'} We will contact you.</Alert>}
      <Card>
        <CardHeader title="Status" />
        <CardBody>
          <ol className="grid gap-3 sm:grid-cols-4">
            {ORDER_STEPS.map((s) => { const t = at(s); return (
              <li key={s} className="flex items-start gap-2">
                {t ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-teal" aria-hidden /> : <Circle className="mt-0.5 size-5 shrink-0 text-line" aria-hidden />}
                <div><p className={cn('text-sm font-medium', !t && 'text-muted')}>{CUSTOMER_ORDER_STATUS_LABEL[s]}</p>{t && <p className="text-xs text-muted">{formatDateTime(t)}</p>}</div>
              </li>
            ); })}
          </ol>
        </CardBody>
      </Card>
      {o.dispatches.length > 0 && (
        <Card><CardHeader title="Dispatch" /><CardBody className="flex flex-col gap-2 text-sm">
          {o.dispatches.map((d, i) => (
            <div key={i} className="flex items-start gap-2">
              <Truck className="mt-0.5 size-4 text-teal-700" aria-hidden />
              <p>{d.method === 'OWN_DELIVERY' ? `Out for delivery${d.person ? ` with ${d.person}` : ''}` : d.method === 'PICKUP' ? 'Ready for pickup at our store' : `Sent${d.courier ? ` via ${d.courier}` : ''}${d.docketNo ? ` · ${d.method === 'TRANSPORT' ? 'LR' : 'docket'} ${d.docketNo}` : ''}`}
                {d.date ? ` · ${formatDate(d.date)}` : ''}
                {d.method === 'OWN_DELIVERY' && d.personMobile && !d.deliveredAt && <> · <a className="text-teal-700 hover:underline" href={`tel:${d.personMobile}`}>{d.personMobile}</a></>}
                {d.deliveredAt && <span className="block text-xs text-muted">Delivered {formatDateTime(d.deliveredAt)}{d.receivedBy ? `, received by ${d.receivedBy}` : ''}</span>}
              </p>
            </div>
          ))}
        </CardBody></Card>
      )}
      <Card className="overflow-hidden">
        <CardHeader title="Items" description={backorder > 0 && o.invoices.length > 0 && o.status !== 'CANCELLED' ? `${backorder} unit(s) not billed yet (back-order)` : undefined} />
        {/* Phones: one row per item. */}
        <ul className="divide-y divide-line sm:hidden">
          {o.lines.map((l) => (
            <li key={l.id} className="px-5 py-3">
              <div className="flex justify-between gap-3"><span className="font-medium">{l.name}</span><span className="shrink-0 text-sm">{rupees(l.rate)}</span></div>
              <p className="text-xs text-muted">{l.label ?? ''}{l.label ? ' · ' : ''}{l.qty} ordered · <span className={cn(l.backorder > 0 && o.status !== 'PLACED' ? 'text-warn' : '')}>{l.sent} billed</span></p>
            </li>
          ))}
        </ul>
        <Table minWidth={560} className="hidden sm:block">
          <THead><tr><Th>Item</Th><Th className="text-right">Ordered</Th><Th className="text-right">Billed</Th><Th className="text-right">Rate</Th></tr></THead>
          <tbody>{o.lines.map((l) => <Tr key={l.id}><Td><div className="font-medium">{l.name}</div><div className="text-xs text-muted">{l.label ?? ''}</div></Td><Td className="num">{l.qty}</Td><Td className={cn('num', l.backorder > 0 && o.status !== 'PLACED' ? 'text-warn' : '')}>{l.sent}</Td><Td className="num">{rupees(l.rate)}</Td></Tr>)}</tbody>
        </Table>
      </Card>
      <div className="grid gap-5 md:grid-cols-2">
        <Card><CardHeader title="Invoices" /><CardBody className="flex flex-col gap-2 text-sm">
          {o.invoices.length === 0 && <p className="text-muted">Your tax invoice appears here as soon as it is made.</p>}
          {o.invoices.map((i) => <a key={i.id} href={`/api/documents/invoice/${i.id}`} target="_blank" rel="noreferrer" className="font-mono text-teal-700 hover:underline">{i.number} · {rupees(i.total)}</a>)}
        </CardBody></Card>
        <Card><CardHeader title="Details" /><CardBody className="flex flex-col gap-1 text-sm">
          {o.shipTo && <p><span className="text-muted">Deliver to:</span> {o.shipTo.name}, {o.shipTo.addressLines.join(', ')}</p>}
          {o.patientName && <p><span className="text-muted">Patient:</span> {o.patientName}</p>}
          {o.surgeryDate && <p><span className="text-muted">Surgery:</span> {formatDate(o.surgeryDate)}</p>}
          {o.note && <p><span className="text-muted">Your note:</span> {o.note}</p>}
        </CardBody></Card>
      </div>
      <ReorderButton orderId={o.id} />
    </div>
  );
}

function ReorderButton({ orderId }: { orderId: string }) {
  const utils = trpc.useUtils();
  const cart = useCart();
  return <div className="flex justify-end"><Button variant="secondary" onClick={async () => { cart.add(await utils.portal.reorderLines.fetch({ orderId })); window.location.href = '/portal/cart'; }}><RotateCcw className="size-4" aria-hidden /> Order the same again</Button></div>;
}
