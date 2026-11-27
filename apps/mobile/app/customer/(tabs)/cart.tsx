import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Alert, Button, Card, Empty, Field, H2, KV, Loading, P, Row, Screen, Small } from '@/components/ui';
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
  const addresses = info.data?.addresses ?? [];
  // Same rule as the server: the default delivery address, else the billing address.
  const billing = addresses.find((a) => a.kind === 'BILLING' && a.isDefault) ?? addresses.find((a) => a.kind === 'BILLING');
  const home = addresses.find((a) => a.kind === 'SHIPPING' && a.isDefault) ?? billing;
  const shipping = addresses.filter((a) => a.kind === 'SHIPPING' && a.id !== home?.id);
  const addressText = (a: { label: string | null; text: string }) => `${a.label ? `${a.label}: ` : ''}${a.text}`;
  const surgeryOk = !surgery || /^\d{4}-\d{2}-\d{2}$/.test(surgery);
  // The "saved on this phone" note is about the order just made: drop it once the cart is used again or the tab is left.
  useEffect(() => { if (ids.length) setQueued(false); }, [ids.length]);
  useFocusEffect(useCallback(() => () => setQueued(false), []));

  const reset = () => { cart.clear(); requestId.current = newRequestId('app'); setShip(null); setDoctor(null); setPatient(''); setSurgery(''); setNote(''); };

  async function submit() {
    const input = { clientRequestId: requestId.current, shippingAddressId: ship, forDoctorId: doctor, patientName: patient || null, surgeryDate: surgery || null, customerNote: note || null, lines: rows.length ? rows.map((l) => ({ variantId: l.variantId, qty: l.qty })) : Object.entries(cart.items).map(([variantId, qty]) => ({ variantId, qty })) };
    try {
      const r = await place.mutateAsync(input);
      reset();
      await utils.portal.invalidate();
      // Back from the order goes to the Order screen, not the now-empty cart.
      router.navigate('/customer');
      router.push(`/customer/order/${r.id}?placed=1`);
    } catch (e) {
      if (!isNetworkError(e)) return;
      // No signal: keep the order on the phone and send it automatically later (same request id → no duplicate).
      await enqueue({ kind: 'placeOrder', label: `Order of ${input.lines.reduce((t, l) => t + l.qty, 0)} unit(s)`, input });
      reset(); setQueued(true);
    }
  }

  if (queued) return <Screen><Alert tone="warn">No connection. Your order is saved on this phone and will be sent automatically when you are back online.</Alert><Button title="Back to home" onPress={() => { setQueued(false); router.navigate('/customer'); }} /></Screen>;
  if (!ids.length) return <Screen><Empty>Your cart is empty.</Empty><Button title="Start ordering" onPress={() => router.navigate('/customer')} /></Screen>;
  return (
    <Screen footer={<Button title={rows.length ? `Place order · ${rupees(subtotal)}` : 'Place order'} loading={place.isPending} disabled={!surgeryOk} onPress={() => void submit()} />}>
      {lines.isLoading && <Loading />}
      {lines.error && !lines.data && <Alert tone="warn">{`${cart.count} item(s) in your cart. ${errorText(lines.error)}`}</Alert>}
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
      <Pressable accessibilityRole="button" onPress={() => router.navigate('/customer')} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 4 }}>
        <Ionicons name="add-circle-outline" size={18} color={C.teal700} /><Text style={{ color: C.teal700, fontWeight: '700' }}>Add more items</Text>
      </Pressable>
      <Card><KV k="Items (before GST)" v={rupees(subtotal)} /><Small>GST is added on the tax invoice, raised when your order is packed.</Small></Card>
      <H2>Delivery</H2>
      <Card>
        {[{ id: null as string | null, text: home ? `${addressText(home)} (default)` : 'Default delivery address' }, ...shipping.map((a) => ({ id: a.id as string | null, text: addressText(a) }))].map((a) => (
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
    </Screen>
  );
}
const st = { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: C.line, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: C.white };
const stt = { fontSize: 18, fontWeight: '700' as const, color: C.navy };
