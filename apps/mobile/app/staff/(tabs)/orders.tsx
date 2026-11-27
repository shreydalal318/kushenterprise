import { useEffect, useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { formatDate, formatDateTime, ORDER_STATUSES, type OrderStatus } from '@kush/core';
import { Badge, Card, Loading, P, Row, s, Small, Tabs } from '@/components/ui';
import { OrderStatusBadge } from '@/components/status';
import { C } from '@/lib/theme';
import { trpc } from '@/lib/trpc';

/** Status filters; Home's tiles open this tab with one of them as ?status=. */
const FILTERS: [string, string][] = [['open', 'Pending'], ['TO_INVOICE', 'To invoice'], ['PACKED', 'To dispatch'], ['DISPATCHED', 'Out for delivery'], ['ON_HOLD', 'On hold'], ['DELIVERED', 'Delivered'], ['CANCELLED', 'Cancelled']];
const OPEN = ['PLACED', 'CONFIRMED', 'PACKED', 'DISPATCHED', 'ON_HOLD'];

export default function StaffOrders() {
  const { status } = useLocalSearchParams<{ status?: string }>();
  const filter = FILTERS.some(([k]) => k === status) ? status! : 'open';
  const one = (ORDER_STATUSES as readonly string[]).includes(filter) ? (filter as OrderStatus) : undefined;
  const [mine, setMine] = useState<'all' | 'mine'>('all');
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  useEffect(() => { const t = setTimeout(() => setTerm(search.trim().slice(0, 60)), 300); return () => clearTimeout(t); }, [search]);
  const me = trpc.auth.me.useQuery();
  // One status is filtered by the server; Pending and To invoice span several, so they are filtered here.
  const q = trpc.orders.list.useQuery({ assignedToId: mine === 'mine' ? me.data?.id : undefined, status: one, q: term || undefined }, { placeholderData: (prev) => prev });
  const rows = (q.data ?? []).filter((o) => (one ? o.status === one : filter === 'TO_INVOICE' ? ['PLACED', 'CONFIRMED'].includes(o.status) : OPEN.includes(o.status)));
  return (
    <View style={{ flex: 1, backgroundColor: C.canvas }}>
      <View style={{ padding: 12, gap: 8 }}>
        {/* The owner looks after every order; "assigned to me" is for employees. */}
        {me.data && me.data.role !== 'OWNER' && <Tabs value={mine} onChange={setMine} options={[['all', 'All orders'], ['mine', 'Assigned to me']]} />}
        <TextInput accessibilityLabel="Search orders" value={search} onChangeText={setSearch} placeholder="Search order no. or customer" style={s.input} placeholderTextColor="#9aa5b1" autoCorrect={false} returnKeyType="search" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 6 }}>
          {FILTERS.map(([k, label]) => (
            <Pressable key={k} accessibilityRole="tab" accessibilityState={{ selected: filter === k }} onPress={() => router.setParams({ status: k })}
              style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: filter === k ? C.teal700 : C.line, backgroundColor: filter === k ? C.aqua100 : C.white }}>
              <Text style={{ fontSize: 13, fontWeight: filter === k ? '700' : '500', color: filter === k ? C.navy : C.muted }}>{label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
      {q.isLoading && <Loading />}
      <FlatList data={rows} keyExtractor={(o) => o.id} contentContainerStyle={{ padding: 12, paddingTop: 0, gap: 10 }} refreshing={q.isRefetching && !q.isPlaceholderData} onRefresh={() => void q.refetch()} keyboardShouldPersistTaps="handled"
        ListEmptyComponent={q.data && !q.isPlaceholderData ? <P muted style={{ textAlign: 'center' }}>{term ? `No orders match “${term}”.` : filter === 'open' ? 'Nothing pending.' : 'No orders here.'}</P> : undefined}
        renderItem={({ item: o }) => (
          <Pressable accessibilityRole="button" accessibilityLabel={`Order ${o.number}`} onPress={() => router.push(`/staff/order/${o.id}`)}>
            <Card>
              <Row style={{ justifyContent: 'space-between' }}><P style={{ fontWeight: '700', color: C.navy }}>{o.number}</P><OrderStatusBadge status={o.status} /></Row>
              <P>{o.customer.name}{o.forDoctor ? ` · for ${o.forDoctor}` : ''}</P>
              <Row style={{ flexWrap: 'wrap' }}>
                <Small>{formatDateTime(o.createdAt)} · {o.units} unit(s)</Small>
                {o.surgeryDate && <Badge label={`Surgery ${formatDate(o.surgeryDate)}`} tone="warn" />}
                {o.backorder > 0 && o.status !== 'PLACED' && OPEN.includes(o.status) && <Badge label={`${o.backorder} to invoice`} tone="teal" />}
              </Row>
            </Card>
          </Pressable>
        )} />
    </View>
  );
}
