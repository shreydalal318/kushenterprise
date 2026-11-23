import { Pressable, View } from 'react-native';
import { Link, router } from 'expo-router';
import { formatDateTime } from '@kush/core';
import { Alert, Button, Card, Empty, H1, H2, Loading, P, Row, Screen, Small } from '@/components/ui';
import { OrderStatusBadge } from '@/components/status';
import { useCart } from '@/lib/cart';
import { rupees } from '@/lib/format';
import { discard, useOutbox } from '@/lib/outbox';
import { C } from '@/lib/theme';
import { trpc } from '@/lib/trpc';

export default function CustomerHome() {
  const q = trpc.portal.home.useQuery();
  const utils = trpc.useUtils();
  const cart = useCart();
  const outbox = useOutbox();
  if (!q.data) return q.error ? <Screen><Alert>Could not load your account. Pull down to retry when you have signal.</Alert></Screen> : <Loading />;
  const d = q.data;
  return (
    <Screen>
      <H1>{d.customer.name}</H1>
      <Small>Account {d.customer.code}</Small>
      {outbox.length > 0 && (
        <Card style={{ borderColor: C.warn }}>
          <H2>Waiting to send ({outbox.length})</H2>
          {outbox.map((o) => (
            <Row key={o.id} style={{ justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}><P>{o.label}</P>{o.error ? <Small style={{ color: C.danger }}>{o.error}</Small> : <Small>Will be sent when you are back online</Small>}</View>
              {o.error && <Button variant="secondary" title="Discard" onPress={() => void discard(o.id)} />}
            </Row>
          ))}
        </Card>
      )}
      <Row style={{ alignItems: 'stretch' }}>
        <Card style={{ flex: 1 }}><Small>Outstanding</Small><H2>{rupees(Math.max(0, d.outstanding))}</H2>{d.overdue > 0 && <Small style={{ color: C.danger }}>{rupees(d.overdue)} overdue</Small>}</Card>
        <Pressable style={{ flex: 1 }} onPress={() => router.push('/customer/notifications')} accessibilityRole="button" accessibilityLabel={`Notifications, ${d.unread} unread`}>
          <Card><Small>Notifications</Small><H2>{d.unread} new</H2><Small style={{ color: C.teal700 }}>Open inbox</Small></Card>
        </Pressable>
      </Row>
      <Button title="Order lenses & supplies" onPress={() => router.push('/customer/catalogue')} />
      <H2>Recent orders</H2>
      {d.orders.length === 0 && <Empty>No orders yet.</Empty>}
      {d.orders.map((o) => (
        <Card key={o.id}>
          <Link href={`/customer/order/${o.id}`} asChild><Pressable accessibilityRole="link"><Row style={{ justifyContent: 'space-between' }}><P style={{ fontWeight: '700', color: C.navy }}>{o.number}</P><OrderStatusBadge status={o.status} /></Row></Pressable></Link>
          <Small>{formatDateTime(o.createdAt)} · {o.units} unit(s)</Small>
          <Button variant="secondary" title="Order again" onPress={async () => { cart.add(await utils.portal.reorderLines.fetch({ orderId: o.id })); router.push('/customer/cart'); }} />
        </Card>
      ))}
    </Screen>
  );
}
