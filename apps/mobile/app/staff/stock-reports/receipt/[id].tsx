import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { formatDate } from '@kush/core';
import { Alert, Card, H2, P, Row, Screen } from '@/components/ui';
import { FailedScreen, Line, Note, LoadingScreen } from '@/components/inventory/common';
import { useCan } from '@/lib/auth';
import { rupees } from '@/lib/format';
import { C } from '@/lib/theme';
import { trpc } from '@/lib/trpc';

/** One goods receipt: who sent it, against which PO, and each item with batch, expiry and serials. */
export default function Receipt() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const can = useCan();
  const q = trpc.inventory.receipt.useQuery({ id: id! });
  const [openSerials, setOpenSerials] = useState<string | null>(null);
  if (!q.data) return q.error ? <FailedScreen title="Goods received" error={q.error} busy={q.isFetching} onRetry={() => void q.refetch()} /> : <LoadingScreen title="Goods received" />;
  const g = q.data;
  const showRate = g.lines.some((l) => l.rate !== undefined);
  const noBarcode = [...new Map(g.lines.filter((l) => !l.hasBarcode).map((l) => [l.variantId, l])).values()];
  const units = g.lines.reduce((t, l) => t + l.qty, 0);
  const seesPos = can('CREATE_PURCHASE_ORDERS') || can('MANAGE_STOCK');
  return (
    <Screen>
      <Stack.Screen options={{ title: g.number }} />
      <Card>
        <Text style={{ fontSize: 20, fontWeight: '700', color: C.navy }}>{g.isOpening ? 'Opening stock' : g.supplier?.name}</Text>
        <Line k="Date" v={formatDate(g.date)} />
        <Line k="Units" v={String(units)} strong />
        {!!g.supplierInvoiceNo && <Line k="Their invoice" v={`${g.supplierInvoiceNo}${g.supplierInvoiceDate ? ` · ${formatDate(g.supplierInvoiceDate)}` : ''}`} />}
        {!!g.by && <Line k="Received by" v={g.by} />}
        {g.po && (seesPos ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Open purchase order ${g.po.number}`} onPress={() => router.push(`/staff/purchase-orders/${g.po!.id}`)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 }}>
            <Note>Against purchase order</Note>
            <Row><Text style={{ fontSize: 15, fontWeight: '700', color: C.teal700 }}>{g.po.number}</Text><Ionicons name="chevron-forward" size={16} color={C.teal700} /></Row>
          </Pressable>
        ) : <Line k="Against purchase order" v={g.po.number} />)}
      </Card>
      {!!g.note && <Alert tone="info">{g.note}</Alert>}
      {noBarcode.length > 0 && (
        <Card style={{ borderColor: C.warn }}>
          <P style={{ fontWeight: '700', color: C.warn }}>No barcode linked, so these can’t be scanned yet:</P>
          {noBarcode.map((l) => (
            can('MANAGE_PRODUCTS') ? (
              <Pressable key={l.variantId} accessibilityRole="button" accessibilityLabel={`Link a barcode to ${l.productName} ${l.label ?? ''}`} onPress={() => router.push(`/staff/products/power?productId=${l.productId}&variantId=${l.variantId}`)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }}>
                <P style={{ flex: 1 }}>{l.productName} {l.label ?? ''}</P>
                <Text style={{ color: C.teal700, fontWeight: '700', fontSize: 15 }}>Link barcode</Text>
              </Pressable>
            ) : <P key={l.variantId}>• {l.productName} {l.label ?? ''}</P>
          ))}
          {!can('MANAGE_PRODUCTS') && <Note>Ask someone who manages products to link them.</Note>}
        </Card>
      )}
      <H2>Items</H2>
      {g.lines.map((l) => (
        <Card key={l.id}>
          <Row style={{ alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}><P style={{ fontWeight: '700' }}>{l.productName}</P><Note>{l.label ?? l.sku}</Note></View>
            <P style={{ fontWeight: '700' }}>× {l.qty}</P>
          </Row>
          <Note>Batch {l.batchNo}{l.expiryDate ? ` · expires ${formatDate(l.expiryDate)}` : ''}</Note>
          {showRate && <Note>{rupees(l.rate)} each · {rupees((l.rate ?? 0) * l.qty)}</Note>}
          {l.serialNos.length > 0 && (
            <>
              <Pressable accessibilityRole="button" accessibilityState={{ expanded: openSerials === l.id }} onPress={() => setOpenSerials(openSerials === l.id ? null : l.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 }}>
                <Text style={{ color: C.teal700, fontWeight: '700', fontSize: 15 }}>{l.serialNos.length} serial number{l.serialNos.length === 1 ? '' : 's'}</Text>
                <Ionicons name={openSerials === l.id ? 'chevron-up' : 'chevron-down'} size={16} color={C.teal700} />
              </Pressable>
              {openSerials === l.id && <Text selectable style={{ fontSize: 15, lineHeight: 21, color: C.ink }}>{l.serialNos.join(', ')}</Text>}
            </>
          )}
        </Card>
      ))}
    </Screen>
  );
}
