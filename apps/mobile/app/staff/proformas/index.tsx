import { useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { formatDate } from '@kush/core';
import { EmptyCard, Failed, ListShell, Muted, ProformaBadge, SearchBox, useDebounced } from '@/components/sales/common';
import { Alert, Button, Card, Loading, P, Row } from '@/components/ui';
import { useCan } from '@/lib/auth';
import { rupees } from '@/lib/format';
import { C } from '@/lib/theme';
import { trpc } from '@/lib/trpc';

/** Like the website's Proforma page: quotes for hospitals, newest first; open one to send it or turn it into a tax invoice. */
export default function Proformas() {
  const can = useCan();
  const allowed = can('CREATE_PROFORMA') || can('VIEW_ORDERS');
  const [search, setSearch] = useState('');
  const term = useDebounced(search.trim().slice(0, 60));
  const [pulling, setPulling] = useState(false);
  const list = trpc.proformas.list.useQuery({ q: term || undefined }, { enabled: allowed, placeholderData: (prev) => prev });
  const title = <Stack.Screen options={{ title: 'Proforma' }} />;
  if (!allowed) return <ListShell>{title}<View style={{ padding: 16 }}><Alert tone="warn">You can’t see proformas. Ask the owner to give you that permission.</Alert></View></ListShell>;
  const refresh = () => { setPulling(true); void list.refetch().finally(() => setPulling(false)); };

  return (
    <ListShell top={<SearchBox value={search} onChange={setSearch} placeholder="Search proforma no. or customer" />}
      footer={can('CREATE_PROFORMA') ? <Button title="New proforma" icon={<Ionicons name="add" size={22} color={C.white} />} onPress={() => router.push('/staff/proformas/new')} /> : undefined}>
      {title}
      {list.error && !list.data ? <Failed padded error={list.error} busy={list.isFetching} onRetry={() => void list.refetch()} /> : !list.data ? <Loading /> : (
        <FlatList data={list.data} keyExtractor={(p) => p.id} contentContainerStyle={{ padding: 12, paddingTop: 4, gap: 10 }} keyboardShouldPersistTaps="handled"
          refreshing={pulling} onRefresh={refresh}
          ListHeaderComponent={<Muted>A proforma is a quote at the customer’s prices. No stock is taken until it becomes a tax invoice.</Muted>}
          ListEmptyComponent={<EmptyCard icon={term ? 'search-outline' : 'document-text-outline'} title={term ? `No proformas match “${term}”` : 'No proformas yet'} hint={term ? 'Check the number or the customer’s name.' : can('CREATE_PROFORMA') ? 'Tap New proforma to make a quote.' : undefined} />}
          renderItem={({ item: p }) => (
            <Pressable accessibilityRole="button" accessibilityLabel={`Proforma ${p.number}, ${p.customer.name}, ${rupees(p.total)}`} onPress={() => router.push(`/staff/proformas/${p.id}`)}>
              {({ pressed }) => (
                <Card style={pressed && { backgroundColor: C.aqua50 }}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <P style={{ fontWeight: '700', color: C.navy }}>{p.number}</P>
                    <ProformaBadge status={p.status} />
                  </Row>
                  <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <P style={{ flex: 1 }} numberOfLines={2}>{p.customer.name}</P>
                    <P style={[{ fontWeight: '700' }, p.status === 'CANCELLED' && { color: C.muted, textDecorationLine: 'line-through' }]}>{rupees(p.total)}</P>
                  </Row>
                  <Muted>{`${formatDate(p.date)} · valid until ${formatDate(p.validUntil)}`}</Muted>
                  {p.invoice && <Muted>{`Tax invoice ${p.invoice.number}${p.invoice.status === 'CANCELLED' ? ' (cancelled)' : ''}`}</Muted>}
                </Card>
              )}
            </Pressable>
          )} />
      )}
    </ListShell>
  );
}
