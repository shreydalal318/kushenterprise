import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { formatDate, istDateString } from '@kush/core';
import { Badge, Card, LinkButton, P, Row, Screen } from '@/components/ui';
import { Check, FailedScreen, LevelBadge, Note, SearchBox, LoadingScreen } from '@/components/inventory/common';
import { useCan } from '@/lib/auth';
import { rupees } from '@/lib/format';
import { C } from '@/lib/theme';
import { trpc } from '@/lib/trpc';

/** One product's stock by power or size, each with its batches first-expiry-first-out (web: Stock → product). */
export default function ProductStock() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const can = useCan();
  const store = can('MANAGE_STOCK');
  const q = trpc.inventory.productStock.useQuery({ productId: id! });
  const [hideEmpty, setHideEmpty] = useState(true);
  const [filter, setFilter] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [serials, setSerials] = useState<string | null>(null);
  if (!q.data) return q.error ? <FailedScreen title="Stock" error={q.error} busy={q.isFetching} onRetry={() => void q.refetch()} /> : <LoadingScreen title="Stock" />;
  const { product, variants } = q.data;
  const today = istDateString();
  const total = variants.reduce((t, v) => t + v.qty, 0);
  const empty = variants.filter((v) => v.qty <= 0).length;
  const term = filter.trim().toLowerCase();
  const shown = variants.filter((v) => (!hideEmpty || v.qty > 0) && (!term || `${v.label ?? ''} ${v.sku}`.toLowerCase().includes(term)));
  return (
    <Screen>
      <Stack.Screen options={{ title: 'Stock' }} />
      <Card>
        <Text style={{ fontSize: 20, fontWeight: '700', color: C.navy }}>{product.name}</Text>
        <Note>{product.code} · {product.category}</Note>
        <P><Text style={{ fontWeight: '700' }}>{total} {product.unit}</Text> in stock</P>
        <View style={{ alignItems: 'flex-start' }}><LinkButton title="Product details" icon={<Ionicons name="cube-outline" size={18} color={C.teal700} />} onPress={() => router.push(`/staff/products/${product.id}`)} /></View>
      </Card>
      {variants.length > 1 && empty > 0 && <Check label={`Hide ${product.isLens ? 'powers' : 'sizes'} with no stock (${empty})`} value={hideEmpty} onChange={setHideEmpty} />}
      {variants.length > 12 && <SearchBox value={filter} onChange={setFilter} placeholder={product.isLens ? 'Find a power, e.g. 21.5' : 'Find a size or SKU'} />}
      {!shown.length && <Card><Note style={{ textAlign: 'center' }}>{term ? `Nothing matches “${filter.trim()}”.` : 'Nothing in stock yet.'}</Note></Card>}
      <Note>Batches are listed in the order to pick them: the one that expires first comes first.</Note>
      {shown.map((v) => {
        const isOpen = open === v.id;
        return (
          <Card key={v.id} style={isOpen ? { borderColor: C.teal } : undefined}>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: isOpen }} accessibilityLabel={`${v.label ?? 'Standard'}: ${v.qty} in stock`} onPress={() => setOpen(isOpen ? null : v.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }}>
              <View style={{ flex: 1, gap: 2 }}>
                <P style={{ fontWeight: '700' }}>{v.label ?? 'Standard'}</P>
                <Note>Reorder at {v.reorderLevel}{v.nearestExpiry ? ` · first expiry ${formatDate(v.nearestExpiry)}` : ''}</Note>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Text style={{ fontSize: 20, fontWeight: '700', color: v.qty > 0 ? C.ink : C.muted }}>{v.qty}</Text>
                <LevelBadge status={v.status} />
              </View>
              <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={C.muted} />
            </Pressable>
            {isOpen && (
              <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 8 }}>
                {!v.batches.length && <Note>No batches in stock.</Note>}
                {v.batches.map((b, i) => {
                  const k = `${b.batchId}-${b.location.id}`;
                  return (
                    <View key={k} style={{ gap: 2, paddingBottom: 6, borderBottomWidth: i < v.batches.length - 1 ? 1 : 0, borderBottomColor: C.line }}>
                      <Row style={{ justifyContent: 'space-between' }}>
                        <Row style={{ flex: 1, flexWrap: 'wrap' }}>
                          <P style={{ fontWeight: '700' }}>Batch {b.batchNo}</P>
                          {i === v.batches.findIndex((x) => !x.expired) && <Badge label="Pick first" tone="teal" />}
                          {b.expired && <Badge label="Expired" tone="danger" />}
                        </Row>
                        <P style={{ fontWeight: '700' }}>{b.qty}</P>
                      </Row>
                      <Note>{b.expiryDate ? `${b.expiryDate < today ? 'Expired' : 'Expires'} ${formatDate(b.expiryDate)}` : 'No expiry'} · {b.location.name}{b.reserved ? ` · ${b.reserved} kept for orders` : ''}{b.unitCost !== undefined ? ` · cost ${rupees(b.unitCost)}` : ''}</Note>
                      {b.serials.length > 0 && (
                        <>
                          <Pressable accessibilityRole="button" accessibilityState={{ expanded: serials === k }} onPress={() => setSerials(serials === k ? null : k)} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={{ color: C.teal700, fontWeight: '700', fontSize: 15 }}>{b.serials.length} serial number{b.serials.length === 1 ? '' : 's'}</Text>
                            <Ionicons name={serials === k ? 'chevron-up' : 'chevron-down'} size={16} color={C.teal700} />
                          </Pressable>
                          {serials === k && <Text selectable style={{ fontSize: 15, lineHeight: 21, color: C.ink }}>{b.serials.join(', ')}</Text>}
                        </>
                      )}
                      {store && <View style={{ alignItems: 'flex-start' }}><LinkButton title="Adjust this batch" onPress={() => router.push(`/staff/stock-reports/adjust?productId=${product.id}&variantId=${v.id}&batchId=${b.batchId}`)} /></View>}
                    </View>
                  );
                })}
                {store && (
                  <Row style={{ flexWrap: 'wrap', gap: 4 }}>
                    <LinkButton title="Stock history" icon={<Ionicons name="time-outline" size={18} color={C.teal700} />} onPress={() => router.push(`/staff/stock-reports/ledger/${v.id}`)} />
                    <LinkButton title="Adjust stock" icon={<Ionicons name="create-outline" size={18} color={C.teal700} />} onPress={() => router.push(`/staff/stock-reports/adjust?productId=${product.id}&variantId=${v.id}`)} />
                  </Row>
                )}
              </View>
            )}
          </Card>
        );
      })}
    </Screen>
  );
}
