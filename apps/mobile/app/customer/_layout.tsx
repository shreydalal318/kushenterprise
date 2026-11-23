import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { CartProvider } from '@/lib/cart';
import { useOutbox } from '@/lib/outbox';
import { usePushRegistration } from '@/lib/push';
import { C } from '@/lib/theme';

/** Customer mode: tabs, with product / order / notifications pushed on top (back button). */
export default function CustomerLayout() {
  const { ready, me } = useAuth();
  useOutbox(); // sends orders saved while offline as soon as the phone is back online
  usePushRegistration();
  if (ready && (!me || me.role !== 'CUSTOMER')) return <Redirect href="/" />;
  // Always render the navigator (even while the session loads) so deep links land on the right screen.
  return (
    <CartProvider userId={me?.id ?? 'pending'}>
      <Stack screenOptions={{ headerTintColor: C.navy, headerTitleStyle: { fontWeight: '700' }, contentStyle: { backgroundColor: C.canvas } }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="product/[id]" options={{ title: 'Product' }} />
        <Stack.Screen name="order/[id]" options={{ title: 'Order' }} />
        <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
      </Stack>
    </CartProvider>
  );
}
