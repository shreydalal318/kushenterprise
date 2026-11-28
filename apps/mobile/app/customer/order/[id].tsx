import { useState, type ReactNode } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { formatDate, ORDER_FLOW, type OrderStatus } from '@kush/core';
import { Button, Card, H2, Loading, Row, Screen } from '@/components/ui';
import { useOrderAgain } from '@/customer/actions';
import { StatusPill } from '@/customer/status';
import { ErrorBox, Line, Note, Notice } from '@/customer/ui';
import { previewHref } from '@/lib/documents';
import { errorCode, errorText, rupees } from '@/lib/format';
import { C, R } from '@/lib/theme';
import { trpc } from '@/lib/trpc';

/** Order tracker: one plain sentence on top, then four big steps with ticks and dates. */
export default function OrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = trpc.portal.order.useQuery({ id: id! });
  const again = useOrderAgain(true);
  const [pulling, setPulling] = useState(false);
  if (!q.data) {
    if (!q.error) return <Loading />;
    return <Screen>{errorCode(q.error) === 'NOT_FOUND' ? <Notice tone="danger">We couldn't find this order.</Notice> : <ErrorBox text={errorText(q.error)} onRetry={() => void q.refetch()} busy={q.isFetching} />}</Screen>;
  }
  const o = q.data;
  const at = (s: string) => o.events.filter((e) => e.status === s).at(-1)?.at;
  // A step is done when it happened, or the order is already past it (older orders may lack an event).
  const rank = ORDER_FLOW.indexOf(o.status as OrderStatus);
  const reached = (s: OrderStatus) => !!at(s) || (rank >= 0 && rank >= ORDER_FLOW.indexOf(s));
  const held = o.events.filter((e) => e.status === 'ON_HOLD' || e.status === 'CANCELLED').at(-1);
  const last = o.dispatches.at(-1);
  const pickup = last?.method === 'PICKUP';
  const invoiced = o.invoices.length > 0 || reached('PACKED');
  const sent = o.dispatches.length > 0 || reached('DISPATCHED');
  const delivered = o.status === 'DELIVERED' || !!at('DELIVERED');
  const deliveredAt = at('DELIVERED') ?? o.dispatches.map((d) => d.deliveredAt).filter(Boolean).at(-1);
  const receivedBy = o.dispatches.map((d) => d.receivedBy).filter(Boolean).at(-1);
  const total = o.lines.reduce((t, l) => t + l.qty * l.rate, 0);
  const toCome = o.lines.some((l) => l.backorder > 0) && o.status !== 'PLACED' && o.status !== 'CANCELLED';
  const refresh = () => { setPulling(true); void q.refetch().finally(() => setPulling(false)); };

  const [headline, tone] = o.status === 'CANCELLED' ? ['This order was cancelled.', 'danger'] as const
    : o.status === 'ON_HOLD' ? ["Your order is on hold. We'll contact you if we need anything.", 'warn'] as const
    : delivered ? ['Your order has been delivered.', 'ok'] as const
    : sent ? [pickup ? 'Your order is ready to collect from our store.' : 'Your order is on the way.', 'info'] as const
    : invoiced ? ["Your invoice is ready. We're packing your order.", 'info'] as const
    : ["We have your order. We'll make your invoice next.", 'info'] as const;

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: C.canvas }}>
      <ScrollView style={{ flex: 1 }} refreshControl={<RefreshControl refreshing={pulling} onRefresh={refresh} colors={[C.teal700]} tintColor={C.teal700} />}>
        <View style={{ gap: 12, padding: 16 }}>
          <Stack.Screen options={{ title: `Order ${o.number}` }} />
          {q.error && <Notice tone="warn">{`This may be out of date. ${errorText(q.error)}`}</Notice>}
          <View accessibilityRole="summary" style={{ backgroundColor: tone === 'ok' ? C.ok50 : tone === 'warn' ? C.warn50 : tone === 'danger' ? C.danger50 : C.aqua50, borderRadius: R.lg, padding: 16, gap: 8 }}>
            <Row style={{ justifyContent: 'space-between' }}><Note style={{ flex: 1 }}>{o.number} · placed {formatDate(o.createdAt)}</Note><StatusPill status={o.status} pickup={pickup} /></Row>
            <Text style={{ fontSize: 19, fontWeight: '700', color: tone === 'ok' ? C.ok : tone === 'warn' ? C.warn : tone === 'danger' ? C.danger : C.navy, lineHeight: 26 }}>{headline}</Text>
            {!!held?.note && (o.status === 'ON_HOLD' || o.status === 'CANCELLED') && <Text style={{ fontSize: 15, color: C.ink }}>Reason: {held.note}</Text>}
            <Note>Pull down to see the latest.</Note>
          </View>

          <Card style={{ gap: 0, paddingVertical: 6 }}>
            <Step n={1} done title="Order placed" date={o.createdAt}>
              <Note>We got your order.</Note>
            </Step>
            <Step n={2} done={invoiced} title="Invoice ready" date={o.invoices[0]?.date ?? at('PACKED')}>
              {o.invoices.length === 0 ? <Note>{invoiced ? 'Packed. The invoice will show here soon.' : 'We make the invoice when we pack your order.'}</Note> : o.invoices.map((i) => (
                <View key={i.id} style={{ gap: 6 }}>
                  <Text style={{ fontSize: 15, color: C.ink }}>Invoice {i.number} · {rupees(i.total)}</Text>
                  <Button variant="secondary" title="View invoice" icon={<Ionicons name="eye-outline" size={20} color={C.ink} />} onPress={() => router.push(previewHref('invoice', i.id, i.number))} />
                </View>
              ))}
            </Step>
            <Step n={3} done={sent} title={pickup ? 'Ready to collect' : 'On the way'} date={last?.date ?? at('DISPATCHED')}>
              {o.dispatches.length === 0 ? <Note>{sent ? 'Sent out.' : "We'll tell you how it is coming: our delivery person, a courier, or pickup from our store."}</Note> : o.dispatches.map((d, i) => (
                <View key={i} style={{ gap: 6 }}>
                  {d.method === 'OWN_DELIVERY' ? <>
                    <Text style={{ fontSize: 15, color: C.ink }}>With our delivery person{d.person ? `: ${d.person}` : ''}{d.personMobile ? ` · ${d.personMobile}` : ''}</Text>
                    {!!d.personMobile && (
                      <Pressable accessibilityRole="button" accessibilityLabel={`Call ${d.person ?? 'the delivery person'}`} onPress={() => void Linking.openURL(`tel:${d.personMobile}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, alignSelf: 'flex-start' }}>
                        <Ionicons name="call-outline" size={20} color={C.teal700} /><Text style={{ color: C.teal700, fontWeight: '700', fontSize: 15 }}>Call {d.person ?? 'delivery person'}</Text>
                      </Pressable>
                    )}
                  </> : d.method === 'PICKUP' ? <Text style={{ fontSize: 15, color: C.ink }}>Ready to collect from our store.</Text>
                    : <Text style={{ fontSize: 15, color: C.ink }}>{d.method === 'TRANSPORT' ? 'By transport' : 'By courier'}{d.courier ? `: ${d.courier}` : ''}{d.docketNo ? `\n${d.method === 'TRANSPORT' ? 'LR' : 'Docket'} number: ${d.docketNo}` : ''}</Text>}
                  {o.dispatches.length > 1 && !!d.date && <Note>Sent {formatDate(d.date)}</Note>}
                </View>
              ))}
              {toCome && <Note style={{ color: C.warn }}>Some items are still to come. We'll send them as soon as we have them.</Note>}
            </Step>
            <Step n={4} done={delivered} title="Delivered" date={deliveredAt} last>
              <Note>{delivered ? (receivedBy ? `Received by ${receivedBy}.` : 'Done.') : pickup ? 'Done when you collect it.' : 'Done when it reaches you.'}</Note>
            </Step>
          </Card>

          <H2>What you ordered</H2>
          <Card>
            {o.lines.map((l) => (
              <Row key={l.id} style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, color: C.ink, fontWeight: '600' }}>{l.name}</Text>
                  <Note>{[l.label, `${l.qty} × ${rupees(l.rate)}`].filter(Boolean).join(' · ')}</Note>
                  {l.backorder > 0 && toCome && <Note style={{ color: C.warn }}>{l.backorder} still to come</Note>}
                </View>
                <Text style={{ fontSize: 15, fontWeight: '700', color: C.ink }}>{rupees(l.qty * l.rate)}</Text>
              </Row>
            ))}
            <Line k="Total (GST is on the invoice)" v={rupees(total)} />
          </Card>
          {!!(o.patientName || o.surgeryDate || o.shipTo || o.forDoctor || o.note) && (
            <Card>
              {o.shipTo && <Line k="Deliver to" v={o.shipTo.addressLines[0] ?? o.shipTo.name} />}
              {!!o.forDoctor && <Line k="For doctor" v={o.forDoctor} />}
              {!!o.patientName && <Line k="Patient" v={o.patientName} />}
              {!!o.surgeryDate && <Line k="Surgery" v={formatDate(o.surgeryDate)} />}
              {!!o.note && <Note>Your note: {o.note}</Note>}
            </Card>
          )}
          {again.failed && <ErrorBox text={again.failed.text} onRetry={again.failed.retry} busy={again.pending === o.id} />}
          <Button variant="secondary" title="Order again" icon={<Ionicons name="refresh" size={20} color={C.ink} />} loading={again.pending === o.id} disabled={!!again.pending} onPress={() => void again.run(o.id)} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/** One step of the tracker: a numbered circle that turns into a green tick, joined to the next by a line. */
function Step({ n, done, title, date, last, children }: { n: number; done: boolean; title: string; date?: Date | string | null; last?: boolean; children?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', gap: 12 }}>
      <View style={{ alignItems: 'center' }}>
        <View style={{ width: 36, height: 36, borderRadius: 18, marginTop: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: done ? C.ok : C.white, borderWidth: 2, borderColor: done ? C.ok : C.line }}>
          {done ? <Ionicons name="checkmark" size={22} color={C.white} /> : <Text style={{ color: C.muted, fontWeight: '700', fontSize: 16 }}>{n}</Text>}
        </View>
        {!last && <View style={{ flex: 1, width: 2, backgroundColor: done ? C.ok : C.line, marginTop: 2 }} />}
      </View>
      <View style={{ flex: 1, paddingVertical: 10, gap: 4 }}>
        <View accessible accessibilityLabel={`Step ${n}: ${title}. ${done ? `Done${date ? `, ${formatDate(date)}` : ''}` : 'Not yet'}.`}>
          <Text style={{ fontSize: 17, fontWeight: '700', color: done ? C.ink : C.muted }}>{title}{done ? ' ✓' : ''}</Text>
          {done && !!date && <Note>{formatDate(date)}</Note>}
        </View>
        {children}
      </View>
    </View>
  );
}
