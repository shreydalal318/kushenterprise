import { useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { formatDateTime } from '@kush/core';
import { Failed, Note, SearchBox, Tag, Tap, usePull } from '@/components/admin/bits';
import { employeeStatus } from '@/components/admin/employee-bits';
import { Alert, Button, Card, Loading, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { C } from '@/lib/theme';
import { trpc } from '@/lib/trpc';

/** Staff logins and what each person may do (owner only, like the website's Employees). */
export default function Employees() {
  const { me } = useAuth();
  const owner = me?.role === 'OWNER';
  const list = trpc.employees.list.useQuery(undefined, { enabled: owner });
  const [search, setSearch] = useState('');
  const pull = usePull(() => list.refetch());
  const title = <Stack.Screen options={{ title: 'Employees' }} />;
  if (!owner) return <Screen>{title}<Alert tone="warn">Only the owner can manage employees.</Alert></Screen>;
  const term = search.trim().toLowerCase();
  const rows = (list.data ?? []).filter((e) => !term || `${e.name} ${e.email ?? ''} ${e.mobile ?? ''}`.toLowerCase().includes(term));
  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: C.canvas }}>
      {title}
      <FlatList data={rows} keyExtractor={(e) => e.id} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 12, gap: 10 }}
        {...pull}
        ListHeaderComponent={
          <View style={{ gap: 8 }}>
            <Note>Add staff and tick exactly what each person may do. Changes apply on their next tap.</Note>
            {(list.data?.length ?? 0) > 5 && <SearchBox value={search} onChange={setSearch} placeholder="Find by name, email or mobile" />}
            {list.error && <Failed error={list.error} busy={list.isFetching} onRetry={() => void list.refetch()} />}
            {!list.data && !list.error && <Loading />}
          </View>
        }
        ListEmptyComponent={list.data ? <Card><Note style={{ textAlign: 'center' }}>{term ? `Nobody matches “${search.trim()}”.` : 'No employees yet. Add your first team member.'}</Note></Card> : undefined}
        renderItem={({ item: e }) => {
          const [word, tone] = employeeStatus(e);
          return (
            <Tap label={`${e.name}, ${word}`} onPress={() => router.push(`/staff/employees/${e.id}`)}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: C.navy }}>{e.name}</Text>
                <Tag label={word} tone={tone} />
              </View>
              <Note>{[e.mobile, e.email].filter(Boolean).join(' · ') || 'No contact'}</Note>
              <Note>{`${e.permissions.length ? `${e.permissions.length} permission${e.permissions.length === 1 ? '' : 's'}` : 'No permissions'} · last signed in ${e.lastLoginAt ? formatDateTime(e.lastLoginAt) : 'never'}`}</Note>
            </Tap>
          );
        }} />
      <View style={{ padding: 12, borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.white }}>
        <Button title="Add employee" icon={<Ionicons name="person-add-outline" size={20} color={C.white} />} onPress={() => router.push('/staff/employees/new')} />
      </View>
    </SafeAreaView>
  );
}
