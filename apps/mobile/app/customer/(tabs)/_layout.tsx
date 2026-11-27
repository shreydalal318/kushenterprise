import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCart } from '@/lib/cart';
import { C } from '@/lib/theme';

export default function CustomerTabs() {
  const cart = useCart();
  const icon = (name: keyof typeof Ionicons.glyphMap) => ({ color, size }: { color: unknown; size: number }) => <Ionicons name={name} color={color as string} size={size} />;
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: C.teal700, headerTintColor: C.navy, headerTitleStyle: { fontWeight: '700' }, sceneStyle: { backgroundColor: C.canvas } }}>
      <Tabs.Screen name="index" options={{ title: 'Order', headerShown: false, tabBarIcon: icon('storefront-outline') }} />
      <Tabs.Screen name="cart" options={{ title: 'Cart', tabBarIcon: icon('cart-outline'), tabBarBadge: cart.count || undefined }} />
      <Tabs.Screen name="orders" options={{ title: 'Orders', tabBarIcon: icon('cube-outline') }} />
      <Tabs.Screen name="account" options={{ title: 'Account', tabBarIcon: icon('wallet-outline') }} />
    </Tabs>
  );
}
