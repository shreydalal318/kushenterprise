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
      {/* Five tabs at most; Scan and Receive open from Home's quick actions and More. */}
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: icon('home-outline') }} />
      <Tabs.Screen name="orders" options={{ title: 'Orders', tabBarIcon: icon('cube-outline'), href: can('VIEW_ORDERS') ? undefined : null }} />
      <Tabs.Screen name="bill" options={{ title: 'Bill', tabBarIcon: icon('receipt-outline'), href: can('CREATE_TAX_INVOICE') ? undefined : null }} />
      <Tabs.Screen name="deliveries" options={{ title: 'Deliver', tabBarIcon: icon('bicycle-outline'), tabBarBadge: mine.data?.length || undefined }} />
      <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: icon('menu-outline') }} />
      <Tabs.Screen name="scan" options={{ title: 'Scan a barcode', href: null }} />
      <Tabs.Screen name="receive" options={{ title: 'Receive goods', href: null }} />
    </Tabs>
  );
}
