import { useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { formatDate, formatDateTime } from '@kush/core';
import { Badge, Card, Loading, P, Row, Small, Tabs } from '@/components/ui';
import { OrderStatusBadge } from '@/components/status';
import { C } from '@/lib/theme';
import { trpc } from '@/lib/trpc';

export default function StaffOrders() {
  const [mine, setMine] = useState<'all' | 'mine'>('all');
  const me = trpc.auth.me.useQuery();
  const q = trpc.orders.list.useQuery({ assignedToId: mine === 'mine' ? me.data?.id : undefined });
  const open = (q.data ?? []).filter((o) => !['DELIVERED', 'CANCELLED'].includes(o.status));
  return (
    <View style={{ flex: 1, backgroundColor: C.canvas }}>
      <View style={{ padding: 12 }}><Tabs value={mine} onChange={setMine} options={[['all', 'Pending orders'], ['mine', 'Assigned to me']]} /></View>
      {q.isLoading && <Loading />}
      <FlatList data={open} keyExtractor={(o) => o.id} contentContainerStyle={{ padding: 12, paddingTop: 0, gap: 10 }} refreshing={q.isRefetching} onRefresh={() => void q.refetch()}
        ListEmptyComponent={q.data ? <P muted style={{ textAlign: 'center' }}>Nothing pending.</P> : undefined}
        renderItem={({ item: o }) => (
          <Pressable accessibilityRole="button" accessibilityLabel={`Order ${o.number}`} onPress={() => router.push(`/staff/order/${o.id}`)}>
            <Card>
              <Row style={{ justifyContent: 'space-between' }}><P style={{ fontWeight: '700', color: C.navy }}>{o.number}</P><OrderStatusBadge status={o.status} /></Row>
              <P>{o.customer.name}{o.forDoctor ? ` · for ${o.forDoctor}` : ''}</P>
              <Row style={{ flexWrap: 'wrap' }}>
                <Small>{formatDateTime(o.createdAt)} · {o.units} unit(s)</Small>
                {o.surgeryDate && <Badge label={`Surgery ${formatDate(o.surgeryDate)}`} tone="warn" />}
                {o.backorder > 0 && o.status !== 'PLACED' && <Badge label={`${o.backorder} to send`} tone="teal" />}
              </Row>
            </Card>
          </Pressable>
        )} />
    </View>
  );
}
