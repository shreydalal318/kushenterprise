import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Bell } from '@/components/bell';
import { useAuth, useCan } from '@/lib/auth';
import { trpc } from '@/lib/trpc';
import { C } from '@/lib/theme';

/**
 * Owner: Home (today at a glance), Orders, Stock, More. Employees: Orders, Stock, More. Delivery-only staff:
 * what they have to deliver, Stock, More. The first tab is always "index", so the app opens there.
 */
export default function StaffTabs() {
  const { me } = useAuth();
  const can = useCan();
  const seesOrders = can('VIEW_ORDERS');
  const owner = me?.role === 'OWNER';
  const mine = trpc.deliveries.mine.useQuery(undefined, { enabled: !seesOrders, refetchInterval: 120_000 });
  const unread = trpc.notifications.unreadCount.useQuery(undefined, { refetchInterval: 120_000 });
  const icon = (name: keyof typeof Ionicons.glyphMap) => ({ color, size }: { color: unknown; size: number }) => <Ionicons name={name} color={color as string} size={size} />;
  return (
    // The bell sits at the top of every tab, so a new order is seen wherever you are.
    <Tabs screenOptions={{ tabBarActiveTintColor: C.teal700, tabBarLabelStyle: { fontSize: 12, fontWeight: '600' }, headerTintColor: C.navy, headerTitleStyle: { fontWeight: '700' }, sceneStyle: { backgroundColor: C.canvas }, headerRight: () => <Bell /> }}>
      <Tabs.Screen name="index" options={owner && seesOrders
        ? { title: 'Home', tabBarIcon: icon('home-outline') }
        : seesOrders
          ? { title: 'Orders', tabBarIcon: icon('cube-outline') }
          : { title: 'My deliveries', tabBarLabel: 'Deliveries', tabBarIcon: icon('bicycle-outline'), tabBarBadge: mine.data?.length || undefined }} />
      <Tabs.Screen name="orders" options={owner && seesOrders ? { title: 'Orders', tabBarIcon: icon('cube-outline') } : { href: null, title: 'Orders' }} />
      <Tabs.Screen name="stock" options={{ title: 'Stock', tabBarIcon: icon('layers-outline') }} />
      <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: icon('menu-outline'), tabBarBadge: unread.data || undefined }} />
    </Tabs>
  );
}
