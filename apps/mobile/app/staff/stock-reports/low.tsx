import { useState } from 'react';
import { Text, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Loading, LinkButton, P, Row } from '@/components/ui';
import { Check, EmptyCard, Failed, ListScreen, NoAccess, Note, SearchBox, TapCard } from '@/components/inventory/common';
import { useCan } from '@/lib/auth';
import { C } from '@/lib/theme';
import { trpc } from '@/lib/trpc';

/** Items at or below their reorder level (web: Stock → Low stock), with a quick way to order them. */
export default function LowStock() {
  const can = useCan();
  const buyer = can('CREATE_PURCHASE_ORDERS');
  const [all, setAll] = useState(false);
  const [search, setSearch] = useState('');
  const q = trpc.inventory.lowStock.useQuery({ includeNeverStocked: all }, { enabled: can('MANAGE_STOCK'), placeholderData: (p) => p });
  const [pulling, setPulling] = useState(false);
  if (!can('MANAGE_STOCK')) return <NoAccess title="Low stock">Low stock needs the “Manage stock” permission. Ask the owner.</NoAccess>;
  const term = search.trim().toLowerCase();
  const rows = (q.data ?? []).filter((r) => !term || `${r.productName} ${r.code} ${r.label ?? ''} ${r.sku} ${r.supplier?.name ?? ''}`.toLowerCase().includes(term));
  return (
    <ListScreen
      top={
        <>
          <Stack.Screen options={{ title: 'Low stock' }} />
          <SearchBox value={search} onChange={setSearch} placeholder="Find product, power or supplier" />
          <Check label="Also show lens powers we have never stocked" value={all} onChange={setAll} />
          {q.data && <Note>{q.data.length} item{q.data.length === 1 ? '' : 's'} at or below the reorder level.</Note>}
          {q.error && <Failed error={q.error} busy={q.isFetching} onRetry={() => void q.refetch()} />}
          {!q.data && !q.error && <Loading />}
        </>
      }
      footer={buyer && !!q.data?.length && (
        <Button title="Make a purchase order" icon={<Ionicons name="cart-outline" size={20} color={C.white} />} onPress={() => router.push('/staff/purchase-orders/new?suggest=1')} />
      )}
      data={rows} keyExtractor={(r) => r.variantId}
      refreshing={pulling} onRefresh={() => { setPulling(true); void q.refetch().finally(() => setPulling(false)); }}
      ListEmptyComponent={q.data ? <EmptyCard icon="checkmark-done-circle-outline" title={term ? `Nothing matches “${search.trim()}”` : 'Nothing is low'} hint={term ? undefined : 'Every item is above its reorder level.'} /> : undefined}
      renderItem={({ item: r }) => (
        // The supplier link sits under the card, not inside it: one tap target never holds another.
        <View style={{ gap: 2 }}>
        <TapCard label={`${r.productName} ${r.label ?? ''}: ${r.qty} on hand`} onPress={() => router.push(`/staff/stock-reports/product/${r.productId}`)}>
          <Row style={{ alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <P style={{ fontWeight: '700' }} numberOfLines={2}>{r.productName}</P>
              <Note>{r.label ?? r.sku}</Note>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 22, fontWeight: '700', color: r.qty === 0 ? C.danger : C.warn }}>{r.qty}</Text>
              <Note>on hand</Note>
            </View>
          </Row>
          <Note>Reorder at {r.reorderLevel} · suggested order {r.suggestedOrder}</Note>
          {r.supplier && <Note>Usually from {r.supplier.name}</Note>}
        </TapCard>
        {r.supplier && buyer && <View style={{ alignItems: 'flex-start', paddingLeft: 6 }}><LinkButton title={`Order from ${r.supplier.name}`} onPress={() => router.push(`/staff/purchase-orders/new?supplier=${r.supplier!.id}&suggest=1`)} /></View>}
        </View>
      )}
    />
  );
}
