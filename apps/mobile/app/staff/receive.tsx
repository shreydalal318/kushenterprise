import { useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { formatDate, istDateString } from '@kush/core';
import { readableError } from '@/components/errors';
import { ProductPicker, type Picked } from '@/components/product-picker';
import { Scanner } from '@/components/scanner';
import { Alert, Button, Card, Field, H2, Loading, P, Row, s, Screen, Small } from '@/components/ui';
import { C } from '@/lib/theme';
import { trpc, type RouterOutputs } from '@/lib/trpc';
import { Done } from '@/components/done';

type PoLine = RouterOutputs['purchaseOrders']['open'][number]['lines'][number];
interface Item { variantId: string; name: string; label: string | null; trackBatch: boolean; trackExpiry: boolean; trackSerial: boolean }
/** `qty` stays as typed (backspace mustn't snap it to 1) and is checked on save. */
interface Line extends Item { key: string; batchNo: string; expiryDate: string; serials: string[]; qty: string }
const int = (v: string) => (/^\d+$/.test(v.trim()) ? Number(v.trim()) : 0);
/** What goes to the server: serial-tracked items are received one unit per serial number. */
const sentQty = (l: Line) => (l.trackSerial ? l.serials.length : int(l.qty));
const nameOf = (l: { name: string; label: string | null }) => `${l.name}${l.label ? ` ${l.label}` : ''}`;

/**
 * Receive goods: pick items by name or scan them (GS1 codes fill batch, expiry and serial), optionally against an open PO.
 * ?supplierId=…&poId=… (from a purchase order's "Receive goods") opens with that supplier and PO chosen.
 */
export default function Receive() {
  const params = useLocalSearchParams<{ supplierId?: string; poId?: string }>();
  const utils = trpc.useUtils();
  const suppliers = trpc.suppliers.list.useQuery();
  const [supplierId, setSupplierId] = useState<string | null>(params.supplierId ?? null);
  const [poId, setPoId] = useState<string | null>(params.supplierId ? params.poId ?? null : null);
  const [invNo, setInvNo] = useState('');
  const pos = trpc.purchaseOrders.open.useQuery({ supplierId: supplierId ?? '' }, { enabled: !!supplierId });
  const po = pos.data?.find((p) => p.id === poId);
  const [lines, setLinesState] = useState<Line[]>([]);
  const [blocked, setBlocked] = useState<string | null>(null);
  const ref = useRef<Line[]>([]);
  const setLines = (n: Line[]) => { ref.current = n; setLinesState(n); setBlocked(null); };
  const seq = useRef(0);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'warn' | 'danger'; text: string } | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [serialFor, setSerialFor] = useState<string | null>(null); // the line whose serial numbers the camera is filling
  const grn = trpc.inventory.createGrn.useMutation({ onSuccess: () => { setLines([]); setPoId(null); setInvNo(''); setMsg(null); setSerialFor(null); void utils.purchaseOrders.invalidate(); void utils.inventory.invalidate(); } });
  const update = (key: string, p: Partial<Line>) => setLines(ref.current.map((l) => (l.key === key ? { ...l, ...p } : l)));

  /** Units onto the receipt: the line with the same item and batch, or a new one. */
  function add(it: Item, n: number, got: { batchNo?: string; expiryDate?: string; serial?: string } = {}) {
    if (po && !po.lines.some((l) => l.variantId === it.variantId)) { setMsg({ tone: 'danger', text: `${nameOf(it)} is not on ${po.number}` }); return false; }
    const cur = ref.current;
    const { batchNo = '', expiryDate = '', serial } = got;
    if (serial && cur.some((l) => l.variantId === it.variantId && l.serials.includes(serial))) { setMsg({ tone: 'warn', text: `Serial ${serial} is already on this receipt` }); return false; }
    // A scanned serial also fills a line that is still waiting for its serials (e.g. one filled from the PO).
    const same = cur.find((l) => l.variantId === it.variantId && l.batchNo === batchNo) ?? (serial ? cur.find((l) => l.variantId === it.variantId && !l.batchNo) : undefined);
    if (same) {
      const serials = serial ? [...same.serials, serial] : same.serials;
      setLines(cur.map((l) => (l === same ? { ...l, serials, batchNo: l.batchNo || batchNo, expiryDate: l.expiryDate || expiryDate, qty: String(serial ? Math.max(int(l.qty), serials.length) : int(l.qty) + n) } : l)));
    } else setLines([...cur, { key: `${Date.now()}-${seq.current++}`, ...it, batchNo, expiryDate, serials: serial ? [serial] : [], qty: String(n) }]);
    return true;
  }

  function onPick(p: Picked) {
    const it = { variantId: p.variantId, name: p.productName, label: p.label, trackBatch: p.trackBatch, trackExpiry: p.trackExpiry, trackSerial: p.trackSerial };
    if (add(it, 1)) setMsg({ tone: 'ok', text: `Added ${nameOf(it)}${p.trackSerial ? '. Enter or scan its serial number below.' : ''}` });
  }

  /** Tapping a PO line receives everything still due on it. */
  function fillDue(l: PoLine) {
    const it = { variantId: l.variantId, name: l.productName, label: l.label, trackBatch: l.trackBatch, trackExpiry: l.trackExpiry, trackSerial: l.trackSerial };
    const due = l.pending - ref.current.filter((x) => x.variantId === l.variantId).reduce((t, x) => t + int(x.qty), 0);
    if (due <= 0) { setMsg({ tone: 'warn', text: `All ${l.pending} of ${nameOf(it)} are already on this receipt` }); return; }
    if (add(it, due)) setMsg({ tone: 'ok', text: `${nameOf(it)}: ${due} added${l.trackSerial ? '. Enter or scan their serial numbers below.' : ''}` });
  }

  function addSerial(key: string, raw: string, got: { batchNo?: string; expiryDate?: string } = {}) {
    const serial = raw.trim().toUpperCase();
    const l = ref.current.find((x) => x.key === key);
    if (!serial || !l) return;
    if (ref.current.some((x) => x.variantId === l.variantId && x.serials.includes(serial))) { setMsg({ tone: 'warn', text: `Serial ${serial} is already on this receipt` }); return; }
    const serials = [...l.serials, serial];
    const qty = Math.max(int(l.qty), serials.length);
    update(key, { serials, qty: String(qty), batchNo: l.batchNo || got.batchNo || '', expiryDate: l.expiryDate || got.expiryDate || '' });
    setMsg({ tone: 'ok', text: `${nameOf(l)}: serial ${serial} (${serials.length} of ${qty})` });
  }

  async function onScan(code: string) {
    const r = await utils.scan.resolve.fetch({ code }, { staleTime: 0 }).catch(() => null);
    if (!r) { setMsg({ tone: 'danger', text: 'No connection.' }); return; }
    const batchNo = r.parsed?.batch?.toUpperCase() ?? '';
    const expiryDate = r.parsed?.expiry ?? '';
    if (expiryDate && expiryDate < istDateString()) { setMsg({ tone: 'danger', text: `Batch ${batchNo} expired on ${formatDate(expiryDate)}. Do not accept.` }); return; }
    const target = serialFor ? ref.current.find((l) => l.key === serialFor) : undefined;
    if (target) {
      // Filling one line's serials: a GS1 code gives its serial; a code the system doesn't know is the serial itself.
      if (r.found && r.variant.id !== target.variantId) { setMsg({ tone: 'danger', text: `That box is ${r.product.name} ${r.variant.label ?? ''}, not ${nameOf(target)}` }); return; }
      const serial = r.found || r.parsed ? r.parsed?.serial : code;
      if (!serial) { setMsg({ tone: 'warn', text: 'That code has no serial number. Scan the serial barcode on the box, or type the number.' }); return; }
      addSerial(target.key, serial, { batchNo, expiryDate });
      return;
    }
    if (!r.found) { setMsg({ tone: 'danger', text: `Unknown barcode ${code}. Find the product by name instead.` }); return; }
    const serial = r.product.trackSerial ? r.parsed?.serial?.toUpperCase() || undefined : undefined;
    const it = { variantId: r.variant.id, name: r.product.name, label: r.variant.label, trackBatch: r.product.trackBatch, trackExpiry: r.product.trackExpiry, trackSerial: r.product.trackSerial };
    if (add(it, 1, { batchNo, expiryDate, serial })) setMsg({ tone: 'ok', text: `${nameOf(it)}${batchNo ? ` · ${batchNo}` : ''}${serial ? ` · ${serial}` : r.product.trackSerial ? '. Enter its serial number below.' : ''}` });
  }

  function save() {
    const today = istDateString();
    const problems = lines.flatMap((l) => {
      const n = int(l.qty);
      const exp = l.expiryDate.trim();
      return [
        n < 1 ? `${nameOf(l)}: enter the quantity received.` : l.trackSerial && l.serials.length !== n ? `${nameOf(l)}: ${n} unit(s) but ${l.serials.length} serial number(s). Enter one serial number per unit.` : null,
        exp && !/^\d{4}-\d{2}-\d{2}$/.test(exp) ? `${nameOf(l)}: write the expiry as YYYY-MM-DD.` : exp && exp < today ? `${nameOf(l)}: expired on ${formatDate(exp)}. Do not accept.` : null,
      ].filter((x): x is string => !!x);
    });
    if (problems.length) { setBlocked(problems.join('\n')); return; }
    grn.mutate({ supplierId: supplierId!, poId, date: today, supplierInvoiceNo: invNo.trim() || null, lines: lines.map((l) => ({ variantId: l.variantId, batchNo: l.batchNo.trim() || null, expiryDate: l.expiryDate.trim() || null, mfgDate: null, serialNos: l.trackSerial ? l.serials : [], qty: sentQty(l), rate: null })) });
  }

  if (!suppliers.data) return suppliers.error ? <Screen><Alert>{readableError(suppliers.error)}</Alert></Screen> : <Loading />;
  const sup = suppliers.data.find((x) => x.id === supplierId);
  const units = lines.reduce((t, l) => t + sentQty(l), 0);
  return (
    <Screen>
      <Done message={grn.data && !lines.length ? `Goods received ✓ ${grn.data.number}: ${grn.data.units} unit(s)${grn.data.po ? ` against ${grn.data.po.number}` : ''}. Stock is updated.` : null} />
      {!sup ? (
        <Card><H2>Supplier</H2>{suppliers.data.map((x) => <Pressable key={x.id} accessibilityRole="button" onPress={() => setSupplierId(x.id)} style={{ paddingVertical: 8 }}><P>{x.name}</P></Pressable>)}</Card>
      ) : (
        <Card>
          <Row style={{ justifyContent: 'space-between' }}><P style={{ fontWeight: '700', flex: 1 }}>{sup.name}</P><Button variant="secondary" title="Change" onPress={() => { setSupplierId(null); setPoId(null); setLines([]); setSerialFor(null); }} /></Row>
          {!!pos.data?.length && (
            <View style={{ gap: 4 }}>
              <Small>Against purchase order</Small>
              {[{ id: null as string | null, number: 'No PO' }, ...pos.data].map((p) => (
                <Pressable key={p.id ?? 'none'} accessibilityRole="radio" accessibilityState={{ selected: poId === p.id }} onPress={() => setPoId(p.id)} style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <Ionicons name={poId === p.id ? 'radio-button-on' : 'radio-button-off'} size={20} color={C.teal700} /><P>{p.number}</P>
                </Pressable>
              ))}
            </View>
          )}
          <TextInput accessibilityLabel="Supplier invoice no." value={invNo} onChangeText={setInvNo} placeholder="Supplier invoice no. (optional)" style={s.input} placeholderTextColor="#9aa5b1" />
        </Card>
      )}
      {po && (
        <Card>
          <Small>Still due on {po.number}. Tap an item to receive all that is due.</Small>
          {po.lines.map((l) => {
            const have = lines.filter((x) => x.variantId === l.variantId).reduce((t, x) => t + int(x.qty), 0);
            return (
              <Pressable key={l.id} accessibilityRole="button" accessibilityLabel={`Receive ${l.productName} ${l.label ?? ''}: ${have} of ${l.pending}`} onPress={() => fillDue(l)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 }}>
                <Ionicons name="add-circle-outline" size={20} color={C.teal700} />
                <Small style={{ flex: 1 }}>{l.productName} {l.label ?? ''}</Small>
                <P style={{ fontWeight: '700', color: have > l.pending ? C.danger : have === l.pending ? C.ok : C.muted }}>{have} / {l.pending}</P>
              </Pressable>
            );
          })}
        </Card>
      )}
      {sup && (
        <Card>
          <H2>Add items</H2>
          <ProductPicker onPick={onPick} allSizes />
          <Button variant="secondary" title={scanOpen ? 'Close scanner' : 'Scan barcode'} onPress={() => { setScanOpen(!scanOpen); setSerialFor(null); }} />
          {scanOpen && <Scanner onScan={onScan} height={180} startCamera />}
        </Card>
      )}
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      {lines.map((l) => (
        <Card key={l.key}>
          <Row style={{ justifyContent: 'space-between' }}><P style={{ fontWeight: '700', flex: 1 }}>{nameOf(l)}</P><Pressable accessibilityLabel={`Remove ${nameOf(l)}`} onPress={() => { setLines(ref.current.filter((x) => x.key !== l.key)); if (serialFor === l.key) setSerialFor(null); }}><Ionicons name="trash-outline" size={20} color={C.muted} /></Pressable></Row>
          {l.trackBatch && <Field label="Batch" value={l.batchNo} autoCapitalize="characters" onChangeText={(v) => update(l.key, { batchNo: v })} />}
          {l.trackExpiry && <Field label="Expiry (YYYY-MM-DD)" value={l.expiryDate} onChangeText={(v) => update(l.key, { expiryDate: v })} />}
          <Field label={l.trackSerial ? 'Quantity (one serial number each)' : 'Quantity'} value={l.qty} keyboardType="number-pad" onChangeText={(v) => update(l.key, { qty: v.replace(/\D/g, '') })} />
          {l.trackSerial && (
            <View style={{ gap: 6 }}>
              <Small style={{ color: l.serials.length === int(l.qty) ? C.ok : C.warn }}>Serial numbers: {l.serials.length} of {int(l.qty)}</Small>
              {l.serials.length > 0 && (
                <Row style={{ flexWrap: 'wrap', gap: 6 }}>
                  {l.serials.map((x) => (
                    <Pressable key={x} accessibilityRole="button" accessibilityLabel={`Remove serial ${x}`} onPress={() => update(l.key, { serials: l.serials.filter((y) => y !== x) })} style={chip}>
                      <Text style={{ color: C.ink, fontSize: 13 }}>{x}</Text><Ionicons name="close" size={14} color={C.muted} />
                    </Pressable>
                  ))}
                </Row>
              )}
              <SerialEntry onAdd={(v) => addSerial(l.key, v)} />
              {/* One camera at a time: scanning serials closes the main scanner. */}
              <Button variant="secondary" title={serialFor === l.key ? 'Done scanning serials' : 'Scan serial numbers'} onPress={() => { setSerialFor(serialFor === l.key ? null : l.key); setScanOpen(false); }} />
              {serialFor === l.key && <Scanner onScan={onScan} height={160} label="Scan serial number" startCamera />}
            </View>
          )}
        </Card>
      ))}
      {!!blocked && <Alert>{blocked}</Alert>}
      {grn.error && <Alert>{readableError(grn.error)}</Alert>}
      {lines.length > 0 && <Button title={`Save goods receipt (${units} unit${units === 1 ? '' : 's'})`} loading={grn.isPending} onPress={save} />}
    </Screen>
  );
}

/** Type a serial number (or use a Bluetooth scanner) and press Add. */
function SerialEntry({ onAdd }: { onAdd: (v: string) => void }) {
  const [v, setV] = useState('');
  const submit = () => { if (v.trim()) onAdd(v); setV(''); };
  return (
    <Row>
      <TextInput accessibilityLabel="Serial number" value={v} onChangeText={setV} placeholder="Type a serial number" autoCapitalize="characters" autoCorrect={false}
        onSubmitEditing={submit} returnKeyType="done" blurOnSubmit={false} style={[s.input, { flex: 1 }]} placeholderTextColor="#9aa5b1" />
      <Button variant="secondary" title="Add" onPress={submit} />
    </Row>
  );
}
const chip = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: C.line, backgroundColor: C.canvas };
