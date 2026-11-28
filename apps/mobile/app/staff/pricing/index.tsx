import { useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Failed, fieldErrors, flashOn, Heading, Input, NotAllowed, Note, SearchBox, Tag, Tap } from '@/components/admin/bits';
import { TYPE_LABEL } from '@/components/admin/customer-form';
import { Alert, Button, Card, LinkButton, Loading, Screen, Tabs } from '@/components/ui';
import { useAuth, useCan } from '@/lib/auth';
import { errorText } from '@/lib/format';
import { C } from '@/lib/theme';
import { trpc } from '@/lib/trpc';

/** Who pays what: pick a customer to see every product at their price, or open a price list (website: Pricing). */
export default function Pricing() {
  const can = useCan();
  const { me } = useAuth();
  const owner = me?.role === 'OWNER';
  const allowed = can('VIEW_PRICES_MARGINS');
  const [tab, setTab] = useState<'customers' | 'lists'>('customers');
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const customers = trpc.pricing.customers.useQuery(undefined, { enabled: allowed });
  const lists = trpc.priceLists.list.useQuery(undefined, { enabled: allowed });

  const title = <Stack.Screen options={{ title: 'Pricing' }} />;
  if (!allowed) return <Screen>{title}<NotAllowed what="see prices" /></Screen>;
  if (adding) return <NewList onBack={() => setAdding(false)} />;

  const term = search.trim().toLowerCase();
  const people = (customers.data ?? []).filter((c) => !term || `${c.name} ${c.code}`.toLowerCase().includes(term));
  const q = tab === 'customers' ? customers : lists;
  const header = (
    <View style={{ gap: 8 }}>
      <Note>Each customer pays their special price if they have one, else their price list’s rate, else the normal rate. Customers only ever see their own price.</Note>
      <Tabs big value={tab} onChange={setTab} options={[['customers', 'Customer prices'], ['lists', 'Price lists']]} />
      {tab === 'customers' && <SearchBox value={search} onChange={setSearch} placeholder="Find a customer" />}
      {q.error && <Failed error={q.error} busy={q.isFetching} onRetry={() => void q.refetch()} />}
      {!q.data && !q.error && <Loading />}
    </View>
  );

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: C.canvas }}>
      {title}
      {tab === 'customers' ? (
        <FlatList data={customers.data ? people : []} keyExtractor={(c) => c.id} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 12, gap: 10 }}
          ListHeaderComponent={header}
          ListEmptyComponent={customers.data ? <Card><Note style={{ textAlign: 'center' }}>{term ? `No customer matches “${search.trim()}”.` : 'No customers yet.'}</Note></Card> : undefined}
          renderItem={({ item: c }) => (
            <Tap label={`Prices for ${c.name}`} onPress={() => router.push(`/staff/pricing/customer/${c.id}`)}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: C.navy }} numberOfLines={2}>{c.name}</Text>
              <Note>{`${c.code} · ${TYPE_LABEL[c.type]} · ${c.priceList ? `price list: ${c.priceList.name}` : 'normal prices'}`}</Note>
            </Tap>
          )} />
      ) : (
        <FlatList data={lists.data ?? []} keyExtractor={(l) => l.id} contentContainerStyle={{ padding: 12, gap: 10 }}
          ListHeaderComponent={header}
          ListEmptyComponent={lists.data ? <Card><Note style={{ textAlign: 'center' }}>No price lists yet. A price list (for example “Govt hospitals”) sets rates for every customer on it.</Note></Card> : undefined}
          renderItem={({ item: l }) => (
            <Tap label={`Price list ${l.name}`} onPress={() => router.push(`/staff/pricing/list/${l.id}`)}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: C.navy }}>{l.name}</Text>
                <Tag label={l.isActive ? 'In use' : 'Not in use'} tone={l.isActive ? 'ok' : 'neutral'} />
              </View>
              {!!l.description && <Note>{l.description}</Note>}
              <Note>{`${l._count.items} product${l._count.items === 1 ? '' : 's'} · ${l._count.customers} customer${l._count.customers === 1 ? '' : 's'}`}</Note>
            </Tap>
          )} />
      )}
      {tab === 'lists' && owner && (
        <View style={{ padding: 12, borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.white }}>
          <Button title="New price list" icon={<Ionicons name="add" size={22} color={C.white} />} onPress={() => setAdding(true)} />
        </View>
      )}
    </SafeAreaView>
  );
}

function NewList({ onBack }: { onBack: () => void }) {
  const utils = trpc.useUtils();
  const [v, setV] = useState({ name: '', description: '' });
  const create = trpc.priceLists.create.useMutation({
    onSuccess: (l) => { void utils.priceLists.list.invalidate(); flashOn(`price-list-${l.id}`, `Price list “${l.name}” made ✓ Next: add products and their rates.`); onBack(); router.push(`/staff/pricing/list/${l.id}`); },
  });
  const fe = fieldErrors(create.error);
  return (
    <Screen footer={
      <>
        {create.error && <Alert>{errorText(create.error)}</Alert>}
        <Button title="Create price list" loading={create.isPending} disabled={v.name.trim().length < 2} onPress={() => create.mutate(v)} />
        <LinkButton tone="muted" title="Back" onPress={onBack} disabled={create.isPending} />
      </>
    }>
      <Stack.Screen options={{ title: 'Pricing' }} />
      <Heading>New price list</Heading>
      <Card>
        <Input label="Name" placeholder="Govt hospitals" value={v.name} onChangeText={(name) => setV({ ...v, name })} error={fe.name} maxLength={80} autoFocus />
        <Input label="Description (optional)" value={v.description} onChangeText={(description) => setV({ ...v, description })} error={fe.description} maxLength={300} />
      </Card>
    </Screen>
  );
}
