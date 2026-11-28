import { useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { formatDate } from '@kush/core';
import { dueText, EmptyCard, Failed, isDay, ListShell, Muted, PdfPill, Pick, SearchBox, useDebounced, usePdf } from '@/components/sales/common';
import { PayBadge } from '@/components/status';
import { Alert, Button, Card, Field, LinkButton, Loading, P, Row, Tabs } from '@/components/ui';
import { useCan } from '@/lib/auth';
import { docPath } from '@/lib/documents';
import { rupees } from '@/lib/format';
import { C } from '@/lib/theme';
import { trpc } from '@/lib/trpc';

const STATUSES: [string, string][] = [['', 'All'], ['UNPAID', 'Unpaid'], ['PARTLY_PAID', 'Part paid'], ['OVERDUE', 'Overdue'], ['PAID', 'Paid'], ['CANCELLED', 'Cancelled']];

/**
 * Like the website's Tax invoices page: every invoice (never deleted; cancelled ones stay with their
 * reason), searchable, with paid / unpaid / overdue, and the credit notes for returned goods.
 */
export default function Invoices() {
  const can = useCan();
  const allowed = can('CREATE_TAX_INVOICE') || can('VIEW_ORDERS') || can('RECORD_PAYMENTS');
  const seesCredit = can('CREATE_TAX_INVOICE') || can('RECORD_PAYMENTS');
  const [tab, setTab] = useState<'invoices' | 'credit'>('invoices');
  const [search, setSearch] = useState('');
  const term = useDebounced(search.trim().slice(0, 60));
  const [status, setStatus] = useState('');
  const [showDates, setShowDates] = useState(false);
  const [range, setRange] = useState({ from: '', to: '' });
  const from = isDay(range.from.trim()) ? range.from.trim() : undefined;
  const to = isDay(range.to.trim()) ? range.to.trim() : undefined;
  const [pulling, setPulling] = useState(false);
  const list = trpc.invoices.list.useQuery({ q: term || undefined, status: status || undefined, from, to }, { enabled: allowed && tab === 'invoices', placeholderData: (prev) => prev });
  const cns = trpc.creditNotes.list.useQuery({ from, to }, { enabled: seesCredit && tab === 'credit', placeholderData: (prev) => prev });
  const pdf = usePdf();
  const title = <Stack.Screen options={{ title: 'Tax invoices' }} />;
  if (!allowed) return <ListShell>{title}<View style={{ padding: 16 }}><Alert tone="warn">You can’t see invoices. Ask the owner to give you that permission.</Alert></View></ListShell>;

  const q = tab === 'invoices' ? list : cns;
  const refresh = () => { setPulling(true); void q.refetch().finally(() => setPulling(false)); };
  const billed = (list.data ?? []).filter((r) => r.status !== 'CANCELLED').reduce((t, r) => t + r.total, 0);
  const owed = (list.data ?? []).reduce((t, r) => t + Math.max(0, r.due), 0);
  const cnTerm = search.trim().toLowerCase();
  const credits = (cns.data ?? []).filter((c) => !cnTerm || `${c.number} ${c.customer.name} ${c.invoice?.number ?? ''} ${c.reason}`.toLowerCase().includes(cnTerm));
  const badFrom = !!range.from.trim() && !from, badTo = !!range.to.trim() && !to;

  const filters = (
    <View style={{ gap: 8, paddingBottom: 4 }}>
      {tab === 'invoices' && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled">
          {STATUSES.map(([k, l]) => <Pick key={k || 'all'} label={l} selected={status === k} onPress={() => setStatus(k)} />)}
        </ScrollView>
      )}
      {showDates ? (
        <Card>
          <Row style={{ alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}><Field label="From (YYYY-MM-DD)" value={range.from} onChangeText={(v) => setRange({ ...range, from: v })} keyboardType="numbers-and-punctuation" maxLength={10} placeholder="2026-04-01" error={badFrom ? 'Use YYYY-MM-DD' : null} /></View>
            <View style={{ flex: 1 }}><Field label="To (YYYY-MM-DD)" value={range.to} onChangeText={(v) => setRange({ ...range, to: v })} keyboardType="numbers-and-punctuation" maxLength={10} placeholder="2027-03-31" error={badTo ? 'Use YYYY-MM-DD' : null} /></View>
          </Row>
          <LinkButton tone="muted" title="Clear dates" onPress={() => { setRange({ from: '', to: '' }); setShowDates(false); }} />
        </Card>
      ) : <LinkButton title="Show only some dates" icon={<Ionicons name="calendar-outline" size={18} color={C.teal700} />} onPress={() => setShowDates(true)} />}
      {tab === 'invoices' && list.data && <P style={{ fontWeight: '600' }}>{`${list.data.length} invoice${list.data.length === 1 ? '' : 's'} · billed ${rupees(billed)} · to receive ${rupees(owed)}`}</P>}
      {!!pdf.error && <Alert>{pdf.error}</Alert>}
    </View>
  );

  return (
    <ListShell
      top={<>
        {seesCredit && <Tabs big value={tab} onChange={setTab} options={[['invoices', 'Invoices'], ['credit', 'Credit notes']]} />}
        <SearchBox value={search} onChange={setSearch} placeholder={tab === 'invoices' ? 'Search invoice no. or customer' : 'Search credit note, customer or invoice'} />
      </>}
      footer={can('CREATE_TAX_INVOICE') ? <Button title="New invoice" icon={<Ionicons name="add" size={22} color={C.white} />} onPress={() => router.push('/staff/invoice')} /> : undefined}>
      {title}
      {q.error && !q.data ? <Failed padded error={q.error} busy={q.isFetching} onRetry={() => void q.refetch()} /> : !q.data ? <Loading /> : tab === 'invoices' ? (
        <FlatList data={list.data ?? []} keyExtractor={(r) => r.id} contentContainerStyle={{ padding: 12, paddingTop: 4, gap: 10 }} keyboardShouldPersistTaps="handled"
          refreshing={pulling} onRefresh={refresh} ListHeaderComponent={filters}
          ListEmptyComponent={<EmptyCard icon={term ? 'search-outline' : 'receipt-outline'} title={term ? `No invoices match “${term}”` : status || from || to ? 'No invoices with these filters' : 'No invoices yet'} hint={term ? 'Check the invoice number or the customer’s name.' : undefined} />}
          renderItem={({ item: r }) => {
            const cancelled = r.status === 'CANCELLED';
            return (
              <Pressable accessibilityRole="button" accessibilityLabel={`Invoice ${r.number}, ${r.customer.name}, ${rupees(r.total)}`} onPress={() => router.push(`/staff/invoices/${r.id}`)}>
                {({ pressed }) => (
                  <Card style={pressed && { backgroundColor: C.aqua50 }}>
                    <Row style={{ justifyContent: 'space-between' }}>
                      <P style={{ fontWeight: '700', color: C.navy }}>{r.number}</P>
                      <PayBadge status={r.status} />
                    </Row>
                    <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <P style={{ flex: 1 }} numberOfLines={2}>{r.customer.name}</P>
                      <P style={[{ fontWeight: '700' }, cancelled && { color: C.muted, textDecorationLine: 'line-through' }]}>{rupees(r.total)}</P>
                    </Row>
                    <Muted>{formatDate(r.date)}</Muted>
                    {r.due > 0 && <Text style={{ fontSize: 15, fontWeight: '600', color: r.status === 'OVERDUE' ? C.danger : C.ink }}>{dueText(r.due, r.dueDate)}</Text>}
                  </Card>
                )}
              </Pressable>
            );
          }} />
      ) : (
        <FlatList data={credits} keyExtractor={(c) => c.id} contentContainerStyle={{ padding: 12, paddingTop: 4, gap: 10 }} keyboardShouldPersistTaps="handled"
          refreshing={pulling} onRefresh={refresh} ListHeaderComponent={filters}
          ListEmptyComponent={<EmptyCard icon={cnTerm ? 'search-outline' : 'return-down-back-outline'} title={cnTerm ? `No credit notes match “${search.trim()}”` : 'No credit notes'} hint={cnTerm ? undefined : 'A credit note is made from an invoice when goods come back.'} />}
          renderItem={({ item: c }) => (
            <Card>
              <Row style={{ justifyContent: 'space-between' }}>
                <P style={{ fontWeight: '700', color: C.navy, flex: 1 }}>{c.number}</P>
                <P style={{ fontWeight: '700' }}>{rupees(c.total)}</P>
              </Row>
              <P numberOfLines={2}>{c.customer.name}</P>
              <Muted>{formatDate(c.date)} · {c.reason}{c.restock ? ' · put back in stock' : ''}</Muted>
              <Row style={{ justifyContent: 'space-between' }}>
                {c.invoice ? <LinkButton title={`Invoice ${c.invoice.number}`} onPress={() => router.push(`/staff/invoices/${c.invoice!.id}`)} /> : <View />}
                <PdfPill label={`Open the PDF of credit note ${c.number}`} busy={pdf.busy === docPath('credit-note', c.id)} disabled={!!pdf.busy} onPress={() => void pdf.open(docPath('credit-note', c.id), `${c.number}.pdf`)} />
              </Row>
            </Card>
          )} />
      )}
    </ListShell>
  );
}
