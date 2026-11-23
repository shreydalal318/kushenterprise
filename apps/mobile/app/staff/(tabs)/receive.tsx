import { useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatDate, istDateString } from '@kush/core';
import { Scanner } from '@/components/scanner';
import { Alert, Button, Card, Field, H2, Loading, P, Row, s, Screen, Small } from '@/components/ui';
import { errorText } from '@/lib/format';
import { C } from '@/lib/theme';
import { trpc } from '@/lib/trpc';

interface Line { key: string; variantId: string; name: string; label: string | null; trackBatch: boolean; trackExpiry: boolean; trackSerial: boolean; batchNo: string; expiryDate: string; serials: string[]; qty: number }

/** Receive goods by scanning: GS1 codes fill batch, expiry and serial; optionally against an open PO. */
export default function Receive() {
  const utils = trpc.useUtils();
  const suppliers = trpc.suppliers.list.useQuery();
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [poId, setPoId] = useState<string | null>(null);
  const [invNo, setInvNo] = useState('');
  const pos = trpc.purchaseOrders.open.useQuery({ supplierId: supplierId ?? '' }, { enabled: !!supplierId });
  const po = pos.data?.find((p) => p.id === poId);
  const [lines, setLinesState] = useState<Line[]>([]);
  const ref = useRef<Line[]>([]);
  const setLines = (n: Line[]) => { ref.current = n; setLinesState(n); };
  const [msg, setMsg] = useState<{ tone: 'ok' | 'warn' | 'danger'; text: string } | null>(null);
  const grn = trpc.inventory.createGrn.useMutation({ onSuccess: () => { setLines([]); void utils.purchaseOrders.invalidate(); } });

  async function onScan(code: string) {
    const r = await utils.scan.resolve.fetch({ code }, { staleTime: 0 }).catch(() => null);
    if (!r) { setMsg({ tone: 'danger', text: 'No connection.' }); return; }
    if (!r.found) { setMsg({ tone: 'danger', text: `Unknown barcode ${code}. Link it on the web app first.` }); return; }
    if (po && !po.lines.some((l) => l.variantId === r.variant.id)) { setMsg({ tone: 'danger', text: `${r.product.name} is not on ${po.number}` }); return; }
    const batchNo = r.parsed?.batch?.toUpperCase() ?? '';
    const expiryDate = r.parsed?.expiry ?? '';
    const serial = r.parsed?.serial?.toUpperCase() ?? '';
    if (expiryDate && expiryDate < istDateString()) { setMsg({ tone: 'danger', text: `Batch ${batchNo} expired on ${formatDate(expiryDate)}. Do not accept.` }); return; }
    const cur = ref.current;
    const same = cur.find((l) => l.variantId === r.variant.id && l.batchNo === batchNo);
    if (same) {
      if (serial && same.serials.includes(serial)) { setMsg({ tone: 'warn', text: `Serial ${serial} already scanned` }); return; }
      setLines(cur.map((l) => (l === same ? { ...l, qty: l.qty + 1, serials: serial ? [...l.serials, serial] : l.serials } : l)));
    } else {
      setLines([...cur, { key: `${Date.now()}`, variantId: r.variant.id, name: r.product.name, label: r.variant.label, trackBatch: r.product.trackBatch, trackExpiry: r.product.trackExpiry, trackSerial: r.product.trackSerial, batchNo, expiryDate, serials: serial ? [serial] : [], qty: 1 }]);
    }
    setMsg({ tone: 'ok', text: `${r.product.name} ${r.variant.label ?? ''}${batchNo ? ` · ${batchNo}` : ''}${serial ? ` · ${serial}` : ''}` });
  }
  const update = (key: string, p: Partial<Line>) => setLines(ref.current.map((l) => (l.key === key ? { ...l, ...p } : l)));

  if (!suppliers.data) return <Loading />;
  const sup = suppliers.data.find((x) => x.id === supplierId);
  return (
    <Screen>
      {grn.data && <Alert tone="ok">Saved {grn.data.number}: {grn.data.units} unit(s){grn.data.po ? ` against ${grn.data.po.number}` : ''}. Stock is updated.</Alert>}
      {!sup ? (
        <Card><H2>Supplier</H2>{suppliers.data.map((x) => <Pressable key={x.id} accessibilityRole="button" onPress={() => setSupplierId(x.id)} style={{ paddingVertical: 8 }}><P>{x.name}</P></Pressable>)}</Card>
      ) : (
        <Card>
          <Row style={{ justifyContent: 'space-between' }}><P style={{ fontWeight: '700', flex: 1 }}>{sup.name}</P><Button variant="secondary" title="Change" onPress={() => { setSupplierId(null); setPoId(null); setLines([]); }} /></Row>
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
      {po && <Card><Small>Still due on {po.number}</Small>{po.lines.map((l) => { const have = lines.filter((x) => x.variantId === l.variantId).reduce((t, x) => t + x.qty, 0); return <Row key={l.id} style={{ justifyContent: 'space-between' }}><Small>{l.productName} {l.label ?? ''}</Small><P style={{ fontWeight: '700', color: have > l.pending ? C.danger : have === l.pending ? C.ok : C.muted }}>{have} / {l.pending}</P></Row>; })}</Card>}
      {sup && <Scanner onScan={onScan} height={180} />}
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      {lines.map((l) => (
        <Card key={l.key}>
          <Row style={{ justifyContent: 'space-between' }}><P style={{ fontWeight: '700', flex: 1 }}>{l.name} {l.label ?? ''}</P><Pressable accessibilityLabel="Remove" onPress={() => setLines(lines.filter((x) => x !== l))}><Ionicons name="trash-outline" size={20} color={C.muted} /></Pressable></Row>
          {l.trackBatch && <Field label="Batch" value={l.batchNo} autoCapitalize="characters" onChangeText={(v) => update(l.key, { batchNo: v })} />}
          {l.trackExpiry && <Field label="Expiry (YYYY-MM-DD)" value={l.expiryDate} onChangeText={(v) => update(l.key, { expiryDate: v })} />}
          {l.trackSerial ? <Small>{l.serials.length} serial(s): {l.serials.join(', ')}</Small> : <Field label="Quantity" value={String(l.qty)} keyboardType="number-pad" onChangeText={(v) => update(l.key, { qty: Math.max(1, Number(v) || 1) })} />}
        </Card>
      ))}
      {grn.error && <Alert>{errorText(grn.error)}</Alert>}
      {lines.length > 0 && <Button title={`Save goods receipt (${lines.reduce((t, l) => t + l.qty, 0)} units)`} loading={grn.isPending}
        onPress={() => grn.mutate({ supplierId: supplierId!, poId, date: istDateString(), supplierInvoiceNo: invNo || null, lines: lines.map((l) => ({ variantId: l.variantId, batchNo: l.batchNo || null, expiryDate: l.expiryDate || null, mfgDate: null, serialNos: l.serials, qty: l.trackSerial ? l.serials.length : l.qty, rate: null })) })} />}
    </Screen>
  );
}
