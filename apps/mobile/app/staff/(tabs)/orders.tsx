import { useEffect, useState } from 'react';
import { FlatList, Pressable, ScrollView, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { formatDate, formatDateTime, ORDER_STATUSES, type OrderStatus } from '@kush/core';
import { Badge, Button, Card, Chip, Loading, P, Row, s, Small } from '@/components/ui';
import { HandlerTag, OrderStatusBadge } from '@/components/status';
import { useAuth, useCan } from '@/lib/auth';
import { C } from '@/lib/theme';
import { trpc } from '@/lib/trpc';

/** Filters; Home's tiles open this tab with one of them as ?status=. Lower-case keys are not a single status. */
const FILTERS: [string, string][] = [['open', 'Pending'], ['mine', 'Assigned to me'], ['unassigned', 'Not assigned'], ['TO_INVOICE', 'To invoice'], ['PACKED', 'To dispatch'], ['DISPATCHED', 'Out for delivery'], ['ON_HOLD', 'On hold'], ['DELIVERED', 'Delivered'], ['CANCELLED', 'Cancelled']];
const OPEN = ['PLACED', 'CONFIRMED', 'PACKED', 'DISPATCHED', 'ON_HOLD'];
const EMPTY: Record<string, string> = { open: 'Nothing pending.', mine: 'Nothing is assigned to you right now.', unassigned: 'Every open order has someone handling it.' };

export default function StaffOrders() {
  const { status } = useLocalSearchParams<{ status?: string }>();
  const { me } = useAuth();
  const can = useCan();
  // The owner oversees every order and never handles one: "Assigned to me" is for employees.
  const filters = FILTERS.filter(([k]) => k !== 'mine' || (!!me && me.role !== 'OWNER'));
  const filter = filters.some(([k]) => k === status) ? status! : 'open';
  const one = (ORDER_STATUSES as readonly string[]).includes(filter) ? (filter as OrderStatus) : undefined;
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  useEffect(() => { const t = setTimeout(() => setTerm(search.trim().slice(0, 60)), 300); return () => clearTimeout(t); }, [search]);
  const q = trpc.orders.list.useQuery({
    status: one ?? (filter === 'TO_INVOICE' ? 'TO_INVOICE' : undefined),
    assignedToId: filter === 'mine' ? me?.id : undefined,
    unassigned: filter === 'unassigned' || undefined,
    q: term || undefined,
  }, { placeholderData: (prev) => prev });
  // Pending, Assigned to me and Not assigned mean open orders; the server sends every status for those.
  const rows = (q.data ?? []).filter((o) => (one ? o.status === one : filter === 'TO_INVOICE' ? ['PLACED', 'CONFIRMED'].includes(o.status) : OPEN.includes(o.status)));
  return (
    <View style={{ flex: 1, backgroundColor: C.canvas }}>
      <View style={{ padding: 12, gap: 8 }}>
        {can('CREATE_ORDERS') && <Button title="New order" icon={<Ionicons name="add" size={20} color={C.white} />} onPress={() => router.push('/staff/new-order')} />}
        <TextInput accessibilityLabel="Search orders" value={search} onChangeText={setSearch} placeholder="Search order no. or customer" style={s.input} placeholderTextColor="#9aa5b1" autoCorrect={false} returnKeyType="search" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 6 }}>
          {filters.map(([k, label]) => <Chip key={k} role="tab" label={label} selected={filter === k} onPress={() => router.setParams({ status: k })} />)}
        </ScrollView>
      </View>
      {q.isLoading && <Loading />}
      <FlatList data={rows} keyExtractor={(o) => o.id} contentContainerStyle={{ padding: 12, paddingTop: 0, gap: 10 }} refreshing={q.isRefetching && !q.isPlaceholderData} onRefresh={() => void q.refetch()} keyboardShouldPersistTaps="handled"
        ListEmptyComponent={q.data && !q.isPlaceholderData ? <P muted style={{ textAlign: 'center' }}>{term ? `No orders match “${term}”.` : EMPTY[filter] ?? 'No orders here.'}</P> : undefined}
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
              {filter !== 'mine' && <HandlerTag name={o.assignedTo} open={OPEN.includes(o.status)} />}
            </Card>
          </Pressable>
        )} />
    </View>
  );
}
