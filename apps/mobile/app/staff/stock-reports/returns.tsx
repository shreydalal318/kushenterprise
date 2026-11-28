import { useState } from 'react';
import { View } from 'react-native';
import { router, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { formatDate } from '@kush/core';
import { Alert, Button, Loading, P, Row } from '@/components/ui';
import { EmptyCard, Failed, ListScreen, NoAccess, Note, SearchBox, TapCard, useFlash } from '@/components/inventory/common';
import { useCan } from '@/lib/auth';
import { C } from '@/lib/theme';
import { trpc } from '@/lib/trpc';
import { Done } from '@/components/done';

/** Goods sent back to suppliers, each with its debit note number (web: Stock → Returns to supplier). */
export default function Returns() {
  const can = useCan();
  const [search, setSearch] = useState('');
  const [pulling, setPulling] = useState(false);
  const [flash, setFlash] = useFlash('supplier-returns');
  const q = trpc.inventory.supplierReturns.useQuery(undefined, { enabled: can('MANAGE_STOCK') });
  if (!can('MANAGE_STOCK')) return <NoAccess title="Returns to supplier">Returns to supplier need the “Manage stock” permission. Ask the owner.</NoAccess>;
  const term = search.trim().toLowerCase();
  const rows = (q.data ?? []).filter((r) => !term || `${r.number} ${r.supplier} ${r.reason}`.toLowerCase().includes(term));
  return (
    <ListScreen
      top={
        <>
          <Stack.Screen options={{ title: 'Returns to supplier' }} />
          <Done message={flash} onShown={() => setFlash(null)} />
          <SearchBox value={search} onChange={setSearch} placeholder="Debit note no., supplier or reason" />
          {q.error && <Failed error={q.error} busy={q.isFetching} onRetry={() => void q.refetch()} />}
          {!q.data && !q.error && <Loading />}
        </>
      }
      footer={<Button title="Return goods to a supplier" icon={<Ionicons name="return-up-back-outline" size={20} color={C.white} />} onPress={() => router.push('/staff/stock-reports/new-return')} />}
      data={rows} keyExtractor={(r) => r.id}
      refreshing={pulling} onRefresh={() => { setPulling(true); void q.refetch().finally(() => setPulling(false)); }}
      ListEmptyComponent={q.data ? <EmptyCard title={term ? `Nothing matches “${search.trim()}”` : 'No returns yet'} hint={term ? undefined : 'Damaged or near-expiry goods sent back to a supplier show up here.'} /> : undefined}
      renderItem={({ item: r }) => (
        <TapCard label={`Debit note ${r.number}, ${r.units} units to ${r.supplier}`}>
          <Row style={{ justifyContent: 'space-between' }}>
            <P style={{ fontWeight: '700', color: C.navy }}>{r.number}</P>
            <P style={{ fontWeight: '700' }}>{r.units} unit{r.units === 1 ? '' : 's'}</P>
          </Row>
          <View><P numberOfLines={2}>{r.supplier}</P></View>
          <Note>{formatDate(r.date)} · {r.reason}</Note>
        </TapCard>
      )}
    />
  );
}
