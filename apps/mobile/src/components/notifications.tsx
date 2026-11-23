import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { formatDateTime } from '@kush/core';
import { useAuth } from '@/lib/auth';
import { C } from '@/lib/theme';
import { trpc } from '@/lib/trpc';
import { Button, Card, Empty, Loading, P, Row, Screen, Small } from './ui';

/** Map a web link from a notification to the matching app screen. */
function appRoute(link: string | null, customer: boolean): string | null {
  if (!link) return null;
  const m = link.match(/\/(?:portal|app)\/orders\/([^/?]+)/);
  if (m) return customer ? `/customer/order/${m[1]}` : `/staff/order/${m[1]}`;
  if (link.startsWith('/portal/invoices') || link.startsWith('/portal/account')) return '/customer/account';
  return null;
}

export function NotificationsList() {
  const { me } = useAuth();
  const utils = trpc.useUtils();
  const q = trpc.notifications.list.useQuery({ limit: 100 });
  const mark = trpc.notifications.markRead.useMutation({ onSuccess: () => utils.notifications.invalidate() });
  if (!q.data) return <Loading />;
  return (
    <Screen>
      <Button variant="secondary" title="Mark all as read" loading={mark.isPending} onPress={() => mark.mutate({})} />
      {q.data.length === 0 && <Empty>No notifications yet.</Empty>}
      {q.data.map((n) => {
        const route = appRoute(n.link, me?.role === 'CUSTOMER');
        return (
          <Pressable key={n.id} accessibilityRole="button" onPress={() => { if (!n.readAt) mark.mutate({ ids: [n.id] }); if (route) router.push(route as never); }}>
            <Card style={!n.readAt ? { borderColor: C.teal, backgroundColor: C.aqua50 } : undefined}>
              <Row style={{ alignItems: 'flex-start' }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, marginTop: 7, backgroundColor: n.readAt ? 'transparent' : C.teal }} />
                <View style={{ flex: 1 }}><P style={{ fontWeight: '700', color: C.navy }}>{n.title}</P><P>{n.body}</P><Small>{formatDateTime(n.createdAt)}</Small></View>
              </Row>
            </Card>
          </Pressable>
        );
      })}
    </Screen>
  );
}
