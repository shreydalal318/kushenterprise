import { useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { DISPATCH_METHOD_LABEL, DISPATCH_METHODS, formatDate, formatDateTime, istDateString, nextStatuses, ORDER_STATUS_LABEL, type DispatchMethod, type OrderStatus } from '@kush/core';
import { Scanner } from '@/components/scanner';
import { Alert, Button, Card, Field, H2, KV, Loading, P, Row, Screen, Small } from '@/components/ui';
import { OrderStatusBadge } from '@/components/status';
import { LinkedPos, OrderFromSupplier, StockNote } from '@/components/order-sourcing';
import { useCan } from '@/lib/auth';
import { errorText } from '@/lib/format';
import { C } from '@/lib/theme';
import { trpc } from '@/lib/trpc';

/** Order detail for staff: stock and sourcing, status steps, scan-to-pack, dispatch details. */
export default function StaffOrder() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const can = useCan();
  const utils = trpc.useUtils();
  const q = trpc.orders.get.useQuery({ id: id! });
  const setStatus = trpc.orders.setStatus.useMutation({ onSuccess: () => utils.orders.invalidate() });
  const verify = trpc.orders.verifyPacked.useMutation({ onSuccess: (r) => { if (r.ok) void utils.orders.invalidate(); } });
  const [mode, setMode] = useState<null | 'pack' | 'dispatch' | 'note' | 'deliver' | 'source'>(null);
  const sq = trpc.orders.shortfall.useQuery({ id: id! });
  const [noteFor, setNoteFor] = useState<OrderStatus | null>(null);
  const [note, setNote] = useState('');
  const [d, setD] = useState({ method: '' as '' | DispatchMethod, courier: '', docketNo: '', vehicleNo: '', dispatchDate: istDateString(), deliveryPersonId: '', deliveryPersonName: '', deliveryPersonMobile: '' });
  const staff = trpc.orders.staff.useQuery();
  const [receivedBy, setReceivedBy] = useState('');
  const deliver = trpc.orders.markDelivered.useMutation({ onSuccess: () => { void utils.orders.invalidate(); void utils.deliveries.invalidate(); setMode(null); } });
  const counts = useRef<Record<string, number>>({});
  const [packed, setPacked] = useState<Record<string, number>>({});
  const [packMsg, setPackMsg] = useState<string | null>(null);
  if (!q.data) return q.error ? <Screen><Alert>{errorText(q.error)}</Alert></Screen> : <Loading />;
  const o = q.data;
  const next = nextStatuses(o.status);
  const stock = new Map((sq.data?.lines ?? []).map((l) => [l.variantId, l]));
  const toOrder = (sq.data?.lines ?? []).reduce((t, l) => t + l.toOrder, 0);
  const isOpen = !['CANCELLED', 'DELIVERED'].includes(o.status);
  const backorder = o.lines.reduce((t, l) => t + l.backorder, 0);

  async function onPackScan(code: string) {
    const r = await utils.scan.resolve.fetch({ code }, { staleTime: 0 }).catch(() => null);
    if (!r?.found) { setPackMsg(`Unknown barcode ${code}`); return; }
    const line = o.lines.find((l) => l.variant.id === r.variant.id);
    if (!line) { setPackMsg(`${r.product.name} ${r.variant.label ?? ''} is NOT on this order`); return; }
    const n = (counts.current[line.variant.id] ?? 0) + 1;
    if (n > line.qty) { setPackMsg(`Too many: only ${line.qty} ordered`); return; }
    counts.current = { ...counts.current, [line.variant.id]: n };
    setPacked(counts.current); setPackMsg(null);
  }
  const allPacked = o.lines.every((l) => (packed[l.variant.id] ?? 0) >= l.qty);

  function go(s: OrderStatus) {
    if (s === 'DISPATCHED') { setD((x) => ({ ...x, method: x.method || (o.suggestedDispatch as DispatchMethod) })); return setMode('dispatch'); }
    if (s === 'DELIVERED') return setMode('deliver');
    if (s === 'CANCELLED' || s === 'ON_HOLD') { setNoteFor(s); setMode('note'); return; }
    setStatus.mutate({ id: o.id, status: s });
  }
  return (
    <Screen>
      <Stack.Screen options={{ title: o.number }} />
      <Row style={{ justifyContent: 'space-between' }}><P style={{ fontWeight: '700' }}>{o.customer.name}</P><OrderStatusBadge status={o.status} /></Row>
      {o.forDoctor && <Small>For {o.forDoctor.name}</Small>}
      {o.surgeryDate && <Alert tone="warn">Surgery {formatDate(o.surgeryDate)}{o.patientName ? ` · ${o.patientName}` : ''}</Alert>}
      {o.customerNote && <Alert tone="info">Customer note: {o.customerNote}</Alert>}
      <Card>
        {o.lines.map((l) => (
          <Row key={l.id} style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}><P>{l.variant.product.name}</P><Small>{l.variant.label ?? l.variant.sku}</Small>{isOpen && mode !== 'pack' && <StockNote line={stock.get(l.variant.id)} />}</View>
            <View style={{ alignItems: 'flex-end' }}>
              <P style={{ fontWeight: '700' }}>{mode === 'pack' ? `${packed[l.variant.id] ?? 0} / ${l.qty}` : l.qty}</P>
              {l.backorder > 0 && o.status !== 'PLACED' && <Small style={{ color: C.warn }}>{l.backorder} to send</Small>}
            </View>
          </Row>
        ))}
      </Card>
      {setStatus.error && <Alert>{errorText(setStatus.error)}</Alert>}
      {isOpen && toOrder > 0 && mode !== 'source' && <Alert tone="warn">{toOrder} unit(s) on this order are not in stock.</Alert>}
      {mode === null && isOpen && backorder > 0 && sq.data && can('CREATE_PURCHASE_ORDERS') && <Button variant={toOrder > 0 ? 'primary' : 'secondary'} title="Order from supplier" onPress={() => setMode('source')} />}
      {mode === 'source' && sq.data && <OrderFromSupplier s={sq.data} onClose={() => setMode(null)} />}
      {mode === null && can('UPDATE_ORDER_STATUS') && next.length > 0 && (
        <View style={{ gap: 8 }}>
          {can('SCAN_DISPATCH') && ['PLACED', 'CONFIRMED'].includes(o.status) && <Button title="Pack & verify by scanning" onPress={() => setMode('pack')} />}
          {next.map((s) => <Button key={s} variant={s === 'CANCELLED' ? 'danger' : 'secondary'} loading={setStatus.isPending && setStatus.variables?.status === s} title={s === 'ON_HOLD' ? 'Put on hold' : s === 'CANCELLED' ? 'Cancel order' : `Mark ${ORDER_STATUS_LABEL[s].toLowerCase()}`} onPress={() => go(s)} />)}
        </View>
      )}
      {mode === 'pack' && (
        <Card>
          <H2>Scan each box into the parcel</H2>
          <Scanner onScan={onPackScan} height={200} />
          {packMsg && <Alert>{packMsg}</Alert>}
          {verify.data && !verify.data.ok && <Alert>{verify.data.problems.join('; ')}</Alert>}
          <Button title="Mark packed" disabled={!allPacked} loading={verify.isPending} onPress={() => verify.mutate({ id: o.id, scanned: Object.entries(packed).map(([variantId, qty]) => ({ variantId, qty })) }, { onSuccess: (r) => { if (r.ok) setMode(null); } })} />
          <Button variant="secondary" title="Close" onPress={() => setMode(null)} />
        </Card>
      )}
      {mode === 'dispatch' && (
        <Card>
          <H2>How is it going out?</H2>
          {!o.invoices.some((i) => i.status === 'ISSUED') && <Alert tone="warn">Raise the tax invoice first (Bill tab or web).</Alert>}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {DISPATCH_METHODS.map((k) => (
              <Pressable key={k} accessibilityRole="radio" accessibilityState={{ selected: d.method === k }} onPress={() => setD({ ...d, method: k })}
                style={{ width: '48%', padding: 10, borderRadius: 10, borderWidth: 1, borderColor: d.method === k ? C.teal : C.line, backgroundColor: d.method === k ? C.aqua50 : C.white }}>
                <P style={{ fontWeight: d.method === k ? '700' : '400' }}>{DISPATCH_METHOD_LABEL[k]}</P>
                {k === o.suggestedDispatch && <Small style={{ color: C.teal700 }}>suggested</Small>}
              </Pressable>
            ))}
          </View>
          {d.method === 'OWN_DELIVERY' && (
            <View style={{ gap: 6 }}>
              <Small>Delivered by</Small>
              {[...(staff.data ?? []).map((u) => ({ id: u.id, label: `${u.name}${u.mobile ? ` · ${u.mobile}` : ''}` })), { id: 'OTHER', label: 'Someone else' }].map((u) => (
                <Pressable key={u.id} accessibilityRole="radio" accessibilityState={{ selected: d.deliveryPersonId === u.id }} onPress={() => setD({ ...d, deliveryPersonId: u.id })} style={{ flexDirection: 'row', gap: 8, alignItems: 'center', paddingVertical: 3 }}>
                  <Ionicons name={d.deliveryPersonId === u.id ? 'radio-button-on' : 'radio-button-off'} size={20} color={C.teal700} /><P>{u.label}</P>
                </Pressable>
              ))}
              {d.deliveryPersonId === 'OTHER' && <><Field label="Name" value={d.deliveryPersonName} onChangeText={(v) => setD({ ...d, deliveryPersonName: v })} /><Field label="Mobile (optional)" keyboardType="phone-pad" value={d.deliveryPersonMobile} onChangeText={(v) => setD({ ...d, deliveryPersonMobile: v })} /></>}
              <Field label="Vehicle no. (optional)" autoCapitalize="characters" value={d.vehicleNo} onChangeText={(v) => setD({ ...d, vehicleNo: v })} />
            </View>
          )}
          {(d.method === 'COURIER' || d.method === 'TRANSPORT') && (
            <>
              <Field label={d.method === 'COURIER' ? 'Courier company' : 'Transporter'} value={d.courier} onChangeText={(v) => setD({ ...d, courier: v })} />
              <Field label={d.method === 'COURIER' ? 'Docket no.' : 'LR no.'} value={d.docketNo} onChangeText={(v) => setD({ ...d, docketNo: v })} />
            </>
          )}
          {d.method === 'PICKUP' && <Small>The customer is told it is ready to collect.</Small>}
          <Field label="Date" value={d.dispatchDate} onChangeText={(v) => setD({ ...d, dispatchDate: v })} />
          <Button title={d.method === 'PICKUP' ? 'Mark ready for pickup' : 'Mark dispatched'} loading={setStatus.isPending} disabled={!d.method}
            onPress={() => setStatus.mutate({ id: o.id, status: 'DISPATCHED', dispatch: {
              method: d.method as DispatchMethod, dispatchDate: d.dispatchDate, vehicleNo: d.vehicleNo || null, courier: d.courier || null, docketNo: d.docketNo || null,
              deliveryPersonId: d.method === 'OWN_DELIVERY' && d.deliveryPersonId && d.deliveryPersonId !== 'OTHER' ? d.deliveryPersonId : null,
              deliveryPersonName: d.deliveryPersonId === 'OTHER' ? d.deliveryPersonName : null, deliveryPersonMobile: d.deliveryPersonId === 'OTHER' ? d.deliveryPersonMobile : null,
            } }, { onSuccess: () => setMode(null) })} />
          <Button variant="secondary" title="Back" onPress={() => setMode(null)} />
        </Card>
      )}
      {mode === 'deliver' && (
        <Card>
          <H2>Proof of delivery</H2>
          <Field label="Received by" placeholder="e.g. Sister Mary, OT store" value={receivedBy} onChangeText={setReceivedBy} />
          {deliver.error && <Alert>{errorText(deliver.error)}</Alert>}
          <Button title="Mark delivered" loading={deliver.isPending} onPress={() => deliver.mutate({ id: o.id, receivedBy })} />
          <Button variant="secondary" title="Back" onPress={() => setMode(null)} />
        </Card>
      )}
      {mode === 'note' && noteFor && (
        <Card>
          <Field label={noteFor === 'CANCELLED' ? 'Why is the order cancelled?' : 'Why is it on hold?'} value={note} onChangeText={setNote} />
          <Button variant={noteFor === 'CANCELLED' ? 'danger' : 'primary'} title={noteFor === 'CANCELLED' ? 'Cancel order' : 'Put on hold'} disabled={!note.trim()} onPress={() => setStatus.mutate({ id: o.id, status: noteFor, note }, { onSuccess: () => { setMode(null); setNote(''); } })} />
          <Button variant="secondary" title="Back" onPress={() => setMode(null)} />
        </Card>
      )}
      {sq.data && <LinkedPos s={sq.data} />}
      <H2>History</H2>
      <Card>{o.events.map((e) => <View key={e.id}><KV k={`${ORDER_STATUS_LABEL[e.status as OrderStatus]} · ${e.by}`} v={formatDateTime(e.at)} />{e.note ? <Small>{e.note}</Small> : null}</View>)}</Card>
      {o.dispatches.map((x) => <Small key={x.id}>{DISPATCH_METHOD_LABEL[x.method as DispatchMethod]} {x.dispatchDate ? formatDate(x.dispatchDate) : ''} {x.deliveryPersonName ?? x.courier ?? ''} {x.docketNo ?? ''}{x.deliveredAt ? ` · delivered${x.receivedBy ? `, received by ${x.receivedBy}` : ''}` : ''}</Small>)}
    </Screen>
  );
}
