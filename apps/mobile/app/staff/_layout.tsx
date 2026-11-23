import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { useOutbox } from '@/lib/outbox';
import { usePushRegistration } from '@/lib/push';
import { C } from '@/lib/theme';

/** Staff mode, built for one hand: scan, orders, billing, receiving, stock. */
export default function StaffLayout() {
  const { ready, me } = useAuth();
  useOutbox();
  usePushRegistration();
  if (ready && (!me || me.role === 'CUSTOMER')) return <Redirect href="/" />;
  return (
    <Stack screenOptions={{ headerTintColor: C.navy, headerTitleStyle: { fontWeight: '700' }, contentStyle: { backgroundColor: C.canvas } }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="order/[id]" options={{ title: 'Order' }} />
      <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
    </Stack>
  );
}
