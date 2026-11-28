'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Circle, FileText, Loader2, Receipt, Truck, UserRound } from 'lucide-react';
import { DISPATCH_METHOD_LABEL, DISPATCH_METHODS, formatDate, formatDateTime, istDateString, nextStatuses, ORDER_STATUS_LABEL, ORDER_STEPS, type DispatchMethod, type OrderStatus } from '@kush/core';
import { Button } from '@/components/ui/button';
import { Alert, Badge, Card, CardBody, CardHeader, PageHeader } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { SelectField, TextField } from '@/components/ui/field';
import { LinkButton } from '@/components/ui/link-button';
import { Table, Td, Th, THead, Tr } from '@/components/ui/table';
import { cn } from '@/lib/cn';
import { errorMessage, fieldErrors } from '@/lib/errors';
import { rupees } from '@/lib/format';
import { trpc, type RouterOutputs } from '@/lib/trpc';
import { useMe } from '@/lib/use-me';
import { OrderBadge, PaymentBadge } from './status';
import { OrderFromSupplierDialog } from './order-sourcing';
import { PoBadge } from '@/components/purchasing/po-status';

type Order = RouterOutputs['orders']['get'];

/** Packed with its invoice, or already out with a later (back-order) invoice that has not gone yet. */
function dispatchable(o: Order) {
  const sent = new Set(o.dispatches.map((d) => d.invoiceId));
  const issued = o.invoices.filter((i) => i.status === 'ISSUED');
  return (o.status === 'PACKED' && issued.length > 0) || (o.status === 'DISPATCHED' && issued.some((i) => !sent.has(i.id)));
}

/** A status change also moves the deliveries board and the dashboard counts. */
function useRefreshAfterStatus() {
  const utils = trpc.useUtils();
  return () => Promise.all([utils.orders.invalidate(), utils.deliveries.invalidate(), utils.analytics.invalidate()]);
}

export function OrderDetail({ id, isNew, openDispatch = false }: { id: string; isNew: boolean; openDispatch?: boolean }) {
  const { can, me, isOwner, loading: meLoading } = useMe();
  const router = useRouter();
  const refresh = useRefreshAfterStatus();
  // Always refetch on arrival: coming back from raising an invoice, the cached order doesn't have it yet.
  const q = trpc.orders.get.useQuery({ id }, { refetchOnMount: 'always' });
  const setStatus = trpc.orders.setStatus.useMutation({ onSuccess: refresh });
  const [dispatchOpen, setDispatchOpen] = useState(false);
  // Back from "Make tax invoice": open the Dispatch dialog once the fresh order has the invoice.
  const autoOpened = useRef(false);
  useEffect(() => {
    if (!openDispatch || autoOpened.current || !q.data || q.isFetching || meLoading) return;
    autoOpened.current = true;
    if (can('UPDATE_ORDER_STATUS') && dispatchable(q.data)) setDispatchOpen(true);
    router.replace(`/app/orders/${id}`, { scroll: false });
  }, [openDispatch, q.data, q.isFetching, meLoading]); // eslint-disable-line react-hooks/exhaustive-deps
  const [deliverOpen, setDeliverOpen] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const sq = trpc.orders.shortfall.useQuery({ id });
  if (q.error) return <Alert>{errorMessage(q.error)}</Alert>;
  if (!q.data) return <p className="text-sm text-muted">Loading…</p>;
  const o = q.data;
  const next = nextStatuses(o.status);
  const backorder = o.lines.reduce((t, l) => t + l.backorder, 0);
  const hasInvoice = o.invoices.some((i) => i.status === 'ISSUED');
  const canDispatch = dispatchable(o);
  // Strict: once it is with one of our staff, only that person (or the owner) marks it delivered, even without
  // the order-status permission. A courier, transport or pickup can be marked by anyone with that permission.
  const drops = o.dispatches.filter((d) => !d.deliveredAt && d.deliveryPersonId);
  const canDeliver = drops.length ? !!me && (isOwner || drops.some((d) => d.deliveryPersonId === me.id)) : can('UPDATE_ORDER_STATUS');
  const stock = new Map((sq.data?.lines ?? []).map((l) => [l.variantId, l]));
  const toOrder = (sq.data?.lines ?? []).reduce((t, l) => t + l.toOrder, 0);
  const linkedPos = [...new Map((sq.data?.lines ?? []).flatMap((l) => l.purchaseOrders).map((p) => [p.id, p])).values()];
  const open = !['CANCELLED', 'DELIVERED'].includes(o.status);
  const reached = (s: OrderStatus) => o.events.find((e) => e.status === s);
  const resumeTo: OrderStatus = hasInvoice ? 'PACKED' : reached('CONFIRMED') ? 'CONFIRMED' : 'PLACED';

  function go(s: OrderStatus) {
    if (s === 'DISPATCHED') return setDispatchOpen(true);
    if (s === 'DELIVERED') return setDeliverOpen(true);
    const note = s === 'CANCELLED' || s === 'ON_HOLD' ? prompt(s === 'CANCELLED' ? 'Why is the order cancelled?' : 'Why is it on hold?') : null;
    if ((s === 'CANCELLED' || s === 'ON_HOLD') && !note) return;
    setStatus.mutate({ id: o.id, status: s, note });
  }

  return (
    <div className="flex flex-col gap-5">
      <Link href="/app/orders" className="flex w-fit items-center gap-1 text-sm text-teal-700 hover:underline"><ArrowLeft className="size-4" aria-hidden /> All orders</Link>
      <PageHeader title={o.number}
        description={<span className="flex flex-col gap-2">
          <span className="flex flex-wrap items-center gap-2">{o.customer.name}{o.forDoctor ? ` · for ${o.forDoctor.name}` : ''} <OrderBadge status={o.status} /></span>
          <HandledBy o={o} open={open} />
        </span>}
        actions={<div className="flex flex-wrap gap-2">
          {open && backorder > 0 && can('CREATE_PROFORMA') && <LinkButton variant="secondary" href={`/app/proforma/new?order=${o.id}`}><FileText className="size-4" aria-hidden /> Proforma</LinkButton>}
          {open && backorder > 0 && can('CREATE_PURCHASE_ORDERS') && sq.data && <Button variant={toOrder > 0 ? 'primary' : 'secondary'} onClick={() => setSourceOpen(true)}><Truck className="size-4" aria-hidden /> Order from supplier</Button>}
        </div>} />
      {isNew && <Alert tone="ok">Order placed.</Alert>}
      {open && toOrder > 0 && <Alert tone="info">{toOrder} unit(s) on this order are not in stock{can('CREATE_PURCHASE_ORDERS') ? ' — use “Order from supplier” to raise a purchase order.' : '.'}</Alert>}
      {setStatus.error && <Alert>{errorMessage(setStatus.error)}</Alert>}

      <Card>
        {/* The main path: Make tax invoice (also confirms and packs) → Dispatch → Delivered. */}
        <CardHeader title="Status" actions={open && (
          <div className="flex flex-wrap gap-2">
            {backorder > 0 && ['PLACED', 'CONFIRMED', 'PACKED', 'DISPATCHED'].includes(o.status) && can('CREATE_TAX_INVOICE') && (
              <LinkButton href={`/app/invoices/new?order=${o.id}&next=dispatch`} variant={hasInvoice ? 'secondary' : 'primary'} className="h-8 px-3"><Receipt className="size-4" aria-hidden /> {hasInvoice ? 'Invoice the rest' : 'Make tax invoice'}</LinkButton>
            )}
            {can('UPDATE_ORDER_STATUS') && canDispatch && <Button size="sm" onClick={() => go('DISPATCHED')}><Truck className="size-4" aria-hidden /> Dispatch</Button>}
            {canDeliver && o.status === 'DISPATCHED' && <Button size="sm" variant={canDispatch ? 'secondary' : 'primary'} onClick={() => go('DELIVERED')}>Mark delivered</Button>}
            {!canDeliver && o.status === 'DISPATCHED' && drops.length > 0 && <span className="self-center text-sm text-muted">{drops.map((d) => d.deliveryPersonName).join(' or ')} marks it delivered</span>}
            {/* Back to where it was: Invoiced if it has an invoice (the goods are already picked), else New. */}
            {can('UPDATE_ORDER_STATUS') && o.status === 'ON_HOLD' && <Button size="sm" variant="secondary" loading={setStatus.isPending} onClick={() => go(resumeTo)}>Resume ({ORDER_STATUS_LABEL[resumeTo].toLowerCase()})</Button>}
            {can('UPDATE_ORDER_STATUS') && next.includes('ON_HOLD') && <Button size="sm" variant="secondary" onClick={() => go('ON_HOLD')}>Put on hold</Button>}
            {can('UPDATE_ORDER_STATUS') && next.includes('CANCELLED') && !hasInvoice && <Button size="sm" variant="danger" onClick={() => go('CANCELLED')}>Cancel order</Button>}
          </div>
        )} />
        <CardBody>
          <ol className="grid gap-3 sm:grid-cols-4">
            {ORDER_STEPS.map((s) => {
              const e = reached(s);
              return (
                <li key={s} className="flex items-start gap-2">
                  {e ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-teal" aria-hidden /> : <Circle className="mt-0.5 size-5 shrink-0 text-line" aria-hidden />}
                  <div><p className={cn('text-sm font-medium', !e && 'text-muted')}>{ORDER_STATUS_LABEL[s]}</p>{e && <p className="text-xs text-muted">{formatDateTime(e.at)} · {e.by}</p>}</div>
                </li>
              );
            })}
          </ol>
          {o.events.filter((e) => e.note).length > 0 && (
            <ul className="mt-4 border-t border-line pt-3 text-sm text-muted">
              {o.events.filter((e) => e.note).map((e) => <li key={e.id}>{formatDateTime(e.at)} · {ORDER_STATUS_LABEL[e.status]}: {e.note} ({e.by})</li>)}
            </ul>
          )}
        </CardBody>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <Card className="overflow-hidden">
          <CardHeader title="Items" description={backorder > 0 && hasInvoice ? `${backorder} unit(s) still to invoice (back-order)` : undefined} />
          {/* Phones: one row per item instead of a 7-column table. */}
          <ul className="divide-y divide-line sm:hidden">
            {o.lines.map((l) => {
              const st = stock.get(l.variant.id);
              return (
                <li key={l.id} className="px-5 py-3">
                  <div className="flex justify-between gap-3"><span className="font-medium">{l.variant.product.name}</span><span className="shrink-0 font-medium">{rupees(l.amount)}</span></div>
                  <p className="text-xs text-muted">{l.variant.label ?? l.variant.sku} · {l.qty} × {rupees(l.rate)}</p>
                  <p className="mt-1 flex flex-wrap gap-x-3 text-xs">
                    <span className={l.backorder > 0 ? 'font-semibold text-warn' : 'text-ok'}>{l.backorder > 0 ? `${l.backorder} to invoice` : 'All invoiced'}</span>
                    {l.qtyDispatched > 0 && <span className="text-muted">{l.qtyDispatched} invoiced</span>}
                    {st && l.backorder > 0 && <span className={st.short > 0 ? 'font-semibold text-danger' : 'text-muted'}>{st.available} in stock{st.short > 0 ? ` · short ${st.short}` : ''}{st.onOrder > 0 ? ` · ${st.onOrder} on PO` : ''}</span>}
                  </p>
                </li>
              );
            })}
          </ul>
          <Table minWidth={720} className="hidden sm:block">
            <THead><tr><Th>Item</Th><Th className="text-right">Ordered</Th><Th className="text-right">Invoiced</Th><Th className="text-right">To invoice</Th><Th className="text-right">In stock</Th><Th className="text-right">Rate</Th><Th className="text-right">Amount</Th></tr></THead>
            <tbody>
              {o.lines.map((l) => (
                <Tr key={l.id}>
                  <Td><div className="font-medium">{l.variant.product.name}</div><div className="text-xs text-muted">{l.variant.label ?? l.variant.sku}</div></Td>
                  <Td className="num">{l.qty}</Td><Td className="num">{l.qtyDispatched}</Td>
                  <Td className={cn('num font-semibold', l.backorder > 0 ? 'text-warn' : 'text-ok')}>{l.backorder}</Td>
                  <StockCell line={stock.get(l.variant.id)} backorder={l.backorder} />
                  <Td className="num">{rupees(l.rate)}</Td><Td className="num">{rupees(l.amount)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
        <div className="flex flex-col gap-5">
          {linkedPos.length > 0 && (
            <Card className="overflow-hidden">
              <CardHeader title="Ordered from supplier" />
              <Table minWidth={300}>
                <tbody>
                  {linkedPos.map((p) => (
                    <Tr key={p.id}>
                      <Td><Link className="font-mono text-sm text-teal-700 hover:underline" href={`/app/purchase-orders/${p.id}`}>{p.number}</Link><div className="text-xs text-muted">{p.supplier}{p.expectedDate ? ` · expected ${formatDate(p.expectedDate)}` : ''}</div></Td>
                      <Td className="text-right"><PoBadge status={p.status} /></Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          )}
          <Card>
            <CardHeader title="Details" />
            <CardBody className="flex flex-col gap-1.5 text-sm">
              <p><span className="text-muted">Deliver to:</span> {(o.shippingSnapshot as { addressLines?: string[] } | null)?.addressLines?.join(', ')}</p>
              {o.patientName && <p><span className="text-muted">Patient:</span> {o.patientName}</p>}
              {o.surgeryDate && <p><span className="text-muted">Surgery date:</span> {formatDate(o.surgeryDate)}</p>}
              {o.customerNote && <p><span className="text-muted">Note:</span> {o.customerNote}</p>}
              <p><span className="text-muted">Placed by:</span> {o.placedBy?.name} ({o.source === 'STAFF' ? 'staff' : 'customer'})</p>
            </CardBody>
          </Card>
          {(o.invoices.length > 0 || o.proformas.length > 0) && (
            <Card>
              <CardHeader title="Documents" />
              <ul className="divide-y divide-line text-sm">
                {o.invoices.map((i) => <li key={i.id} className="flex items-center justify-between px-5 py-2"><Link className="font-mono text-teal-700 hover:underline" href={`/app/invoices/${i.id}`}>{i.number}</Link><span>{i.status === 'CANCELLED' ? <PaymentBadge status="CANCELLED" /> : rupees(i.grandTotal)}</span></li>)}
                {o.proformas.map((p) => <li key={p.id} className="flex items-center justify-between px-5 py-2"><Link className="font-mono text-teal-700 hover:underline" href={`/app/proforma/${p.id}`}>{p.number}</Link><span className="text-xs text-muted">{p.status.toLowerCase()}</span></li>)}
              </ul>
            </Card>
          )}
          {o.dispatches.length > 0 && (
            <Card>
              <CardHeader title="Dispatch" />
              <ul className="divide-y divide-line text-sm">
                {o.dispatches.map((d) => (
                  <li key={d.id} className="px-5 py-2">
                    <span className="font-medium">{DISPATCH_METHOD_LABEL[d.method as DispatchMethod]}</span> · {formatDate(d.dispatchDate)}
                    {d.method === 'OWN_DELIVERY' && d.deliveryPersonName && <> · {d.deliveryPersonName}{d.deliveryPersonMobile ? ` (${d.deliveryPersonMobile})` : ''}</>}
                    {(d.method === 'COURIER' || d.method === 'TRANSPORT') && <> · {d.courier}{d.docketNo ? ` · ${d.method === 'TRANSPORT' ? 'LR' : 'docket'} ${d.docketNo}` : ''}</>}
                    {d.vehicleNo ? ` · ${d.vehicleNo}` : ''}
                    <div className="text-xs text-muted">Invoice {d.invoice?.number}{d.deliveredAt ? ` · delivered ${formatDateTime(d.deliveredAt)}${d.receivedBy ? `, received by ${d.receivedBy}` : ''}` : ' · not delivered yet'}</div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
      {sourceOpen && sq.data && <OrderFromSupplierDialog s={sq.data} onClose={() => setSourceOpen(false)} />}
      {dispatchOpen && <DispatchDialog o={o} refreshing={q.isFetching} onClose={() => setDispatchOpen(false)} />}
      {deliverOpen && <DeliverDialog o={o} onClose={() => setDeliverOpen(false)} />}
    </div>
  );
}

/** The employee who delivers the order. Anyone with the permission can invoice and dispatch it meanwhile. */
function HandledBy({ o, open }: { o: Order; open: boolean }) {
  const { can } = useMe();
  const utils = trpc.useUtils();
  // Once it is out the delivery is with whoever took it (a later dispatch can hand it to someone else).
  const canAssign = open && o.status !== 'DISPATCHED' && (can('CREATE_ORDERS') || can('UPDATE_ORDER_STATUS'));
  const staff = trpc.orders.staff.useQuery(undefined, { enabled: canAssign });
  // Awaiting the refetch keeps the new choice showing (and the spinner) until the page has it; the dashboard counts follow the handler too.
  const m = trpc.orders.assign.useMutation({ onSuccess: () => Promise.all([utils.orders.invalidate(), utils.analytics.invalidate()]) });
  const handlers = staff.data?.filter((u) => u.role === 'EMPLOYEE') ?? [];
  const current = o.assignedTo;
  const none = <Badge tone={open ? 'warn' : 'neutral'}>Not assigned</Badge>;
  return (
    <span className="flex flex-wrap items-center gap-2 text-ink">
      <UserRound className="size-4 text-muted" aria-hidden />
      {canAssign ? (
        <label className="flex items-center gap-2"><span className="text-muted">Delivery by</span>
          <select value={m.isPending ? (m.variables.assignedToId ?? '') : (current?.id ?? '')} disabled={m.isPending} onChange={(e) => m.mutate({ id: o.id, assignedToId: e.target.value || null })}
            className="h-8 max-w-56 rounded-md border border-line bg-white px-2 text-sm font-semibold text-ink disabled:opacity-60">
            <option value="">Not assigned</option>
            {/* Someone since made inactive still shows as the handler until it is changed. */}
            {current && !handlers.some((u) => u.id === current.id) && <option value={current.id}>{current.name}</option>}
            {handlers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </label>
      ) : <><span className="text-muted">Delivery by:</span>{current && <strong className="font-semibold">{current.name}</strong>}</>}
      {!current && !m.isPending && none}
      {m.isPending && <Loader2 className="size-4 animate-spin text-muted" aria-label="Saving" />}
      {(m.error ?? staff.error) && <span role="alert" className="text-danger">{errorMessage(m.error ?? staff.error)}</span>}
    </span>
  );
}

function DispatchDialog({ o, refreshing, onClose }: { o: Order; refreshing: boolean; onClose: () => void }) {
  const { can } = useMe();
  const refresh = useRefreshAfterStatus();
  const staff = trpc.orders.staff.useQuery();
  const invoices = o.invoices.filter((i) => i.status === 'ISSUED');
  const sent = new Set(o.dispatches.map((d) => d.invoiceId));
  const [v, setV] = useState({ method: o.suggestedDispatch as DispatchMethod, courier: '', docketNo: '', vehicleNo: '', dispatchDate: istDateString(), invoiceId: '', deliveryPersonId: o.assignedTo?.id ?? '', deliveryPersonName: '', deliveryPersonMobile: '' });
  // Defaults to the newest invoice not dispatched yet, including one that arrives after the dialog opened.
  const invoiceId = v.invoiceId || invoices.filter((i) => !sent.has(i.id)).at(-1)?.id || invoices.at(-1)?.id || '';
  const m = trpc.orders.setStatus.useMutation({ onSuccess: async () => { await refresh(); onClose(); } });
  const other = v.deliveryPersonId === 'OTHER';
  function save() {
    m.mutate({ id: o.id, status: 'DISPATCHED', dispatch: {
      method: v.method, dispatchDate: v.dispatchDate, invoiceId: invoiceId || undefined, vehicleNo: v.vehicleNo,
      courier: v.method === 'COURIER' || v.method === 'TRANSPORT' ? v.courier : null, docketNo: v.method === 'COURIER' || v.method === 'TRANSPORT' ? v.docketNo : null,
      deliveryPersonId: v.method === 'OWN_DELIVERY' && !other ? v.deliveryPersonId || null : null,
      deliveryPersonName: v.method === 'OWN_DELIVERY' && other ? v.deliveryPersonName : null, deliveryPersonMobile: v.method === 'OWN_DELIVERY' && other ? v.deliveryPersonMobile : null,
    } });
  }
  return (
    <Dialog open onClose={onClose} title="Dispatch" description="How is this order going out? The details print on the invoice and the customer is told." size="md"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={m.isPending} disabled={!invoices.length} onClick={save}>{v.method === 'PICKUP' ? 'Mark ready for pickup' : 'Mark dispatched'}</Button></>}>
      <div className="flex flex-col gap-4">
        {invoices.length === 0 && (refreshing ? <Alert tone="info">Checking for the tax invoice…</Alert> : (
          <Alert tone="warn">
            <span className="flex flex-wrap items-center justify-between gap-3">
              <span>A tax invoice is needed before dispatch. You&apos;ll come straight back here to finish dispatching.</span>
              {can('CREATE_TAX_INVOICE') && <LinkButton href={`/app/invoices/new?order=${o.id}&next=dispatch`} className="h-9 shrink-0"><Receipt className="size-4" aria-hidden /> Create tax invoice</LinkButton>}
            </span>
          </Alert>
        ))}
        <div role="radiogroup" aria-label="Dispatch method" className="grid grid-cols-2 gap-2">
          {DISPATCH_METHODS.map((k) => (
            <button key={k} type="button" role="radio" aria-checked={v.method === k} onClick={() => setV({ ...v, method: k })}
              className={cn('rounded-lg border px-3 py-2.5 text-left text-sm', v.method === k ? 'border-teal bg-aqua-50 font-semibold text-navy ring-1 ring-teal' : 'border-line hover:bg-canvas')}>
              {DISPATCH_METHOD_LABEL[k]}{k === o.suggestedDispatch && <span className="text-xs font-normal text-teal-700"> (suggested)</span>}
            </button>
          ))}
        </div>
        {invoices.length > 1 && <SelectField label="Invoice" value={invoiceId} onChange={(e) => setV({ ...v, invoiceId: e.target.value })}>{invoices.map((i) => <option key={i.id} value={i.id}>{i.number}{sent.has(i.id) ? ' (already dispatched)' : ''}</option>)}</SelectField>}
        {v.method === 'OWN_DELIVERY' && (
          <>
            <SelectField label="Delivered by" value={v.deliveryPersonId} onChange={(e) => setV({ ...v, deliveryPersonId: e.target.value })} hint={other ? 'Anyone who can update orders marks it delivered.' : 'Starts with the person chosen on the order. They see it in their app, and only they (or the owner) can mark it delivered.'}>
              <option value="">Choose…</option>
              {staff.data?.map((u) => <option key={u.id} value={u.id}>{u.name}{u.mobile ? ` · ${u.mobile}` : ''}</option>)}
              <option value="OTHER">Someone else (enter name)</option>
            </SelectField>
            {other && <div className="grid grid-cols-2 gap-3"><TextField label="Name" value={v.deliveryPersonName} onChange={(e) => setV({ ...v, deliveryPersonName: e.target.value })} /><TextField label="Mobile (optional)" inputMode="tel" value={v.deliveryPersonMobile} onChange={(e) => setV({ ...v, deliveryPersonMobile: e.target.value })} /></div>}
            <TextField label="Vehicle no. (optional)" placeholder="GJ06AB1234" value={v.vehicleNo} onChange={(e) => setV({ ...v, vehicleNo: e.target.value.toUpperCase() })} />
          </>
        )}
        {(v.method === 'COURIER' || v.method === 'TRANSPORT') && (
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label={v.method === 'COURIER' ? 'Courier company' : 'Transporter'} value={v.courier} onChange={(e) => setV({ ...v, courier: e.target.value })} />
            <TextField label={v.method === 'COURIER' ? 'Docket no.' : 'LR no.'} value={v.docketNo} onChange={(e) => setV({ ...v, docketNo: e.target.value })} />
            {v.method === 'TRANSPORT' && <TextField label="Vehicle no. (optional)" value={v.vehicleNo} onChange={(e) => setV({ ...v, vehicleNo: e.target.value.toUpperCase() })} />}
          </div>
        )}
        {v.method === 'PICKUP' && <p className="text-sm text-muted">The customer is told the order is ready to collect. Mark it delivered when they pick it up.</p>}
        <TextField label={v.method === 'PICKUP' ? 'Ready on' : 'Dispatch date'} type="date" value={v.dispatchDate} onChange={(e) => setV({ ...v, dispatchDate: e.target.value })} wrapperClassName="max-w-xs" />
        {m.error && <Alert>{errorMessage(m.error)}</Alert>}
      </div>
    </Dialog>
  );
}

/** Proof of delivery: who received the goods. */
function DeliverDialog({ o, onClose }: { o: Order; onClose: () => void }) {
  const refresh = useRefreshAfterStatus();
  const [receivedBy, setReceivedBy] = useState('');
  const [note, setNote] = useState('');
  const m = trpc.orders.markDelivered.useMutation({ onSuccess: async () => { await refresh(); onClose(); } });
  const fe = fieldErrors(m.error);
  return (
    <Dialog open onClose={onClose} title="Mark delivered" description="Who received the goods? Optional; if you fill it in, it is kept as proof of delivery and shown to the customer." size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={m.isPending} onClick={() => m.mutate({ id: o.id, receivedBy: receivedBy.trim() || null, note })}>Mark delivered</Button></>}>
      <div className="flex flex-col gap-3">
        <TextField label="Received by (optional)" placeholder="e.g. Sister Mary, OT store" value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} error={fe.receivedBy} />
        <TextField label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        {m.error && !fe.receivedBy && <Alert>{errorMessage(m.error)}</Alert>}
      </div>
    </Dialog>
  );
}

function StockCell({ line, backorder }: { line?: { available: number; short: number; onOrder: number }; backorder: number }) {
  if (!line || backorder === 0) return <Td className="num text-muted">{line?.available ?? '—'}</Td>;
  return (
    <Td className="num">
      <span className={line.short > 0 ? 'font-semibold text-danger' : 'text-ok'}>{line.available}</span>
      {line.short > 0 && <div className="text-xs text-danger">short {line.short}</div>}
      {line.onOrder > 0 && <div className="text-xs text-muted">{line.onOrder} on PO</div>}
    </Td>
  );
}
