import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { formatDateTime } from '@kush/core';
import { useAuth, useCan } from '@/lib/auth';
import { errorText } from '@/lib/format';
import { appRoute } from '@/lib/links';
import { C } from '@/lib/theme';
import { trpc } from '@/lib/trpc';
import { Alert, Button, Card, Empty, Loading, P, Row, Screen, Small } from './ui';

export function NotificationsList() {
  const { me } = useAuth();
  const can = useCan();
  const utils = trpc.useUtils();
  const q = trpc.notifications.list.useQuery({ limit: 100 });
  const mark = trpc.notifications.markRead.useMutation({ onSuccess: () => utils.notifications.invalidate() });
  if (!q.data) return q.error ? <Screen><Alert>{errorText(q.error)}</Alert><Button variant="secondary" title="Try again" loading={q.isFetching} onPress={() => void q.refetch()} /></Screen> : <Loading />;
  return (
    <Screen>
      <Button variant="secondary" title="Mark all as read" loading={mark.isPending} onPress={() => mark.mutate({})} />
      {mark.error && <Alert>{errorText(mark.error)}</Alert>}
      {q.data.length === 0 && <Empty>No notifications yet.</Empty>}
      {q.data.map((n) => {
        const route = appRoute(n.link, me?.role === 'CUSTOMER', can('VIEW_ORDERS'));
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
