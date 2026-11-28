import { Redirect, Stack } from 'expo-router';
import { ToastProvider } from '@/customer/toast';
import { useAuth } from '@/lib/auth';
import { CartProvider } from '@/lib/cart';
import { useOutbox } from '@/lib/outbox';
import { useInAppAlerts, usePushRegistration } from '@/lib/push';
import { C } from '@/lib/theme';

/** Customer mode: tabs, with product / order / messages pushed on top (back button). */
export default function CustomerLayout() {
  const { ready, me } = useAuth();
  useOutbox(); // sends orders saved while offline as soon as the phone is back online
  usePushRegistration();
  useInAppAlerts();
  if (ready && (!me || me.role !== 'CUSTOMER')) return <Redirect href="/" />;
  // Always render the navigator (even while the session loads) so deep links land on the right screen.
  return (
    <CartProvider userId={me?.id ?? 'pending'}>
      <ToastProvider>
        <Stack screenOptions={{ headerTintColor: C.navy, headerTitleStyle: { fontWeight: '700' }, contentStyle: { backgroundColor: C.canvas } }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="product/[id]" options={{ title: 'Choose quantity', presentation: 'modal' }} />
          <Stack.Screen name="order/[id]" options={{ title: 'Your order' }} />
          <Stack.Screen name="placed" options={{ headerShown: false }} />
          <Stack.Screen name="notifications" options={{ title: 'Messages' }} />
        </Stack>
      </ToastProvider>
    </CartProvider>
  );
}
