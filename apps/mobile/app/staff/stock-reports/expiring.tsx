import { useState } from 'react';
import { Text, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { formatDate } from '@kush/core';
import { Badge, Loading, P, Row } from '@/components/ui';
import { EmptyCard, Failed, ListScreen, NoAccess, Note, Pills, SearchBox, Stat, Stats, TapCard } from '@/components/inventory/common';
import { useCan } from '@/lib/auth';
import { rupees } from '@/lib/format';
import { C } from '@/lib/theme';
import { trpc } from '@/lib/trpc';

/** Batches that expire soon or already have (web: Stock → Expiring), first to expire on top. */
export default function Expiring() {
  const can = useCan();
  const [days, setDays] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [pulling, setPulling] = useState(false);
  const q = trpc.inventory.expiring.useQuery(days ? { days } : undefined, { enabled: can('MANAGE_STOCK'), placeholderData: (p) => p });
  if (!can('MANAGE_STOCK')) return <NoAccess title="Expiring soon">Expiring stock needs the “Manage stock” permission. Ask the owner.</NoAccess>;
  const all = q.data?.rows ?? [];
  const alert = q.data?.alertDays ?? [30, 60, 90];
  const window = days ?? Math.max(...alert);
  const buckets = [...new Set(all.map((r) => r.bucket))];
  const showValue = all.some((r) => r.value !== undefined);
  const term = search.trim().toLowerCase();
  const rows = all.filter((r) => !term || `${r.productName} ${r.code} ${r.label ?? ''} ${r.sku} ${r.batchNo}`.toLowerCase().includes(term));
  return (
    <ListScreen
      top={
        <>
          <Stack.Screen options={{ title: 'Expiring soon' }} />
          <SearchBox value={search} onChange={setSearch} placeholder="Find product, power or batch" />
          {q.error && <Failed error={q.error} busy={q.isFetching} onRetry={() => void q.refetch()} />}
        </>
      }
      ListHeaderComponent={
        <View style={{ gap: 8, paddingBottom: 2 }}>
          <Note>Show stock that expires within</Note>
          <Pills options={[...new Set([...alert, 180])].sort((a, b) => a - b).map((d) => [d, `${d} days`] as [number, string])} value={window} onChange={setDays} />
          {!q.data && !q.error && <Loading />}
          {q.data && buckets.length > 0 && (
            <Stats>
              {buckets.map((b) => {
                const r = all.filter((x) => x.bucket === b);
                return <Stat key={b} label={b === 'Expired' ? 'Already expired' : b} tone={b === 'Expired' ? 'danger' : undefined} value={`${r.reduce((t, x) => t + x.qty, 0)} units`} sub={showValue ? `${rupees(r.reduce((t, x) => t + (x.value ?? 0), 0))} at cost` : undefined} />;
              })}
            </Stats>
          )}
        </View>
      }
      data={rows} keyExtractor={(r) => `${r.batchId}-${r.location}`}
      refreshing={pulling} onRefresh={() => { setPulling(true); void q.refetch().finally(() => setPulling(false)); }}
      ListEmptyComponent={q.data ? <EmptyCard icon="checkmark-done-circle-outline" title={term ? `Nothing matches “${search.trim()}”` : 'Nothing expires in this time'} /> : undefined}
      renderItem={({ item: r }) => {
        const expired = r.bucket === 'Expired';
        return (
          <TapCard label={`${r.productName} ${r.label ?? ''}, batch ${r.batchNo}, ${expired ? 'expired' : 'expires'} ${formatDate(r.expiryDate)}`} onPress={() => router.push(`/staff/stock-reports/product/${r.productId}`)} style={expired ? { borderColor: C.danger } : undefined}>
            <Row style={{ alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <P style={{ fontWeight: '700' }} numberOfLines={2}>{r.productName}</P>
                <Note>{r.label ?? r.sku}</Note>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 22, fontWeight: '700', color: C.ink }}>{r.qty}</Text>
                <Note>units</Note>
              </View>
            </Row>
            <Row style={{ flexWrap: 'wrap' }}>
              <Badge label={expired ? 'Expired' : r.bucket} tone={expired ? 'danger' : r.bucket.startsWith('0') ? 'warn' : 'teal'} />
              <Text style={{ fontSize: 15, fontWeight: '700', color: expired ? C.danger : C.ink }}>{expired ? 'Expired' : 'Expires'} {formatDate(r.expiryDate)}</Text>
            </Row>
            <Note>Batch {r.batchNo} · {r.location}{r.value !== undefined ? ` · ${rupees(r.value)} at cost` : ''}</Note>
          </TapCard>
        );
      }}
    />
  );
}
