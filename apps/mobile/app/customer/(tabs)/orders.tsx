import { useMemo } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { formatDate } from '@kush/core';
import { Button, Card, Loading, Row } from '@/components/ui';
import { Progress, StatusPill } from '@/customer/status';
import { EmptyState, ErrorBox, Note } from '@/customer/ui';
import { errorText, rupees } from '@/lib/format';
import { useOutbox } from '@/lib/outbox';
import { C } from '@/lib/theme';
import { trpc } from '@/lib/trpc';

/** Every order, newest first, each with one plain status word and four progress dots. */
export default function OrdersScreen() {
  const q = trpc.portal.orders.useQuery();
  const outbox = useOutbox();
  // The server lists open orders first; customers look for "my latest order", so newest first.
  const orders = useMemo(() => [...(q.data ?? [])].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)), [q.data]);
  const waiting = outbox.filter((o) => o.kind === 'placeOrder');
  return (
    <View style={{ flex: 1, backgroundColor: C.canvas }}>
      {q.isLoading && <Loading />}
      <FlatList data={orders} keyExtractor={(o) => o.id} contentContainerStyle={{ padding: 12, gap: 10 }} refreshing={q.isRefetching} onRefresh={() => void q.refetch()}
        ListHeaderComponent={<>
          {q.error && !q.data && <ErrorBox text={errorText(q.error)} onRetry={() => void q.refetch()} busy={q.isFetching} />}
          {waiting.map((o) => (
            <Card key={o.id} style={{ borderColor: C.warn, backgroundColor: C.warn50, marginBottom: 10 }}>
              <Row><Ionicons name={o.error ? 'alert-circle' : 'cloud-offline-outline'} size={22} color={C.warn} /><Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: C.warn }}>{o.error ? 'Not sent' : 'Waiting for internet'}</Text></Row>
              <Text style={{ fontSize: 15, color: C.ink }}>{o.label} · saved {formatDate(new Date(o.createdAt))}</Text>
              <Note>{o.error ? `${o.error} Remove it on the Order screen and order again.` : 'Saved on your phone. It will be sent automatically when you are online.'}</Note>
            </Card>
          ))}
        </>}
        ListEmptyComponent={q.data && !waiting.length ? (
          <EmptyState icon={<Ionicons name="cube-outline" size={48} color={C.teal700} />} text="No orders yet. Tap Order to start."
            action={<Button title="Start ordering" onPress={() => router.navigate('/customer')} />} />
        ) : undefined}
        renderItem={({ item: o }) => (
          <Pressable accessibilityRole="button" accessibilityLabel={`Order ${o.number}, ${formatDate(o.createdAt)}, ${rupees(o.value)}`} accessibilityHint="Opens the order" onPress={() => router.push(`/customer/order/${o.id}`)}>
            {({ pressed }) => (
              <Card style={{ gap: 10, opacity: pressed ? 0.85 : 1 }}>
                <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ fontSize: 17, fontWeight: '700', color: C.navy }}>{o.number}</Text>
                    <Note>{formatDate(o.createdAt)} · {o.units} item{o.units === 1 ? '' : 's'} · {rupees(o.value)}</Note>
                    {!!(o.forDoctor || o.surgeryDate) && <Note>{[o.forDoctor && `For ${o.forDoctor}`, o.surgeryDate && `Surgery ${formatDate(o.surgeryDate)}`].filter(Boolean).join(' · ')}</Note>}
                  </View>
                  <StatusPill status={o.status} />
                </Row>
                <Progress status={o.status} />
              </Card>
            )}
          </Pressable>
        )} />
    </View>
  );
}
