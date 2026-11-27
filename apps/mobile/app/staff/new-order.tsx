import { useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { readableError } from '@/components/errors';
import { HandlerPicker } from '@/components/handler-picker';
import { ProductPicker, type Picked } from '@/components/product-picker';
import { Alert, Button, Card, Field, H2, Loading, P, Row, s, Screen, Small } from '@/components/ui';
import { useCan } from '@/lib/auth';
import { errorText, newRequestId } from '@/lib/format';
import { C, R } from '@/lib/theme';
import { trpc } from '@/lib/trpc';

/** `qty` stays as typed (backspace mustn't snap it to 1) and is checked before saving. */
interface Line { variantId: string; name: string; label: string | null; qty: string }
const int = (v: string) => (/^\d+$/.test(v.trim()) ? Number(v.trim()) : 0);
/** A real calendar day as YYYY-MM-DD (2026-02-30 is not). */
const isDay = (v: string) => { const d = new Date(`${v}T00:00:00Z`); return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(d.getTime()) && d.toISOString().startsWith(v); };

/** An order taken on a call or WhatsApp: customer, items found by name, and who will handle it. */
export default function NewOrder() {
  const can = useCan();
  const utils = trpc.useUtils();
  const customers = trpc.sales.customers.useQuery();
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [added, setAdded] = useState<string | null>(null);
  const [patient, setPatient] = useState('');
  const [surgery, setSurgery] = useState('');
  const [note, setNote] = useState('');
  // Nothing chosen until the person entering decides: an order mustn't quietly land with nobody, or the wrong person.
  const [handler, setHandler] = useState<string | null | undefined>(undefined);
  const [saved, setSaved] = useState<string | null>(null);
  const requestId = useRef(newRequestId('app-ord'));
  const saving = useRef(false);
  const create = trpc.orders.create.useMutation();

  const customer = customers.data?.find((c) => c.id === customerId);
  const term = search.trim().toLowerCase();
  const matches = (customers.data ?? []).filter((c) => !term || `${c.name} ${c.code}`.toLowerCase().includes(term));
  const cityOf = (c: { addresses: { kind: string; isDefault: boolean; city: string | null }[] }) => (c.addresses.find((a) => a.kind === 'BILLING' && a.isDefault) ?? c.addresses.find((a) => a.kind === 'BILLING'))?.city;
  const badQty = lines.some((l) => int(l.qty) < 1 || int(l.qty) > 10000);
  const surgeryOk = !surgery.trim() || isDay(surgery.trim());
  const missing = [!customer && 'choose the customer', !lines.length && 'add an item', handler === undefined && 'choose who will handle it'].filter(Boolean);
  const ready = !missing.length && !badQty && surgeryOk;

  function onPick(p: Picked) {
    const name = `${p.productName}${p.label ? ` ${p.label}` : ''}`;
    setLines((cur) => (cur.some((l) => l.variantId === p.variantId)
      ? cur.map((l) => (l.variantId === p.variantId ? { ...l, qty: String(int(l.qty) + 1) } : l))
      : [...cur, { variantId: p.variantId, name: p.productName, label: p.label, qty: '1' }]));
    setAdded(`Added ${name}`);
  }
  const setQty = (variantId: string, qty: string) => setLines((cur) => cur.map((l) => (l.variantId === variantId ? { ...l, qty } : l)));
  const remove = (variantId: string) => { setLines((cur) => cur.filter((l) => l.variantId !== variantId)); setAdded(null); };

  async function save() {
    if (!ready || !customer || handler === undefined || saving.current) return;
    saving.current = true;
    try {
      // The same request id on a retry: if the first try did reach the server, it answers with that order instead of a second one.
      const r = await create.mutateAsync({
        customerId: customer.id, assignedToId: handler, clientRequestId: requestId.current,
        lines: lines.map((l) => ({ variantId: l.variantId, qty: int(l.qty) })),
        patientName: patient.trim() || null, surgeryDate: surgery.trim() || null, customerNote: note.trim() || null,
      });
      void utils.orders.invalidate();
      // Someone who may enter orders but not view them can't open the order screen.
      if (can('VIEW_ORDERS')) router.replace(`/staff/order/${r.id}`);
      else setSaved(r.number);
    } catch {
      // Shown below from create.error.
    } finally {
      saving.current = false;
    }
  }

  if (!can('CREATE_ORDERS')) return <Screen><Alert tone="warn">You can’t enter orders. Ask the owner to give you that permission.</Alert></Screen>;
  if (saved) return <Screen><Alert tone="ok">Order {saved} saved.</Alert><Button title="Done" onPress={() => router.back()} /></Screen>;
  if (!customers.data) return customers.error ? <Screen><Alert>{readableError(customers.error)}</Alert></Screen> : <Loading />;
  return (
    <Screen footer={
      <>
        {create.error && <Alert>{errorText(create.error)}</Alert>}
        {!!missing.length && <Small style={{ textAlign: 'center' }}>To save: {missing.join(', ')}.</Small>}
        <Button title="Save order" loading={create.isPending} disabled={!ready} onPress={() => void save()} />
      </>
    }>
      {!customer ? (
        <Card>
          <H2>Customer</H2>
          <TextInput accessibilityLabel="Search customers" value={search} onChangeText={setSearch} placeholder="Search name or code" style={s.input} placeholderTextColor="#9aa5b1" autoCorrect={false} />
          {matches.slice(0, 12).map((c) => (
            <Pressable key={c.id} accessibilityRole="button" onPress={() => setCustomerId(c.id)} style={{ paddingVertical: 8 }}>
              <P>{c.name}</P><Small>{c.code}{cityOf(c) ? ` · ${cityOf(c)}` : ''}</Small>
            </Pressable>
          ))}
          {!matches.length && <Small>{term ? `No customer matches “${search.trim()}”.` : 'No customers yet.'}</Small>}
        </Card>
      ) : (
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}><P style={{ fontWeight: '700' }}>{customer.name}</P><Small>{customer.code}{cityOf(customer) ? ` · ${cityOf(customer)}` : ''}</Small></View>
            {/* The items stay: prices are set by the server when the order is saved. */}
            <Button variant="secondary" title="Change" onPress={() => setCustomerId(null)} />
          </Row>
        </Card>
      )}

      <Card>
        <H2>Items</H2>
        <ProductPicker onPick={onPick} allSizes />
      </Card>
      {added && <Alert tone="ok">{added}</Alert>}
      {lines.length > 0 && (
        <Card>
          {lines.map((l) => (
            <Row key={l.variantId} style={{ justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}><P style={{ fontWeight: '600' }}>{l.name}</P>{l.label && <Small>{l.label}</Small>}</View>
              <Pressable accessibilityRole="button" accessibilityLabel={`One less ${l.name}`} onPress={() => (int(l.qty) <= 1 ? remove(l.variantId) : setQty(l.variantId, String(int(l.qty) - 1)))} style={step}><Ionicons name="remove" size={16} color={C.teal700} /></Pressable>
              <TextInput accessibilityLabel={`Quantity of ${l.name}`} value={l.qty} onChangeText={(v) => setQty(l.variantId, v.replace(/\D/g, '').slice(0, 5))} keyboardType="number-pad" selectTextOnFocus
                style={{ minWidth: 44, textAlign: 'center', fontWeight: '700', fontSize: 16, color: C.ink, borderWidth: 1, borderColor: int(l.qty) < 1 || int(l.qty) > 10000 ? C.danger : C.line, borderRadius: R.sm, paddingVertical: 4 }} />
              <Pressable accessibilityRole="button" accessibilityLabel={`One more ${l.name}`} onPress={() => setQty(l.variantId, String(int(l.qty) + 1))} style={step}><Ionicons name="add" size={16} color={C.teal700} /></Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${l.name}`} onPress={() => remove(l.variantId)} hitSlop={8}><Ionicons name="trash-outline" size={20} color={C.muted} /></Pressable>
            </Row>
          ))}
          {badQty && <Small style={{ color: C.danger }}>Each quantity must be between 1 and 10000.</Small>}
        </Card>
      )}

      <Card>
        <H2>Details (optional)</H2>
        <Field label="Patient name" value={patient} onChangeText={setPatient} maxLength={120} />
        <Field label="Surgery date (YYYY-MM-DD)" value={surgery} onChangeText={setSurgery} placeholder="2026-12-01" keyboardType="numbers-and-punctuation" maxLength={10} error={surgeryOk ? null : 'Use a real date as YYYY-MM-DD'} />
        <Field label="Note" value={note} onChangeText={setNote} maxLength={1000} multiline style={[s.input, { minHeight: 70, textAlignVertical: 'top' }]} />
      </Card>

      <Card>
        <H2>Who will handle it?</H2>
        <Small>They make the tax invoice, dispatch and deliver it.</Small>
        <HandlerPicker value={handler} onChange={setHandler} disabled={create.isPending} />
      </Card>
    </Screen>
  );
}
const step = { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: C.teal700, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: C.white };
