import { useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { formatDateTime } from '@kush/core';
import { Failed, NotAllowed, Note, Pills, SearchBox, Tag, Tap, useDebounced, usePull } from '@/components/admin/bits';
import { LEAD_STATUS, LEAD_TYPE } from '@/components/admin/labels';
import { Card, Loading, P, Screen } from '@/components/ui';
import { useCan } from '@/lib/auth';
import { C } from '@/lib/theme';
import { trpc } from '@/lib/trpc';

type Status = '' | 'NEW' | 'CONTACTED' | 'CONVERTED' | 'CLOSED';
const TABS: [Status, string][] = [['NEW', 'New'], ['CONTACTED', 'Contacted'], ['CONVERTED', 'Customers'], ['CLOSED', 'Closed'], ['', 'All']];

/** Enquiries from the website: call back, note what happened, turn real ones into customers (website: Leads). */
export default function Leads() {
  const can = useCan();
  const allowed = can('MANAGE_CUSTOMERS');
  const [status, setStatus] = useState<Status>('NEW');
  const [search, setSearch] = useState('');
  const term = useDebounced(search.trim().slice(0, 80));
  const list = trpc.leads.list.useQuery({ status: status || undefined, q: term || undefined }, { enabled: allowed, placeholderData: (p) => p });
  const counts = trpc.leads.counts.useQuery(undefined, { enabled: allowed });
  const pull = usePull(() => Promise.all([list.refetch(), counts.refetch()]));

  if (!allowed) return <Screen><Stack.Screen options={{ title: 'Leads' }} /><NotAllowed what="see website enquiries" /></Screen>;
  const tabs = TABS.map(([k, l]): [Status, string] => [k, k && counts.data?.[k] ? `${l} (${counts.data[k]})` : l]);
  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: C.canvas }}>
      <Stack.Screen options={{ title: 'Leads' }} />
      <FlatList data={list.data ?? []} keyExtractor={(l) => l.id} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 12, gap: 10 }}
        {...pull}
        ListHeaderComponent={
          <View style={{ gap: 8 }}>
            <Note>Enquiries from the website. Call back, write what happened, and turn real customers into customers here.</Note>
            <Pills value={status} options={tabs} onChange={setStatus} />
            <SearchBox value={search} onChange={setSearch} placeholder="Name, clinic, mobile or city" />
            {list.error && <Failed error={list.error} busy={list.isFetching} onRetry={() => void list.refetch()} />}
            {!list.data && !list.error && <Loading />}
          </View>
        }
        ListEmptyComponent={list.data ? (
          <Card style={{ alignItems: 'center', paddingVertical: 24 }}>
            <Ionicons name="file-tray-outline" size={36} color={C.teal700} />
            <P style={{ fontWeight: '700', textAlign: 'center' }}>{term ? `Nothing matches “${term}”` : 'No enquiries here'}</P>
            <Note style={{ textAlign: 'center' }}>{status === 'NEW' ? 'New enquiries from the website show up here.' : 'Try another tab.'}</Note>
          </Card>
        ) : undefined}
        renderItem={({ item: l }) => {
          const [word, tone] = LEAD_STATUS[l.status] ?? [l.status, 'neutral'];
          return (
            <Tap label={`Enquiry from ${l.organisation || l.name}, ${word}`} onPress={() => router.push(`/staff/leads/${l.id}`)}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: C.navy }} numberOfLines={2}>{l.organisation || l.name}{l.organisation ? <Text style={{ fontWeight: '400', color: C.muted }}>{` · ${l.name}`}</Text> : null}</Text>
                <Tag label={word} tone={tone} />
              </View>
              <P numberOfLines={2}>{l.message}</P>
              <Note>{[formatDateTime(l.createdAt), l.city, l.type ? LEAD_TYPE[l.type] : null].filter(Boolean).join(' · ')}</Note>
            </Tap>
          );
        }} />
    </SafeAreaView>
  );
}
