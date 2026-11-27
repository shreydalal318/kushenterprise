import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Alert, Button, Card, H2, P, Row, Screen, Small } from '@/components/ui';
import { useAuth, useCan } from '@/lib/auth';
import { discard, useOutbox } from '@/lib/outbox';
import { C, R } from '@/lib/theme';
import { trpc } from '@/lib/trpc';

function MenuRow({ icon, label, hint, count, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; hint?: string; count?: number; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={count ? `${label}, ${count} new` : label} onPress={onPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 14, paddingVertical: 10, borderRadius: R.lg, borderWidth: 1, borderColor: C.line, backgroundColor: pressed ? C.aqua50 : C.white })}>
      <Ionicons name={icon} size={22} color={C.teal700} />
      <View style={{ flex: 1 }}><Text style={{ fontSize: 16, fontWeight: '600', color: C.ink }}>{label}</Text>{hint ? <Small>{hint}</Small> : null}</View>
      {!!count && <View style={{ minWidth: 24, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: C.teal700 }}><Text style={{ color: C.white, fontWeight: '700', textAlign: 'center' }}>{count}</Text></View>}
      <Ionicons name="chevron-forward" size={18} color={C.muted} />
    </Pressable>
  );
}

/** Receiving, barcode lookup, notifications, anything waiting to send, and the account. */
export default function More() {
  const { me, signOut } = useAuth();
  const can = useCan();
  const unread = trpc.notifications.unreadCount.useQuery();
  const outbox = useOutbox();
  return (
    <Screen>
      {outbox.length > 0 && (
        <Card style={{ borderColor: C.warn }}>
          <H2>Waiting to send ({outbox.length})</H2>
          {outbox.map((o) => <View key={o.id}><P>{o.label}</P>{o.error ? <><Alert>{o.error}</Alert><Button variant="secondary" title="Discard" onPress={() => void discard(o.id)} /></> : <Small>Sends by itself when you are back online</Small>}</View>)}
        </Card>
      )}
      {can('MANAGE_STOCK') && <MenuRow icon="download-outline" label="Receive goods" hint="Add stock that came from a supplier" onPress={() => router.push('/staff/receive')} />}
      <MenuRow icon="scan-outline" label="Barcode lookup" hint="Scan a box to see the product, batch and expiry" onPress={() => router.push('/staff/scan')} />
      <MenuRow icon="notifications-outline" label="Notifications" count={unread.data} onPress={() => router.push('/staff/notifications')} />
      <Card>
        <Row>
          <Ionicons name="person-circle-outline" size={36} color={C.teal700} />
          <View style={{ flex: 1 }}><P style={{ fontWeight: '700' }}>{me?.name}</P><Small>{me?.role === 'OWNER' ? 'Owner' : 'Employee'}{me?.email ? ` · ${me.email}` : ''}</Small></View>
        </Row>
      </Card>
      <Button variant="danger" title="Sign out" onPress={() => void signOut().then(() => router.replace('/login'))} />
    </Screen>
  );
}
