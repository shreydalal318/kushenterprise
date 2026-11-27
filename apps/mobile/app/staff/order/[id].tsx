import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { DISPATCH_METHOD_LABEL, DISPATCH_METHODS, formatDate, formatDateTime, istDateString, nextStatuses, ORDER_STATUS_LABEL, type DispatchMethod, type OrderStatus } from '@kush/core';
import { readableError } from '@/components/errors';
import { HandlerPicker } from '@/components/handler-picker';
import { Alert, Badge, Button, Card, Field, H2, KV, Loading, P, Row, Screen, Small } from '@/components/ui';
import { OrderStatusBadge } from '@/components/status';
import { LinkedPos, OrderFromSupplier, StockNote } from '@/components/order-sourcing';
import { useAuth, useCan } from '@/lib/auth';
import { C } from '@/lib/theme';
import { trpc } from '@/lib/trpc';

/** Order detail for staff: stock and sourcing, then Make tax invoice -> Dispatch -> Delivered. */
export default function StaffOrder() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const can = useCan();
  const { me } = useAuth();
  const utils = trpc.useUtils();
  const q = trpc.orders.get.useQuery({ id: id! });
  const setStatus = trpc.orders.setStatus.useMutation({ onSuccess: () => utils.orders.invalidate() });
  const [mode, setModeState] = useState<null | 'dispatch' | 'note' | 'deliver' | 'source'>(null);
  const sq = trpc.orders.shortfall.useQuery({ id: id! });
  const [noteFor, setNoteFor] = useState<OrderStatus | null>(null);
  const [note, setNote] = useState('');
  const [d, setD] = useState({ method: '' as '' | DispatchMethod, courier: '', docketNo: '', vehicleNo: '', dispatchDate: istDateString(), deliveryPersonId: '', deliveryPersonName: '', deliveryPersonMobile: '' });
  const staff = trpc.orders.staff.useQuery();
  const [receivedBy, setReceivedBy] = useState('');
  const deliver = trpc.orders.markDelivered.useMutation({ onSuccess: () => { void utils.orders.invalidate(); void utils.deliveries.invalidate(); setModeState(null); } });
  const [assigning, setAssigning] = useState(false);
  // Waits for the refetch, so the picker closes on the new name rather than the old one.
  const assign = trpc.orders.assign.useMutation({ onSuccess: async () => { await utils.orders.invalidate(); setAssigning(false); } });
  // Opening or closing a card starts without the last card's error.
  const setMode = (m: typeof mode) => { setStatus.reset(); deliver.reset(); setModeState(m); };
  if (!q.data) return q.error ? <Screen><Alert>{readableError(q.error)}</Alert></Screen> : <Loading />;
  const o = q.data;
  const next = nextStatuses(o.status);
  const stock = new Map((sq.data?.lines ?? []).map((l) => [l.variantId, l]));
  const toOrder = (sq.data?.lines ?? []).reduce((t, l) => t + l.toOrder, 0);
  const isOpen = !['CANCELLED', 'DELIVERED'].includes(o.status);
  const backorder = o.lines.reduce((t, l) => t + l.backorder, 0);
  const hasInvoice = o.invoices.some((i) => i.status === 'ISSUED');
  // A back-order invoice raised after the order went out still has to be dispatched.
  const toSend = o.invoices.find((i) => i.status === 'ISSUED' && !o.dispatches.some((x) => x.invoiceId === i.id));
  const canDispatch = can('UPDATE_ORDER_STATUS') && ((o.status === 'PACKED' && hasInvoice) || (o.status === 'DISPATCHED' && !!toSend));
  // The person it was handed to may mark it delivered without the status permission (the API allows it).
  const canDeliver = o.status === 'DISPATCHED' && (can('UPDATE_ORDER_STATUS') || o.dispatches.some((x) => x.deliveryPersonId === me?.id && !x.deliveredAt));
  // Invoiced goods are packed: an invoiced order on hold can only go back to Packed.
  const resumeTo = o.status === 'ON_HOLD' ? next.filter((x) => x !== 'CANCELLED' && (!hasInvoice || x === 'PACKED')) : [];
  const busy = setStatus.isPending;
  const canAssign = isOpen && (can('CREATE_ORDERS') || can('UPDATE_ORDER_STATUS'));
  const handlerId = o.assignedTo?.id ?? null;

  function go(s: OrderStatus) {
    if (busy) return;
    if (s === 'DISPATCHED') { setD((x) => ({ ...x, method: x.method || (o.suggestedDispatch as DispatchMethod) })); return setMode('dispatch'); }
    if (s === 'DELIVERED') { setReceivedBy(''); return setMode('deliver'); }
    if (s === 'CANCELLED' || s === 'ON_HOLD') { setNoteFor(s); setNote(''); setMode('note'); return; }
    setStatus.mutate({ id: o.id, status: s });
  }
  return (
    <Screen>
      <Stack.Screen options={{ title: o.number }} />
      <Row style={{ justifyContent: 'space-between' }}><P style={{ fontWeight: '700' }}>{o.customer.name}</P><OrderStatusBadge status={o.status} /></Row>
      {o.forDoctor && <Small>For {o.forDoctor.name}</Small>}
      {(o.assignedTo || isOpen) && (
        <Row style={{ justifyContent: 'space-between' }}>
          <Row style={{ flex: 1 }}>
            <Ionicons name="person-circle-outline" size={20} color={o.assignedTo ? C.teal700 : C.warn} />
            {o.assignedTo ? <P style={{ flex: 1 }}>Handled by <Text style={{ fontWeight: '700' }}>{o.assignedTo.name}</Text></P> : <Badge label="Not assigned" tone="warn" />}
          </Row>
          {canAssign && !assigning && (
            <Pressable accessibilityRole="button" hitSlop={8} onPress={() => { assign.reset(); setAssigning(true); }}>
              <Text style={{ color: C.teal700, fontWeight: '700' }}>{o.assignedTo ? 'Change' : 'Assign'}</Text>
            </Pressable>
          )}
        </Row>
      )}
      {canAssign && assigning && (
        <Card>
          <H2>Who will handle it?</H2>
          <Small>They make the tax invoice, dispatch and deliver it.</Small>
          <HandlerPicker value={handlerId} noneLabel="Not assigned" disabled={assign.isPending}
            onChange={(v) => (v === handlerId ? setAssigning(false) : assign.mutate({ id: o.id, assignedToId: v }))} />
          {assign.isPending && <Small>Saving…</Small>}
          {assign.error && <Alert>{readableError(assign.error)}</Alert>}
          <Button variant="secondary" title="Back" disabled={assign.isPending} onPress={() => setAssigning(false)} />
        </Card>
      )}
      {o.surgeryDate && <Alert tone="warn">Surgery {formatDate(o.surgeryDate)}{o.patientName ? ` · ${o.patientName}` : ''}</Alert>}
      {o.customerNote && <Alert tone="info">Customer note: {o.customerNote}</Alert>}
      <Card>
        {o.lines.map((l) => (
          <Row key={l.id} style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}><P>{l.variant.product.name}</P><Small>{l.variant.label ?? l.variant.sku}</Small>{isOpen && <StockNote line={stock.get(l.variant.id)} />}</View>
            <View style={{ alignItems: 'flex-end' }}>
              <P style={{ fontWeight: '700' }}>{l.qty}</P>
              {isOpen && l.backorder > 0 && o.status !== 'PLACED' && <Small style={{ color: C.warn }}>{l.backorder} to invoice</Small>}
            </View>
          </Row>
        ))}
      </Card>
      {isOpen && toOrder > 0 && mode !== 'source' && <Alert tone="warn">{toOrder} unit(s) on this order are not in stock.</Alert>}
      {mode === null && isOpen && backorder > 0 && sq.data && can('CREATE_PURCHASE_ORDERS') && <Button variant={toOrder > 0 ? 'primary' : 'secondary'} title="Order from supplier" onPress={() => setMode('source')} />}
      {mode === 'source' && sq.data && <OrderFromSupplier s={sq.data} onClose={() => setMode(null)} />}
      {mode === null && isOpen && (
        <View style={{ gap: 8 }}>
          {/* The main path: Make tax invoice (also confirms and packs) -> Dispatch -> Delivered. */}
          {setStatus.error && <Alert>{readableError(setStatus.error)}</Alert>}
          {backorder > 0 && ['PLACED', 'CONFIRMED', 'PACKED', 'DISPATCHED'].includes(o.status) && can('CREATE_TAX_INVOICE') && (
            <Button title={hasInvoice ? 'Invoice the remaining items' : 'Make tax invoice'} variant={canDispatch || canDeliver ? 'secondary' : 'primary'} onPress={() => router.push(`/staff/invoice?orderId=${o.id}`)} />
          )}
          {canDispatch && <Button title={o.status === 'DISPATCHED' && toSend ? `Dispatch invoice ${toSend.number}` : 'Dispatch'} onPress={() => go('DISPATCHED')} />}
          {canDeliver && <Button title="Mark delivered" variant={canDispatch ? 'secondary' : 'primary'} onPress={() => go('DELIVERED')} />}
          {can('UPDATE_ORDER_STATUS') && (
            <Row style={{ gap: 8, flexWrap: 'wrap' }}>
              {o.status === 'PLACED' && <Button variant="secondary" title="Confirm only" loading={busy && setStatus.variables?.status === 'CONFIRMED'} disabled={busy} onPress={() => go('CONFIRMED')} />}
              {resumeTo.map((x) => <Button key={x} variant="secondary" title={`Resume (${ORDER_STATUS_LABEL[x].toLowerCase()})`} loading={busy && setStatus.variables?.status === x} disabled={busy} onPress={() => go(x)} />)}
              {next.includes('ON_HOLD') && <Button variant="secondary" title="Put on hold" disabled={busy} onPress={() => go('ON_HOLD')} />}
              {/* The server refuses to cancel an order with an issued invoice; that invoice is cancelled first (web). */}
              {next.includes('CANCELLED') && !hasInvoice && <Button variant="danger" title="Cancel order" disabled={busy} onPress={() => go('CANCELLED')} />}
            </Row>
          )}
        </View>
      )}
      {mode === 'dispatch' && (
        <Card>
          <H2>How is it going out?</H2>
          {!hasInvoice ? <Alert tone="warn">Make the tax invoice first.</Alert> : toSend && <Small>Goes out with invoice {toSend.number}</Small>}
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
          {setStatus.error && <Alert>{readableError(setStatus.error)}</Alert>}
          <Button title={d.method === 'PICKUP' ? 'Mark ready for pickup' : 'Mark dispatched'} loading={busy} disabled={!d.method}
            onPress={() => setStatus.mutate({ id: o.id, status: 'DISPATCHED', dispatch: {
              method: d.method as DispatchMethod, dispatchDate: d.dispatchDate, invoiceId: toSend?.id, vehicleNo: d.vehicleNo || null, courier: d.courier || null, docketNo: d.docketNo || null,
              deliveryPersonId: d.method === 'OWN_DELIVERY' && d.deliveryPersonId && d.deliveryPersonId !== 'OTHER' ? d.deliveryPersonId : null,
              deliveryPersonName: d.deliveryPersonId === 'OTHER' ? d.deliveryPersonName : null, deliveryPersonMobile: d.deliveryPersonId === 'OTHER' ? d.deliveryPersonMobile : null,
            } }, { onSuccess: () => setModeState(null) })} />
          <Button variant="secondary" title="Back" onPress={() => setMode(null)} />
        </Card>
      )}
      {mode === 'deliver' && (
        <Card>
          <H2>Proof of delivery</H2>
          <Field label="Received by" placeholder="e.g. Sister Mary, OT store" value={receivedBy} onChangeText={setReceivedBy} maxLength={80} />
          {deliver.error && <Alert>{readableError(deliver.error)}</Alert>}
          <Button title="Mark delivered" loading={deliver.isPending} disabled={receivedBy.trim().length < 2} onPress={() => deliver.mutate({ id: o.id, receivedBy: receivedBy.trim() })} />
          <Button variant="secondary" title="Back" onPress={() => setMode(null)} />
        </Card>
      )}
      {mode === 'note' && noteFor && (
        <Card>
          <Field label={noteFor === 'CANCELLED' ? 'Why is the order cancelled?' : 'Why is it on hold?'} value={note} onChangeText={setNote} maxLength={300} />
          {setStatus.error && <Alert>{readableError(setStatus.error)}</Alert>}
          <Button variant={noteFor === 'CANCELLED' ? 'danger' : 'primary'} title={noteFor === 'CANCELLED' ? 'Cancel order' : 'Put on hold'} loading={busy} disabled={!note.trim()} onPress={() => setStatus.mutate({ id: o.id, status: noteFor, note: note.trim() }, { onSuccess: () => { setModeState(null); setNote(''); } })} />
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
