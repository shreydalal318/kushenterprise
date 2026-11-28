import { useState } from 'react';
import { Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ADJUSTMENT_REASON_LABELS, MOVEMENT_LABELS, formatDate, formatDateTime, type AdjustmentReason } from '@kush/core';
import { Badge, Card, Field, LinkButton, Loading, P, Row } from '@/components/ui';
import { EmptyCard, Failed, isDay, ListScreen, NoAccess, Note, Stat, Stats } from '@/components/inventory/common';
import { useCan } from '@/lib/auth';
import { C } from '@/lib/theme';
import { trpc } from '@/lib/trpc';

/** Every stock movement of one power or size, with the balance after each (web: Stock ledger). Newest first. */
export default function Ledger() {
  const { variantId } = useLocalSearchParams<{ variantId: string }>();
  const can = useCan();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [pulling, setPulling] = useState(false);
  const f = from.trim(), t = to.trim();
  const q = trpc.inventory.ledger.useQuery({ variantId: variantId!, from: isDay(f) ? f : undefined, to: isDay(t) ? t : undefined }, { enabled: can('MANAGE_STOCK'), placeholderData: (p) => p });
  if (!can('MANAGE_STOCK')) return <NoAccess title="Stock history">Stock history needs the “Manage stock” permission. Ask the owner.</NoAccess>;
  const d = q.data;
  const tot = (k: string) => d?.totals[k] ?? 0;
  const rows = d ? [...d.rows].reverse() : [];
  return (
    <ListScreen
      ListHeaderComponent={
        <View style={{ gap: 10, paddingBottom: 2 }}>
          <Stack.Screen options={{ title: 'Stock history' }} />
          {d && (
            <Card>
              <Text style={{ fontSize: 18, fontWeight: '700', color: C.navy }}>{d.variant.productName}</Text>
              <Note>{d.variant.label ? `${d.variant.label} · ` : ''}{d.variant.sku}</Note>
              <View style={{ alignItems: 'flex-start' }}><LinkButton title="Stock and batches" onPress={() => router.push(`/staff/stock-reports/product/${d.variant.productId}`)} /></View>
            </Card>
          )}
          <Row style={{ alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}><Field label="From (YYYY-MM-DD)" placeholder="Any" keyboardType="numbers-and-punctuation" value={from} onChangeText={setFrom} maxLength={10} error={f && !isDay(f) ? 'Use YYYY-MM-DD' : null} /></View>
            <View style={{ flex: 1 }}><Field label="To (YYYY-MM-DD)" placeholder="Today" keyboardType="numbers-and-punctuation" value={to} onChangeText={setTo} maxLength={10} error={t && !isDay(t) ? 'Use YYYY-MM-DD' : null} /></View>
          </Row>
          {q.error && <Failed error={q.error} busy={q.isFetching} onRetry={() => void q.refetch()} />}
          {!d && !q.error && <Loading />}
          {d && (
            <Stats>
              <Stat label={isDay(f) ? `On ${formatDate(f)}` : 'At the start'} value={String(d.opening)} />
              <Stat label="Now / at the end" value={String(d.closing)} tone="ok" />
              <Stat label="Received" value={String(tot('GRN') + tot('OPENING'))} />
              <Stat label="Sold" value={String(-tot('SALE'))} />
              <Stat label="Returns" value={String(tot('SALES_RETURN') + tot('PURCHASE_RETURN'))} />
              <Stat label="Adjustments" value={String(tot('ADJUSTMENT'))} />
            </Stats>
          )}
          {d && rows.length > 0 && <Note>Newest first. The number on the right is the stock after that movement.</Note>}
        </View>
      }
      data={rows} keyExtractor={(r) => r.id} initialNumToRender={20}
      refreshing={pulling} onRefresh={() => { setPulling(true); void q.refetch().finally(() => setPulling(false)); }}
      ListEmptyComponent={d ? <EmptyCard icon="time-outline" title="No movements in this time" /> : undefined}
      renderItem={({ item: r }) => (
        <Card>
          <Row style={{ alignItems: 'flex-start' }}>
            <View style={{ flex: 1, gap: 4 }}>
              <Row style={{ flexWrap: 'wrap' }}>
                <Ionicons name={r.qtyIn ? 'arrow-down-circle' : 'arrow-up-circle'} size={20} color={r.qtyIn ? C.ok : C.danger} />
                <Badge label={MOVEMENT_LABELS[r.type] ?? r.type} tone={r.qtyIn ? 'ok' : 'neutral'} />
              </Row>
              <Text style={{ fontSize: 18, fontWeight: '700', color: r.qtyIn ? C.ok : C.danger }}>{r.qtyIn ? `+${r.qtyIn} in` : `−${r.qtyOut} out`}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 20, fontWeight: '700', color: C.navy }}>{r.balance}</Text>
              <Note>after</Note>
            </View>
          </Row>
          {r.reason && <P>Reason: {ADJUSTMENT_REASON_LABELS[r.reason as AdjustmentReason] ?? r.reason}</P>}
          {r.ref ? <Note>{r.ref}</Note> : null}
          <Note>Batch {r.batchNo}{r.expiryDate ? ` · exp ${formatDate(r.expiryDate)}` : ''} · {r.location}{r.serialNos.length ? ` · ${r.serialNos.length} serial${r.serialNos.length === 1 ? '' : 's'}` : ''}</Note>
          <Note>{formatDateTime(r.at)} · {r.by}</Note>
        </Card>
      )}
    />
  );
}
