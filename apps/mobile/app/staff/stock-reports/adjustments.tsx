import { useState } from 'react';
import { Text, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ADJUSTMENT_REASON_LABELS, formatDateTime, type AdjustmentReason } from '@kush/core';
import { Badge, Button, Loading, P, Row } from '@/components/ui';
import { EmptyCard, Failed, ListScreen, NoAccess, Note, SearchBox, TapCard } from '@/components/inventory/common';
import { useCan } from '@/lib/auth';
import { C } from '@/lib/theme';
import { trpc } from '@/lib/trpc';

/** The last 100 stock adjustments, each with its reason (web: Stock → Adjustments). */
export default function Adjustments() {
  const can = useCan();
  const [search, setSearch] = useState('');
  const [pulling, setPulling] = useState(false);
  const q = trpc.inventory.adjustments.useQuery(undefined, { enabled: can('MANAGE_STOCK') });
  if (!can('MANAGE_STOCK')) return <NoAccess title="Adjustments">Adjustments need the “Manage stock” permission. Ask the owner.</NoAccess>;
  const term = search.trim().toLowerCase();
  const rows = (q.data ?? []).filter((r) => !term || `${r.product} ${r.label ?? ''} ${r.batchNo} ${r.note ?? ''} ${r.by} ${r.reason ? ADJUSTMENT_REASON_LABELS[r.reason as AdjustmentReason] : ''}`.toLowerCase().includes(term));
  return (
    <ListScreen
      top={
        <>
          <Stack.Screen options={{ title: 'Adjustments' }} />
          <SearchBox value={search} onChange={setSearch} placeholder="Find product, reason, note or person" />
          {q.error && <Failed error={q.error} busy={q.isFetching} onRetry={() => void q.refetch()} />}
          {!q.data && !q.error && <Loading />}
        </>
      }
      footer={<Button title="New adjustment" icon={<Ionicons name="add" size={22} color={C.white} />} onPress={() => router.push('/staff/stock-reports/adjust')} />}
      data={rows} keyExtractor={(r) => r.id}
      refreshing={pulling} onRefresh={() => { setPulling(true); void q.refetch().finally(() => setPulling(false)); }}
      ListEmptyComponent={q.data ? <EmptyCard title={term ? `Nothing matches “${search.trim()}”` : 'No adjustments yet'} hint={term ? undefined : 'When stock is damaged, lost, given as a sample or recounted, record it with New adjustment.'} /> : undefined}
      renderItem={({ item: r }) => (
        <TapCard label={`${r.product} ${r.label ?? ''}: ${r.qty > 0 ? 'added' : 'removed'} ${Math.abs(r.qty)}`}>
          <Row style={{ alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}><P style={{ fontWeight: '700' }} numberOfLines={2}>{r.product}</P>{r.label ? <Note>{r.label}</Note> : null}</View>
            <Text style={{ fontSize: 20, fontWeight: '700', color: r.qty < 0 ? C.danger : C.ok }}>{r.qty > 0 ? `+${r.qty}` : r.qty}</Text>
          </Row>
          <Row style={{ flexWrap: 'wrap' }}>
            <Badge label={r.reason ? ADJUSTMENT_REASON_LABELS[r.reason as AdjustmentReason] : 'No reason'} tone={r.qty < 0 ? 'warn' : 'ok'} />
            <Note>Batch {r.batchNo}</Note>
          </Row>
          {r.note ? <P>“{r.note}”</P> : null}
          <Note>{formatDateTime(r.at)} · by {r.by}</Note>
        </TapCard>
      )}
    />
  );
}
