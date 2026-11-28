'use client';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, Trash2 } from 'lucide-react';
import { computeGst, formatDate, istDateString, stateByCode } from '@kush/core';
import { Button } from '@/components/ui/button';
import { Alert, Badge, Card, CardBody, CardHeader } from '@/components/ui/card';
import { SelectField, TextField } from '@/components/ui/field';
import { Table, Td, Th, THead, Tr } from '@/components/ui/table';
import { ScanField, type ScanFieldHandle } from '@/components/scan/scan-field';
import { VariantPicker, type VariantChoice } from '@/components/stock/variant-picker';
import { cn } from '@/lib/cn';
import { errorMessage, fieldErrors } from '@/lib/errors';
import { scanError, scanOk, scanWarn } from '@/lib/feedback';
import { rupees } from '@/lib/format';
import { trpc } from '@/lib/trpc';
import { useMe } from '@/lib/use-me';

export type BuilderMode = 'invoice' | 'proforma' | 'order';

export interface BuilderLine {
  key: string;
  variantId: string;
  productId: string;
  name: string;
  label: string | null;
  unit: string;
  hsn: string;
  gstRate: number;
  mrp: number;
  trackSerial: boolean;
  qty: number;
  rate: number | null; // null = use the customer's price
  discPct: number;
  batchId: string | null; // null = FEFO
  serials: string[];
  /** Units still to invoice on the order this line came from (serial lines start with that many ticked when in stock). */
  wanted?: number;
}

export interface BuilderPrefill {
  customerId?: string;
  shippingAddressId?: string | null;
  forDoctorId?: string | null;
  orderId?: string | null;
  /** After saving an invoice for an order, go back to the order with the Dispatch dialog open. */
  thenDispatch?: boolean;
  lines?: Omit<BuilderLine, 'key'>[];
}

let seq = 0;
const newKey = () => `l${++seq}`;
const uuid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

const TITLES: Record<BuilderMode, string> = { invoice: 'Save tax invoice', proforma: 'Save proforma', order: 'Place order' };
const NOBODY = 'NONE';

export function DocBuilder({ mode, prefill }: { mode: BuilderMode; prefill?: BuilderPrefill }) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const { isOwner } = useMe();
  const customers = trpc.sales.customers.useQuery();
  const company = trpc.sales.companyReady.useQuery(undefined, { enabled: mode !== 'order' });
  // Whoever enters an order picks its handler on purpose: '' = not chosen yet, NOBODY = leave it for someone to assign.
  const staff = trpc.orders.staff.useQuery(undefined, { enabled: mode === 'order' });
  const handlers = staff.data?.filter((u) => u.role === 'EMPLOYEE') ?? [];
  const [handler, setHandler] = useState('');
  const [customerId, setCustomerId] = useState(prefill?.customerId ?? '');
  const [shipId, setShipId] = useState<string>(prefill?.shippingAddressId ?? '');
  const [doctorId, setDoctorId] = useState<string>(prefill?.forDoctorId ?? '');
  const [date, setDate] = useState(istDateString());
  const [extra, setExtra] = useState({ buyersOrderNo: '', buyersOrderDate: '', dispatchedThrough: '', destination: '', termsOfDelivery: '', validUntil: '', patientName: '', surgeryDate: '', customerNote: '' });
  const [showExtra, setShowExtra] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'warn' | 'danger'; text: string } | null>(null);
  const [lines, setLinesState] = useState<BuilderLine[]>(() => (prefill?.lines ?? []).map((l) => ({ ...l, key: newKey() })));
  const linesRef = useRef(lines);
  const setLines = (next: BuilderLine[] | ((l: BuilderLine[]) => BuilderLine[])) => { linesRef.current = typeof next === 'function' ? next(linesRef.current) : next; setLinesState(linesRef.current); };
  const queue = useRef<Promise<void>>(Promise.resolve());
  const scan = useRef<ScanFieldHandle>(null);
  const requestId = useRef(uuid());

  const customer = customers.data?.find((c) => c.id === customerId);
  const shippingOptions = customer?.addresses ?? [];
  const ship = shippingOptions.find((a) => a.id === shipId) ?? shippingOptions.find((a) => a.kind === 'SHIPPING' && a.isDefault) ?? shippingOptions.find((a) => a.kind === 'BILLING');
  useEffect(() => { if (!prefill?.customerId || customerId !== prefill.customerId) { setShipId(''); setDoctorId(''); } }, [customerId]); // eslint-disable-line react-hooks/exhaustive-deps

  const productIds = useMemo(() => [...new Set(lines.map((l) => l.productId))].sort(), [lines]);
  const prices = trpc.sales.prices.useQuery({ customerId, productIds }, { enabled: !!customerId && productIds.length > 0, placeholderData: (p) => p });
  // Orders always take the customer's price (the server ignores any other rate), so only invoices / proformas can override it.
  const rateOf = (l: BuilderLine) => (mode === 'order' ? null : l.rate) ?? prices.data?.[l.productId]?.rate ?? null;

  const companyState = company.data?.stateCode ?? '';
  const totals = useMemo(() => {
    const ready = lines.every((l) => rateOf(l) != null);
    if (mode === 'order' || !ready || !lines.length || !ship) return null;
    return computeGst(companyState || 'XX', ship.stateCode, lines.map((l) => ({ qty: l.qty, rate: rateOf(l)!, discPct: l.discPct, hsn: l.hsn, gstRate: l.gstRate })));
  }, [lines, prices.data, ship, companyState]); // eslint-disable-line react-hooks/exhaustive-deps

  async function productInfo(productId: string) {
    const p = await utils.products.get.fetch({ id: productId });
    return { hsn: p.hsnCode, gstRate: p.gstRate, unit: p.unit, mrp: p.mrp, trackSerial: p.trackSerial, variants: p.variants };
  }

  async function addVariant(v: VariantChoice, opts: { batchId?: string | null; serial?: string | null } = {}) {
    const info = await productInfo(v.productId);
    const variant = info.variants.find((x) => x.id === v.variantId);
    const mrp = variant?.mrp ?? info.mrp;
    const sameBatch = (l: BuilderLine) => l.variantId === v.variantId && (mode !== 'invoice' || (opts.batchId ? l.batchId === opts.batchId : !l.batchId || info.trackSerial));
    const existing = linesRef.current.find(sameBatch);
    if (existing) {
      if (opts.serial) {
        if (existing.serials.includes(opts.serial)) { scanWarn(); setMsg({ tone: 'warn', text: `Serial ${opts.serial} is already on this bill` }); return false; }
        setLines((ls) => ls.map((l) => (l.key === existing.key ? { ...l, serials: [...l.serials, opts.serial!], qty: l.serials.length + 1 } : l)));
      } else if (!(mode === 'invoice' && info.trackSerial)) {
        setLines((ls) => ls.map((l) => (l.key === existing.key ? { ...l, qty: l.qty + 1 } : l)));
      }
    } else {
      setLines((ls) => [...ls, {
        key: newKey(), variantId: v.variantId, productId: v.productId, name: v.productName, label: v.label, unit: info.unit, hsn: info.hsn, gstRate: info.gstRate,
        mrp, trackSerial: info.trackSerial, qty: mode === 'invoice' && info.trackSerial ? (opts.serial ? 1 : 0) : 1, rate: null, discPct: 0,
        batchId: opts.batchId ?? null, serials: opts.serial ? [opts.serial] : [],
      }]);
    }
    return true;
  }

  /** Scan to bill: each scan adds the item at the customer's price; scanning again adds one more. */
  const onScan = (code: string) => { queue.current = queue.current.then(() => handleScan(code)); return queue.current; };
  async function handleScan(code: string) {
    setMsg(null);
    if (!customerId) { scanError(); setMsg({ tone: 'danger', text: 'Choose the customer first' }); return; }
    const r = await utils.scan.resolve.fetch({ code }, { staleTime: 0 }).catch(() => null);
    if (!r || !r.found) { scanError(); setMsg({ tone: 'danger', text: `Unknown barcode ${code}` }); return; }
    const bad = r.warnings.filter((w) => (mode === 'invoice' ? ['EXPIRED', 'OUT_OF_STOCK', 'SERIAL_NOT_IN_STOCK', 'BATCH_NOT_IN_STOCK', 'INACTIVE'] : ['INACTIVE']).includes(w));
    if (bad.length) {
      scanError();
      setMsg({ tone: 'danger', text: `${r.product.name} ${r.variant.label ?? ''}: ${bad.map((w) => ({ EXPIRED: 'batch expired', OUT_OF_STOCK: 'out of stock', SERIAL_NOT_IN_STOCK: 'serial not in stock', BATCH_NOT_IN_STOCK: 'that batch is not in stock', INACTIVE: 'inactive item' } as Record<string, string>)[w]).join(', ')}` });
      return;
    }
    const serial = mode === 'invoice' && r.product.trackSerial ? (r.serial?.serialNo ?? null) : null;
    if (mode === 'invoice' && r.product.trackSerial && !serial) {
      scanWarn();
      setMsg({ tone: 'warn', text: `${r.product.name} ${r.variant.label ?? ''} needs its serial: scan the box's 2D code or tick the serial below` });
    }
    const ok = await addVariant(
      { variantId: r.variant.id, productId: r.product.id, productName: r.product.name, label: r.variant.label, sku: r.variant.sku, trackSerial: r.product.trackSerial, trackBatch: r.product.trackBatch, trackExpiry: r.product.trackExpiry },
      { batchId: mode === 'invoice' && !r.product.trackSerial ? (r.batch?.batchId ?? null) : null, serial },
    );
    if (ok && (serial || !(mode === 'invoice' && r.product.trackSerial))) { scanOk(); setMsg({ tone: 'ok', text: `${r.product.name} ${r.variant.label ?? ''}${r.batch ? ` · batch ${r.batch.batchNo}` : ''}${serial ? ` · ${serial}` : ''}` }); }
  }

  const update = (key: string, patch: Partial<BuilderLine>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const createInvoice = trpc.invoices.create.useMutation();
  const createProforma = trpc.proformas.create.useMutation();
  const createOrder = trpc.orders.create.useMutation();
  const m = mode === 'invoice' ? createInvoice : mode === 'proforma' ? createProforma : createOrder;
  const fe = fieldErrors(m.error);

  // An order is valued like the order page shows it: quantity × the customer's rate, before GST.
  const orderValue = mode === 'order' && lines.length && lines.every((l) => rateOf(l) != null) ? Math.round(lines.reduce((t, l) => t + l.qty * rateOf(l)!, 0) * 100) / 100 : null;
  const total = mode === 'order' ? orderValue : totals?.total ?? null;

  function submit() {
    const common = { customerId, shippingAddressId: ship?.id ?? null, forDoctorId: doctorId || null };
    const after = (path: string) => () => { void utils.invalidate(); router.push(path); };
    if (mode === 'invoice') {
      createInvoice.mutate({
        ...common, date, orderId: prefill?.orderId ?? null, clientRequestId: requestId.current,
        buyersOrderNo: extra.buyersOrderNo, buyersOrderDate: extra.buyersOrderDate, dispatchedThrough: extra.dispatchedThrough, destination: extra.destination || ship?.city || '', termsOfDelivery: extra.termsOfDelivery,
        lines: lines.map((l) => ({ variantId: l.variantId, qty: l.qty, discPct: l.discPct, rate: isOwner ? l.rate : null, batchId: l.batchId, serialNos: l.serials })),
      }, { onSuccess: (r) => after(prefill?.orderId && prefill.thenDispatch ? `/app/orders/${prefill.orderId}?dispatch=1` : `/app/invoices/${r.id}?new=1`)() });
    } else if (mode === 'proforma') {
      createProforma.mutate({ ...common, date, orderId: prefill?.orderId ?? null, validUntil: extra.validUntil, lines: lines.map((l) => ({ variantId: l.variantId, qty: l.qty, discPct: l.discPct, rate: isOwner ? l.rate : null })) },
        { onSuccess: (r) => after(`/app/proforma/${r.id}?new=1`)() });
    } else {
      createOrder.mutate({ ...common, assignedToId: handler === NOBODY ? null : handler, clientRequestId: requestId.current, patientName: extra.patientName, surgeryDate: extra.surgeryDate, customerNote: extra.customerNote, lines: lines.map((l) => ({ variantId: l.variantId, qty: l.qty })) },
        { onSuccess: (r) => after(`/app/orders/${r.id}?new=1`)() });
    }
  }

  const units = lines.reduce((t, l) => t + l.qty, 0);
  const serialProblems = mode === 'invoice' && lines.some((l) => l.trackSerial && l.serials.length !== l.qty);
  const zeroQty = lines.some((l) => l.qty < 1);
  const noHandler = mode === 'order' && !handler;
  // Serial-tracked lines are only as long as the serials ticked: say which ones still need ticking (and why Save may be off).
  const shortSerials = mode === 'invoice' ? lines.filter((l) => l.trackSerial && l.serials.length < Math.max(1, l.wanted ?? 0)) : [];
  return (
    <div className="flex flex-col gap-5">
      {mode !== 'order' && company.data && !company.data.ready && (
        <Alert tone="warn">Set the company state and GSTIN in Settings → Company before issuing GST documents. Until then tax can&apos;t be worked out.</Alert>
      )}
      <Card>
        <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SelectField label="Customer" value={customerId} onChange={(e) => setCustomerId(e.target.value)} error={fe.customerId} wrapperClassName="lg:col-span-2">
            <option value="">Choose a doctor, hospital or clinic…</option>
            {customers.data?.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
          </SelectField>
          <SelectField label="Deliver to" value={ship?.id ?? ''} onChange={(e) => setShipId(e.target.value)} disabled={!customer}>
            {shippingOptions.map((a) => <option key={a.id} value={a.id}>{a.label ?? (a.kind === 'BILLING' ? 'Billing address' : 'Shipping')} · {a.city} ({stateByCode(a.stateCode)?.shortCode})</option>)}
          </SelectField>
          {mode !== 'order' ? <TextField label={mode === 'invoice' ? 'Invoice date' : 'Date'} type="date" value={date} onChange={(e) => setDate(e.target.value)} /> : (
            <SelectField label="Who will deliver it" required value={handler} onChange={(e) => setHandler(e.target.value)} error={fe.assignedToId}
              hint={staff.error ? errorMessage(staff.error) : 'They get the delivery. Anyone can make the invoice and pack it meanwhile.'}>
              <option value="" disabled>Choose…</option>
              {handlers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              <option value={NOBODY}>Not assigned yet</option>
            </SelectField>
          )}
          {customer && customer.doctors.length > 0 && (
            <SelectField label="For doctor (optional)" value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
              <option value="">—</option>
              {customer.doctors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </SelectField>
          )}
          {customer && ship && mode !== 'order' && (
            <p className="self-end pb-2 text-sm text-muted lg:col-span-2">
              GST: <strong className="text-ink">{companyState === ship.stateCode ? 'CGST + SGST' : 'IGST'}</strong> (deliver to {stateByCode(ship.stateCode)?.name}) · terms {customer.paymentTermsDays} days
            </p>
          )}
        </CardBody>
        <button type="button" aria-expanded={showExtra} onClick={() => setShowExtra(!showExtra)} className="flex w-full items-center gap-1 border-t border-line px-5 py-2 text-sm text-teal-700 hover:bg-aqua-50">
          <ChevronDown className={cn('size-4 transition-transform', showExtra && 'rotate-180')} aria-hidden /> {mode === 'order' ? 'Patient / surgery details' : 'More details (buyer’s order, dispatch, terms)'}
        </button>
        {showExtra && (
          <CardBody className="grid gap-4 border-t border-line sm:grid-cols-3">
            {mode === 'invoice' && <>
              <TextField label="Buyer's order no." value={extra.buyersOrderNo} onChange={(e) => setExtra({ ...extra, buyersOrderNo: e.target.value })} />
              <TextField label="Buyer's order date" type="date" value={extra.buyersOrderDate} onChange={(e) => setExtra({ ...extra, buyersOrderDate: e.target.value })} />
              <TextField label="Dispatched through" value={extra.dispatchedThrough} onChange={(e) => setExtra({ ...extra, dispatchedThrough: e.target.value })} />
              <TextField label="Destination" placeholder={ship?.city} value={extra.destination} onChange={(e) => setExtra({ ...extra, destination: e.target.value })} />
              <TextField label="Terms of delivery" value={extra.termsOfDelivery} onChange={(e) => setExtra({ ...extra, termsOfDelivery: e.target.value })} wrapperClassName="sm:col-span-2" />
            </>}
            {mode === 'proforma' && <TextField label="Valid until" type="date" value={extra.validUntil} onChange={(e) => setExtra({ ...extra, validUntil: e.target.value })} hint="Blank uses the default from Settings" />}
            {mode === 'order' && <>
              <TextField label="Patient name (optional)" value={extra.patientName} onChange={(e) => setExtra({ ...extra, patientName: e.target.value })} />
              <TextField label="Surgery date (optional)" type="date" value={extra.surgeryDate} onChange={(e) => setExtra({ ...extra, surgeryDate: e.target.value })} />
              <TextField label="Note" value={extra.customerNote} onChange={(e) => setExtra({ ...extra, customerNote: e.target.value })} />
            </>}
          </CardBody>
        )}
      </Card>

      <Card>
        <CardHeader title="Items" description={`${lines.length} line(s), ${units} unit(s)`} />
        <CardBody className="flex flex-col gap-3">
          <ScanField ref={scan} onScan={onScan} placeholder="Find products below, or scan a barcode" />
          {msg && <Alert tone={msg.tone === 'danger' ? 'danger' : msg.tone === 'warn' ? 'warn' : 'ok'}>{msg.text}</Alert>}
          <VariantPicker onPick={(v) => { if (!customerId) { setMsg({ tone: 'danger', text: 'Choose the customer first' }); return; } void addVariant(v); }} />
        </CardBody>
        {lines.length > 0 && (
          <Table minWidth={mode === 'invoice' ? 1060 : mode === 'order' ? 640 : 820}>
            <THead><tr><Th>Item</Th>{mode === 'invoice' && <Th>Batch / serials</Th>}<Th className="w-24">Qty</Th><Th className="text-right">Rate</Th>{mode !== 'order' && <Th className="w-24">Disc %</Th>}<Th className="text-right">Amount</Th><Th className="w-10" /></tr></THead>
            <tbody>
              {lines.map((l, i) => {
                const rate = rateOf(l);
                const amount = rate == null ? null : Math.round(l.qty * rate * (1 - (mode === 'order' ? 0 : l.discPct) / 100) * 100) / 100;
                const src = prices.data?.[l.productId]?.source;
                return (
                  <Tr key={l.key}>
                    <Td><div className="font-medium">{l.name}</div><div className="text-xs text-muted">{l.label ?? ''} · HSN {l.hsn} · GST {l.gstRate}%</div></Td>
                    {mode === 'invoice' && <Td><StockPick line={l} onChange={(p) => update(l.key, p)} /></Td>}
                    <Td><input aria-label={`Quantity for line ${i + 1}`} type="number" min={1} disabled={mode === 'invoice' && l.trackSerial} value={l.qty} onChange={(e) => update(l.key, { qty: Math.max(0, Number(e.target.value)) })} className="h-9 w-20 rounded-md border border-line px-2 text-sm disabled:bg-canvas" /></Td>
                    <Td className="num">
                      {isOwner && mode !== 'order' ? (
                        <input aria-label={`Rate for line ${i + 1}`} type="number" step="0.01" value={l.rate ?? rate ?? ''} onChange={(e) => update(l.key, { rate: e.target.value === '' ? null : Number(e.target.value) })} className="h-9 w-28 rounded-md border border-line px-2 text-right text-sm" />
                      ) : rupees(rate)}
                      {src && src !== 'DEFAULT' && l.rate == null && <div><Badge tone="teal">{src === 'CUSTOMER' ? 'Special price' : 'Price list'}</Badge></div>}
                    </Td>
                    {mode !== 'order' && <Td><input aria-label={`Discount for line ${i + 1}`} type="number" min={0} max={100} step="0.5" value={l.discPct} onChange={(e) => update(l.key, { discPct: Math.min(100, Math.max(0, Number(e.target.value))) })} className="h-9 w-20 rounded-md border border-line px-2 text-sm" /></Td>}
                    <Td className="num font-semibold">{rupees(amount)}</Td>
                    <Td><button aria-label={`Remove line ${i + 1}`} className="rounded p-1.5 text-muted hover:bg-danger-50 hover:text-danger" onClick={() => setLines(lines.filter((x) => x.key !== l.key))}><Trash2 className="size-4" /></button></Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
        {totals && (
          <div className="flex justify-end border-t border-line px-5 py-4">
            <dl className="grid w-72 grid-cols-2 gap-y-1 text-sm">
              <dt className="text-muted">Taxable value</dt><dd className="num">{rupees(totals.taxable)}</dd>
              {totals.taxLines.map((t, i) => <Fragment key={i}><dt className="text-muted">{t.label} @ {t.rate}%</dt><dd className="num">{rupees(t.amount)}</dd></Fragment>)}
              {totals.roundOff !== 0 && <><dt className="text-muted">Round off</dt><dd className="num">{rupees(totals.roundOff)}</dd></>}
              <dt className="border-t border-line pt-1 font-semibold">Total</dt><dd className="num border-t border-line pt-1 text-lg font-semibold">{rupees(totals.total)}</dd>
            </dl>
          </div>
        )}
        {orderValue != null && (
          <div className="flex flex-col items-end border-t border-line px-5 py-4 text-sm">
            <p><span className="font-semibold">Order value</span> <span className="num ml-6 text-lg font-semibold">{rupees(orderValue)}</span></p>
            <p className="text-xs text-muted">At this customer’s prices, before GST. GST is added on the tax invoice.</p>
          </div>
        )}
      </Card>

      {m.error && <Alert>{Object.keys(fe).length && !Object.keys(fe).some((k) => k.startsWith('lines')) ? 'Please correct the highlighted fields.' : errorMessage(m.error)}</Alert>}
      <div className="flex flex-wrap items-center justify-end gap-3">
        {shortSerials.map((l) => { const n = Math.max(1, l.wanted ?? 0) - l.serials.length; return <span key={l.key} className="text-sm text-warn">Tick {n} serial{n === 1 ? '' : 's'} for {l.name}{l.label ? ` ${l.label}` : ''}{l.serials.length === 0 ? ' (or remove the line)' : ''}</span>; })}
        {lines.some((l) => l.qty < 1 && !(mode === 'invoice' && l.trackSerial)) && <span className="text-sm text-warn">Each line needs a quantity of at least 1.</span>}
        {serialProblems && <span className="text-sm text-warn">Each serial-tracked item needs one serial per unit.</span>}
        {noHandler && <span className="text-sm text-warn">Choose who will deliver this order (or “Not assigned yet”).</span>}
        {/* Stays disabled after saving until the new page opens (proformas have no idempotency key, so a second click would save twice). */}
        <Button size="lg" disabled={!customerId || !lines.length || serialProblems || zeroQty || noHandler || m.isSuccess} loading={m.isPending || m.isSuccess} onClick={submit}>{TITLES[mode]}{total != null ? ` · ${rupees(total)}` : ''}</Button>
      </div>
    </div>
  );
}

/** Batch (FEFO by default) or serial selection for one invoice line, from live stock. */
function StockPick({ line, onChange }: { line: BuilderLine; onChange: (p: Partial<BuilderLine>) => void }) {
  const stock = trpc.inventory.productStock.useQuery({ productId: line.productId });
  const v = stock.data?.variants.find((x) => x.id === line.variantId);
  const batches = (v?.batches ?? []).filter((b) => !b.expired);
  if (!v) return <span className="text-xs text-muted">…</span>;
  if (line.trackSerial) {
    const available = batches.flatMap((b) => b.serials.map((s) => ({ s, b })));
    return (
      <div className="flex max-w-80 flex-wrap gap-1">
        {available.length === 0 && line.serials.length === 0 && <span className="text-xs text-danger">No units in stock</span>}
        {available.map(({ s, b }) => {
          const on = line.serials.includes(s);
          return (
            <button key={s} type="button" title={`Batch ${b.batchNo}${b.expiryDate ? `, exp ${formatDate(b.expiryDate)}` : ''}`}
              onClick={() => { const ss = on ? line.serials.filter((x) => x !== s) : [...line.serials, s]; onChange({ serials: ss, qty: ss.length }); }}
              className={cn('rounded-full border px-2 py-0.5 font-mono text-[11px]', on ? 'border-teal bg-aqua-100 text-navy' : 'border-line text-muted hover:border-teal')}>{s}</button>
          );
        })}
      </div>
    );
  }
  const total = batches.reduce((t, b) => t + b.qty, 0);
  return (
    <div>
      <select aria-label={`Batch for ${line.name}`} value={line.batchId ?? ''} onChange={(e) => onChange({ batchId: e.target.value || null })} className="h-9 max-w-64 rounded-md border border-line bg-white px-2 text-sm">
        <option value="">Auto (earliest expiry first)</option>
        {batches.map((b) => <option key={`${b.batchId}-${b.location.id}`} value={b.batchId}>{b.batchNo}{b.expiryDate ? ` · ${formatDate(b.expiryDate)}` : ''} · {b.qty}</option>)}
      </select>
      <div className={cn('text-xs', total < line.qty ? 'text-danger' : 'text-muted')}>{total} in stock</div>
    </div>
  );
}
