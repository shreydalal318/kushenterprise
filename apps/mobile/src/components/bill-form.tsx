import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { computeGst, istDateString } from '@kush/core';
import { readableError } from '@/components/errors';
import { ProductPicker, type Picked } from '@/components/product-picker';
import { Scanner } from '@/components/scanner';
import { Alert, Button, Card, H2, KV, Loading, P, Row, s, Screen, Small } from '@/components/ui';
import { docPath, openPdf, previewHref } from '@/lib/documents';
import { errorText, newRequestId, rupees } from '@/lib/format';
import { enqueue, isNetworkError } from '@/lib/outbox';
import { C } from '@/lib/theme';
import { trpc } from '@/lib/trpc';
import { SuccessScreen } from '@/components/done';

interface Line { key: string; variantId: string; productId: string; name: string; label: string | null; hsn: string; gstRate: number; trackSerial: boolean; qty: number; serials: string[]; batchId: string | null }
const BAD: Record<string, string> = { EXPIRED: 'batch expired', OUT_OF_STOCK: 'out of stock', SERIAL_NOT_IN_STOCK: 'serial not in stock', BATCH_NOT_IN_STOCK: 'that batch is not in stock', INACTIVE: 'inactive item' };
const byExpiry = (a: { expiryDate: string | null }, b: { expiryDate: string | null }) => (a.expiryDate ?? '9999').localeCompare(b.expiryDate ?? '9999');
/** Orders whose invoice was just made here and whose person chose "Send it out": the order screen opens its dispatch form on return. */
export const dispatchNext = new Set<string>();

/**
 * Tax invoice at the counter or the hospital: find products by name (or scan), at this customer's price.
 * With `orderId` (an order's "Make invoice") it starts from the order's customer and the items still
 * to invoice, at the rates locked on the order; `onDone` goes back to that order.
 */
export function BillForm({ orderId, onDone }: { orderId?: string; onDone?: () => void }) {
  const utils = trpc.useUtils();
  const customers = trpc.sales.customers.useQuery();
  const company = trpc.sales.companyReady.useQuery();
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [lines, setLinesState] = useState<Line[]>([]);
  const ref = useRef<Line[]>([]);
  const setLines = (n: Line[]) => { ref.current = n; setLinesState(n); };
  const seq = useRef(0);
  const newKey = () => `${Date.now()}-${seq.current++}`;
  const [msg, setMsg] = useState<{ tone: 'ok' | 'warn' | 'danger'; text: string } | null>(null);
  const [done, setDone] = useState<{ id?: string; number?: string; queued?: boolean } | null>(null);
  const [pdf, setPdf] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  const requestId = useRef(newRequestId('app-inv'));
  const create = trpc.invoices.create.useMutation();
  const customer = customers.data?.find((c) => c.id === customerId);
  const prices = trpc.sales.prices.useQuery({ customerId: customerId ?? '', productIds: [...new Set(lines.map((l) => l.productId))] }, { enabled: !!customerId && lines.length > 0 });

  const order = trpc.orders.get.useQuery({ id: orderId ?? '' }, { enabled: !!orderId });
  const orderRate = useMemo(() => new Map((order.data?.lines ?? []).map((l) => [l.variant.id, l.rate])), [order.data]);
  const [prefill, setPrefill] = useState<'loading' | 'failed' | null>(null);
  const prefilled = useRef<string | null>(null);
  useEffect(() => {
    if (!orderId || prefilled.current === orderId) return;
    prefilled.current = orderId;
    void fromOrder(orderId);
  }, [orderId]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * The order's customer and what is still to invoice, added to whatever is already on the bill. Lenses
   * take the earliest-expiring serials in stock; other items are capped at unexpired stock.
   */
  async function fromOrder(id: string) {
    setPrefill('loading'); setMsg(null);
    try {
      const o = await utils.orders.get.fetch({ id }, { staleTime: 0 });
      setCustomerId(o.customer.id);
      const todo = o.lines.filter((l) => l.backorder > 0);
      // An item can sit on two order lines: invoice it once, for both.
      const due = new Map<string, number>();
      for (const l of todo) due.set(l.variant.id, (due.get(l.variant.id) ?? 0) + l.backorder);
      const info = await Promise.all(todo.filter((l, i) => todo.findIndex((x) => x.variant.id === l.variant.id) === i).map(async (l) => {
        const [p, st] = await Promise.all([utils.products.get.fetch({ id: l.variant.product.id }), utils.inventory.productStock.fetch({ productId: l.variant.product.id }, { staleTime: 0 })]);
        return { l, p, batches: (st.variants.find((x) => x.id === l.variant.id)?.batches ?? []).filter((b) => !b.expired).sort(byExpiry) };
      }));
      // Read the lines only now: anything added while the stock loaded is kept and counted.
      let next = ref.current;
      const short: string[] = [];
      for (const { l, p, batches } of info) {
        const mine = next.filter((x) => x.variantId === l.variant.id);
        const onBill = mine.reduce((t, x) => t + x.qty, 0);
        const want = due.get(l.variant.id)! - onBill;
        if (want <= 0) continue;
        let serials: string[] = [];
        let have: number;
        if (p.trackSerial) {
          const used = new Set(next.flatMap((x) => x.serials));
          serials = batches.flatMap((b) => b.serials).filter((x) => !used.has(x)).slice(0, want);
          have = serials.length;
        } else have = Math.max(0, batches.reduce((t, b) => t + b.qty - b.reserved, 0) - onBill);
        const qty = Math.min(want, have);
        const name = `${p.name}${l.variant.label ? ` ${l.variant.label}` : ''}`;
        if (qty < want) short.push(have ? `only ${have} of ${want} ${name} in stock` : `no ${name} in stock (${want} to invoice)`);
        if (qty <= 0) continue;
        const same = mine.find((x) => p.trackSerial || x.batchId === null);
        next = same
          ? next.map((x) => (x === same ? { ...x, qty: x.qty + qty, serials: [...x.serials, ...serials] } : x))
          : [...next, { key: newKey(), variantId: l.variant.id, productId: p.id, name: p.name, label: l.variant.label, hsn: p.hsnCode, gstRate: p.gstRate, trackSerial: p.trackSerial, qty, serials, batchId: null }];
      }
      setLines(next);
      setMsg(!todo.length ? { tone: 'warn', text: `Everything on order ${o.number} is already invoiced.` }
        : short.length ? { tone: 'warn', text: `Not enough stock: ${short.join('; ')}. The rest stays on the order to invoice later.` }
          : { tone: 'ok', text: `Items from order ${o.number}. Check them and save.` });
      setPrefill(null);
    } catch (e) {
      setPrefill('failed');
      setMsg({ tone: 'danger', text: `Could not load the items from the order. ${readableError(e)}` });
    }
  }

  const rateOf = (l: Line) => orderRate.get(l.variantId) ?? prices.data?.[l.productId]?.rate;
  const shipState = customer?.addresses.find((a) => a.kind === 'SHIPPING' && a.isDefault)?.stateCode ?? customer?.addresses.find((a) => a.kind === 'BILLING')?.stateCode ?? customer?.stateCode;
  const totals = useMemo(() => {
    const rate = (l: Line) => orderRate.get(l.variantId) ?? prices.data?.[l.productId]?.rate;
    if (!lines.length || !shipState || lines.some((l) => rate(l) == null)) return null;
    return computeGst(company.data?.stateCode ?? 'XX', shipState, lines.map((l) => ({ qty: l.qty, rate: rate(l)!, discPct: 0, hsn: l.hsn, gstRate: l.gstRate })));
  }, [lines, prices.data, shipState, company.data, orderRate]);

  const [scanOpen, setScanOpen] = useState(false);
  const taken = useMemo(() => new Set(lines.flatMap((l) => l.serials)), [lines]);

  /** One unit onto the bill, from the product list or a scan. */
  async function addItem(it: Picked & { batchId: string | null; batchNo?: string | null }) {
    const cur = ref.current;
    const same = cur.find((l) => l.variantId === it.variantId && (it.trackSerial || l.batchId === it.batchId));
    if (same) {
      if (it.serial && same.serials.includes(it.serial)) { setMsg({ tone: 'warn', text: `Serial ${it.serial} is already on this bill` }); return; }
      setLines(cur.map((l) => (l === same ? { ...l, qty: l.qty + 1, serials: it.serial ? [...l.serials, it.serial] : l.serials } : l)));
    } else {
      const p = await utils.products.get.fetch({ id: it.productId });
      setLines([...ref.current, { key: newKey(), variantId: it.variantId, productId: it.productId, name: it.productName, label: it.label, hsn: p.hsnCode, gstRate: p.gstRate, trackSerial: it.trackSerial, qty: 1, serials: it.serial ? [it.serial] : [], batchId: it.trackSerial ? null : it.batchId }]);
    }
    setMsg({ tone: 'ok', text: `Added ${it.productName} ${it.label ?? ''}${it.batchNo ? ` · ${it.batchNo}` : ''}${it.serial ? ` · ${it.serial}` : ''}` });
  }

  function onPick(p: Picked) {
    if (p.trackSerial && !p.serial) { setMsg({ tone: 'warn', text: `${p.productName} ${p.label ?? ''}: every unit in stock is already on this bill` }); return; }
    void addItem({ ...p, batchId: null });
  }

  async function onScan(code: string) {
    if (!customerId) { setMsg({ tone: 'danger', text: 'Choose the customer first' }); return; }
    const r = await utils.scan.resolve.fetch({ code }, { staleTime: 0 }).catch(() => null);
    if (!r) { setMsg({ tone: 'danger', text: 'No connection: billing needs signal to check stock.' }); return; }
    if (!r.found) { setMsg({ tone: 'danger', text: `Unknown barcode ${code}. Find the product by name instead.` }); return; }
    const bad = r.warnings.filter((w) => BAD[w]);
    if (bad.length) { setMsg({ tone: 'danger', text: `${r.product.name} ${r.variant.label ?? ''}: ${bad.map((w) => BAD[w]).join(', ')}` }); return; }
    const serial = r.product.trackSerial ? r.serial?.serialNo ?? null : null;
    if (r.product.trackSerial && !serial) { setMsg({ tone: 'warn', text: `${r.product.name}: scan the 2D code on the box for the serial number, or find the product by name` }); return; }
    await addItem({ productId: r.product.id, productName: r.product.name, trackSerial: r.product.trackSerial, trackBatch: r.product.trackBatch, trackExpiry: r.product.trackExpiry, variantId: r.variant.id, label: r.variant.label, serial, batchId: r.product.trackSerial ? null : (r.batch?.batchId ?? null), batchNo: r.batch?.batchNo ?? null });
  }
  const setQty = (l: Line, q: number) => setLines(q <= 0 ? lines.filter((x) => x !== l) : lines.map((x) => (x === l ? { ...x, qty: q } : x)));

  async function save() {
    const input = { customerId: customerId!, orderId: orderId ?? null, date: istDateString(), clientRequestId: requestId.current, lines: lines.map((l) => ({ variantId: l.variantId, qty: l.qty, discPct: 0, batchId: l.batchId, serialNos: l.serials })) };
    try {
      const r = await create.mutateAsync(input);
      setDone({ id: r.id, number: r.number });
      // The order is now packed with less left to invoice, and stock went down.
      void utils.orders.invalidate(); void utils.inventory.invalidate();
    } catch (e) {
      if (!isNetworkError(e)) return;
      await enqueue({ kind: 'createInvoice', label: `Invoice for ${customer?.name ?? 'customer'} (${lines.length} line(s))`, input });
      setDone({ queued: true });
    }
    requestId.current = newRequestId('app-inv');
  }

  async function sharePdf(id: string, number?: string) {
    setPdf({ busy: true, error: null });
    try {
      await openPdf(docPath('invoice', id), `${number ?? 'invoice'}.pdf`);
      setPdf({ busy: false, error: null });
    } catch (e) {
      const t = errorText(e);
      setPdf({ busy: false, error: /pdf/i.test(t) ? t : `Could not open the PDF. ${t}` });
    }
  }

  function newBill() { setDone(null); setLines([]); setMsg(null); setCustomerId(null); setPdf({ busy: false, error: null }); create.reset(); }

  if (done) return (
    <SuccessScreen waiting={done.queued} title={done.queued ? 'Saved on this phone' : 'Invoice made'}
      lines={done.queued
        ? ['No connection right now.', 'The invoice will be made by itself when you are back online.']
        : [done.number ? `Invoice ${done.number}` : 'Invoice made', 'Stock is updated.', !!orderId && 'Next: send it out.']}
      footer={<>
        {!!pdf.error && <Alert>{pdf.error}</Alert>}
        {orderId
          ? <Button title={done.id ? 'Send it out (dispatch)' : 'Back to the order'} onPress={() => { if (done.id) dispatchNext.add(orderId); void utils.orders.invalidate(); onDone?.(); }} />
          : done.id ? <Button title="View invoice" icon={<Ionicons name="eye-outline" size={18} color={C.white} />} onPress={() => router.push(previewHref('invoice', done.id!, done.number ?? ''))} /> : null}
        {/* See it as it prints before sending it; Share PDF is on that screen too. */}
        {!!orderId && !!done.id && <Button title="View invoice" variant="secondary" icon={<Ionicons name="eye-outline" size={18} color={C.ink} />} onPress={() => router.push(previewHref('invoice', done.id!, done.number ?? ''))} />}
        {!!done.id && <Button title="Share / print PDF" variant="secondary" icon={<Ionicons name="share-outline" size={18} color={C.ink} />} loading={pdf.busy} onPress={() => void sharePdf(done.id!, done.number)} />}
        {!orderId && <Button variant="secondary" title="New bill" onPress={newBill} />}
      </>} />
  );
  if (!customers.data) return customers.error ? <Screen><Alert>{readableError(customers.error)}</Alert></Screen> : <Loading />;
  return (
    <Screen footer={customer && (
      <>
        {create.error && !isNetworkError(create.error) && <Alert>{readableError(create.error)}</Alert>}
        {!lines.length && prefill !== 'loading' && <Small style={{ textAlign: 'center' }}>To save: add at least one item.</Small>}
        <Button title={`Save invoice${totals ? ` · ${rupees(totals.total)}` : ''}`} loading={create.isPending} disabled={prefill === 'loading' || !lines.length} onPress={() => void save()} />
      </>
    )}>
      {company.data && !company.data.ready && <Alert tone="warn">Set the company state in Settings → Company (web) before billing.</Alert>}
      {prefill === 'loading' && <Card><Loading /><Small style={{ textAlign: 'center' }}>Loading the items still to invoice on this order…</Small></Card>}
      {!customer ? (
        !orderId && (
          <Card>
            <H2>Customer</H2>
            <TextInput accessibilityLabel="Search customers" value={search} onChangeText={setSearch} placeholder="Search name or code" style={s.input} placeholderTextColor="#9aa5b1" />
            {customers.data.filter((c) => !search || `${c.name} ${c.code}`.toLowerCase().includes(search.toLowerCase())).slice(0, 12).map((c) => (
              <Pressable key={c.id} accessibilityRole="button" onPress={() => setCustomerId(c.id)} style={{ paddingVertical: 8 }}><P>{c.name}</P><Small>{c.code} · {c.paymentTermsDays} days</Small></Pressable>
            ))}
          </Card>
        )
      ) : (
        <Card><Row style={{ justifyContent: 'space-between' }}><View style={{ flex: 1 }}><P style={{ fontWeight: '700' }}>{customer.name}</P><Small>{shipState === company.data?.stateCode ? 'CGST + SGST' : 'IGST'} · terms {customer.paymentTermsDays} days</Small></View>{orderId ? <Small>Order {order.data?.number ?? ''}</Small> : <Button variant="secondary" title="Change" onPress={() => { setCustomerId(null); setLines([]); }} />}</Row></Card>
      )}
      {customer && (
        <Card>
          <H2>Add items</H2>
          <ProductPicker onPick={onPick} taken={taken} />
          <Button variant="secondary" title={scanOpen ? 'Close scanner' : 'Scan a barcode instead'} onPress={() => setScanOpen(!scanOpen)} />
          {scanOpen && <Scanner onScan={onScan} height={180} startCamera />}
        </Card>
      )}
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      {!!(prefill === 'failed' && orderId) && <Button variant="secondary" title="Try again" onPress={() => void fromOrder(orderId)} />}
      {lines.map((l) => (
        <Card key={l.key}>
          <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}><P style={{ fontWeight: '700' }}>{l.name}</P><Small>{l.label ?? ''}{l.serials.length ? ` · ${l.serials.join(', ')}` : ''}</Small></View>
            <Pressable accessibilityLabel={`Remove ${l.name}`} onPress={() => setLines(lines.filter((x) => x !== l))}><Ionicons name="trash-outline" size={20} color={C.muted} /></Pressable>
          </Row>
          <Row style={{ justifyContent: 'space-between' }}>
            {l.trackSerial
              ? <Small>{l.qty} × {rupees(rateOf(l))}{orderRate.has(l.variantId) ? ' (order rate)' : prices.data?.[l.productId]?.source === 'CUSTOMER' ? ' (special)' : ''}</Small>
              : <Row style={{ gap: 6 }}>
                  <Pressable accessibilityRole="button" accessibilityLabel={`One less ${l.name}`} onPress={() => setQty(l, l.qty - 1)} style={step}><Ionicons name="remove" size={16} color={C.teal700} /></Pressable>
                  <P style={{ minWidth: 24, textAlign: 'center', fontWeight: '700' }}>{l.qty}</P>
                  <Pressable accessibilityRole="button" accessibilityLabel={`One more ${l.name}`} onPress={() => setQty(l, l.qty + 1)} style={step}><Ionicons name="add" size={16} color={C.teal700} /></Pressable>
                  <Small>× {rupees(rateOf(l))}</Small>
                </Row>}
            <P style={{ fontWeight: '700' }}>{rupees(rateOf(l) != null ? l.qty * rateOf(l)! : null)}</P>
          </Row>
        </Card>
      ))}
      {totals && (
        <Card>
          <KV k="Taxable" v={rupees(totals.taxable)} />
          {totals.taxLines.map((t) => <KV key={t.label} k={`${t.label} @ ${t.rate}%`} v={rupees(t.amount)} />)}
          {totals.roundOff !== 0 && <KV k="Round off" v={rupees(totals.roundOff)} />}
          <KV k="Total" v={rupees(totals.total)} />
        </Card>
      )}
    </Screen>
  );
}
const step = { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: C.teal700, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: C.white };
