import { useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { formatDate, formatDateTime } from '@kush/core';
import { Alert, Button, Card, Loading, P, Row, Small, Tabs } from '@/components/ui';
import { OrderStatusBadge } from '@/components/status';
import { errorText, rupees } from '@/lib/format';
import { C } from '@/lib/theme';
import { trpc } from '@/lib/trpc';

export default function OrdersScreen() {
  const [status, setStatus] = useState<'' | 'OPEN' | 'DELIVERED'>('OPEN');
  const q = trpc.portal.orders.useQuery({ status: status || undefined });
  return (
    <View style={{ flex: 1, backgroundColor: C.canvas }}>
      <View style={{ padding: 12 }}><Tabs value={status} onChange={setStatus} options={[['OPEN', 'Open'], ['DELIVERED', 'Delivered'], ['', 'All']]} /></View>
      {q.isLoading && <Loading />}
      {q.error && !q.data && <View style={{ paddingHorizontal: 12, gap: 8 }}><Alert>{errorText(q.error)}</Alert><Button variant="secondary" title="Try again" loading={q.isFetching} onPress={() => void q.refetch()} /></View>}
      <FlatList data={q.data ?? []} keyExtractor={(o) => o.id} contentContainerStyle={{ padding: 12, paddingTop: 0, gap: 10 }} refreshing={q.isRefetching} onRefresh={() => void q.refetch()}
        ListEmptyComponent={q.data ? <P muted style={{ textAlign: 'center' }}>No orders here.</P> : undefined}
        renderItem={({ item: o }) => (
          <Pressable accessibilityRole="button" accessibilityLabel={`Order ${o.number}`} onPress={() => router.push(`/customer/order/${o.id}`)}>
            <Card>
              <Row style={{ justifyContent: 'space-between' }}><P style={{ fontWeight: '700', color: C.navy }}>{o.number}</P><OrderStatusBadge status={o.status} /></Row>
              <Small>{formatDateTime(o.createdAt)} · {o.units} unit(s) · {rupees(o.value)}</Small>
              {(o.forDoctor || o.surgeryDate) && <Small>{[o.forDoctor && `For ${o.forDoctor}`, o.surgeryDate && `Surgery ${formatDate(o.surgeryDate)}`].filter(Boolean).join(' · ')}</Small>}
            </Card>
          </Pressable>
        )} />
    </View>
  );
}
