import { useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Alert, Button, Card, Empty, Field, H2, KV, P, Row, Screen, Small } from '@/components/ui';
import { useCart } from '@/lib/cart';
import { errorText, newRequestId, rupees } from '@/lib/format';
import { enqueue, isNetworkError } from '@/lib/outbox';
import { C, R } from '@/lib/theme';
import { trpc } from '@/lib/trpc';

export default function CartScreen() {
  const cart = useCart();
  const utils = trpc.useUtils();
  const ids = Object.keys(cart.items);
  const lines = trpc.portal.cart.useQuery({ variantIds: ids }, { enabled: ids.length > 0 });
  const info = trpc.portal.checkout.useQuery();
  const [ship, setShip] = useState<string | null>(null);
  const [doctor, setDoctor] = useState<string | null>(null);
  const [patient, setPatient] = useState('');
  const [surgery, setSurgery] = useState('');
  const [note, setNote] = useState('');
  const [queued, setQueued] = useState(false);
  const requestId = useRef(newRequestId('app'));
  const place = trpc.portal.placeOrder.useMutation();
  const rows = useMemo(() => (lines.data ?? []).map((l) => ({ ...l, qty: cart.items[l.variantId] ?? 0 })).filter((l) => l.qty > 0), [lines.data, cart.items]);
  const subtotal = rows.reduce((t, l) => t + l.qty * l.price, 0);
  const shipping = info.data?.addresses.filter((a) => a.kind === 'SHIPPING') ?? [];
  const surgeryOk = !surgery || /^\d{4}-\d{2}-\d{2}$/.test(surgery);

  async function submit() {
    const input = { clientRequestId: requestId.current, shippingAddressId: ship, forDoctorId: doctor, patientName: patient || null, surgeryDate: surgery || null, customerNote: note || null, lines: rows.length ? rows.map((l) => ({ variantId: l.variantId, qty: l.qty })) : Object.entries(cart.items).map(([variantId, qty]) => ({ variantId, qty })) };
    try {
      const r = await place.mutateAsync(input);
      cart.clear(); requestId.current = newRequestId('app');
      await utils.portal.invalidate();
      router.replace(`/customer/order/${r.id}`);
    } catch (e) {
      if (!isNetworkError(e)) return;
      // No signal: keep the order on the phone and send it automatically later (same request id → no duplicate).
      await enqueue({ kind: 'placeOrder', label: `Order of ${input.lines.reduce((t, l) => t + l.qty, 0)} unit(s)`, input });
      cart.clear(); requestId.current = newRequestId('app'); setQueued(true);
    }
  }

  if (queued) return <Screen><Alert tone="warn">No connection. Your order is saved on this phone and will be sent automatically when you are back online.</Alert><Button title="Back to home" onPress={() => { setQueued(false); router.replace('/customer'); }} /></Screen>;
  if (!ids.length) return <Screen><Empty>Your cart is empty.</Empty><Button title="Browse the catalogue" onPress={() => router.push('/customer/catalogue')} /></Screen>;
  return (
    <Screen>
      {rows.map((l) => (
        <Card key={l.variantId}>
          <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}><P style={{ fontWeight: '700', color: C.navy }}>{l.name}</P><Small>{l.label ?? ''} · {rupees(l.price)} / {l.unit}</Small></View>
            <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${l.name}`} onPress={() => cart.set(l.variantId, 0)}><Ionicons name="trash-outline" size={20} color={C.muted} /></Pressable>
          </Row>
          <Row style={{ justifyContent: 'space-between' }}>
            <Row>
              <Pressable accessibilityLabel="One less" onPress={() => cart.set(l.variantId, l.qty - 1)} style={st}><Text style={stt}>−</Text></Pressable>
              <Text style={{ minWidth: 28, textAlign: 'center', fontWeight: '700' }}>{l.qty}</Text>
              <Pressable accessibilityLabel="One more" onPress={() => cart.set(l.variantId, l.qty + 1)} style={st}><Text style={stt}>+</Text></Pressable>
            </Row>
            <P style={{ fontWeight: '700' }}>{rupees(l.qty * l.price)}</P>
          </Row>
        </Card>
      ))}
      <Card><KV k="Items (before GST)" v={rupees(subtotal)} /><Small>GST is added on the tax invoice when your order is dispatched.</Small></Card>
      <H2>Delivery</H2>
      <Card>
        {[{ id: null as string | null, text: 'Default delivery address' }, ...shipping.filter((a) => !a.isDefault).map((a) => ({ id: a.id as string | null, text: `${a.label ? `${a.label}: ` : ''}${a.text}` }))].map((a) => (
          <Pressable key={a.id ?? 'default'} accessibilityRole="radio" accessibilityState={{ selected: ship === a.id }} onPress={() => setShip(a.id)} style={{ flexDirection: 'row', gap: 8, alignItems: 'center', paddingVertical: 4 }}>
            <Ionicons name={ship === a.id ? 'radio-button-on' : 'radio-button-off'} size={20} color={C.teal700} /><P style={{ flex: 1 }}>{a.text}</P>
          </Pressable>
        ))}
      </Card>
      {!!info.data?.doctors.length && (
        <Card><Small>For doctor (optional)</Small>
          {[{ id: null as string | null, name: '—' }, ...info.data.doctors].map((d) => (
            <Pressable key={d.id ?? 'none'} accessibilityRole="radio" accessibilityState={{ selected: doctor === d.id }} onPress={() => setDoctor(d.id)} style={{ flexDirection: 'row', gap: 8, alignItems: 'center', paddingVertical: 4 }}>
              <Ionicons name={doctor === d.id ? 'radio-button-on' : 'radio-button-off'} size={20} color={C.teal700} /><P>{d.name}</P>
            </Pressable>
          ))}
        </Card>
      )}
      <Field label="Patient name (optional)" value={patient} onChangeText={setPatient} />
      <Field label="Surgery date (optional, YYYY-MM-DD)" value={surgery} onChangeText={setSurgery} placeholder="2026-12-01" error={surgeryOk ? null : 'Use YYYY-MM-DD'} />
      <Field label="Note for us (optional)" value={note} onChangeText={setNote} multiline style={{ minHeight: 70, borderWidth: 1, borderColor: C.line, borderRadius: R.md, padding: 10, backgroundColor: C.white }} />
      {place.error && !isNetworkError(place.error) && <Alert>{errorText(place.error)}</Alert>}
      <Button title="Place order" loading={place.isPending} disabled={!surgeryOk} onPress={() => void submit()} />
    </Screen>
  );
}
const st = { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: C.line, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: C.white };
const stt = { fontSize: 18, fontWeight: '700' as const, color: C.navy };
