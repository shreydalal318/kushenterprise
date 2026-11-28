import { useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { formatDateTime } from '@kush/core';
import { Failed, Note, Pills, Tag, usePull, type Tone } from '@/components/admin/bits';
import { Picker } from '@/components/admin/pickers';
import { Alert, Button, Card, Loading, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { C } from '@/lib/theme';
import { trpc } from '@/lib/trpc';

/** The website's filters, plus the other areas the log records. The server matches the start of the action name. */
const ACTIONS: [string, string][] = [
  ['', 'Everything'], ['auth.', 'Sign-ins & security'], ['employee.', 'Employees'], ['settings.', 'Settings'], ['category.', 'Categories'],
  ['order.', 'Orders'], ['invoice.', 'Invoices'], ['payment.', 'Payments'], ['customer.', 'Customers'], ['price.', 'Prices'], ['stock.', 'Stock'], ['product.', 'Products'],
];
const tone = (a: string): Tone => (a.includes('failed') || a.includes('locked') || a.includes('deactivate') || a.includes('cancel') ? 'danger' : a.startsWith('auth.') ? 'neutral' : 'teal');
/** "customer.login_create" → "customer · login create" */
const words = (a: string) => a.replace(/_/g, ' ').replace('.', ' · ');

/** Who did what, and when (owner only). Entries can't be changed or deleted. */
export default function Activity() {
  const { me } = useAuth();
  const owner = me?.role === 'OWNER';
  const [action, setAction] = useState('');
  const [actorId, setActorId] = useState('');
  const actors = trpc.activity.actors.useQuery(undefined, { enabled: owner });
  const q = trpc.activity.list.useInfiniteQuery(
    { action: action || undefined, actorId: actorId || undefined, limit: 50 },
    { enabled: owner, getNextPageParam: (p) => p.nextCursor ?? undefined },
  );
  const pull = usePull(() => q.refetch());
  const title = <Stack.Screen options={{ title: 'Activity log' }} />;
  if (!owner) return <Screen>{title}<Alert tone="warn">Only the owner can see the activity log.</Alert></Screen>;
  const rows = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: C.canvas }}>
      {title}
      <FlatList data={rows} keyExtractor={(r) => r.id} contentContainerStyle={{ padding: 12, gap: 10 }}
        {...pull}
        onEndReachedThreshold={0.4} onEndReached={() => { if (q.hasNextPage && !q.isFetchingNextPage) void q.fetchNextPage(); }}
        ListHeaderComponent={
          <View style={{ gap: 8 }}>
            <Note>Who did what, and when. Entries can’t be changed or deleted.</Note>
            <Pills value={action} options={ACTIONS} onChange={setAction} />
            <Picker label="Person" value={actorId} onChange={setActorId} options={[{ value: '', label: 'Everyone' }, ...(actors.data ?? []).map((a) => ({ value: a.id, label: a.name }))]} />
            {q.error && <Failed error={q.error} busy={q.isFetching} onRetry={() => void q.refetch()} />}
            {q.isLoading && <Loading />}
          </View>
        }
        ListEmptyComponent={q.data ? <Card><Note style={{ textAlign: 'center' }}>Nothing matches these filters.</Note></Card> : undefined}
        renderItem={({ item: r }) => (
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
              <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: C.navy }}>{r.actor?.name ?? 'System'}</Text>
              <Note>{formatDateTime(r.createdAt)}</Note>
            </View>
            <Tag label={words(r.action)} tone={tone(r.action)} />
            {r.summary ? <Text style={{ fontSize: 15, color: C.ink, lineHeight: 21 }}>{r.summary}</Text> : null}
            {r.ip ? <Note>{`From ${r.ip}`}</Note> : null}
          </Card>
        )}
        ListFooterComponent={q.hasNextPage ? (
          <Button variant="secondary" title="Show older" loading={q.isFetchingNextPage} onPress={() => void q.fetchNextPage()} />
        ) : rows.length ? <Note style={{ textAlign: 'center' }}>That’s everything.</Note> : undefined} />
    </SafeAreaView>
  );
}
