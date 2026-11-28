import { useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Check, Failed, NotAllowed, Note, Pills, SearchBox, Tag, Tap, useDebounced, usePull } from '@/components/admin/bits';
import { TYPE_LABEL, type CustomerType } from '@/components/admin/customer-form';
import { Picker } from '@/components/admin/pickers';
import { Button, Card, LinkButton, Loading, P, Screen } from '@/components/ui';
import { useCan } from '@/lib/auth';
import { C } from '@/lib/theme';
import { trpc } from '@/lib/trpc';

const TYPES: ['' | CustomerType, string][] = [['', 'All'], ['DOCTOR', 'Doctors'], ['HOSPITAL', 'Hospitals'], ['CLINIC', 'Clinics']];

/** Doctors, hospitals and clinics: find one, open it, or add a new one (website: Customers). */
export default function Customers() {
  const can = useCan();
  const allowed = can('MANAGE_CUSTOMERS');
  const [search, setSearch] = useState('');
  const term = useDebounced(search.trim().slice(0, 100));
  const [type, setType] = useState<'' | CustomerType>('');
  const [assigned, setAssigned] = useState('');
  const [inactive, setInactive] = useState(false);
  const [filters, setFilters] = useState(false);
  const staff = trpc.customers.staffOptions.useQuery(undefined, { enabled: allowed && filters });
  const list = trpc.customers.list.useQuery({ q: term || undefined, type: type || undefined, assignedEmployeeId: assigned || undefined, includeInactive: inactive }, { enabled: allowed, placeholderData: (p) => p });
  const pull = usePull(() => list.refetch());

  if (!allowed) return <Screen><Stack.Screen options={{ title: 'Customers' }} /><NotAllowed what="see customers" /></Screen>;
  const rows = list.data ?? [];
  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: C.canvas }}>
      <Stack.Screen options={{ title: 'Customers' }} />
      <FlatList data={rows} keyExtractor={(c) => c.id} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 12, gap: 10 }}
        {...pull}
        ListHeaderComponent={
          <View style={{ gap: 8 }}>
            <SearchBox value={search} onChange={setSearch} placeholder="Name, code, mobile or GSTIN" />
            <Pills value={type} options={TYPES} onChange={setType} />
            <LinkButton title={filters ? 'Hide more filters' : 'More filters'} icon={<Ionicons name="options-outline" size={18} color={C.teal700} />} onPress={() => setFilters(!filters)} />
            {filters && (
              <Card>
                <Picker label="Looked after by" value={assigned} onChange={setAssigned} options={[{ value: '', label: 'Anyone' }, ...(staff.data ?? []).map((u) => ({ value: u.id, label: u.name }))]} />
                <Check label="Show inactive customers too" value={inactive} onChange={setInactive} />
              </Card>
            )}
            {list.error && <Failed error={list.error} busy={list.isFetching} onRetry={() => void list.refetch()} />}
            {!list.data && !list.error && <Loading />}
            {list.data && <Note>{rows.length === 500 ? 'Showing the first 500. Search to find others.' : `${rows.length} customer${rows.length === 1 ? '' : 's'}`}</Note>}
          </View>
        }
        ListEmptyComponent={list.data ? (
          <Card style={{ alignItems: 'center', paddingVertical: 24 }}>
            <Ionicons name={term ? 'search-outline' : 'people-outline'} size={36} color={C.teal700} />
            <P style={{ fontWeight: '700', textAlign: 'center' }}>{term ? `No customer matches “${term}”` : 'No customers here yet'}</P>
            <Note style={{ textAlign: 'center' }}>{term ? 'Check the spelling, or search by mobile or code.' : 'Tap New customer to add the first one.'}</Note>
          </Card>
        ) : undefined}
        renderItem={({ item: c }) => (
          <Tap label={`${c.name}, ${TYPE_LABEL[c.type]}`} onPress={() => router.push(`/staff/customers/${c.id}`)}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
              <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: C.navy }} numberOfLines={2}>{c.name}</Text>
              <Tag label={TYPE_LABEL[c.type]} tone={c.type === 'DOCTOR' ? 'neutral' : 'teal'} />
            </View>
            <Note>{[c.code, c.city, c.parent ? `at ${c.parent.name}` : null].filter(Boolean).join(' · ')}</Note>
            <Note>
              {[c.assignedEmployee ? `Looked after by ${c.assignedEmployee.name}` : null, c.priceList ? `Price list: ${c.priceList.name}` : null,
                c._count.customPrices ? `${c._count.customPrices} special price${c._count.customPrices === 1 ? '' : 's'}` : null,
                c._count.doctors ? `${c._count.doctors} doctor${c._count.doctors === 1 ? '' : 's'}` : null,
                c._count.logins ? `${c._count.logins} login${c._count.logins === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ') || 'Default prices'}
            </Note>
            {!c.isActive && <Tag label="Inactive" tone="danger" />}
          </Tap>
        )} />
      <View style={{ padding: 12, borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.white }}>
        <Button title="New customer" icon={<Ionicons name="add" size={22} color={C.white} />} onPress={() => router.push('/staff/customers/new')} />
      </View>
    </SafeAreaView>
  );
}
