import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Alert, Button, Card, H1, H2, KV, Loading, P, Row, Screen, Small } from '@/components/ui';
import { fmtPower, LENS_TYPE_LABEL } from '@/components/status';
import { useCart } from '@/lib/cart';
import { rupees } from '@/lib/format';
import { C, R } from '@/lib/theme';
import { trpc } from '@/lib/trpc';

const DOT: Record<string, string> = { AVAILABLE: C.ok, LIMITED: C.warn, ON_REQUEST: C.line };

/** Power grid: tap + / − under each power, then add them all to the cart. */
export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = trpc.portal.product.useQuery({ id: id! });
  const cart = useCart();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [added, setAdded] = useState(0);
  const groups = useMemo(() => {
    const m = new Map<string, NonNullable<typeof q.data>['variants']>();
    for (const v of q.data?.variants ?? []) {
      const k = [v.cylinder != null ? `Cyl ${v.cylinder.toFixed(2)}` : null, v.addPower != null ? `Add +${v.addPower.toFixed(2)}` : null].filter(Boolean).join(' · ');
      m.set(k, [...(m.get(k) ?? []), v]);
    }
    return [...m.entries()];
  }, [q.data]);
  if (q.error) return <Screen><Alert>This product is not available.</Alert></Screen>;
  if (!q.data) return <Loading />;
  const p = q.data;
  const total = Object.values(qty).reduce((t, n) => t + n, 0);
  const bump = (vid: string, d: number) => setQty((x) => ({ ...x, [vid]: Math.max(0, Math.min(500, (x[vid] ?? 0) + d)) }));
  return (
    <Screen footer={<>
      {added > 0 && !total && <Alert tone="ok">Added {added} unit(s) to your cart.</Alert>}
      <Button title={total ? `Add ${total} to cart · ${rupees(total * p.price)}` : added ? 'Go to cart' : 'Choose quantities'} disabled={!total && !added}
        onPress={() => { if (!total) { router.push('/customer/cart'); return; } cart.add(Object.entries(qty).map(([variantId, n]) => ({ variantId, qty: n }))); setAdded(total); setQty({}); }} />
    </>}>
      <Stack.Screen options={{ title: p.code }} />
      <Small>{[p.brand, p.category].filter(Boolean).join(' · ')}</Small>
      <H1>{p.name}</H1>
      <P><Text style={{ fontWeight: '700', fontSize: 20 }}>{rupees(p.price)}</Text> per {p.unit} + GST {p.gstRate}% · MRP {rupees(p.mrp)}</P>
      {p.priceSource && <Small style={{ color: C.teal700 }}>Your agreed rate</Small>}
      {(p.lensType || p.material || p.aConstant) && (
        <Card>
          {p.lensType && <KV k="Type" v={LENS_TYPE_LABEL[p.lensType]} />}
          {p.material && <KV k="Material" v={p.material} />}
          {p.aConstant != null && <KV k="A-constant" v={p.aConstant} />}
          {p.opticSizeMm != null && <KV k="Optic / overall" v={`${p.opticSizeMm} / ${p.overallLenMm ?? '—'} mm`} />}
          {p.preloaded != null && <KV k="Preloaded" v={p.preloaded ? 'Yes' : 'No'} />}
        </Card>
      )}
      <H2>{p.variants.length > 1 ? 'Powers and quantities' : 'Quantity'}</H2>
      <Row style={{ gap: 12 }}>{[['Available', C.ok], ['Limited', C.warn], ['On request', C.line]].map(([l, c]) => <Row key={l} style={{ gap: 4 }}><View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c }} /><Small>{l}</Small></Row>)}</Row>
      {groups.map(([label, vs]) => (
        <View key={label || 'all'} style={{ gap: 6 }}>
          {!!label && <Small style={{ fontWeight: '700', color: C.navy }}>{label}</Small>}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {vs.map((v) => {
              const n = qty[v.id] ?? 0;
              const name = v.powerSph != null ? fmtPower(v.powerSph) : (v.label ?? 'Qty');
              return (
                <View key={v.id} style={{ width: '31%', borderWidth: 1, borderColor: n ? C.teal : C.line, backgroundColor: n ? C.aqua50 : C.white, borderRadius: R.md, padding: 6, gap: 4, alignItems: 'center' }}>
                  <Row style={{ gap: 4 }}><View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: DOT[v.stock] }} /><Text style={{ fontWeight: '700', color: C.ink }}>{name}</Text></Row>
                  <Row style={{ gap: 6 }}>
                    <Pressable accessibilityRole="button" accessibilityLabel={`One less ${name}`} onPress={() => bump(v.id, -1)} style={stepper}><Text style={stepText}>−</Text></Pressable>
                    <Text accessibilityLabel={`Quantity for ${name}`} style={{ minWidth: 22, textAlign: 'center', fontWeight: '700' }}>{n}</Text>
                    <Pressable accessibilityRole="button" accessibilityLabel={`One more ${name}`} onPress={() => bump(v.id, +1)} style={stepper}><Text style={stepText}>+</Text></Pressable>
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
const stepper = { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: C.line, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: C.white };
const stepText = { fontSize: 18, fontWeight: '700' as const, color: C.navy };
