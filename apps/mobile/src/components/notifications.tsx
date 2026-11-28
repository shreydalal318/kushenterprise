import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { formatDateTime } from '@kush/core';
import { useAuth, useCan } from '@/lib/auth';
import { errorText } from '@/lib/format';
import { appRoute } from '@/lib/links';
import { C } from '@/lib/theme';
import { trpc } from '@/lib/trpc';
import { showDone } from './done';
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
      <PushCheck owner={me?.role === 'OWNER'} />
      <Button variant="secondary" title="Mark all as read" loading={mark.isPending} onPress={() => mark.mutate({})} />
      {mark.error && <Alert>{errorText(mark.error)}</Alert>}
      {q.data.length === 0 && <Empty>No notifications yet.</Empty>}
      {q.data.map((n) => {
        // Staff home is a tab: go back to it rather than stacking a second copy.
        const route = appRoute(n.link, me?.role === 'CUSTOMER', can('VIEW_ORDERS'));
        return (
          <Pressable key={n.id} accessibilityRole="button" onPress={() => { if (!n.readAt) mark.mutate({ ids: [n.id] }); if (route === '/staff') router.navigate(route); else if (route) router.push(route as never); }}>
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

/**
 * Are alerts reaching this phone? One plain line, and a button that rings your own phones so you can see.
 * The owner also sees what is missing on the server (switched off, no Firebase key).
 */
function PushCheck({ owner }: { owner: boolean }) {
  const st = trpc.notifications.pushStatus.useQuery();
  const test = trpc.notifications.sendTest.useMutation({
    onSuccess: (r) => { if (r.status === 'sent') showDone('Test sent', 'Your phone should ring in a few seconds.'); },
  });
  if (!st.data) return null;
  const d = st.data;
  const problems = [
    !d.switchedOn && 'Phone alerts are switched off (Settings → Notifications).',
    owner && !d.firebaseProject && 'The server has no Firebase key yet (Render → Environment → FCM_SERVICE_ACCOUNT).',
    !d.phones && 'This account has no phone set up for alerts yet: open the app with internet and allow notifications.',
  ].filter(Boolean) as string[];
  return (
    <Card style={problems.length ? { borderColor: C.warn } : undefined}>
      <P style={{ fontWeight: '700', color: problems.length ? C.warn : C.ok }}>{problems.length ? 'Phone alerts need attention' : `Phone alerts are on ✓ (${d.phones} phone${d.phones === 1 ? '' : 's'})`}</P>
      {problems.map((p) => <Small key={p}>{p}</Small>)}
      {test.data && test.data.status !== 'sent' && <Alert tone="warn">{test.data.phones ? 'The test could not be sent. Check the Firebase key on the server.' : 'No phone is set up for this account yet.'}</Alert>}
      {test.error && <Alert>{errorText(test.error)}</Alert>}
      <Button variant="secondary" title="Send a test notification" loading={test.isPending} onPress={() => test.mutate()} />
    </Card>
  );
}
