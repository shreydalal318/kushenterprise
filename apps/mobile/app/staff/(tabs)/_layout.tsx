import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCan } from '@/lib/auth';
import { trpc } from '@/lib/trpc';
import { C } from '@/lib/theme';

/** Tabs follow the owner's permission ticks. */
export default function StaffTabs() {
  const can = useCan();
  const mine = trpc.deliveries.mine.useQuery(undefined, { refetchInterval: 120_000 });
  const icon = (name: keyof typeof Ionicons.glyphMap) => ({ color, size }: { color: unknown; size: number }) => <Ionicons name={name} color={color as string} size={size} />;
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: C.teal700, headerTintColor: C.navy, headerTitleStyle: { fontWeight: '700' }, sceneStyle: { backgroundColor: C.canvas } }}>
      <Tabs.Screen name="index" options={{ title: 'Scan', tabBarIcon: icon('scan-outline') }} />
      <Tabs.Screen name="orders" options={{ title: 'Orders', tabBarIcon: icon('cube-outline'), href: can('VIEW_ORDERS') ? undefined : null }} />
      <Tabs.Screen name="deliveries" options={{ title: 'Deliver', tabBarIcon: icon('bicycle-outline'), tabBarBadge: mine.data?.length || undefined }} />
      <Tabs.Screen name="bill" options={{ title: 'Bill', tabBarIcon: icon('receipt-outline'), href: can('CREATE_TAX_INVOICE') ? undefined : null }} />
      <Tabs.Screen name="receive" options={{ title: 'Receive', tabBarIcon: icon('download-outline'), href: can('MANAGE_STOCK') ? undefined : null }} />
      <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: icon('menu-outline') }} />
    </Tabs>
  );
}
