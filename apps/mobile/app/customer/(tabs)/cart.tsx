import { useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, H2, Loading, Row, Screen } from '@/components/ui';
import { useCartQty } from '@/customer/toast';
import { EmptyState, ErrorBox, Input, Line, Note, Notice } from '@/customer/ui';
import { useCart } from '@/lib/cart';
import { errorText, newRequestId, rupees } from '@/lib/format';
import { enqueue, isNetworkError } from '@/lib/outbox';
import { C } from '@/lib/theme';
import { trpc } from '@/lib/trpc';

export default function CartScreen() {
  const cart = useCart();
  const setQty = useCartQty();
  const utils = trpc.useUtils();
  const ids = Object.keys(cart.items);
  const lines = trpc.portal.cart.useQuery({ variantIds: ids }, { enabled: ids.length > 0 });
  const info = trpc.portal.checkout.useQuery();
  const [ship, setShip] = useState<string | null>(null);
  const [doctor, setDoctor] = useState<string | null>(null);
  const [patient, setPatient] = useState('');
  const [surgery, setSurgery] = useState('');
  const [note, setNote] = useState('');
  const [saveErr, setSaveErr] = useState<string | null>(null);
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

  const reset = () => { cart.clear(); requestId.current = newRequestId('app'); setShip(null); setDoctor(null); setPatient(''); setSurgery(''); setNote(''); };

  async function submit() {
    setSaveErr(null);
    const input = { clientRequestId: requestId.current, shippingAddressId: ship, forDoctorId: doctor, patientName: patient || null, surgeryDate: surgery || null, customerNote: note || null, lines: rows.length ? rows.map((l) => ({ variantId: l.variantId, qty: l.qty })) : Object.entries(cart.items).map(([variantId, qty]) => ({ variantId, qty })) };
    const units = input.lines.reduce((t, l) => t + l.qty, 0);
    const summary = { units: String(units), ...(rows.length ? { total: String(subtotal) } : {}) };
    // The success screen sits above the Order tab, so leaving it never lands on the now-empty cart.
    const done = (params: Record<string, string>) => { reset(); router.navigate('/customer'); router.push({ pathname: '/customer/placed', params }); };
    try {
      const r = await place.mutateAsync(input);
      void utils.portal.invalidate();
      done({ ...summary, id: r.id, number: r.number });
    } catch (e) {
      if (!isNetworkError(e)) return; // the server said no: shown under the form, with Try again
      // No signal: keep the order on the phone and send it automatically later (same request id → no duplicate).
      try { await enqueue({ kind: 'placeOrder', label: `Order of ${units} item${units === 1 ? '' : 's'}`, input }); } catch (err) { setSaveErr(errorText(err)); return; }
      done({ ...summary, offline: '1' });
    }
  }

  if (!ids.length) return (
    <Screen>
      <EmptyState icon={<Ionicons name="cart-outline" size={48} color={C.teal700} />} text="Your cart is empty. Tap Order to add items."
        action={<Button title="Start ordering" onPress={() => router.navigate('/customer')} />} />
    </Screen>
  );
  return (
    <Screen footer={<>
      {!surgeryOk && <Note style={{ color: C.danger, textAlign: 'center' }}>Fix the surgery date first.</Note>}
      <Button title={rows.length ? `Place order · ${rupees(subtotal)}` : 'Place order'} loading={place.isPending} disabled={!surgeryOk} onPress={() => void submit()} />
    </>}>
      <Note>Check your items, then tap Place order at the bottom.</Note>
      {lines.isLoading && <Loading />}
      {lines.error && !lines.data && <>
        <Notice tone="warn">{`${cart.count} item${cart.count === 1 ? '' : 's'} in your cart, but we couldn't load the prices. ${errorText(lines.error)} You can still place the order.`}</Notice>
        <Button variant="secondary" title="Try again" loading={lines.isFetching} onPress={() => void lines.refetch()} />
      </>}
      {rows.map((l) => (
        <Card key={l.variantId}>
          <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: C.navy }}>{l.name}</Text>
              <Note>{[l.label, `${rupees(l.price)} each`].filter(Boolean).join(' · ')}</Note>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${l.name} from cart`} onPress={() => setQty(l.variantId, l.name, 0)} hitSlop={6} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, paddingHorizontal: 4 }}>
              <Ionicons name="trash-outline" size={20} color={C.danger} /><Text style={{ color: C.danger, fontWeight: '600', fontSize: 15 }}>Remove</Text>
            </Pressable>
          </Row>
          <Row style={{ justifyContent: 'space-between' }}>
            <Row style={{ gap: 4 }}>
              <Pressable accessibilityRole="button" accessibilityLabel={`One less ${l.name}`} onPress={() => setQty(l.variantId, l.name, l.qty - 1)} style={st}><Ionicons name="remove" size={22} color={C.teal700} /></Pressable>
              <Text accessibilityLabel={`${l.qty} in cart`} style={{ minWidth: 36, textAlign: 'center', fontWeight: '700', fontSize: 17 }}>{l.qty}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={`One more ${l.name}`} onPress={() => setQty(l.variantId, l.name, l.qty + 1)} style={st}><Ionicons name="add" size={22} color={C.teal700} /></Pressable>
            </Row>
            <Text style={{ fontSize: 17, fontWeight: '700', color: C.ink }}>{rupees(l.qty * l.price)}</Text>
          </Row>
        </Card>
      ))}
      <Pressable accessibilityRole="button" onPress={() => router.navigate('/customer')} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', minHeight: 44 }}>
        <Ionicons name="add-circle-outline" size={22} color={C.teal700} /><Text style={{ color: C.teal700, fontWeight: '700', fontSize: 16 }}>Add more items</Text>
      </Pressable>
      {rows.length > 0 && <Card><Line k="Items total" v={rupees(subtotal)} /><Note>GST is added on the invoice.</Note></Card>}

      <H2>Where should we deliver?</H2>
      <Card>
        {[{ id: null as string | null, text: home ? `${addressText(home)} (usual address)` : 'Your usual address' }, ...shipping.map((a) => ({ id: a.id as string | null, text: addressText(a) }))].map((a) => (
          <Pressable key={a.id ?? 'default'} accessibilityRole="radio" accessibilityState={{ selected: ship === a.id }} onPress={() => setShip(a.id)} style={radio}>
            <Ionicons name={ship === a.id ? 'radio-button-on' : 'radio-button-off'} size={24} color={C.teal700} /><Text style={radioText}>{a.text}</Text>
          </Pressable>
        ))}
      </Card>
      {!!info.data?.doctors.length && <>
        <H2>For which doctor? (optional)</H2>
        <Card>
          {[{ id: null as string | null, name: 'No doctor' }, ...info.data.doctors].map((d) => (
            <Pressable key={d.id ?? 'none'} accessibilityRole="radio" accessibilityState={{ selected: doctor === d.id }} onPress={() => setDoctor(d.id)} style={radio}>
              <Ionicons name={doctor === d.id ? 'radio-button-on' : 'radio-button-off'} size={24} color={C.teal700} /><Text style={radioText}>{d.name}</Text>
            </Pressable>
          ))}
        </Card>
      </>}
      <H2>More details (optional)</H2>
      <Input label="Patient name" value={patient} onChangeText={setPatient} placeholder="Leave empty if not needed" />
      <Input label="Surgery date" value={surgery} onChangeText={setSurgery} placeholder="Like 2026-12-01 (year-month-day)" error={surgeryOk ? null : 'Write the date like 2026-12-01 (year-month-day)'} />
      <Input label="Note for us" value={note} onChangeText={setNote} multiline placeholder="Anything we should know" />
      {place.error && !isNetworkError(place.error) && <ErrorBox text={`Your order was not placed. ${errorText(place.error)}`} onRetry={() => void submit()} busy={place.isPending} />}
      {!!saveErr && <ErrorBox text={`Your order was not placed or saved. ${saveErr}`} onRetry={() => void submit()} />}
    </Screen>
  );
}
const st = { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: C.teal700, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: C.white };
const radio = { flexDirection: 'row' as const, gap: 10, alignItems: 'center' as const, minHeight: 44, paddingVertical: 6 };
const radioText = { flex: 1, fontSize: 15, color: C.ink, lineHeight: 21 };
