import { useState } from 'react';
import { View } from 'react-native';
import { router, Stack } from 'expo-router';
import { formatDate } from '@kush/core';
import { Loading, P, Row } from '@/components/ui';
import { EmptyCard, Failed, ListScreen, NoAccess, Note, SearchBox, Stat, Stats, TapCard } from '@/components/inventory/common';
import { useAuth } from '@/lib/auth';
import { rupees } from '@/lib/format';
import { C } from '@/lib/theme';
import { trpc } from '@/lib/trpc';

/** What the stock is worth at cost, by category and product (web: Stock → Valuation, owner only). */
export default function StockValue() {
  const { me } = useAuth();
  const owner = me?.role === 'OWNER';
  const [search, setSearch] = useState('');
  const [pulling, setPulling] = useState(false);
  const q = trpc.inventory.valuation.useQuery(undefined, { enabled: owner });
  if (!owner) return <NoAccess title="Stock value">Only the owner can see what the stock is worth.</NoAccess>;
  const d = q.data;
  const term = search.trim().toLowerCase();
  const rows = (d?.products ?? []).filter((p) => !term || `${p.name} ${p.code} ${p.category}`.toLowerCase().includes(term));
  return (
    <ListScreen
      top={
        <>
          <Stack.Screen options={{ title: 'Stock value' }} />
          <SearchBox value={search} onChange={setSearch} placeholder="Find product or category" />
          {q.error && <Failed error={q.error} busy={q.isFetching} onRetry={() => void q.refetch()} />}
        </>
      }
      ListHeaderComponent={
        <View style={{ gap: 8, paddingBottom: 2 }}>
          {!d && !q.error && <Loading />}
          {d && (
            <>
              <Stats>
                <Stat label="Total stock value" value={rupees(d.total)} sub={`at cost, on ${formatDate(d.asOn)}`} />
                {d.categories.map((c) => <Stat key={c.category} label={c.category} value={rupees(c.value)} sub={`${c.qty} units`} />)}
              </Stats>
              <Note>Cost is the price paid for each batch, or the product’s cost if that is missing.</Note>
            </>
          )}
        </View>
      }
      data={rows} keyExtractor={(p) => p.productId}
      refreshing={pulling} onRefresh={() => { setPulling(true); void q.refetch().finally(() => setPulling(false)); }}
      ListEmptyComponent={d ? <EmptyCard title={term ? `Nothing matches “${search.trim()}”` : 'No stock'} /> : undefined}
      renderItem={({ item: p }) => {
        const margin = p.atDefaultRate ? ((p.atDefaultRate - p.value) / p.atDefaultRate) * 100 : null;
        return (
          <TapCard label={`${p.name}: ${rupees(p.value)}`} onPress={() => router.push(`/staff/stock-reports/product/${p.productId}`)}>
            <Row style={{ alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}><P style={{ fontWeight: '700' }} numberOfLines={2}>{p.name}</P><Note>{p.code} · {p.category}</Note></View>
              <P style={{ fontWeight: '700', color: C.navy }}>{rupees(p.value)}</P>
            </Row>
            <Note>{p.qty} units · {rupees(p.atDefaultRate)} at our selling rate{margin != null ? ` · margin ${margin.toFixed(1)}%` : ''}</Note>
          </TapCard>
        );
      }}
    />
  );
}
