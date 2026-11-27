import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { formatDate } from '@kush/core';
import { HandlerTag, OrderStatusBadge } from '@/components/status';
import { Card, H2, Loading, P, Row, Screen, Small } from '@/components/ui';
import { useAuth, useCan } from '@/lib/auth';
import { rupees } from '@/lib/format';
import { C, R } from '@/lib/theme';
import { trpc } from '@/lib/trpc';

type Icon = keyof typeof Ionicons.glyphMap;

const greeting = () => {
  const h = Number(new Intl.DateTimeFormat('en-IN', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }).format(new Date()));
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

/** Staff home: what needs doing now, quick actions, and the latest open orders. */
export default function StaffHome() {
  const { me } = useAuth();
  const can = useCan();
  const seesOrders = can('VIEW_ORDERS');
  const owner = me?.role === 'OWNER';
  const orders = trpc.orders.list.useQuery({}, { enabled: seesOrders, refetchInterval: 60_000 });
  // The orders this employee handles, asked of the server rather than matched by name.
  const handling = trpc.orders.list.useQuery({ assignedToId: me?.id }, { enabled: seesOrders && !!me && !owner, refetchInterval: 60_000 });
  const mine = trpc.deliveries.mine.useQuery(undefined, { refetchInterval: 120_000 });
  const isOpen = (o: { status: string }) => !['DELIVERED', 'CANCELLED'].includes(o.status);
  const list = orders.data ?? [];
  const count = (s: string) => list.filter((o) => o.status === s).length;
  const open = list.filter(isOpen);

  // Each tile opens the Orders tab filtered to it. "To dispatch" can't include a dispatched order's next
  // invoice: the list doesn't say which invoices went out (the order screen does).
  const tile = (label: string, value: number, icon: Icon, tone: string, to: string, loading: boolean) => ({ label, value, icon, tone, to, loading });
  const unassigned = tile('Not assigned', open.filter((o) => !o.assignedTo).length, 'person-add-outline', C.warn, '/staff/orders?status=unassigned', orders.isLoading);
  const outForDelivery = tile('Out for delivery', count('DISPATCHED'), 'car-outline', C.ok, '/staff/orders?status=DISPATCHED', orders.isLoading);
  const deliveries = tile('My deliveries', mine.data?.length ?? 0, 'bicycle-outline', C.teal700, '/staff/deliveries', false);
  const tiles = [
    ...(seesOrders ? owner ? [
      unassigned,
      tile('To invoice', count('PLACED') + count('CONFIRMED'), 'receipt-outline', C.teal700, '/staff/orders?status=TO_INVOICE', orders.isLoading),
      tile('To dispatch', count('PACKED'), 'paper-plane-outline', C.warn, '/staff/orders?status=PACKED', orders.isLoading),
      outForDelivery,
    ] : [
      tile('Assigned to me', (handling.data ?? []).filter(isOpen).length, 'person-outline', C.teal700, '/staff/orders?status=mine', handling.isLoading),
      unassigned,
      outForDelivery,
    ] : []),
    // The owner only sees this when something has actually been handed to them to deliver.
    ...(!owner || (mine.data?.length ?? 0) > 0 ? [deliveries] : []),
  ];
  const actions: { label: string; icon: Icon; to: string; show: boolean }[] = [
    { label: 'New order', icon: 'add-circle-outline', to: '/staff/new-order', show: can('CREATE_ORDERS') },
    { label: 'Scan a barcode', icon: 'scan-outline', to: '/staff/scan', show: true },
    { label: 'New bill', icon: 'receipt-outline', to: '/staff/bill', show: can('CREATE_TAX_INVOICE') },
    { label: 'Receive goods', icon: 'download-outline', to: '/staff/receive', show: can('MANAGE_STOCK') },
  ];
  const shown = actions.filter((a) => a.show);

  return (
    <Screen>
      <View style={{ gap: 2 }}>
        <Small>{greeting()}</Small>
        <Text style={{ fontSize: 24, fontWeight: '700', color: C.navy }}>{me?.name ?? ''}</Text>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {tiles.map((t) => (
          <Pressable key={t.label} accessibilityRole="button" accessibilityLabel={`${t.label}: ${t.value}`} onPress={() => router.navigate(t.to as never)}
            style={({ pressed }) => ({ flexBasis: '47%', flexGrow: 1, backgroundColor: pressed ? C.aqua50 : C.white, borderRadius: R.lg, borderWidth: 1, borderColor: C.line, padding: 14, gap: 6 })}>
            <Ionicons name={t.icon} size={20} color={t.tone} />
            <Text style={{ fontSize: 26, fontWeight: '700', color: C.ink }}>{t.loading ? '–' : t.value}</Text>
            <Small>{t.label}</Small>
          </Pressable>
        ))}
      </View>

      <H2>Quick actions</H2>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {shown.map((a) => (
          <Pressable key={a.label} accessibilityRole="button" onPress={() => router.push(a.to as never)}
            // Four buttons in one row squeeze the labels: two rows of two instead.
            style={({ pressed }) => ({ flexBasis: shown.length > 3 ? '47%' : 0, flexGrow: 1, alignItems: 'center', gap: 6, paddingVertical: 14, borderRadius: R.lg, backgroundColor: pressed ? C.teal : C.teal700 })}>
            <Ionicons name={a.icon} size={22} color={C.white} />
            <Text style={{ color: C.white, fontWeight: '600', fontSize: 13, textAlign: 'center' }}>{a.label}</Text>
          </Pressable>
        ))}
      </View>

      {seesOrders && (
        <>
          <Row style={{ justifyContent: 'space-between' }}>
            <H2>Open orders</H2>
            {open.length > 5 && <Pressable onPress={() => router.navigate('/staff/orders?status=open')}><Text style={{ color: C.teal700, fontWeight: '600' }}>See all {open.length}</Text></Pressable>}
          </Row>
          {orders.isLoading && <Loading />}
          {orders.data && open.length === 0 && <Card><P muted style={{ textAlign: 'center' }}>No open orders. All caught up.</P></Card>}
          {open.slice(0, 5).map((o) => (
            <Pressable key={o.id} accessibilityRole="button" onPress={() => router.push(`/staff/order/${o.id}`)}>
              <Card>
                <Row style={{ justifyContent: 'space-between' }}><P style={{ fontWeight: '700', color: C.navy }}>{o.number}</P><OrderStatusBadge status={o.status} /></Row>
                <P numberOfLines={1}>{o.customer.name}</P>
                <Small>{o.units} unit{o.units === 1 ? '' : 's'} · {rupees(o.value)}{o.surgeryDate ? ` · surgery ${formatDate(o.surgeryDate)}` : ''}</Small>
                <HandlerTag name={o.assignedTo} />
              </Card>
            </Pressable>
          ))}
        </>
      )}
    </Screen>
  );
}
