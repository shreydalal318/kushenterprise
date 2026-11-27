import { useEffect, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { MyDeliveries } from '@/components/deliveries';
import { HandlerTag, StaffStatusBadge, staffStatus, StepDots, stepOf, SurgeryChip, surgeryIn } from '@/components/status';
import { Alert, Button, Card, Loading, P, Row, s, Small, Tabs } from '@/components/ui';
import { useAuth, useCan } from '@/lib/auth';
import { errorText, rupees } from '@/lib/format';
import { C, R } from '@/lib/theme';
import { trpc, type RouterOutputs } from '@/lib/trpc';

type Order = RouterOutputs['orders']['list'][number];
// Asked for status by status: the server returns the newest 200, and an old open order must never be
// pushed off the list by newer delivered ones.
const TODO = ['TO_INVOICE', 'PACKED', 'DISPATCHED', 'ON_HOLD'] as const;
const DONE = ['DELIVERED', 'CANCELLED'] as const;
/** 0 surgery today, tomorrow or already past · 1 within 3 days · 2 later · 3 no surgery date. */
const urgency = (o: Order) => { if (!o.surgeryDate) return 3; const d = surgeryIn(o.surgeryDate); return d <= 1 ? 0 : d <= 3 ? 1 : 2; };

/** Staff home. Delivery-only staff can't see orders, so theirs is the list of what they have to deliver. */
export default function StaffHome() {
  const can = useCan();
  return can('VIEW_ORDERS') ? <Orders /> : <MyDeliveries />;
}

/** Two lists only: To do (everything still open, most urgent first) and Done. */
function Orders() {
  const { me } = useAuth();
  const can = useCan();
  const [tab, setTab] = useState<'todo' | 'done'>('todo');
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [unassignedFirst, setUnassignedFirst] = useState(false);
  const [pulling, setPulling] = useState(false);
  useEffect(() => { const t = setTimeout(() => setTerm(search.trim().slice(0, 60)), 300); return () => clearTimeout(t); }, [search]);
  const q = term || undefined;
  const todo = trpc.useQueries((t) => TODO.map((status) => t.orders.list({ status, q }, { placeholderData: (prev) => prev, refetchInterval: 60_000 })));
  const done = trpc.useQueries((t) => DONE.map((status) => t.orders.list({ status, q }, { placeholderData: (prev) => prev, enabled: tab === 'done' })));
  // The owner oversees and never handles. An employee's own orders (asked of the server by id, not matched
  // by name) and anything handed to them to deliver come first within the same urgency.
  const owner = me?.role === 'OWNER';
  const handling = trpc.orders.list.useQuery({ assignedToId: me?.id, limit: 500 }, { enabled: !!me && !owner, refetchInterval: 60_000 });
  const drops = trpc.deliveries.mine.useQuery(undefined, { refetchInterval: 120_000 });
  const handled = new Set(owner ? [] : (handling.data ?? []).map((o) => o.id));
  const mine = new Set([...handled, ...(drops.data ?? []).map((d) => d.orderId)]);

  const lists = tab === 'todo' ? todo : done;
  const loaded = lists.every((x) => x.data);
  const settled = lists.every((x) => x.data && !x.isPlaceholderData);
  const error = lists.find((x) => x.error)?.error;
  const open = todo.flatMap((x) => x.data ?? []);
  const unassigned = open.filter((o) => !o.assignedTo).length;
  const rows = tab === 'todo'
    ? [...open].sort((a, b) => (unassignedFirst ? Number(!!a.assignedTo) - Number(!!b.assignedTo) : 0)
      || urgency(a) - urgency(b)
      || Number(!mine.has(a.id)) - Number(!mine.has(b.id))
      || (a.surgeryDate && b.surgeryDate ? a.surgeryDate.localeCompare(b.surgeryDate) : 0)
      || a.createdAt.getTime() - b.createdAt.getTime())
    : done.flatMap((x) => x.data ?? []).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const refresh = () => { setPulling(true); void Promise.all([...lists.map((x) => x.refetch()), drops.refetch()]).finally(() => setPulling(false)); };

  return (
    <View style={{ flex: 1, backgroundColor: C.canvas }}>
      <View style={{ padding: 12, gap: 8 }}>
        <Tabs big value={tab} onChange={setTab} options={[['todo', `To do${todo.every((x) => x.data) ? ` (${open.length})` : ''}`], ['done', 'Done']]} />
        <TextInput accessibilityLabel="Search orders" value={search} onChangeText={setSearch} placeholder="Search order no. or customer" style={s.input} placeholderTextColor="#9aa5b1" autoCorrect={false} returnKeyType="search" />
        {tab === 'todo' && unassigned > 0 && (
          <Pressable accessibilityRole="button" onPress={() => setUnassignedFirst(!unassignedFirst)}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 12, borderRadius: R.md, backgroundColor: C.warn50, opacity: pressed ? 0.7 : 1 })}>
            <Ionicons name="person-add-outline" size={18} color={C.warn} />
            <Text style={{ flex: 1, color: C.warn, fontSize: 15, fontWeight: '600' }}>{unassigned === 1 ? '1 order is not assigned' : `${unassigned} orders are not assigned`}</Text>
            <Text style={{ color: C.warn, fontSize: 14, fontWeight: '700' }}>{unassignedFirst ? 'Undo' : 'Show first'}</Text>
          </Pressable>
        )}
        {error && <Alert>{errorText(error)}</Alert>}
        {error && <Button variant="secondary" title="Try again" onPress={refresh} />}
      </View>
      {!loaded && !error && <Loading />}
      <FlatList data={rows} keyExtractor={(o) => o.id} contentContainerStyle={{ padding: 12, paddingTop: 0, gap: 10 }} keyboardShouldPersistTaps="handled"
        refreshing={pulling} onRefresh={refresh}
        ListEmptyComponent={settled ? (
          <Card style={{ alignItems: 'center', paddingVertical: 28 }}>
            <Ionicons name={term ? 'search-outline' : tab === 'todo' ? 'checkmark-done-circle-outline' : 'file-tray-outline'} size={36} color={C.teal700} />
            <P style={{ fontWeight: '700', textAlign: 'center' }}>{term ? `No orders match “${term}”` : tab === 'todo' ? 'No orders to do' : 'No delivered orders yet'}</P>
            <Small style={{ textAlign: 'center' }}>
              {term ? 'Check the order number or the customer’s name.' : tab === 'done' ? 'Orders show up here once they are delivered.' : can('CREATE_ORDERS') ? 'All caught up. Tap New order when a doctor calls.' : 'All caught up. New orders show up here.'}
            </Small>
          </Card>
        ) : undefined}
        renderItem={({ item: o }) => {
          const flagged = tab === 'todo' && unassignedFirst && !o.assignedTo;
          return (
            <Pressable accessibilityRole="button" accessibilityLabel={`Order ${o.number}, ${o.customer.name}, ${staffStatus(o.status)}`} onPress={() => router.push(`/staff/order/${o.id}`)}>
              {({ pressed }) => (
                <Card style={[pressed && { backgroundColor: C.aqua50 }, flagged && { borderColor: C.warn, borderWidth: 2 }]}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <P style={{ fontWeight: '700', color: C.navy }}>{o.number}</P>
                    <StaffStatusBadge status={o.status} />
                  </Row>
                  <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <P style={{ flex: 1 }} numberOfLines={2}>{o.customer.name}</P>
                    <P style={{ fontWeight: '700' }}>{rupees(o.value)}</P>
                  </Row>
                  {stepOf(o.status) > 0 && <StepDots status={o.status} />}
                  <Row style={{ flexWrap: 'wrap' }}>
                    <SurgeryChip date={o.surgeryDate} done={tab === 'done'} />
                    <HandlerTag name={o.assignedTo} you={handled.has(o.id)} open={tab === 'todo'} />
                  </Row>
                </Card>
              )}
            </Pressable>
          );
        }} />
      {can('CREATE_ORDERS') && (
        <View style={{ padding: 12, borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.white }}>
          <Button title="New order" icon={<Ionicons name="add" size={22} color={C.white} />} onPress={() => router.push('/staff/new-order')} />
        </View>
      )}
    </View>
  );
}
