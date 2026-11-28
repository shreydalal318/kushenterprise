import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { computeGst, istDateString, stateByCode } from '@kush/core';
import { ProductPicker, type Picked } from '@/components/product-picker';
import { amountOf, Amount, Choice, ChosenCustomer, CustomerPicker, Failed, Hint, int, isDay, Muted, Stepper } from '@/components/sales/common';
import { Alert, Badge, Button, Card, Field, H2, Loading, P, Row, s, Screen } from '@/components/ui';
import { useAuth, useCan } from '@/lib/auth';
import { errorText, rupees } from '@/lib/format';
import { C, R } from '@/lib/theme';
import { trpc } from '@/lib/trpc';

/** Quantity, discount and (owner only) rate stay as typed and are checked before saving. */
interface Line { key: string; variantId: string; productId: string; name: string; label: string | null; hsn: string; gstRate: number; qty: string; disc: string; rate: string }
/** Discount as typed: '' is none; otherwise 0–100, decimals allowed. NaN when it isn't a number. */
const discOf = (v: string) => (v.trim() === '' ? 0 : /^\d+(\.\d+)?$/.test(v.trim()) ? Number(v.trim()) : NaN);
const smallInput = { height: 44, minWidth: 90, paddingHorizontal: 10, fontSize: 16, color: C.ink, borderWidth: 1, borderRadius: R.sm, backgroundColor: C.white, textAlign: 'right' as const };

/**
 * New proforma, like the website's (doc builder in proforma mode): customer, where it goes, items at the
 * customer's prices with quantity and discount, how long the quote is valid, and the terms. No stock is taken.
 */
export default function NewProforma() {
  const can = useCan();
  const { me } = useAuth();
  const owner = me?.role === 'OWNER';
  const utils = trpc.useUtils();
  const customers = trpc.sales.customers.useQuery();
  const company = trpc.sales.companyReady.useQuery();
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [shipId, setShipId] = useState<string | null>(null);
  const [doctorId, setDoctorId] = useState<string | null>(null);
  const [date, setDate] = useState(istDateString());
  const [validUntil, setValidUntil] = useState('');
  const [terms, setTerms] = useState('');
  const [lines, setLinesState] = useState<Line[]>([]);
  const ref = useRef<Line[]>([]);
  const setLines = (n: Line[]) => { ref.current = n; setLinesState(n); };
  const seq = useRef(0);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);
  const create = trpc.proformas.create.useMutation();
  const saving = useRef(false);
  // "Make proforma" on an order opens this filled in from it (as the website does): customer, doctor, where it goes, items.
  const { orderId } = useLocalSearchParams<{ orderId?: string }>();
  const order = trpc.orders.get.useQuery({ id: orderId! }, { enabled: !!orderId });
  const [prefilled, setPrefilled] = useState(false);
  useEffect(() => {
    const o = order.data;
    if (!o || prefilled) return;
    setPrefilled(true);
    setCustomerId(o.customer.id); setShipId(o.shippingAddressId ?? null); setDoctorId(o.forDoctor?.id ?? null);
    void (async () => {
      const next: Line[] = [];
      for (const l of o.lines) {
        try {
          const p = await utils.products.get.fetch({ id: l.variant.product.id });
          next.push({ key: `${Date.now()}-${seq.current++}`, variantId: l.variant.id, productId: p.id, name: p.name, label: l.variant.label, hsn: p.hsnCode, gstRate: p.gstRate, qty: String(l.qty), disc: '', rate: owner ? String(l.rate) : '' });
        } catch (e) { setMsg({ tone: 'danger', text: `Could not add an item from the order. ${errorText(e)}` }); }
      }
      setLines([...next, ...ref.current]);
    })();
  }, [order.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const customer = customers.data?.find((c) => c.id === customerId);
  const addresses = customer?.addresses ?? [];
  const ship = addresses.find((a) => a.id === shipId) ?? addresses.find((a) => a.kind === 'SHIPPING' && a.isDefault) ?? addresses.find((a) => a.kind === 'BILLING') ?? addresses[0];
  const productIds = useMemo(() => [...new Set(lines.map((l) => l.productId))].sort(), [lines]);
  const prices = trpc.sales.prices.useQuery({ customerId: customerId ?? '', productIds }, { enabled: !!customerId && productIds.length > 0, placeholderData: (prev) => prev });
  // Only the owner may quote a different rate (the server ignores anyone else's); blank = the customer's price.
  const rateOf = (l: Line) => (owner && amountOf(l.rate) > 0 ? amountOf(l.rate) : prices.data?.[l.productId]?.rate ?? null);
  const companyState = company.data?.stateCode ?? '';
  const totals = useMemo(() => {
    const rate = (l: Line) => (owner && amountOf(l.rate) > 0 ? amountOf(l.rate) : prices.data?.[l.productId]?.rate ?? null);
    if (!lines.length || !ship || lines.some((l) => rate(l) == null || int(l.qty) < 1 || Number.isNaN(discOf(l.disc)))) return null;
    return computeGst(companyState || 'XX', ship.stateCode, lines.map((l) => ({ qty: int(l.qty), rate: rate(l)!, discPct: Math.min(100, discOf(l.disc)), hsn: l.hsn, gstRate: l.gstRate })));
  }, [lines, prices.data, ship, companyState, owner]);

  async function onPick(p: Picked) {
    const name = `${p.productName}${p.label ? ` ${p.label}` : ''}`;
    const same = ref.current.find((l) => l.variantId === p.variantId);
    if (same) { setLines(ref.current.map((l) => (l === same ? { ...l, qty: String(int(l.qty) + 1) } : l))); setMsg({ tone: 'ok', text: `Added one more ${name} ✓` }); return; }
    try {
      const prod = await utils.products.get.fetch({ id: p.productId });
      setLines([...ref.current, { key: `${Date.now()}-${seq.current++}`, variantId: p.variantId, productId: p.productId, name: p.productName, label: p.label, hsn: prod.hsnCode, gstRate: prod.gstRate, qty: '1', disc: '', rate: '' }]);
      setMsg({ tone: 'ok', text: `Added ${name} ✓` });
    } catch (e) {
      setMsg({ tone: 'danger', text: `Could not add ${name}. ${errorText(e)}` });
    }
  }
  const update = (key: string, patch: Partial<Line>) => setLines(ref.current.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const remove = (key: string) => { setLines(ref.current.filter((l) => l.key !== key)); setMsg(null); };

  const badQty = lines.some((l) => int(l.qty) < 1 || int(l.qty) > 10000);
  const badDisc = lines.some((l) => { const d = discOf(l.disc); return Number.isNaN(d) || d > 100; });
  const badRate = owner && lines.some((l) => l.rate.trim() !== '' && !(amountOf(l.rate) > 0));
  const badValid = !!validUntil.trim() && (!isDay(validUntil.trim()) || validUntil.trim() < date.trim());
  const missing = [
    !customer && 'choose the customer',
    !lines.length && 'add an item',
    !isDay(date.trim()) && 'write the date as YYYY-MM-DD',
    badQty && 'each quantity must be 1 to 10000',
    badDisc && 'each discount must be 0 to 100',
    badRate && 'write each rate as an amount, or leave it empty',
    badValid && 'fix the "valid until" date',
  ].filter(Boolean);

  function save() {
    if (missing.length || !customer || saving.current) return;
    saving.current = true;
    create.mutate({
      customerId: customer.id, shippingAddressId: ship?.id ?? null, forDoctorId: doctorId, orderId: order.data?.id ?? null, date: date.trim(), validUntil: validUntil.trim() || null, terms: terms.trim() || null,
      lines: lines.map((l) => ({ variantId: l.variantId, qty: int(l.qty), discPct: discOf(l.disc), rate: owner && amountOf(l.rate) > 0 ? amountOf(l.rate) : null })),
    }, {
      onSuccess: (r) => { void utils.proformas.invalidate(); router.replace(`/staff/proformas/${r.id}?saved=1`); },
      // After success the button stays busy until the proforma opens: proformas have no retry key, so a second tap would save twice.
      onError: () => { saving.current = false; },
    });
  }

  const title = <Stack.Screen options={{ title: 'New proforma' }} />;
  if (!can('CREATE_PROFORMA')) return <Screen>{title}<Alert tone="warn">You can’t make proformas. Ask the owner to give you that permission.</Alert></Screen>;
  if (!customers.data) return customers.error ? <Screen>{title}<Failed error={customers.error} busy={customers.isFetching} onRetry={() => void customers.refetch()} /></Screen> : <>{title}<Loading /></>;

  return (
    <Screen footer={
      <>
        {create.error && <Alert>{errorText(create.error)}</Alert>}
        {missing.length > 0 && <Hint tone="muted">{`To save: ${missing.join(', ')}.`}</Hint>}
        <Button title={`Save proforma${totals ? ` · ${rupees(totals.total)}` : ''}`} loading={create.isPending || create.isSuccess} disabled={missing.length > 0} onPress={save} />
      </>
    }>
      {title}
      <Muted>A quote at the customer’s prices. No stock is taken.</Muted>
      {order.data && <Alert tone="info">{`From order ${order.data.number}.`}</Alert>}
      {order.error && <Alert>{errorText(order.error)}</Alert>}
      {company.data && !company.data.ready && <Alert tone="warn">Set the company state and GSTIN in Settings → Company (website) first. Until then GST can’t be worked out.</Alert>}
      {company.error && <Alert>{errorText(company.error)}</Alert>}

      {!customer ? <CustomerPicker customers={customers.data} onPick={(cid) => { setCustomerId(cid); setShipId(null); setDoctorId(null); }} /> : (
        <ChosenCustomer customer={customer} onChange={() => setCustomerId(null)}>
          {addresses.length > 1 && (
            <View style={{ gap: 2 }}>
              <P style={{ fontWeight: '700' }}>Deliver to</P>
              {addresses.map((a) => <Choice key={a.id} label={`${a.label ?? (a.kind === 'BILLING' ? 'Billing address' : 'Shipping')} · ${a.city}`} hint={stateByCode(a.stateCode)?.name} selected={ship?.id === a.id} onPress={() => setShipId(a.id)} />)}
            </View>
          )}
          {customer.doctors.length > 0 && (
            <View style={{ gap: 2 }}>
              <P style={{ fontWeight: '700' }}>For doctor (optional)</P>
              <Choice label="No doctor" selected={!doctorId} onPress={() => setDoctorId(null)} />
              {customer.doctors.map((d) => <Choice key={d.id} label={d.name} selected={doctorId === d.id} onPress={() => setDoctorId(d.id)} />)}
            </View>
          )}
          {ship && <Muted>{`GST: ${companyState === ship.stateCode ? 'CGST + SGST' : 'IGST'} (to ${stateByCode(ship.stateCode)?.name ?? ship.stateCode}) · payment in ${customer.paymentTermsDays} days`}</Muted>}
          {!ship && <Alert tone="warn">This customer has no address. Add one on the website before making a proforma.</Alert>}
        </ChosenCustomer>
      )}

      {customer && (
        <Card>
          <H2>Add items</H2>
          <ProductPicker onPick={(p) => void onPick(p)} allSizes />
        </Card>
      )}
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}

      {lines.map((l) => {
        const rate = rateOf(l);
        const d = discOf(l.disc);
        const amount = rate != null && !Number.isNaN(d) ? Math.round(int(l.qty) * rate * (1 - Math.min(100, d) / 100) * 100) / 100 : null;
        const src = prices.data?.[l.productId]?.source;
        return (
          <Card key={l.key}>
            <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}><P style={{ fontWeight: '700' }}>{l.name}</P>{!!l.label && <Muted>{l.label}</Muted>}</View>
              <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${l.name}`} onPress={() => remove(l.key)} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="trash-outline" size={22} color={C.muted} />
              </Pressable>
            </Row>
            <Row style={{ justifyContent: 'space-between' }}>
              <P>How many</P>
              <Stepper label={l.name} value={l.qty} onChange={(v) => update(l.key, { qty: v })} min={1} />
            </Row>
            <Row style={{ justifyContent: 'space-between' }}>
              <P>Discount %</P>
              <TextInput accessibilityLabel={`Discount percent for ${l.name}`} value={l.disc} onChangeText={(v) => update(l.key, { disc: v.replace(/[^\d.]/g, '').slice(0, 6) })} placeholder="0" placeholderTextColor="#9aa5b1" keyboardType="decimal-pad"
                style={[smallInput, { borderColor: Number.isNaN(d) || d > 100 ? C.danger : C.line }]} />
            </Row>
            {owner && (
              <Row style={{ justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}><P>Rate ₹ (owner)</P><Muted>Empty = customer’s price</Muted></View>
                <TextInput accessibilityLabel={`Rate for ${l.name}`} value={l.rate} onChangeText={(v) => update(l.key, { rate: v.replace(/[^\d.]/g, '').slice(0, 12) })} placeholder={prices.data?.[l.productId] ? String(prices.data[l.productId]!.rate) : ''} placeholderTextColor="#9aa5b1" keyboardType="decimal-pad"
                  style={[smallInput, { borderColor: l.rate.trim() && !(amountOf(l.rate) > 0) ? C.danger : C.line }]} />
              </Row>
            )}
            <Row style={{ justifyContent: 'space-between' }}>
              <Row style={{ flexShrink: 1, flexWrap: 'wrap' }}>
                <Muted>{`× ${rupees(rate)} · GST ${l.gstRate}%`}</Muted>
                {src && src !== 'DEFAULT' && !(owner && l.rate.trim()) && <Badge label={src === 'CUSTOMER' ? 'Special price' : 'Price list'} tone="teal" />}
              </Row>
              <Text style={{ fontSize: 16, fontWeight: '700', color: C.ink }}>{rupees(amount)}</Text>
            </Row>
          </Card>
        );
      })}

      {customer && (
        <Card>
          <H2>Quote details</H2>
          <Field label="Date (YYYY-MM-DD)" value={date} onChangeText={setDate} keyboardType="numbers-and-punctuation" maxLength={10} error={date.trim() && !isDay(date.trim()) ? 'Use a real date as YYYY-MM-DD' : null} />
          <Field label="Valid until (YYYY-MM-DD, optional)" value={validUntil} onChangeText={setValidUntil} keyboardType="numbers-and-punctuation" maxLength={10} placeholder="Empty = usual validity from Settings"
            error={badValid ? (isDay(validUntil.trim()) ? 'Must be on or after the date' : 'Use a real date as YYYY-MM-DD') : null} />
          <Field label="Terms (optional)" value={terms} onChangeText={setTerms} maxLength={2000} multiline placeholder="Empty = the usual terms from Settings" style={[s.input, { minHeight: 80, textAlignVertical: 'top' }]} />
        </Card>
      )}

      {totals && (
        <Card>
          <Amount k="Taxable value" v={rupees(totals.taxable)} />
          {totals.taxLines.map((t) => <Amount key={`${t.label}-${t.rate}`} k={`${t.label} @ ${t.rate}%`} v={rupees(t.amount)} />)}
          {totals.roundOff !== 0 && <Amount k="Round off" v={rupees(totals.roundOff)} />}
          <Amount k="Total" v={rupees(totals.total)} strong />
        </Card>
      )}
    </Screen>
  );
}
