import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { formatDateTime } from '@kush/core';
import { Button, Card, Loading, Screen } from '@/components/ui';
import { errorText } from '@/lib/format';
import { appRoute } from '@/lib/links';
import { C } from '@/lib/theme';
import { trpc } from '@/lib/trpc';
import { useToast } from './toast';
import { EmptyState, ErrorBox, Note } from './ui';

/** Messages about the customer's orders and invoices. Tapping one opens what it is about. */
export function CustomerMessages() {
  const toast = useToast();
  const utils = trpc.useUtils();
  const q = trpc.notifications.list.useQuery({ limit: 100 });
  const mark = trpc.notifications.markRead.useMutation({ onSuccess: () => utils.notifications.invalidate() });
  const markAll = () => mark.mutate({}, { onSuccess: () => toast('All messages marked as read') });
  if (!q.data) return q.error ? <Screen><ErrorBox text={errorText(q.error)} onRetry={() => void q.refetch()} busy={q.isFetching} /></Screen> : <Loading />;
  const unread = q.data.filter((n) => !n.readAt).length;
  return (
    <Screen>
      {q.data.length === 0 ? (
        <EmptyState icon={<Ionicons name="chatbubble-ellipses-outline" size={44} color={C.teal700} />} text="No messages yet. We'll send you one here each time your order moves to the next step." />
      ) : (
        <>
          {unread > 0 && <Button variant="secondary" title={`Mark all ${unread} as read`} loading={mark.isPending} onPress={markAll} />}
          {mark.error && <ErrorBox text={errorText(mark.error)} onRetry={markAll} busy={mark.isPending} />}
          {q.data.map((n) => {
            const route = appRoute(n.link, true, false);
            return (
              <Pressable key={n.id} accessibilityRole="button" accessibilityLabel={`${n.readAt ? '' : 'New. '}${n.title}. ${n.body}`} accessibilityHint={route ? 'Opens it' : undefined}
                onPress={() => { if (!n.readAt) mark.mutate({ ids: [n.id] }); if (route) router.push(route as never); }}>
                <Card style={!n.readAt ? { borderColor: C.teal, backgroundColor: C.aqua50 } : undefined}>
                  <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                    <View style={{ width: 10, height: 10, borderRadius: 5, marginTop: 6, backgroundColor: n.readAt ? 'transparent' : C.teal }} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={{ fontSize: 16, fontWeight: '700', color: C.navy }}>{n.title}</Text>
                      <Text style={{ fontSize: 15, color: C.ink, lineHeight: 21 }}>{n.body}</Text>
                      <Note style={{ fontSize: 14 }}>{formatDateTime(n.createdAt)}</Note>
                    </View>
                    {!!route && <Ionicons name="chevron-forward" size={20} color={C.muted} style={{ alignSelf: 'center' }} />}
                  </View>
                </Card>
              </Pressable>
            );
          })}
        </>
      )}
    </Screen>
  );
}
