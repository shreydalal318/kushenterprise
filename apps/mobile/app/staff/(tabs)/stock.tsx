import { useEffect, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatDate, istDateString } from '@kush/core';
import { Alert, Badge, Button, Card, Loading, P, Row, s, Small } from '@/components/ui';
import { errorText } from '@/lib/format';
import { C, R } from '@/lib/theme';
import { trpc } from '@/lib/trpc';

const LEVEL: Record<string, [string, 'ok' | 'warn' | 'danger']> = { IN_STOCK: ['In stock', 'ok'], LOW_STOCK: ['Low', 'warn'], OUT_OF_STOCK: ['Out', 'danger'], EXPIRING_SOON: ['Expiring soon', 'warn'] };
const Level = ({ status }: { status: string }) => <Badge label={LEVEL[status]?.[0] ?? ''} tone={LEVEL[status]?.[1] ?? 'ok'} />;

/** What is in stock: search, then tap a product for each power or size with its quantity and nearest expiry. */
export default function Stock() {
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [pulling, setPulling] = useState(false);
  useEffect(() => { const t = setTimeout(() => setTerm(search.trim().slice(0, 60)), 300); return () => clearTimeout(t); }, [search]);
  const q = trpc.inventory.overview.useQuery({ q: term || undefined }, { placeholderData: (prev) => prev });
  return (
    <View style={{ flex: 1, backgroundColor: C.canvas }}>
      <View style={{ padding: 12, gap: 8 }}>
        <TextInput accessibilityLabel="Search stock" value={search} onChangeText={setSearch} placeholder="Search product name or code" style={s.input} placeholderTextColor="#9aa5b1" autoCorrect={false} returnKeyType="search" />
        {q.error && <Alert>{errorText(q.error)}</Alert>}
        {q.error && <Button variant="secondary" title="Try again" loading={q.isFetching} onPress={() => void q.refetch()} />}
      </View>
      {!q.data && !q.error && <Loading />}
      <FlatList data={q.data ?? []} keyExtractor={(r) => r.productId} contentContainerStyle={{ padding: 12, paddingTop: 0, gap: 10 }} keyboardShouldPersistTaps="handled"
        refreshing={pulling} onRefresh={() => { setPulling(true); void q.refetch().finally(() => setPulling(false)); }}
        ListEmptyComponent={q.data && !q.isPlaceholderData ? (
          <Card style={{ alignItems: 'center', paddingVertical: 28 }}>
            <Ionicons name="search-outline" size={36} color={C.teal700} />
            <P style={{ fontWeight: '700', textAlign: 'center' }}>{term ? `No product matches “${term}”` : 'No products yet'}</P>
            <Small style={{ textAlign: 'center' }}>{term ? 'Try part of the name, or the product code.' : 'Products added on the website show up here.'}</Small>
          </Card>
        ) : undefined}
        renderItem={({ item: r }) => {
          const open = openId === r.productId;
          return (
            <Card style={open ? { borderColor: C.teal } : undefined}>
              <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`${r.name}, ${r.qty} ${r.unit}, ${LEVEL[r.status]?.[0] ?? ''}`}
                onPress={() => setOpenId(open ? null : r.productId)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <P style={{ fontWeight: '700' }} numberOfLines={2}>{r.name}</P>
                  <Small>{r.code} · {r.qty} {r.unit}{r.isLens ? ` · ${r.variantsInStock} of ${r.variantCount} powers` : ''}</Small>
                </View>
                <Level status={r.status} />
                <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={C.muted} />
              </Pressable>
              {open && <Sizes productId={r.productId} />}
            </Card>
          );
        }} />
    </View>
  );
}

/** Every power or size of one product. Lenses have dozens of powers: a compact grid with a filter. */
function Sizes({ productId }: { productId: string }) {
  const st = trpc.inventory.productStock.useQuery({ productId });
  const [vq, setVq] = useState('');
  if (!st.data) return st.error ? <Alert>{errorText(st.error)}</Alert> : <Loading />;
  const today = istDateString();
  const all = st.data.variants.filter((v) => v.isActive);
  if (!all.length) return <Small>This product has no sizes.</Small>;
  const term = vq.trim().toLowerCase();
  const shown = term ? all.filter((v) => `${v.label ?? ''} ${v.sku}`.toLowerCase().includes(term)) : all;
  const expiry = (v: (typeof all)[number]) => !v.qty || !v.nearestExpiry ? null : (
    <Text style={{ fontSize: 12.5, color: v.nearestExpiry < today ? C.danger : v.status === 'EXPIRING_SOON' ? C.warn : C.muted }}>
      {v.nearestExpiry < today ? 'Expired' : 'Exp'} {formatDate(v.nearestExpiry)}
    </Text>
  );
  return (
    <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 10 }}>
      {all.length > 12 && <TextInput accessibilityLabel="Find a power or size" value={vq} onChangeText={setVq} placeholder="Find a power or size" style={s.input} placeholderTextColor="#9aa5b1" autoCorrect={false} autoCapitalize="none" />}
      {!shown.length && <Small>No size matches “{vq.trim()}”.</Small>}
      {all.length > 8 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {shown.map((v) => (
            <View key={v.id} accessible accessibilityLabel={`${v.label ?? v.sku}: ${v.qty || 'none'} in stock`}
              style={{ width: '31%', padding: 7, borderRadius: R.sm, borderWidth: 1, borderColor: v.qty > 0 ? C.aqua : C.line, backgroundColor: v.qty > 0 ? C.white : C.canvas }}>
              <Text style={{ fontWeight: '700', color: C.ink, fontSize: 14 }} numberOfLines={1}>{v.label ?? v.sku}</Text>
              <Text style={{ fontSize: 14, fontWeight: '600', color: v.qty > 0 ? C.ok : C.muted }}>{v.qty > 0 ? `${v.qty} in stock` : 'None'}</Text>
              {expiry(v)}
            </View>
          ))}
        </View>
      ) : shown.map((v) => (
        <Row key={v.id} style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}><P style={{ fontWeight: '600' }}>{v.label ?? st.data.product.name}</P>{expiry(v)}</View>
          <P style={{ fontWeight: '700', color: v.qty > 0 ? C.ink : C.muted }}>{v.qty > 0 ? `${v.qty} ${st.data.product.unit}` : 'None'}</P>
        </Row>
      ))}
    </View>
  );
}
