import { useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AGEING_BUCKETS, formatDate, PAYMENT_MODE_LABEL, type PaymentMode } from '@kush/core';
import { EmptyCard, Failed, ListShell, Muted, SearchBox } from '@/components/sales/common';
import { Alert, Button, Card, LinkButton, Loading, P, Row, Tabs } from '@/components/ui';
import { useCan } from '@/lib/auth';
import { rupees } from '@/lib/format';
import { C, R } from '@/lib/theme';
import { trpc } from '@/lib/trpc';

/**
 * Like the website's Payments page: money received (and which invoices it paid), and who still owes
 * us, with how old the dues are. Record payment is the one button at the bottom.
 */
export default function Payments() {
  const can = useCan();
  const allowed = can('RECORD_PAYMENTS');
  const [tab, setTab] = useState<'received' | 'owed'>('received');
  const [search, setSearch] = useState('');
  const [pulling, setPulling] = useState(false);
  const list = trpc.payments.list.useQuery(undefined, { enabled: allowed && tab === 'received' });
  const rec = trpc.ledger.receivables.useQuery(undefined, { enabled: allowed && tab === 'owed' });
  const title = <Stack.Screen options={{ title: 'Payments' }} />;
  if (!allowed) return <ListShell>{title}<View style={{ padding: 16 }}><Alert tone="warn">You can’t record payments. Ask the owner to give you that permission.</Alert></View></ListShell>;

  const q = tab === 'received' ? list : rec;
  const refresh = () => { setPulling(true); void q.refetch().finally(() => setPulling(false)); };
  const term = search.trim().toLowerCase();
  const payments = (list.data ?? []).filter((p) => !term || `${p.number} ${p.customer.name} ${p.reference ?? ''} ${p.invoices.map((i) => i.number).join(' ')}`.toLowerCase().includes(term));
  const owed = (rec.data ?? []).filter((r) => !term || `${r.name} ${r.code}`.toLowerCase().includes(term));
  const totalOwed = (rec.data ?? []).reduce((t, r) => t + Math.max(0, r.outstanding), 0);
  const totalOverdue = (rec.data ?? []).reduce((t, r) => t + Math.max(0, r.overdue), 0);
  const record = (customerId?: string) => router.push(customerId ? `/staff/payments/new?customerId=${customerId}` : '/staff/payments/new');

  return (
    <ListShell
      top={<>
        <Tabs big value={tab} onChange={setTab} options={[['received', 'Received'], ['owed', 'Still owed']]} />
        <SearchBox value={search} onChange={setSearch} placeholder={tab === 'received' ? 'Search customer, receipt or invoice' : 'Search customer'} />
      </>}
      footer={<Button title="Record payment" icon={<Ionicons name="add" size={22} color={C.white} />} onPress={() => record()} />}>
      {title}
      {q.error && !q.data ? <Failed padded error={q.error} busy={q.isFetching} onRetry={() => void q.refetch()} /> : !q.data ? <Loading /> : tab === 'received' ? (
        <FlatList data={payments} keyExtractor={(p) => p.id} contentContainerStyle={{ padding: 12, paddingTop: 4, gap: 10 }} keyboardShouldPersistTaps="handled"
          refreshing={pulling} onRefresh={refresh}
          ListHeaderComponent={<Muted>Money received, applied to invoices. Anything not applied stays on the customer’s account.</Muted>}
          ListEmptyComponent={<EmptyCard icon={term ? 'search-outline' : 'wallet-outline'} title={term ? `Nothing matches “${search.trim()}”` : 'No payments yet'} hint={term ? undefined : 'Tap Record payment when money comes in.'} />}
          renderItem={({ item: p }) => (
            <Card>
              <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}><P style={{ fontWeight: '700', color: C.navy }}>{p.customer.name}</P><Muted>{`Receipt ${p.number} · ${formatDate(p.date)}`}</Muted></View>
                <Text style={{ fontSize: 17, fontWeight: '700', color: C.ok }}>{rupees(p.amount)}</Text>
              </Row>
              <Muted>{`${PAYMENT_MODE_LABEL[p.mode as PaymentMode] ?? p.mode}${p.reference ? ` · ${p.reference}` : ''}`}</Muted>
              {p.invoices.length > 0 && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {p.invoices.map((i) => (
                    <Pressable key={i.id} accessibilityRole="button" accessibilityLabel={`Open invoice ${i.number}`} onPress={() => router.push(`/staff/invoices/${i.id}`)}
                      style={({ pressed }) => ({ minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: R.md, borderWidth: 1, borderColor: C.line, backgroundColor: pressed ? C.aqua50 : C.white })}>
                      <Text style={{ fontSize: 15, color: C.teal700, fontWeight: '700' }}>{i.number}</Text>
                      <Text style={{ fontSize: 15, color: C.muted }}>{rupees(i.amount)}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
              {p.onAccount > 0 && <Text style={{ fontSize: 15, color: C.warn, fontWeight: '600' }}>{`${rupees(p.onAccount)} kept on account (not applied to an invoice)`}</Text>}
            </Card>
          )} />
      ) : (
        <FlatList data={owed} keyExtractor={(r) => r.customerId} contentContainerStyle={{ padding: 12, paddingTop: 4, gap: 10 }} keyboardShouldPersistTaps="handled"
          refreshing={pulling} onRefresh={refresh}
          ListHeaderComponent={rec.data && rec.data.length > 0 ? <P style={{ fontWeight: '600' }}>{`Owed to us ${rupees(totalOwed)}${totalOverdue > 0 ? ` · overdue ${rupees(totalOverdue)}` : ''}`}</P> : undefined}
          ListEmptyComponent={<EmptyCard icon={term ? 'search-outline' : 'checkmark-done-circle-outline'} title={term ? `No customer matches “${search.trim()}”` : 'Nothing is owed'} hint={term ? undefined : 'Every invoice is paid.'} />}
          renderItem={({ item: r }) => {
            const over = r.creditLimit != null && r.outstanding > r.creditLimit;
            const ages = AGEING_BUCKETS.filter((b) => r.ageing[b] > 0);
            return (
              <Card>
                <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1 }}><P style={{ fontWeight: '700', color: C.navy }}>{r.name}</P><Muted>{`${r.code}${r.creditLimit ? ` · limit ${rupees(r.creditLimit)}` : ''}`}</Muted></View>
                  {r.outstanding < 0
                    ? <View style={{ alignItems: 'flex-end' }}><Text style={{ fontSize: 17, fontWeight: '700', color: C.ok }}>{rupees(-r.outstanding)}</Text><Muted>paid in advance</Muted></View>
                    : <Text style={{ fontSize: 17, fontWeight: '700', color: over ? C.danger : C.ink }}>{rupees(r.outstanding)}</Text>}
                </Row>
                {over && <Text style={{ fontSize: 15, color: C.danger, fontWeight: '600' }}>Over the credit limit</Text>}
                {r.overdue > 0 && <Text style={{ fontSize: 15, color: C.danger, fontWeight: '600' }}>{`${rupees(r.overdue)} overdue`}</Text>}
                {ages.length > 0 && <Muted>{ages.map((b) => `${b} days: ${rupees(r.ageing[b])}`).join(' · ')}</Muted>}
                {r.onAccount > 0 && <Muted>{`${rupees(r.onAccount)} on account`}</Muted>}
                <LinkButton title="Record payment" icon={<Ionicons name="wallet-outline" size={18} color={C.teal700} />} onPress={() => record(r.customerId)} />
              </Card>
            );
          }} />
      )}
    </ListShell>
  );
}
