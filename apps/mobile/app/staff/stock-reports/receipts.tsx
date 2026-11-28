import { useState } from 'react';
import { View } from 'react-native';
import { router, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { formatDate } from '@kush/core';
import { Badge, Button, Loading, P, Row } from '@/components/ui';
import { EmptyCard, Failed, ListScreen, Note, SearchBox, TapCard } from '@/components/inventory/common';
import { useCan } from '@/lib/auth';
import { C } from '@/lib/theme';
import { trpc } from '@/lib/trpc';

/** Every goods receipt, newest first (web: Stock → Receipts). */
export default function Receipts() {
  const can = useCan();
  const [search, setSearch] = useState('');
  const [pulling, setPulling] = useState(false);
  const q = trpc.inventory.receipts.useQuery({ kind: 'ALL', limit: 200 });
  const term = search.trim().toLowerCase();
  const rows = (q.data ?? []).filter((r) => !term || `${r.number} ${r.supplier?.name ?? 'opening stock'} ${r.supplierInvoiceNo ?? ''} ${r.by}`.toLowerCase().includes(term));
  return (
    <ListScreen
      top={
        <>
          <Stack.Screen options={{ title: 'Goods received' }} />
          <SearchBox value={search} onChange={setSearch} placeholder="Receipt no., supplier or their invoice no." />
          {q.error && <Failed error={q.error} busy={q.isFetching} onRetry={() => void q.refetch()} />}
          {!q.data && !q.error && <Loading />}
        </>
      }
      footer={can('MANAGE_STOCK') && <Button title="Receive goods" icon={<Ionicons name="download-outline" size={20} color={C.white} />} onPress={() => router.push('/staff/receive')} />}
      data={rows} keyExtractor={(r) => r.id}
      refreshing={pulling} onRefresh={() => { setPulling(true); void q.refetch().finally(() => setPulling(false)); }}
      ListEmptyComponent={q.data ? <EmptyCard title={term ? `Nothing matches “${search.trim()}”` : 'No goods received yet'} hint={term ? undefined : 'Each delivery from a supplier shows up here once it is received.'} /> : undefined}
      renderItem={({ item: r }) => (
        <TapCard label={`Receipt ${r.number}, ${r.units} units`} onPress={() => router.push(`/staff/stock-reports/receipt/${r.id}`)}>
          <Row style={{ justifyContent: 'space-between' }}>
            <P style={{ fontWeight: '700', color: C.navy }}>{r.number}</P>
            <P style={{ fontWeight: '700' }}>{r.units} unit{r.units === 1 ? '' : 's'}</P>
          </Row>
          <View>
            {r.isOpening ? <Badge label="Opening stock" tone="teal" /> : <P numberOfLines={2}>{r.supplier?.name}</P>}
          </View>
          <Note>{formatDate(r.date)} · {r.lines} item{r.lines === 1 ? '' : 's'}{r.supplierInvoiceNo ? ` · their invoice ${r.supplierInvoiceNo}` : ''}{r.by ? ` · by ${r.by}` : ''}</Note>
        </TapCard>
      )}
    />
  );
}
