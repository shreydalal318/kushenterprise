import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { keepPreviousData } from '@tanstack/react-query';
import { formatDate } from '@kush/core';
import { Button, Loading, Row, s } from '@/components/ui';
import { fmtPower, LENS_TYPE_LABEL, StockBadge } from '@/components/status';
import { useOrderAgain } from '@/customer/actions';
import { useCartQty } from '@/customer/toast';
import { ErrorBox, Note, Notice } from '@/customer/ui';
import { useCart } from '@/lib/cart';
import { errorText, rupees } from '@/lib/format';
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
  const setQty = useCartQty();
  const outbox = useOutbox();
  const again = useOrderAgain();
  const home = trpc.portal.home.useQuery();
  const filters = trpc.portal.filters.useQuery();
  // Search as the typing pauses, and keep the last results on screen until the new ones arrive.
  const query = useDebounced(q.trim());
  const pw = useDebounced(power.trim().replace(',', '.'));
  const powerNum = pw === '' || Number.isNaN(Number(pw)) ? undefined : Number(pw);
  const list = trpc.portal.catalogue.useQuery({ q: query || undefined, power: powerNum, categoryId: categoryId ?? undefined }, { placeholderData: keepPreviousData });
  const ids = Object.keys(cart.items);
  const priced = trpc.portal.cart.useQuery({ variantIds: ids }, { enabled: ids.length > 0 });
  const total = useMemo(() => (priced.data ?? []).reduce((t, l) => t + (cart.items[l.variantId] ?? 0) * l.price, 0), [priced.data, cart.items]);
  const searching = !!query || powerNum != null || !!categoryId;
  const recent = (home.data?.orders ?? []).slice(0, 5);
  const clear = () => { setQ(''); setPower(''); setCategory(null); };

  const header = (
    <View style={{ gap: 12 }}>
      {outbox.map((o) => (
        <Notice key={o.id} tone={o.error ? 'danger' : 'warn'}>{o.error ? `Not sent: ${o.label}. ${o.error}` : `Waiting for internet: ${o.label}. It is saved on this phone and will be sent automatically.`}</Notice>
      ))}
      {outbox.some((o) => o.error) && <Button variant="secondary" title="Remove orders that were not sent" onPress={() => outbox.filter((o) => o.error).forEach((o) => void discard(o.id))} />}
      {!searching && recent.length > 0 && (
        <View style={{ gap: 8 }}>
          <Text style={{ fontWeight: '700', color: C.navy, fontSize: 17 }}>Order again</Text>
          {again.failed && <ErrorBox text={again.failed.text} onRetry={again.failed.retry} />}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
            {recent.map((o) => {
              const busy = again.pending === o.id;
              return (
                <View key={o.id} style={{ width: 210, backgroundColor: C.white, borderRadius: R.lg, borderWidth: 1, borderColor: C.line, padding: 12, gap: 2 }}>
                  <Text style={{ fontWeight: '700', color: C.navy, fontSize: 16 }}>{o.number}</Text>
                  <Note>{formatDate(o.createdAt)} · {o.units} item{o.units === 1 ? '' : 's'}</Note>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Order ${o.number} again`} accessibilityState={{ disabled: !!again.pending, busy }} disabled={!!again.pending} onPress={() => void again.run(o.id)}
                    style={{ marginTop: 8, minHeight: 44, borderRadius: R.md, borderWidth: 1, borderColor: C.teal700, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', opacity: again.pending && !busy ? 0.5 : 1 }}>
                    {busy ? <ActivityIndicator size="small" color={C.teal700} /> : <Ionicons name="refresh" size={18} color={C.teal700} />}
                    <Text style={{ color: C.teal700, fontWeight: '700', fontSize: 15 }}>{busy ? 'Adding…' : 'Order again'}</Text>
                  </Pressable>
                </View>
              );
            })}
          </ScrollView>
        </View>
      )}
      <Row style={{ justifyContent: 'space-between' }}>
        <Text style={{ fontWeight: '700', color: C.navy, fontSize: 17 }}>{searching ? `${list.data?.length ?? 0} product${list.data?.length === 1 ? '' : 's'} found` : 'All products'}</Text>
        {searching && <Pressable accessibilityRole="button" onPress={clear} hitSlop={8} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: C.teal700, fontWeight: '700', fontSize: 15 }}>Clear search</Text></Pressable>}
      </Row>
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: C.canvas }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 10, backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.line, paddingBottom: 10 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 22, fontWeight: '700', color: C.navy }}>Order</Text>
            {home.data && <Text numberOfLines={1} style={{ fontSize: 15, color: C.muted }}>{home.data.customer.name}</Text>}
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={`Messages, ${home.data?.unread ?? 0} new`} onPress={() => router.push('/customer/notifications')} style={{ alignItems: 'center', minWidth: 64, minHeight: 44, justifyContent: 'center' }}>
            <View>
              <Ionicons name="notifications-outline" size={24} color={C.navy} />
              {!!home.data?.unread && <View style={{ position: 'absolute', top: -6, right: -12, minWidth: 20, height: 20, borderRadius: 10, backgroundColor: C.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}><Text style={{ color: C.white, fontSize: 12, fontWeight: '700' }}>{home.data.unread > 99 ? '99+' : home.data.unread}</Text></View>}
            </View>
            <Text style={{ fontSize: 13, color: C.navy, fontWeight: '600' }}>Messages</Text>
          </Pressable>
        </Row>
        <Row style={{ gap: 8 }}>
          <View style={{ flex: 1 }}><TextInput accessibilityLabel="Search products" value={q} onChangeText={setQ} placeholder="Search name, brand or code" style={s.input} placeholderTextColor="#9aa5b1" returnKeyType="search" /></View>
          <TextInput accessibilityLabel="Lens power, for example 21.5" value={power} onChangeText={setPower} placeholder="Power" keyboardType="numbers-and-punctuation" style={[s.input, { width: 92 }]} placeholderTextColor="#9aa5b1" />
        </Row>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {[{ id: null as string | null, name: 'All' }, ...(filters.data?.categories ?? [])].map((c) => {
            const on = categoryId === c.id;
            return (
              <Pressable key={c.id ?? 'all'} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => setCategory(c.id)} hitSlop={{ top: 4, bottom: 4 }}
                style={{ paddingHorizontal: 16, minHeight: 40, justifyContent: 'center', borderRadius: 999, borderWidth: 1, borderColor: on ? C.teal700 : C.line, backgroundColor: on ? C.teal700 : C.white }}>
                <Text style={{ color: on ? C.white : C.ink, fontWeight: '600', fontSize: 15 }}>{c.name}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {list.isLoading && <Loading />}
      {list.error && !list.data && <View style={{ padding: 16 }}><ErrorBox text={errorText(list.error)} onRetry={() => void list.refetch()} busy={list.isFetching} /></View>}
      <FlatList
        data={list.data ?? []}
        keyExtractor={(p) => p.id}
        ListHeaderComponent={header}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: cart.count ? 104 : 24 }}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={list.data ? (
          <View style={{ alignItems: 'center', gap: 10, paddingVertical: 24 }}>
            <Note style={{ textAlign: 'center' }}>Nothing found. Try another name or power, or see all products.</Note>
            <Button variant="secondary" title="See all products" onPress={clear} />
          </View>
        ) : undefined}
        renderItem={({ item: p }) => {
          const n = p.variantId ? cart.items[p.variantId] ?? 0 : 0;
          return (
            <View style={{ backgroundColor: C.white, borderRadius: R.lg, borderWidth: 1, borderColor: n ? C.teal : C.line, padding: 14, gap: 8 }}>
              <Pressable accessibilityRole="button" accessibilityLabel={`${p.name}, see details`} onPress={() => router.push(`/customer/product/${p.id}`)} style={{ gap: 2 }}>
                <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <Note style={{ flex: 1, fontSize: 14 }}>{[p.brand ?? p.category, p.lensType && LENS_TYPE_LABEL[p.lensType], p.preloaded && 'Preloaded'].filter(Boolean).join(' · ')}</Note>
                  <StockBadge stock={p.stock} />
                </Row>
                <Text style={{ fontWeight: '700', color: C.navy, fontSize: 16 }} numberOfLines={2}>{p.name}</Text>
                {p.powerRange && <Note>Powers {fmtPower(p.powerRange.min)} to {fmtPower(p.powerRange.max)}</Note>}
              </Pressable>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={{ color: C.ink }}><Text style={{ fontWeight: '700', fontSize: 17 }}>{rupees(p.price)}</Text><Text style={{ color: C.muted, fontSize: 14 }}> / {p.unit}</Text></Text>
                {p.variantId ? (
                  n === 0
                    ? <Pressable accessibilityRole="button" accessibilityLabel={`Add ${p.name} to cart`} onPress={() => setQty(p.variantId!, p.name, 1)} style={addBtn}><Ionicons name="add" size={20} color={C.white} /><Text style={{ color: C.white, fontWeight: '700', fontSize: 15 }}>Add</Text></Pressable>
                    : <Row style={{ gap: 4 }}>
                        <Pressable accessibilityRole="button" accessibilityLabel={n === 1 ? `Remove ${p.name} from cart` : `One less ${p.name}`} onPress={() => setQty(p.variantId!, p.name, n - 1)} style={step}><Ionicons name={n === 1 ? 'trash-outline' : 'remove'} size={20} color={C.teal700} /></Pressable>
                        <Text accessibilityLabel={`${n} in cart`} style={{ minWidth: 36, textAlign: 'center', fontWeight: '700', fontSize: 17 }}>{n}</Text>
                        <Pressable accessibilityRole="button" accessibilityLabel={`One more ${p.name}`} onPress={() => setQty(p.variantId!, p.name, n + 1)} style={step}><Ionicons name="add" size={20} color={C.teal700} /></Pressable>
                      </Row>
                ) : (
                  <Pressable accessibilityRole="button" onPress={() => router.push(`/customer/product/${p.id}`)} style={[addBtn, { backgroundColor: C.white, borderWidth: 1, borderColor: C.teal700 }]}>
                    <Text style={{ color: C.teal700, fontWeight: '700', fontSize: 15 }}>{p.isLens ? 'Choose powers' : 'Choose option'}</Text><Ionicons name="chevron-forward" size={18} color={C.teal700} />
                  </Pressable>
                )}
              </Row>
            </View>
          );
        }}
      />

      {cart.count > 0 && (
        <Pressable accessibilityRole="button" accessibilityLabel={`Go to cart, ${cart.count} items`} onPress={() => router.navigate('/customer/cart')}
          style={({ pressed }) => ({ position: 'absolute', left: 16, right: 16, bottom: 12, minHeight: 60, backgroundColor: pressed ? C.teal : C.teal700, borderRadius: R.lg, paddingVertical: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', elevation: 4, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } })}>
          <View>
            <Text style={{ color: C.white, fontWeight: '700', fontSize: 16 }}>{cart.count} item{cart.count === 1 ? '' : 's'}{priced.data ? ` · ${rupees(total)}` : ''}</Text>
            <Text style={{ color: C.aqua100, fontSize: 13 }}>GST is added on the invoice</Text>
          </View>
          <Row style={{ gap: 4 }}><Ionicons name="cart" size={20} color={C.white} /><Text style={{ color: C.white, fontWeight: '700', fontSize: 16 }}>Go to cart</Text></Row>
        </Pressable>
      )}
    </SafeAreaView>
  );
}

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

const addBtn = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, backgroundColor: C.teal700, borderRadius: 999, paddingHorizontal: 18, minHeight: 44 };
const step = { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: C.teal700, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: C.white };
