import { useState } from 'react';
import { View } from 'react-native';
import { router, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { stateByCode } from '@kush/core';
import { Badge, Button, Loading, P, Row } from '@/components/ui';
import { EmptyCard, Failed, ListScreen, NoAccess, Note, SearchBox, TapCard, useDebounced } from '@/components/inventory/common';
import { useCan } from '@/lib/auth';
import { C } from '@/lib/theme';
import { trpc } from '@/lib/trpc';

/** Companies we buy from (web: Suppliers), with the same permissions. */
export default function Suppliers() {
  const can = useCan();
  const allowed = can('CREATE_PURCHASE_ORDERS') || can('MANAGE_STOCK') || can('VIEW_PRICES_MARGINS');
  const [search, setSearch] = useState('');
  const term = useDebounced(search);
  const [pulling, setPulling] = useState(false);
  const q = trpc.suppliers.list.useQuery({ q: term || undefined, includeInactive: true }, { enabled: allowed, placeholderData: (p) => p });
  if (!allowed) return <NoAccess title="Suppliers">Suppliers need the “Create purchase orders”, “Manage stock” or “View prices” permission. Ask the owner.</NoAccess>;
  return (
    <ListScreen
      top={
        <>
          <Stack.Screen options={{ title: 'Suppliers' }} />
          <SearchBox value={search} onChange={setSearch} placeholder="Name, code or GSTIN" label="Search suppliers" />
          {q.error && <Failed error={q.error} busy={q.isFetching} onRetry={() => void q.refetch()} />}
          {!q.data && !q.error && <Loading />}
        </>
      }
      footer={can('CREATE_PURCHASE_ORDERS') && <Button title="New supplier" icon={<Ionicons name="add" size={22} color={C.white} />} onPress={() => router.push('/staff/suppliers/new')} />}
      data={q.data ?? []} keyExtractor={(s) => s.id}
      refreshing={pulling} onRefresh={() => { setPulling(true); void q.refetch().finally(() => setPulling(false)); }}
      ListEmptyComponent={q.data && !q.isPlaceholderData ? <EmptyCard icon="business-outline" title={term ? `No supplier matches “${term}”` : 'No suppliers yet'} hint={term ? 'Try part of the name or the GSTIN.' : can('CREATE_PURCHASE_ORDERS') ? 'Tap New supplier to add the first one.' : undefined} /> : undefined}
      renderItem={({ item: s }) => (
        <TapCard label={`${s.name}${s.isActive ? '' : ', inactive'}`} onPress={() => router.push(`/staff/suppliers/${s.id}`)} style={!s.isActive ? { opacity: 0.75 } : undefined}>
          <Row style={{ alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <P style={{ fontWeight: '700', color: C.navy }} numberOfLines={2}>{s.name}</P>
              <Note>{s.code} · {s.city}, {stateByCode(s.stateCode)?.name ?? s.stateCode}</Note>
            </View>
            {!s.isActive && <Badge label="Inactive" tone="danger" />}
          </Row>
          {!!(s.contactPerson || s.mobile) && <P>{[s.contactPerson, s.mobile].filter(Boolean).join(' · ')}</P>}
          <Note>Payment terms {s.paymentTermsDays} days · {s._count.products} product{s._count.products === 1 ? '' : 's'}</Note>
        </TapCard>
      )}
    />
  );
}
