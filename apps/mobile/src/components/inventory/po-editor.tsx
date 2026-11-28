import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { computeGst, istDateString, stateByCode } from '@kush/core';
import { readableError } from '@/components/errors';
import { ProductPicker, type Picked } from '@/components/product-picker';
import { Alert, Button, Card, Field, H2, LinkButton, Loading, P, Row, Screen } from '@/components/ui';
import { useCan } from '@/lib/auth';
import { rupees } from '@/lib/format';
import { C, R } from '@/lib/theme';
import { trpc } from '@/lib/trpc';
import { decimalText, Failed, flashNext, int, isDay, nameOf, Note, numOrNull, PickList } from './common';

/** `qty`, `rate` and `disc` stay as typed and are checked on save. A blank rate means "the last price paid". */
interface Line { key: string; variantId: string; productId: string; name: string; label: string | null; unit: string; hsn: string; gstRate: number; qty: string; rate: string; disc: string }
type Item = { variantId: string; productId: string; productName: string; label: string | null };

/**
 * New purchase order, or change a draft (web: PoEditor). Supplier, items (by name, or from those below
 * reorder level), quantities and rates. Rates start at the last price paid to this supplier.
 */
export function PoEditor({ poId, supplier: presetSupplier, suggest }: { poId?: string; supplier?: string; suggest?: boolean }) {
  const can = useCan();
  const utils = trpc.useUtils();
  const buyer = can('CREATE_PURCHASE_ORDERS');
  const suppliers = trpc.suppliers.list.useQuery(undefined, { enabled: buyer });
  const defaults = trpc.purchaseOrders.defaults.useQuery(undefined, { enabled: buyer });
  const existing = trpc.purchaseOrders.get.useQuery({ id: poId ?? '' }, { enabled: buyer && !!poId });
  const [head, setHead] = useState({ supplierId: presetSupplier ?? null as string | null, date: istDateString(), expectedDate: '', terms: '', note: '' });
  const [lines, setLinesState] = useState<Line[]>([]);
  const ref = useRef<Line[]>([]);
  const setLines = (next: Line[]) => { ref.current = next; setLinesState(next); };
  const seq = useRef(0);
  const loaded = useRef(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [showSuggest, setShowSuggest] = useState(!!suggest);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [showDetails, setShowDetails] = useState(false);
  const create = trpc.purchaseOrders.create.useMutation();
  const update = trpc.purchaseOrders.update.useMutation();
  const m = poId ? update : create;

  useEffect(() => { if (!poId && defaults.data && !head.terms) setHead((h) => ({ ...h, terms: defaults.data.terms })); }, [defaults.data]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const p = existing.data;
    if (!p || loaded.current) return;
    loaded.current = true;
    setHead({ supplierId: p.supplier.id, date: p.date, expectedDate: p.expectedDate ?? '', terms: p.terms ?? '', note: p.note ?? '' });
    setLines(p.lines.map((l) => ({ key: `l${seq.current++}`, variantId: l.variantId, productId: l.productId, name: l.name, label: l.label, unit: l.unit, hsn: l.hsnCode, gstRate: l.gstRate, qty: String(l.qtyOrdered), rate: l.rate == null ? '' : String(l.rate), disc: l.discPct ? String(l.discPct) : '' })));
  }, [existing.data]);

  const supplier = suppliers.data?.find((s) => s.id === head.supplierId);
  const rates = trpc.purchaseOrders.rates.useQuery({ supplierId: head.supplierId, variantIds: lines.map((l) => l.variantId) }, { enabled: buyer && lines.length > 0, placeholderData: (p) => p });
  const suggestions = trpc.purchaseOrders.suggestions.useQuery({ supplierId: head.supplierId }, { enabled: buyer && showSuggest });
  const rateOf = (l: Line) => (l.rate.trim() !== '' ? Number(l.rate) : rates.data?.[l.variantId]?.rate ?? null);
  const totals = useMemo(() => {
    if (!supplier || !lines.length || lines.some((l) => { const r = rateOf(l); return r == null || !Number.isFinite(r) || int(l.qty) < 1; })) return null;
    return computeGst(supplier.stateCode, defaults.data?.stateCode ?? 'XX', lines.map((l) => ({ qty: int(l.qty), rate: rateOf(l)!, discPct: Number(l.disc || 0), hsn: l.hsn, gstRate: l.gstRate })));
  }, [lines, rates.data, supplier, defaults.data]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!buyer) return <Screen><Alert tone="warn">Making purchase orders needs the “Create purchase orders” permission. Ask the owner.</Alert></Screen>;
  const failed = suppliers.error ?? existing.error;
  if (failed) return <Screen><Failed error={failed} onRetry={() => { void suppliers.refetch(); if (poId) void existing.refetch(); }} /></Screen>;
  if (!suppliers.data || (poId && !existing.data)) return <Loading />;
  if (poId && existing.data && existing.data.status !== 'DRAFT') return <Screen><Alert tone="warn">Only a draft can be changed. This PO has already been sent.</Alert></Screen>;

  /** Add an item (or more of one already on the PO). Its HSN, GST rate and unit come from the product. */
  async function add(v: Item, qty = 1) {
    const p = await utils.products.get.fetch({ id: v.productId });
    const cur = ref.current;
    const have = cur.find((l) => l.variantId === v.variantId);
    if (have) setLines(cur.map((l) => (l.key === have.key ? { ...l, qty: String(int(l.qty) + qty) } : l)));
    else setLines([...cur, { key: `l${seq.current++}`, variantId: v.variantId, productId: v.productId, name: v.productName, label: v.label, unit: p.unit, hsn: p.hsnCode, gstRate: p.gstRate, qty: String(qty), rate: '', disc: '' }]);
  }
  async function onPick(p: Picked) {
    setAdding(true);
    try { await add(p); setMsg({ tone: 'ok', text: `Added ${nameOf(p)}` }); }
    catch (e) { setMsg({ tone: 'danger', text: readableError(e) }); }
    finally { setAdding(false); }
  }
  async function addSuggested() {
    const chosen = (suggestions.data ?? []).filter((r) => r.variantId in picked && int(picked[r.variantId] ?? '') > 0);
    setAdding(true);
    try {
      for (const r of chosen) await add({ variantId: r.variantId, productId: r.productId, productName: r.productName, label: r.label }, int(picked[r.variantId] ?? ''));
      setPicked({}); setShowSuggest(false);
      setMsg({ tone: 'ok', text: `Added ${chosen.length} item${chosen.length === 1 ? '' : 's'} below reorder level` });
    } catch (e) { setMsg({ tone: 'danger', text: readableError(e) }); }
    finally { setAdding(false); }
  }
  const update1 = (key: string, patch: Partial<Line>) => setLines(ref.current.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const units = lines.reduce((t, l) => t + int(l.qty), 0);
  const problems = lines.flatMap((l) => {
    const r = numOrNull(l.rate), d = numOrNull(l.disc);
    return [
      (int(l.qty) < 1 || int(l.qty) > 100000) && `${nameOf(l)}: write the quantity`,
      r != null && !Number.isFinite(r) && `${nameOf(l)}: write the rate as a number`,
      d != null && (!Number.isFinite(d) || d < 0 || d > 100) && `${nameOf(l)}: discount must be 0 to 100`,
    ].filter((x): x is string => !!x);
  });
  const missing = [
    !head.supplierId && 'choose the supplier',
    !isDay(head.date.trim()) && 'write the PO date as YYYY-MM-DD',
    head.expectedDate.trim() && !isDay(head.expectedDate.trim()) && 'write the expected date as YYYY-MM-DD',
    !lines.length && 'add an item',
  ].filter((x): x is string => !!x);

  function save() {
    const body = {
      supplierId: head.supplierId!, date: head.date.trim(), expectedDate: head.expectedDate.trim() || null, terms: head.terms.trim() || null, note: head.note.trim() || null,
      lines: lines.map((l) => ({ variantId: l.variantId, qty: int(l.qty), rate: numOrNull(l.rate), discPct: Number(l.disc || 0) })),
    };
    if (poId) {
      update.mutate({ ...body, id: poId }, { onSuccess: () => { void utils.purchaseOrders.invalidate(); flashNext(`po:${poId}`, 'Changes saved ✓'); router.back(); } });
    } else {
      create.mutate(body, {
        onSuccess: (r) => {
          void utils.purchaseOrders.invalidate();
          flashNext(`po:${r.id}`, `Saved ${r.number} as a draft ✓ Next: share the PDF with the supplier, then mark it as sent.`);
          router.replace(`/staff/purchase-orders/${r.id}`);
        },
      });
    }
  }

  const tickedCount = Object.keys(picked).length;
  return (
    <Screen footer={
      <>
        {m.error && <Alert>{readableError(m.error)}</Alert>}
        {(missing.length > 0 || problems.length > 0) && <Note style={{ textAlign: 'center' }}>To save: {[...missing, ...problems].join('; ')}.</Note>}
        <Button title={`${poId ? 'Save changes' : 'Save as draft'}${totals ? ` · ${rupees(totals.total)}` : ''}`} loading={m.isPending} disabled={missing.length > 0 || problems.length > 0 || adding} onPress={save} />
      </>
    }>
      {defaults.data && !defaults.data.ready && <Alert tone="warn">The company’s state is not set (website: Settings → Company), so GST on the PO can’t be worked out. Ask the owner.</Alert>}
      <Card>
        <PickList label="Supplier" value={head.supplierId} placeholder="Choose the supplier" items={suppliers.data.map((s) => ({ id: s.id, label: s.name, hint: s.code }))} onChange={(id) => setHead({ ...head, supplierId: id })} />
        {supplier && <Note>GST: {supplier.stateCode === defaults.data?.stateCode ? 'CGST + SGST (same state)' : `IGST (supplier in ${stateByCode(supplier.stateCode)?.name ?? supplier.stateCode})`} · payment terms {supplier.paymentTermsDays} days</Note>}
        <Row style={{ alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}><Field label="PO date" keyboardType="numbers-and-punctuation" value={head.date} onChangeText={(x) => setHead({ ...head, date: x })} maxLength={10} error={head.date.trim() && !isDay(head.date.trim()) ? 'Use YYYY-MM-DD' : null} /></View>
          <View style={{ flex: 1 }}><Field label="Expected by (optional)" placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" value={head.expectedDate} onChangeText={(x) => setHead({ ...head, expectedDate: x })} maxLength={10} error={head.expectedDate.trim() && !isDay(head.expectedDate.trim()) ? 'Use YYYY-MM-DD' : null} /></View>
        </Row>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: showDetails }} onPress={() => setShowDetails(!showDetails)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 }}>
          <Text style={{ color: C.teal700, fontWeight: '700', fontSize: 15 }}>Terms and reference</Text>
          <Ionicons name={showDetails ? 'chevron-up' : 'chevron-down'} size={18} color={C.teal700} />
        </Pressable>
        {showDetails && (
          <>
            <Field label="Terms and conditions (printed)" value={head.terms} onChangeText={(x) => setHead({ ...head, terms: x })} multiline maxLength={2000} />
            <Field label="Reference / note (printed)" value={head.note} onChangeText={(x) => setHead({ ...head, note: x })} maxLength={300} />
          </>
        )}
      </Card>

      <Card>
        <H2>Add items</H2>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: showSuggest }} onPress={() => setShowSuggest(!showSuggest)}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingHorizontal: 12, borderRadius: R.md, backgroundColor: pressed ? C.aqua100 : C.aqua50 })}>
          <Ionicons name="list-outline" size={20} color={C.teal700} />
          <Text style={{ flex: 1, fontSize: 15, fontWeight: '700', color: C.navy }}>Items below reorder level</Text>
          <Ionicons name={showSuggest ? 'chevron-up' : 'chevron-down'} size={18} color={C.teal700} />
        </Pressable>
        {showSuggest && (
          <View style={{ gap: 8 }}>
            {!suggestions.data && (suggestions.error ? <Failed error={suggestions.error} busy={suggestions.isFetching} onRetry={() => void suggestions.refetch()} /> : <Loading />)}
            {suggestions.data?.length === 0 && <Note>Nothing is below its reorder level{head.supplierId ? ' among this supplier’s products' : ''}.</Note>}
            {suggestions.data && suggestions.data.length > 0 && <Note>Tick what to order. What is already on order is taken off the suggested quantity.</Note>}
            {suggestions.data?.map((r) => {
              const on = r.variantId in picked;
              return (
                <View key={r.variantId} style={{ borderWidth: 1, borderColor: on ? C.teal700 : C.line, borderRadius: R.md, padding: 8, gap: 6, backgroundColor: on ? C.aqua50 : C.white }}>
                  <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={`Order ${nameOf(r)}`}
                    onPress={() => { const n = { ...picked }; if (on) delete n[r.variantId]; else n[r.variantId] = String(r.suggestedQty); setPicked(n); }}
                    style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', minHeight: 44 }}>
                    <Ionicons name={on ? 'checkbox' : 'square-outline'} size={24} color={C.teal700} />
                    <View style={{ flex: 1 }}>
                      <P style={{ fontWeight: '700' }}>{r.productName}</P>
                      <Note>{r.label ?? r.sku}{!head.supplierId && r.supplier ? ` · usually from ${r.supplier.name}` : ''}</Note>
                      <Note>In stock <Text style={{ color: r.qty === 0 ? C.danger : C.ink, fontWeight: '700' }}>{r.qty}</Text> · reorder at {r.reorderLevel}{r.onOrder ? ` · ${r.onOrder} on order` : ''} · {rupees(r.rate)}{r.rateSource === 'LAST_PURCHASE' ? ' last paid' : ''}</Note>
                    </View>
                  </Pressable>
                  {on && <Field label="How many to order" keyboardType="number-pad" value={picked[r.variantId] ?? ''} onChangeText={(x) => setPicked({ ...picked, [r.variantId]: x.replace(/\D/g, '') })} maxLength={6} />}
                </View>
              );
            })}
            {suggestions.data && suggestions.data.length > 0 && (
              <>
                <View style={{ alignItems: 'flex-start' }}><LinkButton title="Tick all" onPress={() => setPicked(Object.fromEntries(suggestions.data.map((r) => [r.variantId, picked[r.variantId] ?? String(r.suggestedQty)])))} /></View>
                <Button variant="secondary" title={`Add ${tickedCount} item${tickedCount === 1 ? '' : 's'} to the PO`} disabled={!tickedCount} loading={adding} onPress={() => void addSuggested()} />
              </>
            )}
          </View>
        )}
        <Note>Or find any item by name:</Note>
        <ProductPicker allSizes onPick={(p) => void onPick(p)} />
        {adding && <Note>Adding…</Note>}
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      </Card>

      {lines.length > 0 && <H2>On this PO: {lines.length} item{lines.length === 1 ? '' : 's'}, {units} unit{units === 1 ? '' : 's'}</H2>}
      {lines.map((l) => {
        const rate = rateOf(l);
        const src = l.rate.trim() === '' ? rates.data?.[l.variantId] : undefined;
        const amount = rate != null && Number.isFinite(rate) ? Math.round(int(l.qty) * rate * (1 - Number(l.disc || 0) / 100) * 100) / 100 : null;
        return (
          <Card key={l.key}>
            <Row style={{ alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}><P style={{ fontWeight: '700' }}>{l.name}</P><Note>{l.label ? `${l.label} · ` : ''}HSN {l.hsn} · GST {l.gstRate}%</Note></View>
              <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${nameOf(l)}`} onPress={() => setLines(ref.current.filter((x) => x.key !== l.key))} hitSlop={8} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="trash-outline" size={22} color={C.muted} />
              </Pressable>
            </Row>
            <Row style={{ alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}><Field label={`Qty (${l.unit})`} keyboardType="number-pad" value={l.qty} onChangeText={(x) => update1(l.key, { qty: x.replace(/\D/g, '') })} maxLength={6} /></View>
              <View style={{ flex: 1.3 }}><Field label="Rate ₹" keyboardType="decimal-pad" placeholder={src ? String(src.rate) : ''} value={l.rate} onChangeText={(x) => update1(l.key, { rate: decimalText(x) })} maxLength={12} /></View>
              <View style={{ flex: 0.9 }}><Field label="Disc %" keyboardType="decimal-pad" placeholder="0" value={l.disc} onChangeText={(x) => update1(l.key, { disc: decimalText(x) })} maxLength={5} /></View>
            </Row>
            <Row style={{ justifyContent: 'space-between' }}>
              <Note style={{ flex: 1 }}>{src ? (src.source === 'LAST_PURCHASE' ? `Last paid ${rupees(src.rate)}` : `Cost price ${rupees(src.rate)}`) : ''}</Note>
              <P style={{ fontWeight: '700' }}>{amount == null ? '—' : rupees(amount)}</P>
            </Row>
          </Card>
        );
      })}

      {totals && (
        <Card>
          <Row style={{ justifyContent: 'space-between' }}><Note>Before tax</Note><P>{rupees(totals.taxable)}</P></Row>
          {totals.taxLines.map((t, i) => <Row key={i} style={{ justifyContent: 'space-between' }}><Note>{t.label} @ {t.rate}%</Note><P>{rupees(t.amount)}</P></Row>)}
          {totals.roundOff !== 0 && <Row style={{ justifyContent: 'space-between' }}><Note>Round off</Note><P>{rupees(totals.roundOff)}</P></Row>}
          <Row style={{ justifyContent: 'space-between' }}><P style={{ fontWeight: '700' }}>Total</P><Text style={{ fontSize: 18, fontWeight: '700', color: C.navy }}>{rupees(totals.total)}</Text></Row>
        </Card>
      )}
    </Screen>
  );
}
