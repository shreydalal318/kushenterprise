import { View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { formatDate, formatDateTime, ORDER_FLOW, ORDER_STATUS_LABEL } from '@kush/core';
import { Alert, Button, Card, H2, KV, Loading, P, Row, Screen, Small } from '@/components/ui';
import { OrderStatusBadge } from '@/components/status';
import { useCart } from '@/lib/cart';
import { docPath, openPdf } from '@/lib/documents';
import { rupees } from '@/lib/format';
import { C } from '@/lib/theme';
import { trpc } from '@/lib/trpc';

export default function OrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = trpc.portal.order.useQuery({ id: id! });
  const utils = trpc.useUtils();
  const cart = useCart();
  if (q.error) return <Screen><Alert>Order not found.</Alert></Screen>;
  if (!q.data) return <Loading />;
  const o = q.data;
  const at = (s: string) => o.events.filter((e) => e.status === s).at(-1)?.at;
  const held = o.events.filter((e) => e.status === 'ON_HOLD' || e.status === 'CANCELLED').at(-1);
  return (
    <Screen>
      <Stack.Screen options={{ title: o.number }} />
      <Row style={{ justifyContent: 'space-between' }}><Small>Placed {formatDateTime(o.createdAt)}</Small><OrderStatusBadge status={o.status} /></Row>
      {(o.status === 'ON_HOLD' || o.status === 'CANCELLED') && <Alert tone={o.status === 'ON_HOLD' ? 'warn' : 'danger'}>{o.status === 'ON_HOLD' ? 'On hold' : 'Cancelled'}{held?.note ? `: ${held.note}` : '.'}</Alert>}
      <Card>
        {ORDER_FLOW.map((s) => { const t = at(s); return (
          <Row key={s} style={{ gap: 10 }}>
            <Ionicons name={t ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={t ? C.teal : C.line} />
            <View style={{ flex: 1 }}><P style={{ fontWeight: t ? '700' : '400', color: t ? C.ink : C.muted }}>{ORDER_STATUS_LABEL[s]}</P>{t && <Small>{formatDateTime(t)}</Small>}</View>
          </Row>
        ); })}
      </Card>
      {o.dispatches.map((d, i) => (
        <Alert key={i} tone={d.deliveredAt ? 'ok' : 'info'}>
          {d.method === 'OWN_DELIVERY' ? `Out for delivery${d.person ? ` with ${d.person}${d.personMobile ? ` (${d.personMobile})` : ''}` : ''}` : d.method === 'PICKUP' ? 'Ready for pickup at our store' : `Sent${d.courier ? ` via ${d.courier}` : ''}${d.docketNo ? `, ${d.method === 'TRANSPORT' ? 'LR' : 'docket'} ${d.docketNo}` : ''}`}
          {d.date ? ` · ${formatDate(d.date)}` : ''}{d.deliveredAt ? `\nDelivered${d.receivedBy ? `, received by ${d.receivedBy}` : ''}` : ''}
        </Alert>
      ))}
      <H2>Items</H2>
      <Card>
        {o.lines.map((l) => (
          <Row key={l.id} style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}><P>{l.name}</P><Small>{l.label ?? ''} · {rupees(l.rate)}</Small></View>
            <View style={{ alignItems: 'flex-end' }}><P style={{ fontWeight: '700' }}>{l.qty}</P>{l.backorder > 0 && o.status !== 'PLACED' && o.status !== 'CANCELLED' && <Small style={{ color: C.warn }}>{l.backorder} to come</Small>}</View>
          </Row>
        ))}
      </Card>
      {(o.patientName || o.surgeryDate || o.shipTo) && (
        <Card>
          {o.shipTo && <KV k="Deliver to" v={o.shipTo.addressLines[0] ?? o.shipTo.name} />}
          {o.patientName && <KV k="Patient" v={o.patientName} />}
          {o.surgeryDate && <KV k="Surgery" v={formatDate(o.surgeryDate)} />}
        </Card>
      )}
      <H2>Invoices</H2>
      {o.invoices.length === 0 ? <Small>The tax invoice appears here when the goods are dispatched.</Small> : o.invoices.map((i) => (
        <Button key={i.id} variant="secondary" title={`${i.number} · ${rupees(i.total)} (PDF)`} onPress={() => void openPdf(docPath('invoice', i.id), `${i.number}.pdf`)} />
      ))}
      <Button variant="secondary" title="Order the same again" onPress={async () => { cart.add(await utils.portal.reorderLines.fetch({ orderId: o.id })); router.push('/customer/cart'); }} />
    </Screen>
  );
}
