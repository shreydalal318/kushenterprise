import { useMemo, useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { computeGst, istDateString } from '@kush/core';
import { Scanner } from '@/components/scanner';
import { Alert, Button, Card, H2, KV, Loading, P, Row, s, Screen, Small } from '@/components/ui';
import { docPath, openPdf } from '@/lib/documents';
import { errorText, newRequestId, rupees } from '@/lib/format';
import { enqueue, isNetworkError } from '@/lib/outbox';
import { C } from '@/lib/theme';
import { trpc } from '@/lib/trpc';

interface Line { key: string; variantId: string; productId: string; name: string; label: string | null; hsn: string; gstRate: number; trackSerial: boolean; qty: number; serials: string[]; batchId: string | null }
const BAD: Record<string, string> = { EXPIRED: 'batch expired', OUT_OF_STOCK: 'out of stock', SERIAL_NOT_IN_STOCK: 'serial not in stock', BATCH_NOT_IN_STOCK: 'that batch is not in stock', INACTIVE: 'inactive item' };

/** Scan-to-invoice at the counter or the hospital: each scan adds the item at this customer's price. */
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
  const shipState = customer?.addresses.find((a) => a.kind === 'SHIPPING' && a.isDefault)?.stateCode ?? customer?.addresses.find((a) => a.kind === 'BILLING')?.stateCode ?? customer?.stateCode;
  const totals = useMemo(() => {
    if (!lines.length || !prices.data || !shipState || lines.some((l) => !prices.data![l.productId])) return null;
    return computeGst(company.data?.stateCode ?? 'XX', shipState, lines.map((l) => ({ qty: l.qty, rate: prices.data![l.productId]!.rate, discPct: 0, hsn: l.hsn, gstRate: l.gstRate })));
  }, [lines, prices.data, shipState, company.data]);

  async function onScan(code: string) {
    if (!customerId) { setMsg({ tone: 'danger', text: 'Choose the customer first' }); return; }
    const r = await utils.scan.resolve.fetch({ code }, { staleTime: 0 }).catch(() => null);
    if (!r) { setMsg({ tone: 'danger', text: 'No connection: billing needs signal to check stock.' }); return; }
    if (!r.found) { setMsg({ tone: 'danger', text: `Unknown barcode ${code}` }); return; }
    const bad = r.warnings.filter((w) => BAD[w]);
    if (bad.length) { setMsg({ tone: 'danger', text: `${r.product.name} ${r.variant.label ?? ''}: ${bad.map((w) => BAD[w]).join(', ')}` }); return; }
    const serial = r.product.trackSerial ? r.serial?.serialNo ?? null : null;
    if (r.product.trackSerial && !serial) { setMsg({ tone: 'warn', text: `${r.product.name}: scan the 2D code on the box so the serial number is recorded` }); return; }
    const cur = ref.current;
    const same = cur.find((l) => l.variantId === r.variant.id && (r.product.trackSerial || l.batchId === (r.batch?.batchId ?? null)));
    if (same) {
      if (serial && same.serials.includes(serial)) { setMsg({ tone: 'warn', text: `Serial ${serial} is already on this bill` }); return; }
      setLines(cur.map((l) => (l === same ? { ...l, qty: l.qty + 1, serials: serial ? [...l.serials, serial] : l.serials } : l)));
    } else {
      const p = await utils.products.get.fetch({ id: r.product.id });
      setLines([...ref.current, { key: `${Date.now()}`, variantId: r.variant.id, productId: r.product.id, name: r.product.name, label: r.variant.label, hsn: p.hsnCode, gstRate: p.gstRate, trackSerial: r.product.trackSerial, qty: 1, serials: serial ? [serial] : [], batchId: r.product.trackSerial ? null : (r.batch?.batchId ?? null) }]);
    }
    setMsg({ tone: 'ok', text: `${r.product.name} ${r.variant.label ?? ''}${r.batch ? ` · ${r.batch.batchNo}` : ''}${serial ? ` · ${serial}` : ''}` });
  }

  async function save() {
    const input = { customerId: customerId!, date: istDateString(), clientRequestId: requestId.current, lines: lines.map((l) => ({ variantId: l.variantId, qty: l.qty, discPct: 0, batchId: l.batchId, serialNos: l.serials })) };
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
      <Button variant="secondary" title="New bill" onPress={() => { setDone(null); setLines([]); setMsg(null); }} />
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
        <Card><Row style={{ justifyContent: 'space-between' }}><View style={{ flex: 1 }}><P style={{ fontWeight: '700' }}>{customer.name}</P><Small>{shipState === company.data?.stateCode ? 'CGST + SGST' : 'IGST'} · terms {customer.paymentTermsDays} days</Small></View><Button variant="secondary" title="Change" onPress={() => { setCustomerId(null); setLines([]); }} /></Row></Card>
      )}
      {customer && <Scanner onScan={onScan} height={180} />}
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      {lines.map((l) => (
        <Card key={l.key}>
          <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}><P style={{ fontWeight: '700' }}>{l.name}</P><Small>{l.label ?? ''}{l.serials.length ? ` · ${l.serials.join(', ')}` : ''}</Small></View>
            <Pressable accessibilityLabel={`Remove ${l.name}`} onPress={() => setLines(lines.filter((x) => x !== l))}><Ionicons name="trash-outline" size={20} color={C.muted} /></Pressable>
          </Row>
          <Row style={{ justifyContent: 'space-between' }}><Small>{l.qty} × {rupees(prices.data?.[l.productId]?.rate)}{prices.data?.[l.productId]?.source === 'CUSTOMER' ? ' (special)' : ''}</Small><P style={{ fontWeight: '700' }}>{rupees(prices.data?.[l.productId] ? l.qty * prices.data[l.productId]!.rate : null)}</P></Row>
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
