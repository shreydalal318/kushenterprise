import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { computeGst, istDateString } from '@kush/core';
import { ProductPicker, type Picked } from '@/components/product-picker';
import { Scanner } from '@/components/scanner';
import { Alert, Button, Card, H2, KV, Loading, P, Row, s, Screen, Small } from '@/components/ui';
import { docPath, openPdf } from '@/lib/documents';
import { errorText, newRequestId, rupees } from '@/lib/format';
import { enqueue, isNetworkError } from '@/lib/outbox';
import { C } from '@/lib/theme';
import { trpc } from '@/lib/trpc';

interface Line { key: string; variantId: string; productId: string; name: string; label: string | null; hsn: string; gstRate: number; trackSerial: boolean; qty: number; serials: string[]; batchId: string | null }
const BAD: Record<string, string> = { EXPIRED: 'batch expired', OUT_OF_STOCK: 'out of stock', SERIAL_NOT_IN_STOCK: 'serial not in stock', BATCH_NOT_IN_STOCK: 'that batch is not in stock', INACTIVE: 'inactive item' };

/** Tax invoice at the counter or the hospital: find products by name (or scan), at this customer's price. */
export default function Bill() {
  const utils = trpc.useUtils();
  const customers = trpc.sales.customers.useQuery();
  const company = trpc.sales.companyReady.useQuery();
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [lines, setLinesState] = useState<Line[]>([]);
  const ref = useRef<Line[]>([]);
  const setLines = (n: Line[]) => { ref.current = n; setLinesState(n); };
  const [msg, setMsg] = useState<{ tone: 'ok' | 'warn' | 'danger'; text: string } | null>(null);
  const [done, setDone] = useState<{ id?: string; number?: string; queued?: boolean } | null>(null);
  const requestId = useRef(newRequestId('app-inv'));
  const create = trpc.invoices.create.useMutation();
  const customer = customers.data?.find((c) => c.id === customerId);
  const prices = trpc.sales.prices.useQuery({ customerId: customerId ?? '', productIds: [...new Set(lines.map((l) => l.productId))] }, { enabled: !!customerId && lines.length > 0 });

  // Opened from an order ("Make tax invoice"): the order's customer and remaining items, at the
  // rates locked on the order; lenses take the earliest-expiring serials in stock.
  const { orderId } = useLocalSearchParams<{ orderId?: string }>();
  const order = trpc.orders.get.useQuery({ id: orderId ?? '' }, { enabled: !!orderId });
  const orderRate = useMemo(() => new Map((order.data?.lines ?? []).map((l) => [l.variant.id, l.rate])), [order.data]);
  const prefilled = useRef<string | null>(null);
  useEffect(() => {
    if (!orderId || !order.data || prefilled.current === orderId) return;
    prefilled.current = orderId;
    const o = order.data;
    setCustomerId(o.customer.id);
    void (async () => {
      const out: Line[] = [];
      const short: string[] = [];
      for (const l of o.lines.filter((x) => x.backorder > 0)) {
        const p = await utils.products.get.fetch({ id: l.variant.product.id });
        let serials: string[] = [];
        if (p.trackSerial) {
          const st = await utils.inventory.productStock.fetch({ productId: p.id });
          const v = st.variants.find((x) => x.id === l.variant.id);
          const avail = (v?.batches ?? []).filter((b) => !b.expired).sort((a, b) => (a.expiryDate ?? '9999').localeCompare(b.expiryDate ?? '9999')).flatMap((b) => b.serials);
          serials = avail.filter((x) => !out.some((ln) => ln.serials.includes(x))).slice(0, l.backorder);
          if (serials.length < l.backorder) short.push(`${p.name} ${l.variant.label ?? ''}: ${serials.length} of ${l.backorder} in stock`);
          if (!serials.length) continue;
        }
        out.push({ key: l.id, variantId: l.variant.id, productId: p.id, name: p.name, label: l.variant.label, hsn: p.hsnCode, gstRate: p.gstRate, trackSerial: p.trackSerial, qty: p.trackSerial ? serials.length : l.backorder, serials, batchId: null });
      }
      setLines(out);
      setMsg(short.length ? { tone: 'warn', text: `Not enough stock: ${short.join('; ')}. The rest stays on the order to send later.` } : { tone: 'ok', text: `Items from order ${o.number}. Check them and save.` });
    })();
  }, [orderId, order.data]); // eslint-disable-line react-hooks/exhaustive-deps
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
      setLines([...ref.current, { key: `${Date.now()}`, variantId: it.variantId, productId: it.productId, name: it.productName, label: it.label, hsn: p.hsnCode, gstRate: p.gstRate, trackSerial: it.trackSerial, qty: 1, serials: it.serial ? [it.serial] : [], batchId: it.trackSerial ? null : it.batchId }]);
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
    await addItem({ productId: r.product.id, productName: r.product.name, trackSerial: r.product.trackSerial, variantId: r.variant.id, label: r.variant.label, serial, batchId: r.product.trackSerial ? null : (r.batch?.batchId ?? null), batchNo: r.batch?.batchNo ?? null });
  }
  const setQty = (l: Line, q: number) => setLines(q <= 0 ? lines.filter((x) => x !== l) : lines.map((x) => (x === l ? { ...x, qty: q } : x)));

  async function save() {
    const input = { customerId: customerId!, orderId: orderId ?? null, date: istDateString(), clientRequestId: requestId.current, lines: lines.map((l) => ({ variantId: l.variantId, qty: l.qty, discPct: 0, batchId: l.batchId, serialNos: l.serials })) };
    try {
      const r = await create.mutateAsync(input);
      setDone({ id: r.id, number: r.number });
    } catch (e) {
      if (!isNetworkError(e)) return;
      await enqueue({ kind: 'createInvoice', label: `Invoice for ${customer?.name ?? 'customer'} (${lines.length} line(s))`, input });
      setDone({ queued: true });
    }
    requestId.current = newRequestId('app-inv');
  }

  if (done) return (
    <Screen>
      {done.queued ? <Alert tone="warn">No connection. The invoice is saved on this phone and will be issued automatically when you are back online.</Alert> : <Alert tone="ok">Invoice {done.number} saved. Stock is updated.</Alert>}
      {done.id && <Button title="Share / print PDF" onPress={() => void openPdf(docPath('invoice', done.id!), `${done.number}.pdf`)} />}
      {orderId && done.id && <Button title="Dispatch this order" onPress={() => { void utils.orders.invalidate(); router.replace(`/staff/order/${orderId}`); }} />}
      <Button variant="secondary" title="New bill" onPress={() => { setDone(null); setLines([]); setMsg(null); setCustomerId(null); prefilled.current = null; if (orderId) router.replace('/staff/bill'); }} />
    </Screen>
  );
  if (!customers.data) return <Loading />;
  return (
    <Screen>
      {company.data && !company.data.ready && <Alert tone="warn">Set the company state in Settings → Company (web) before billing.</Alert>}
      {!customer ? (
        <Card>
          <H2>Customer</H2>
          <TextInput accessibilityLabel="Search customers" value={search} onChangeText={setSearch} placeholder="Search name or code" style={s.input} placeholderTextColor="#9aa5b1" />
          {customers.data.filter((c) => !search || `${c.name} ${c.code}`.toLowerCase().includes(search.toLowerCase())).slice(0, 12).map((c) => (
            <Pressable key={c.id} accessibilityRole="button" onPress={() => setCustomerId(c.id)} style={{ paddingVertical: 8 }}><P>{c.name}</P><Small>{c.code} · {c.paymentTermsDays} days</Small></Pressable>
          ))}
        </Card>
      ) : (
        <Card><Row style={{ justifyContent: 'space-between' }}><View style={{ flex: 1 }}><P style={{ fontWeight: '700' }}>{customer.name}</P><Small>{shipState === company.data?.stateCode ? 'CGST + SGST' : 'IGST'} · terms {customer.paymentTermsDays} days</Small></View>{orderId ? <Small>Order {order.data?.number ?? ''}</Small> : <Button variant="secondary" title="Change" onPress={() => { setCustomerId(null); setLines([]); }} />}</Row></Card>
      )}
      {customer && (
        <Card>
          <H2>Add items</H2>
          <ProductPicker onPick={onPick} taken={taken} />
          <Button variant="secondary" title={scanOpen ? 'Close scanner' : 'Scan a barcode instead'} onPress={() => setScanOpen(!scanOpen)} />
          {scanOpen && <Scanner onScan={onScan} height={180} />}
        </Card>
      )}
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
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
      {create.error && !isNetworkError(create.error) && <Alert>{errorText(create.error)}</Alert>}
      {lines.length > 0 && <Button title={`Save tax invoice${totals ? ` · ${rupees(totals.total)}` : ''}`} loading={create.isPending} onPress={() => void save()} />}
    </Screen>
  );
}
const step = { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: C.teal700, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: C.white };
