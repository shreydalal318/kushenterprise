import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, H1, H2, Loading, Row, Screen } from '@/components/ui';
import { fmtPower, LENS_TYPE_LABEL } from '@/components/status';
import { useToast } from '@/customer/toast';
import { ErrorBox, Line, Note, Notice } from '@/customer/ui';
import { useCart } from '@/lib/cart';
import { errorCode, errorText, rupees } from '@/lib/format';
import { C, R } from '@/lib/theme';
import { trpc } from '@/lib/trpc';

const DOT: Record<string, string> = { AVAILABLE: C.ok, LIMITED: C.warn, ON_REQUEST: C.muted };

/** Power grid: tap + / − under each power, then add them all to the cart. */
export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = trpc.portal.product.useQuery({ id: id! });
  const cart = useCart();
  const toast = useToast();
  const [qty, setQty] = useState<Record<string, number>>({});
  // Opens showing what is already in the cart for this product, so it can be adjusted.
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!q.data || loaded) return;
    setQty(Object.fromEntries(q.data.variants.map((v) => [v.id, cart.items[v.id] ?? 0]).filter(([, n]) => (n as number) > 0)));
    setLoaded(true);
  }, [q.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const groups = useMemo(() => {
    const m = new Map<string, NonNullable<typeof q.data>['variants']>();
    for (const v of q.data?.variants ?? []) {
      const k = [v.cylinder != null ? `Cyl ${v.cylinder.toFixed(2)}` : null, v.addPower != null ? `Add +${v.addPower.toFixed(2)}` : null].filter(Boolean).join(' · ');
      m.set(k, [...(m.get(k) ?? []), v]);
    }
    return [...m.entries()];
  }, [q.data]);
  // A saved copy still opens with no signal; only a product that is really gone says so.
  if (!q.data) {
    if (!q.error) return <Loading />;
    return errorCode(q.error) === 'NOT_FOUND' ? <Screen><Notice tone="danger">This product is not sold any more.</Notice><Button variant="secondary" title="Go back" onPress={() => router.back()} /></Screen>
      : <Screen><ErrorBox text={errorText(q.error)} onRetry={() => void q.refetch()} busy={q.isFetching} /></Screen>;
  }
  const p = q.data;
  const many = p.variants.length > 1;
  const total = Object.values(qty).reduce((t, n) => t + n, 0);
  const before = p.variants.reduce((t, v) => t + (cart.items[v.id] ?? 0), 0);
  const count = (n: number) => (p.isLens ? `${n} lens${n === 1 ? '' : 'es'}` : `${n} ${p.unit}`);
  const bump = (vid: string, d: number) => setQty((x) => ({ ...x, [vid]: Math.max(0, Math.min(500, (x[vid] ?? 0) + d)) }));
  const save = () => {
    cart.setMany(Object.fromEntries(p.variants.map((v) => [v.id, qty[v.id] ?? 0])));
    if (!total) toast('Removed from cart', p.name);
    else if (p.isLens) toast(before ? 'Cart updated' : `${count(total)} added to cart`, before ? `${count(total)} of ${p.name}` : p.name);
    else toast(before ? 'Cart updated' : 'Added to cart', `${total} × ${p.name}`);
    router.back();
  };
  return (
    <Screen footer={
      <Button title={total ? `${before ? 'Update cart' : 'Add to cart'} · ${count(total)} · ${rupees(total * p.price)}` : before ? 'Remove from cart' : many ? 'Tap + to choose how many' : 'Tap + to choose quantity'}
        disabled={!total && !before} variant={!total && before ? 'danger' : 'primary'} onPress={save} />
    }>
      <Stack.Screen options={{ title: p.isLens && many ? 'Choose powers' : 'Choose quantity' }} />
      <Note>{[p.brand, p.category, p.code].filter(Boolean).join(' · ')}</Note>
      <H1>{p.name}</H1>
      <Text style={{ fontSize: 15, color: C.ink }}><Text style={{ fontWeight: '700', fontSize: 20 }}>{rupees(p.price)}</Text> per {p.unit} + GST {p.gstRate}%</Text>
      <Note>MRP {rupees(p.mrp)}{p.priceSource ? ' · this is your agreed rate' : ''}</Note>
      {(p.lensType || p.material || p.aConstant) && (
        <Card>
          {p.lensType && <Line k="Type" v={LENS_TYPE_LABEL[p.lensType]} />}
          {p.material && <Line k="Material" v={p.material} />}
          {p.aConstant != null && <Line k="A-constant" v={p.aConstant} />}
          {p.opticSizeMm != null && <Line k="Optic / overall" v={`${p.opticSizeMm} / ${p.overallLenMm ?? '—'} mm`} />}
          {p.preloaded != null && <Line k="Preloaded" v={p.preloaded ? 'Yes' : 'No'} />}
        </Card>
      )}
      <H2>{!many ? 'How many?' : p.isLens ? 'Tap + under each power you need' : 'Tap + under each option you need'}</H2>
      {many && <Row style={{ gap: 14, flexWrap: 'wrap' }}>{[['Available', C.ok], ['Limited', C.warn], ['On request (takes longer)', C.muted]].map(([l, c]) => <Row key={l} style={{ gap: 6 }}><View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c }} /><Note style={{ fontSize: 14 }}>{l}</Note></Row>)}</Row>}
      {groups.map(([label, vs]) => (
        <View key={label || 'all'} style={{ gap: 8 }}>
          {!!label && <Text style={{ fontSize: 15, fontWeight: '700', color: C.navy }}>{label}</Text>}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {vs.map((v) => {
              const n = qty[v.id] ?? 0;
              const name = v.powerSph != null ? fmtPower(v.powerSph) : (v.label ?? 'Quantity');
              return (
                <View key={v.id} style={{ width: many ? '47%' : '100%', borderWidth: n ? 2 : 1, borderColor: n ? C.teal : C.line, backgroundColor: n ? C.aqua50 : C.white, borderRadius: R.md, padding: 8, gap: 6, alignItems: 'center' }}>
                  <Row style={{ gap: 6 }}><View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: DOT[v.stock] }} /><Text style={{ fontWeight: '700', color: C.ink, fontSize: 16 }}>{name}</Text></Row>
                  <Row style={{ gap: 6 }}>
                    <Pressable accessibilityRole="button" accessibilityLabel={`One less ${name}`} onPress={() => bump(v.id, -1)} style={stepper}><Ionicons name="remove" size={22} color={C.teal700} /></Pressable>
                    <Text accessibilityLabel={`${n} of ${name}`} style={{ minWidth: 30, textAlign: 'center', fontWeight: '700', fontSize: 17 }}>{n}</Text>
                    <Pressable accessibilityRole="button" accessibilityLabel={`One more ${name}`} onPress={() => bump(v.id, +1)} style={stepper}><Ionicons name="add" size={22} color={C.teal700} /></Pressable>
                  </Row>
                </View>
              );
            })}
          </View>
        </View>
      ))}
    </Screen>
  );
}
const stepper = { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: C.teal700, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: C.white };
