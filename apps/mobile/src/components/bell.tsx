import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/lib/theme';
import { trpc } from '@/lib/trpc';

/** The bell at the top of the staff screens: a red count of what's new (a new order, "You'll deliver…"). */
export function Bell({ to = '/staff/notifications' }: { to?: string }) {
  const unread = trpc.notifications.unreadCount.useQuery(undefined, { refetchInterval: 30_000 });
  const n = unread.data ?? 0;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={n ? `Notifications, ${n} new` : 'Notifications'} hitSlop={8} onPress={() => router.push(to as never)}
      style={({ pressed }) => ({ width: 48, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: 4, opacity: pressed ? 0.6 : 1 })}>
      <Ionicons name={n ? 'notifications' : 'notifications-outline'} size={26} color={n ? C.teal700 : C.navy} />
      {n > 0 && (
        <View style={{ position: 'absolute', top: 4, right: 6, minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, backgroundColor: C.danger, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: C.white }}>
          <Text style={{ color: C.white, fontSize: 11, fontWeight: '800' }}>{n > 99 ? '99+' : n}</Text>
        </View>
      )}
    </Pressable>
  );
}
