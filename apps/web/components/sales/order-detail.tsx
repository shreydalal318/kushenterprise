'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Circle, FileText, Receipt, ScanLine, Truck } from 'lucide-react';
import { DISPATCH_METHOD_LABEL, DISPATCH_METHODS, formatDate, formatDateTime, istDateString, nextStatuses, ORDER_FLOW, ORDER_STATUS_LABEL, type DispatchMethod, type OrderStatus } from '@kush/core';
import { Button } from '@/components/ui/button';
import { Alert, Card, CardBody, CardHeader, PageHeader } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { SelectField, TextField } from '@/components/ui/field';
import { LinkButton } from '@/components/ui/link-button';
import { Table, Td, Th, THead, Tr } from '@/components/ui/table';
import { ScanField } from '@/components/scan/scan-field';
import { cn } from '@/lib/cn';
import { errorMessage, fieldErrors } from '@/lib/errors';
import { scanError, scanOk } from '@/lib/feedback';
import { rupees } from '@/lib/format';
import { trpc, type RouterOutputs } from '@/lib/trpc';
import { useMe } from '@/lib/use-me';
import { OrderBadge, PaymentBadge } from './status';
import { OrderFromSupplierDialog } from './order-sourcing';
import { PoBadge } from '@/components/purchasing/po-status';

type Order = RouterOutputs['orders']['get'];

export function OrderDetail({ id, isNew, openDispatch = false }: { id: string; isNew: boolean; openDispatch?: boolean }) {
  const { can } = useMe();
  const router = useRouter();
  const utils = trpc.useUtils();
  // Always refetch on arrival: coming back from raising an invoice, the cached order doesn't have it yet.
  const q = trpc.orders.get.useQuery({ id }, { refetchOnMount: 'always' });
  const setStatus = trpc.orders.setStatus.useMutation({ onSuccess: () => utils.orders.invalidate() });
  const [dispatchOpen, setDispatchOpen] = useState(false);
  // Back from "Create tax invoice" in the Dispatch dialog: reopen it once the fresh order has the invoice.
  const autoOpened = useRef(false);
  useEffect(() => {
    if (!openDispatch || autoOpened.current || !q.data || q.isFetching) return;
    autoOpened.current = true;
    if (q.data.status === 'PACKED' && q.data.invoices.some((i) => i.status === 'ISSUED')) setDispatchOpen(true);
    router.replace(`/app/orders/${id}`, { scroll: false });
  }, [openDispatch, q.data, q.isFetching]); // eslint-disable-line react-hooks/exhaustive-deps
  const [packOpen, setPackOpen] = useState(false);
  const [deliverOpen, setDeliverOpen] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const sq = trpc.orders.shortfall.useQuery({ id });
  if (q.error) return <Alert>{errorMessage(q.error)}</Alert>;
  if (!q.data) return <p className="text-sm text-muted">Loading…</p>;
  const o = q.data;
  const next = nextStatuses(o.status);
  const backorder = o.lines.reduce((t, l) => t + l.backorder, 0);
  const stock = new Map((sq.data?.lines ?? []).map((l) => [l.variantId, l]));
  const toOrder = (sq.data?.lines ?? []).reduce((t, l) => t + l.toOrder, 0);
  const linkedPos = [...new Map((sq.data?.lines ?? []).flatMap((l) => l.purchaseOrders).map((p) => [p.id, p])).values()];
  const open = !['CANCELLED', 'DELIVERED'].includes(o.status);
  const reached = (s: OrderStatus) => o.events.find((e) => e.status === s);

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
        description={<span className="flex flex-wrap items-center gap-2">{o.customer.name}{o.forDoctor ? ` · for ${o.forDoctor.name}` : ''} <OrderBadge status={o.status} /></span>}
        actions={<div className="flex flex-wrap gap-2">
          {backorder > 0 && o.status !== 'CANCELLED' && can('CREATE_TAX_INVOICE') && <LinkButton href={`/app/invoices/new?order=${o.id}${o.status === 'PACKED' ? '&next=dispatch' : ''}`}><Receipt className="size-4" aria-hidden /> Create tax invoice</LinkButton>}
          {o.status !== 'CANCELLED' && can('CREATE_PROFORMA') && <LinkButton variant="secondary" href={`/app/proforma/new?order=${o.id}`}><FileText className="size-4" aria-hidden /> Proforma</LinkButton>}
          {open && backorder > 0 && can('CREATE_PURCHASE_ORDERS') && sq.data && <Button variant={toOrder > 0 ? 'primary' : 'secondary'} onClick={() => setSourceOpen(true)}><Truck className="size-4" aria-hidden /> Order from supplier</Button>}
          {can('SCAN_DISPATCH') && ['CONFIRMED', 'PLACED'].includes(o.status) && <Button variant="secondary" onClick={() => setPackOpen(true)}><ScanLine className="size-4" aria-hidden /> Pack &amp; verify</Button>}
        </div>} />
      {isNew && <Alert tone="ok">Order placed.</Alert>}
      {open && toOrder > 0 && <Alert tone="info">{toOrder} unit(s) on this order are not in stock{can('CREATE_PURCHASE_ORDERS') ? ' — use “Order from supplier” to raise a purchase order.' : '.'}</Alert>}
      {setStatus.error && <Alert>{errorMessage(setStatus.error)}</Alert>}

      <Card>
        <CardHeader title="Status" actions={can('UPDATE_ORDER_STATUS') && next.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {next.map((s) => <Button key={s} size="sm" variant={s === 'CANCELLED' ? 'danger' : s === 'ON_HOLD' ? 'secondary' : 'primary'} loading={setStatus.isPending && setStatus.variables?.status === s} onClick={() => go(s)}>{s === 'ON_HOLD' ? 'Put on hold' : s === 'CANCELLED' ? 'Cancel order' : `Mark ${ORDER_STATUS_LABEL[s].toLowerCase()}`}</Button>)}
          </div>
        )} />
        <CardBody>
          <ol className="grid gap-3 sm:grid-cols-5">
            {ORDER_FLOW.map((s) => {
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
          <CardHeader title="Items" description={backorder > 0 && o.invoices.length ? `${backorder} unit(s) still to send (back-order)` : undefined} />
          {/* Phones: one row per item instead of a 7-column table. */}
          <ul className="divide-y divide-line sm:hidden">
            {o.lines.map((l) => {
              const st = stock.get(l.variant.id);
              return (
                <li key={l.id} className="px-5 py-3">
                  <div className="flex justify-between gap-3"><span className="font-medium">{l.variant.product.name}</span><span className="shrink-0 font-medium">{rupees(l.amount)}</span></div>
                  <p className="text-xs text-muted">{l.variant.label ?? l.variant.sku} · {l.qty} × {rupees(l.rate)}</p>
                  <p className="mt-1 flex flex-wrap gap-x-3 text-xs">
                    <span className={l.backorder > 0 ? 'font-semibold text-warn' : 'text-ok'}>{l.backorder > 0 ? `${l.backorder} to send` : 'All sent'}</span>
                    {l.qtyDispatched > 0 && <span className="text-muted">{l.qtyDispatched} invoiced</span>}
                    {st && l.backorder > 0 && <span className={st.short > 0 ? 'font-semibold text-danger' : 'text-muted'}>{st.available} in stock{st.short > 0 ? ` · short ${st.short}` : ''}{st.onOrder > 0 ? ` · ${st.onOrder} on PO` : ''}</span>}
                  </p>
                </li>
              );
            })}
          </ul>
          <Table minWidth={720} className="hidden sm:block">
            <THead><tr><Th>Item</Th><Th className="text-right">Ordered</Th><Th className="text-right">Invoiced</Th><Th className="text-right">To send</Th><Th className="text-right">In stock</Th><Th className="text-right">Rate</Th><Th className="text-right">Amount</Th></tr></THead>
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
              <p><span className="text-muted">Assigned to:</span> {o.assignedTo?.name ?? '—'}</p>
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
      {packOpen && <PackDialog o={o} onClose={() => setPackOpen(false)} />}
      {deliverOpen && <DeliverDialog o={o} onClose={() => setDeliverOpen(false)} />}
    </div>
  );
}

function DispatchDialog({ o, refreshing, onClose }: { o: Order; refreshing: boolean; onClose: () => void }) {
  const { can } = useMe();
  const utils = trpc.useUtils();
  const staff = trpc.orders.staff.useQuery();
  const invoices = o.invoices.filter((i) => i.status === 'ISSUED');
  const [v, setV] = useState({ method: o.suggestedDispatch as DispatchMethod, courier: '', docketNo: '', vehicleNo: '', dispatchDate: istDateString(), invoiceId: '', deliveryPersonId: '', deliveryPersonName: '', deliveryPersonMobile: '' });
  // Defaults to the latest invoice, including one that arrives after the dialog opened.
  const invoiceId = v.invoiceId || invoices.at(-1)?.id || '';
  const m = trpc.orders.setStatus.useMutation({ onSuccess: async () => { await utils.orders.invalidate(); onClose(); } });
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
        {invoices.length > 1 && <SelectField label="Invoice" value={invoiceId} onChange={(e) => setV({ ...v, invoiceId: e.target.value })}>{invoices.map((i) => <option key={i.id} value={i.id}>{i.number}</option>)}</SelectField>}
        {v.method === 'OWN_DELIVERY' && (
          <>
            <SelectField label="Delivered by" value={v.deliveryPersonId} onChange={(e) => setV({ ...v, deliveryPersonId: e.target.value })} hint="Staff in the list see this delivery in their app and mark it delivered there.">
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
  const utils = trpc.useUtils();
  const [receivedBy, setReceivedBy] = useState('');
  const [note, setNote] = useState('');
  const m = trpc.orders.markDelivered.useMutation({ onSuccess: async () => { await utils.orders.invalidate(); onClose(); } });
  const fe = fieldErrors(m.error);
  return (
    <Dialog open onClose={onClose} title="Mark delivered" description="Who received the goods? This is kept as proof of delivery and shown to the customer." size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={m.isPending} onClick={() => m.mutate({ id: o.id, receivedBy, note })}>Mark delivered</Button></>}>
      <div className="flex flex-col gap-3">
        <TextField label="Received by" placeholder="e.g. Sister Mary, OT store" value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} error={fe.receivedBy} />
        <TextField label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        {m.error && !fe.receivedBy && <Alert>{errorMessage(m.error)}</Alert>}
      </div>
    </Dialog>
  );
}

/** Scan every packed box; the order is marked Packed only when everything matches. */
function PackDialog({ o, onClose }: { o: Order; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [scanned, setScanned] = useState<Record<string, number>>({});
  const counts = useRef<Record<string, number>>({});
  const queue = useRef<Promise<void>>(Promise.resolve());
  const [msg, setMsg] = useState<string | null>(null);
  const verify = trpc.orders.verifyPacked.useMutation({ onSuccess: async (r) => { if (r.ok) { await utils.orders.invalidate(); onClose(); } } });
  // Scans are handled one at a time against a ref, so a fast scanner can't double-count or skip the "too many" check.
  const onScan = (code: string) => { queue.current = queue.current.then(() => handleScan(code)); return queue.current; };
  async function handleScan(code: string) {
    const r = await utils.scan.resolve.fetch({ code }, { staleTime: 0 }).catch(() => null);
    if (!r?.found) { scanError(); setMsg(`Unknown barcode ${code}`); return; }
    const line = o.lines.find((l) => l.variant.id === r.variant.id);
    if (!line) { scanError(); setMsg(`${r.product.name} ${r.variant.label ?? ''} is NOT on this order`); return; }
    const n = (counts.current[r.variant.id] ?? 0) + 1;
    if (n > line.qty) { scanError(); setMsg(`Too many: only ${line.qty} × ${r.product.name} ${r.variant.label ?? ''} ordered`); return; }
    scanOk(); setMsg(null);
    counts.current = { ...counts.current, [r.variant.id]: n };
    setScanned(counts.current);
  }
  const done = o.lines.every((l) => (scanned[l.variant.id] ?? 0) >= l.qty);
  return (
    <Dialog open onClose={onClose} title="Pack & verify" description="Scan each box as it goes into the parcel." size="lg"
      footer={<><Button variant="secondary" onClick={onClose}>Close</Button><Button disabled={!done} loading={verify.isPending} onClick={() => verify.mutate({ id: o.id, scanned: Object.entries(scanned).map(([variantId, qty]) => ({ variantId, qty })) })}>Mark packed</Button></>}>
      <div className="flex flex-col gap-3">
        <ScanField onScan={onScan} />
        {msg && <Alert>{msg}</Alert>}
        {verify.data && !verify.data.ok && <Alert>{verify.data.problems.join('; ')}</Alert>}
        <ul className="divide-y divide-line rounded-lg border border-line text-sm">
          {o.lines.map((l) => { const n = scanned[l.variant.id] ?? 0; return (
            <li key={l.id} className="flex items-center justify-between px-3 py-2"><span>{l.variant.product.name} <span className="text-muted">{l.variant.label ?? ''}</span></span><span className={cn('font-semibold', n >= l.qty ? 'text-ok' : 'text-muted')}>{n} / {l.qty}</span></li>
          ); })}
        </ul>
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
