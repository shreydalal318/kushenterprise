import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { formatDate } from '@kush/core';
import { Alert, Button, Loading, P, Row, s, Small } from '@/components/ui';
import { fmtPower, LENS_TYPE_LABEL, StockBadge } from '@/components/status';
import { useCart } from '@/lib/cart';
import { rupees } from '@/lib/format';
import { discard, useOutbox } from '@/lib/outbox';
import { C, R } from '@/lib/theme';
import { trpc } from '@/lib/trpc';

/**
 * The customer app opens here: find a product, add it with + / − (lenses: choose powers), and
 * check out from the cart bar. "Order again" repeats a past order in one tap.
 */
export default function OrderScreen() {
  const [q, setQ] = useState('');
  const [power, setPower] = useState('');
  const [categoryId, setCategory] = useState<string | null>(null);
  const cart = useCart();
  const utils = trpc.useUtils();
  const outbox = useOutbox();
  const home = trpc.portal.home.useQuery();
  const filters = trpc.portal.filters.useQuery();
  const powerNum = power === '' || Number.isNaN(Number(power)) ? undefined : Number(power);
  const list = trpc.portal.catalogue.useQuery({ q: q || undefined, power: powerNum, categoryId: categoryId ?? undefined });
  const ids = Object.keys(cart.items);
  const priced = trpc.portal.cart.useQuery({ variantIds: ids }, { enabled: ids.length > 0 });
  const total = useMemo(() => (priced.data ?? []).reduce((t, l) => t + (cart.items[l.variantId] ?? 0) * l.price, 0), [priced.data, cart.items]);
  const searching = !!q || powerNum != null || !!categoryId;
  const recent = (home.data?.orders ?? []).slice(0, 5);

  const reorder = async (orderId: string) => { cart.add(await utils.portal.reorderLines.fetch({ orderId })); router.push('/customer/cart'); };

  const header = (
    <View style={{ gap: 12 }}>
      {outbox.length > 0 && outbox.map((o) => (
        <Alert key={o.id} tone="warn">{o.error ? `${o.label}: ${o.error}` : `${o.label} is saved on this phone and will be sent when you are back online.`}</Alert>
      ))}
      {outbox.some((o) => o.error) && <Button variant="secondary" title="Discard failed orders" onPress={() => outbox.filter((o) => o.error).forEach((o) => void discard(o.id))} />}
      {!searching && recent.length > 0 && (
        <View style={{ gap: 8 }}>
          <Text style={{ fontWeight: '700', color: C.navy, fontSize: 16 }}>Order again</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
            {recent.map((o) => (
              <View key={o.id} style={{ width: 200, backgroundColor: C.white, borderRadius: R.lg, borderWidth: 1, borderColor: C.line, padding: 12, gap: 4 }}>
                <Text style={{ fontWeight: '700', color: C.navy }}>{o.number}</Text>
                <Small>{formatDate(o.createdAt)} · {o.units} unit{o.units === 1 ? '' : 's'}</Small>
                <Pressable accessibilityRole="button" onPress={() => void reorder(o.id)} style={{ marginTop: 6, flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                  <Ionicons name="refresh" size={16} color={C.teal700} /><Text style={{ color: C.teal700, fontWeight: '700' }}>Add to cart again</Text>
                </Pressable>
              </View>
            ))}
          </ScrollView>
        </View>
      )}
      <Text style={{ fontWeight: '700', color: C.navy, fontSize: 16 }}>{searching ? `${list.data?.length ?? 0} products` : 'All products'}</Text>
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: C.canvas }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 10, backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.line, paddingBottom: 10 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 22, fontWeight: '700', color: C.navy }}>Order</Text>
            {home.data && <Text numberOfLines={1} style={{ fontSize: 13, color: C.muted }}>{home.data.customer.name}</Text>}
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={`Notifications, ${home.data?.unread ?? 0} unread`} onPress={() => router.push('/customer/notifications')} style={{ padding: 6 }}>
            <Ionicons name="notifications-outline" size={24} color={C.navy} />
            {!!home.data?.unread && <View style={{ position: 'absolute', top: 2, right: 2, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: C.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}><Text style={{ color: C.white, fontSize: 11, fontWeight: '700' }}>{home.data.unread > 99 ? '99+' : home.data.unread}</Text></View>}
          </Pressable>
        </Row>
        <Row style={{ gap: 8 }}>
          <View style={{ flex: 1 }}><TextInput accessibilityLabel="Search products" value={q} onChangeText={setQ} placeholder="Search lens, brand or code" style={s.input} placeholderTextColor="#9aa5b1" returnKeyType="search" /></View>
          <TextInput accessibilityLabel="Lens power" value={power} onChangeText={setPower} placeholder="Power" keyboardType="numbers-and-punctuation" style={[s.input, { width: 86 }]} placeholderTextColor="#9aa5b1" />
        </Row>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {[{ id: null as string | null, name: 'All' }, ...(filters.data?.categories ?? [])].map((c) => {
            const on = categoryId === c.id;
            return (
              <Pressable key={c.id ?? 'all'} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => setCategory(c.id)}
                style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: on ? C.teal700 : C.line, backgroundColor: on ? C.teal700 : C.white }}>
                <Text style={{ color: on ? C.white : C.ink, fontWeight: '600', fontSize: 13 }}>{c.name}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {list.isLoading && <Loading />}
      {list.error && !list.data && <View style={{ padding: 16 }}><Alert>No connection and nothing saved yet. Try again when you have signal.</Alert></View>}
      <FlatList
        data={list.data ?? []}
        keyExtractor={(p) => p.id}
        ListHeaderComponent={header}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: cart.count ? 96 : 24 }}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={list.data ? <P muted style={{ textAlign: 'center', paddingVertical: 24 }}>Nothing matches. Try another search or power.</P> : undefined}
        renderItem={({ item: p }) => {
          const n = p.variantId ? cart.items[p.variantId] ?? 0 : 0;
          return (
            <View style={{ backgroundColor: C.white, borderRadius: R.lg, borderWidth: 1, borderColor: n ? C.teal : C.line, padding: 14, gap: 6 }}>
              <Pressable accessibilityRole="button" accessibilityLabel={p.name} onPress={() => router.push(`/customer/product/${p.id}`)} style={{ gap: 2 }}>
                <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <Small style={{ flex: 1 }}>{[p.brand ?? p.category, p.lensType && LENS_TYPE_LABEL[p.lensType], p.preloaded && 'Preloaded'].filter(Boolean).join(' · ')}</Small>
                  <StockBadge stock={p.stock} />
                </Row>
                <Text style={{ fontWeight: '700', color: C.navy, fontSize: 15 }} numberOfLines={2}>{p.name}</Text>
                {p.powerRange && <Small>Powers {fmtPower(p.powerRange.min)} to {fmtPower(p.powerRange.max)} D</Small>}
              </Pressable>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={{ color: C.ink }}><Text style={{ fontWeight: '700', fontSize: 16 }}>{rupees(p.price)}</Text><Text style={{ color: C.muted, fontSize: 12 }}> / {p.unit}</Text></Text>
                {p.variantId ? (
                  n === 0
                    ? <Pressable accessibilityRole="button" accessibilityLabel={`Add ${p.name}`} onPress={() => cart.set(p.variantId!, 1)} style={addBtn}><Ionicons name="add" size={18} color={C.white} /><Text style={{ color: C.white, fontWeight: '700' }}>Add</Text></Pressable>
                    : <Row style={{ gap: 0 }}>
                        <Pressable accessibilityRole="button" accessibilityLabel={`One less ${p.name}`} onPress={() => cart.set(p.variantId!, n - 1)} style={step}><Ionicons name="remove" size={18} color={C.teal700} /></Pressable>
                        <Text accessibilityLabel={`${n} in cart`} style={{ minWidth: 34, textAlign: 'center', fontWeight: '700', fontSize: 16 }}>{n}</Text>
                        <Pressable accessibilityRole="button" accessibilityLabel={`One more ${p.name}`} onPress={() => cart.set(p.variantId!, n + 1)} style={step}><Ionicons name="add" size={18} color={C.teal700} /></Pressable>
                      </Row>
                ) : (
                  <Pressable accessibilityRole="button" onPress={() => router.push(`/customer/product/${p.id}`)} style={[addBtn, { backgroundColor: C.white, borderWidth: 1, borderColor: C.teal700 }]}>
                    <Text style={{ color: C.teal700, fontWeight: '700' }}>Choose powers</Text><Ionicons name="chevron-forward" size={16} color={C.teal700} />
                  </Pressable>
                )}
              </Row>
            </View>
          );
        }}
      />

      {cart.count > 0 && (
        <Pressable accessibilityRole="button" accessibilityLabel={`View cart, ${cart.count} items`} onPress={() => router.push('/customer/cart')}
          style={({ pressed }) => ({ position: 'absolute', left: 16, right: 16, bottom: 12, backgroundColor: pressed ? C.teal : C.teal700, borderRadius: R.lg, paddingVertical: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', elevation: 4, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } })}>
          <View>
            <Text style={{ color: C.white, fontWeight: '700' }}>{cart.count} item{cart.count === 1 ? '' : 's'}{priced.data ? ` · ${rupees(total)}` : ''}</Text>
            <Text style={{ color: C.aqua100, fontSize: 12 }}>GST added on the invoice</Text>
          </View>
          <Row style={{ gap: 4 }}><Text style={{ color: C.white, fontWeight: '700', fontSize: 16 }}>View cart</Text><Ionicons name="chevron-forward" size={18} color={C.white} /></Row>
        </Pressable>
      )}
    </SafeAreaView>
  );
}

const addBtn = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, backgroundColor: C.teal700, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 };
const step = { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: C.teal700, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: C.white };
