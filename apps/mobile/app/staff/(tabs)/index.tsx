import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { OrderStatusBadge } from '@/components/status';
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
  const orders = trpc.orders.list.useQuery({}, { enabled: seesOrders, refetchInterval: 60_000 });
  const mine = trpc.deliveries.mine.useQuery(undefined, { refetchInterval: 120_000 });
  const list = orders.data ?? [];
  const count = (s: string) => list.filter((o) => o.status === s).length;
  const open = list.filter((o) => !['DELIVERED', 'CANCELLED'].includes(o.status));

  const tiles: { label: string; value: number; icon: Icon; tone: string; to: string }[] = [
    ...(seesOrders ? [
      { label: 'New orders', value: count('PLACED'), icon: 'sparkles-outline' as Icon, tone: C.teal700, to: '/staff/orders' },
      { label: 'To pack', value: count('CONFIRMED'), icon: 'cube-outline' as Icon, tone: C.navy, to: '/staff/orders' },
      { label: 'Ready to dispatch', value: count('PACKED'), icon: 'paper-plane-outline' as Icon, tone: C.warn, to: '/staff/orders' },
      { label: 'Out for delivery', value: count('DISPATCHED'), icon: 'car-outline' as Icon, tone: C.ok, to: '/staff/orders' },
    ] : []),
    { label: 'My deliveries', value: mine.data?.length ?? 0, icon: 'bicycle-outline', tone: C.teal700, to: '/staff/deliveries' },
  ];
  const actions: { label: string; icon: Icon; to: string; show: boolean }[] = [
    { label: 'Scan a barcode', icon: 'scan-outline', to: '/staff/scan', show: true },
    { label: 'New bill', icon: 'receipt-outline', to: '/staff/bill', show: can('CREATE_TAX_INVOICE') },
    { label: 'Receive goods', icon: 'download-outline', to: '/staff/receive', show: can('MANAGE_STOCK') },
  ];

  return (
    <Screen>
      <View style={{ gap: 2 }}>
        <Small>{greeting()}</Small>
        <Text style={{ fontSize: 24, fontWeight: '700', color: C.navy }}>{me?.name ?? ''}</Text>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {tiles.map((t) => (
          <Pressable key={t.label} accessibilityRole="button" accessibilityLabel={`${t.label}: ${t.value}`} onPress={() => router.push(t.to as never)}
            style={({ pressed }) => ({ flexBasis: '47%', flexGrow: 1, backgroundColor: pressed ? C.aqua50 : C.white, borderRadius: R.lg, borderWidth: 1, borderColor: C.line, padding: 14, gap: 6 })}>
            <Ionicons name={t.icon} size={20} color={t.tone} />
            <Text style={{ fontSize: 26, fontWeight: '700', color: C.ink }}>{seesOrders && orders.isLoading && t.to === '/staff/orders' ? '–' : t.value}</Text>
            <Small>{t.label}</Small>
          </Pressable>
        ))}
      </View>

      <H2>Quick actions</H2>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {actions.filter((a) => a.show).map((a) => (
          <Pressable key={a.label} accessibilityRole="button" onPress={() => router.push(a.to as never)}
            style={({ pressed }) => ({ flex: 1, alignItems: 'center', gap: 6, paddingVertical: 14, borderRadius: R.lg, backgroundColor: pressed ? C.teal : C.teal700 })}>
            <Ionicons name={a.icon} size={22} color={C.white} />
            <Text style={{ color: C.white, fontWeight: '600', fontSize: 13, textAlign: 'center' }}>{a.label}</Text>
          </Pressable>
        ))}
      </View>

      {seesOrders && (
        <>
          <Row style={{ justifyContent: 'space-between' }}>
            <H2>Open orders</H2>
            {open.length > 5 && <Pressable onPress={() => router.push('/staff/orders')}><Text style={{ color: C.teal700, fontWeight: '600' }}>See all {open.length}</Text></Pressable>}
          </Row>
          {orders.isLoading && <Loading />}
          {orders.data && open.length === 0 && <Card><P muted style={{ textAlign: 'center' }}>No open orders. All caught up.</P></Card>}
          {open.slice(0, 5).map((o) => (
            <Pressable key={o.id} accessibilityRole="button" onPress={() => router.push(`/staff/order/${o.id}`)}>
              <Card>
                <Row style={{ justifyContent: 'space-between' }}><P style={{ fontWeight: '700', color: C.navy }}>{o.number}</P><OrderStatusBadge status={o.status} /></Row>
                <P numberOfLines={1}>{o.customer.name}</P>
                <Small>{o.units} unit{o.units === 1 ? '' : 's'} · {rupees(o.value)}{o.surgeryDate ? ` · surgery ${o.surgeryDate.toString().slice(0, 10)}` : ''}</Small>
              </Card>
            </Pressable>
          ))}
        </>
      )}
    </Screen>
  );
}
