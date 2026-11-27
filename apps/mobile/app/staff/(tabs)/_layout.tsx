import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCan } from '@/lib/auth';
import { trpc } from '@/lib/trpc';
import { C } from '@/lib/theme';

/** Three tabs: Orders is home (or, for delivery-only staff, what they have to deliver), Stock, More. */
export default function StaffTabs() {
  const can = useCan();
  const seesOrders = can('VIEW_ORDERS');
  const mine = trpc.deliveries.mine.useQuery(undefined, { enabled: !seesOrders, refetchInterval: 120_000 });
  const unread = trpc.notifications.unreadCount.useQuery(undefined, { refetchInterval: 120_000 });
  const icon = (name: keyof typeof Ionicons.glyphMap) => ({ color, size }: { color: unknown; size: number }) => <Ionicons name={name} color={color as string} size={size} />;
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: C.teal700, tabBarLabelStyle: { fontSize: 12, fontWeight: '600' }, headerTintColor: C.navy, headerTitleStyle: { fontWeight: '700' }, sceneStyle: { backgroundColor: C.canvas } }}>
      <Tabs.Screen name="index" options={seesOrders
        ? { title: 'Orders', tabBarIcon: icon('cube-outline') }
        : { title: 'My deliveries', tabBarLabel: 'Deliveries', tabBarIcon: icon('bicycle-outline'), tabBarBadge: mine.data?.length || undefined }} />
      <Tabs.Screen name="stock" options={{ title: 'Stock', tabBarIcon: icon('layers-outline') }} />
      <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: icon('menu-outline'), tabBarBadge: unread.data || undefined }} />
    </Tabs>
  );
}
