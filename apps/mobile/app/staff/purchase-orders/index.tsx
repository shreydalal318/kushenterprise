import { useState } from 'react';
import { View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { formatDate } from '@kush/core';
import { Badge, Button, Loading, P, Row, Tabs } from '@/components/ui';
import { EmptyCard, Failed, ListScreen, NoAccess, Note, PickList, PoBadge, SearchBox, TapCard, useDebounced } from '@/components/inventory/common';
import { useCan } from '@/lib/auth';
import { rupees } from '@/lib/format';
import { C } from '@/lib/theme';
import { trpc } from '@/lib/trpc';

type Tab = 'OPEN' | 'DRAFT' | 'RECEIVED' | 'ALL';
const EMPTY: Record<Tab, string> = { OPEN: 'Nothing on order right now', DRAFT: 'No drafts', RECEIVED: 'Nothing fully received yet', ALL: 'No purchase orders yet' };

/** Orders to suppliers (web: Purchase orders). Open ones stay open until the goods arrive or the PO is short-closed. */
export default function PurchaseOrders() {
  const params = useLocalSearchParams<{ supplier?: string }>();
  const can = useCan();
  const allowed = can('CREATE_PURCHASE_ORDERS') || can('MANAGE_STOCK');
  const [tab, setTab] = useState<Tab>(params.supplier ? 'ALL' : 'OPEN');
  const [supplierId, setSupplierId] = useState<string | null>(params.supplier ?? null);
  const [search, setSearch] = useState('');
  const term = useDebounced(search);
  const [pulling, setPulling] = useState(false);
  const suppliers = trpc.suppliers.list.useQuery(undefined, { enabled: allowed });
  const q = trpc.purchaseOrders.list.useQuery({ status: tab === 'ALL' ? undefined : tab, q: term || undefined, supplierId: supplierId ?? undefined }, { enabled: allowed, placeholderData: (p) => p });
  if (!allowed) return <NoAccess title="Purchase orders">Purchase orders need the “Create purchase orders” or “Manage stock” permission. Ask the owner.</NoAccess>;
  return (
    <ListScreen
      top={
        <>
          <Stack.Screen options={{ title: 'Purchase orders' }} />
          <Tabs big value={tab} onChange={setTab} options={[['OPEN', 'Open'], ['DRAFT', 'Drafts'], ['RECEIVED', 'Received'], ['ALL', 'All']]} />
          <SearchBox value={search} onChange={setSearch} placeholder="PO number or supplier" label="Search purchase orders" />
          {q.error && <Failed error={q.error} busy={q.isFetching} onRetry={() => void q.refetch()} />}
          {!q.data && !q.error && <Loading />}
        </>
      }
      ListHeaderComponent={(suppliers.data?.length ?? 0) > 1 ? <View style={{ paddingBottom: 2 }}><PickList label="Supplier" value={supplierId} none="All suppliers" items={(suppliers.data ?? []).map((s) => ({ id: s.id, label: s.name }))} onChange={setSupplierId} /></View> : undefined}
      footer={can('CREATE_PURCHASE_ORDERS') && <Button title="New purchase order" icon={<Ionicons name="add" size={22} color={C.white} />} onPress={() => router.push(`/staff/purchase-orders/new${supplierId ? `?supplier=${supplierId}` : ''}`)} />}
      data={q.data ?? []} keyExtractor={(p) => p.id}
      refreshing={pulling} onRefresh={() => { setPulling(true); void q.refetch().finally(() => setPulling(false)); }}
      ListEmptyComponent={q.data && !q.isPlaceholderData ? <EmptyCard icon="car-outline" title={term ? `Nothing matches “${term}”` : EMPTY[tab]} hint={tab === 'OPEN' && !term ? 'POs that are sent and still waiting for goods show up here.' : undefined} /> : undefined}
      renderItem={({ item: p }) => (
        <TapCard label={`Purchase order ${p.number}, ${p.supplier.name}`} onPress={() => router.push(`/staff/purchase-orders/${p.id}`)} style={p.late ? { borderColor: C.danger } : undefined}>
          <Row style={{ justifyContent: 'space-between' }}>
            <P style={{ fontWeight: '700', color: C.navy }}>{p.number}</P>
            <Row><PoBadge status={p.status} />{p.late && <Badge label="Late" tone="danger" />}</Row>
          </Row>
          <View><P numberOfLines={2}>{p.supplier.name}</P></View>
          <Row style={{ justifyContent: 'space-between' }}>
            <Note style={{ flex: 1 }}>{formatDate(p.date)}{p.expectedDate ? ` · expected ${formatDate(p.expectedDate)}` : ''}</Note>
            {p.total != null && <P style={{ fontWeight: '700' }}>{rupees(p.total)}</P>}
          </Row>
          <Note>Received {p.received} of {p.ordered}</Note>
        </TapCard>
      )}
    />
  );
}
