import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { readableError } from '@/components/errors';
import { Scanner } from '@/components/scanner';
import { Alert, Badge, Button, Card, Field, H2, LinkButton, P, Row, Screen } from '@/components/ui';
import { Check, Confirm, decimalText, FailedScreen, flashNext, Line, MoreActions, Note, numOrNull, LoadingScreen, Title } from '@/components/inventory/common';
import { useCan } from '@/lib/auth';
import { rupees } from '@/lib/format';
import { C, R } from '@/lib/theme';
import { trpc } from '@/lib/trpc';

type Ask = { kind: 'unlink'; gtin?: boolean; code?: string; shown: string } | { kind: 'delete' };
const str = (n: number | null | undefined) => (n == null ? '' : String(n));
const show = (c: string) => c.replace(/\x1d/g, '⟨GS⟩');

/**
 * One power or size of a product: link the barcode printed on its box (scan or type) so it scans
 * everywhere, and change its reorder level, MRP or cost (web: Variants → Edit).
 */
export default function Power() {
  const { productId, variantId } = useLocalSearchParams<{ productId: string; variantId: string }>();
  const can = useCan();
  const utils = trpc.useUtils();
  const q = trpc.products.get.useQuery({ id: productId! });
  const st = trpc.inventory.productStock.useQuery({ productId: productId! });
  const link = trpc.scan.mapAlias.useMutation();
  const unlink = trpc.scan.unlink.useMutation();
  const save = trpc.products.updateVariant.useMutation();
  const remove = trpc.products.removeVariant.useMutation();
  const [flash, setFlash] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [ask, setAsk] = useState<Ask | null>(null);
  const v = q.data?.variants.find((x) => x.id === variantId);
  const [form, setForm] = useState<{ reorderLevel: string; mrp: string; purchaseCost: string; isActive: boolean } | null>(null);
  useEffect(() => { if (v && !form) setForm({ reorderLevel: str(v.reorderLevel), mrp: str(v.mrp), purchaseCost: str(v.purchaseCost), isActive: v.isActive }); }, [v, form]);

  if (!q.data) return q.error ? <FailedScreen title="Item details" error={q.error} busy={q.isFetching} onRetry={() => void q.refetch()} /> : <LoadingScreen title="Item details" />;
  const p = q.data;
  if (!v) return <Screen><Title title="Item details" /><Alert>This {p.isLens ? 'power' : 'size'} no longer exists.</Alert><Button variant="secondary" title="Back" onPress={() => router.back()} /></Screen>;
  const editable = can('MANAGE_PRODUCTS');
  const store = can('MANAGE_STOCK');
  const name = `${p.name} ${v.label ?? ''}`.trim();
  const sv = st.data?.variants.find((x) => x.id === v.id);
  const refresh = () => Promise.all([utils.products.get.invalidate({ id: p.id }), utils.products.list.invalidate(), utils.inventory.invalidate()]);
  const clear = () => { link.reset(); unlink.reset(); save.reset(); remove.reset(); };

  function onScan(code: string) {
    clear(); setFlash(null);
    link.mutate({ code, variantId: v!.id }, {
      onSuccess: (r) => { void refresh(); setScanning(false); setFlash(r.stored === 'gtin' ? `Barcode linked ✓ Saved as GTIN ${r.gtin}. It now scans everywhere.` : 'Barcode linked ✓ It now scans everywhere.'); },
    });
  }
  function doUnlink(a: Extract<Ask, { kind: 'unlink' }>) {
    unlink.mutate({ variantId: v!.id, ...(a.gtin ? { gtin: true } : { code: a.code }) }, {
      onSuccess: () => { void refresh(); setAsk(null); setFlash(`Barcode ${a.shown} removed.`); }, onError: () => setAsk(null),
    });
  }
  const mrp = form ? numOrNull(form.mrp) : null;
  const cost = form ? numOrNull(form.purchaseCost) : null;
  const badNumber = (mrp != null && !Number.isFinite(mrp)) || (cost != null && !Number.isFinite(cost));
  const dirty = !!form && (form.reorderLevel !== str(v.reorderLevel) || form.mrp !== str(v.mrp) || form.purchaseCost !== str(v.purchaseCost) || form.isActive !== v.isActive);
  function doSave() {
    if (!form) return;
    clear(); setFlash(null);
    save.mutate({
      id: v!.id, gtin: v!.gtin, isActive: form.isActive, reorderLevel: form.reorderLevel.trim() === '' ? null : Number(form.reorderLevel), mrp,
      ...(p.canSeeCost ? { purchaseCost: cost } : {}),
    }, { onSuccess: () => { void refresh(); setFlash('Saved ✓'); } });
  }
  function doDelete() {
    remove.mutate({ id: v!.id }, {
      onSuccess: () => { void refresh(); flashNext(`product:${p.id}`, `${v!.label ?? 'That size'} deleted.`); router.back(); }, onError: () => setAsk(null),
    });
  }
  const error = link.error ?? unlink.error ?? save.error ?? remove.error;

  return (
    <Screen footer={editable && (
      <>
        {error && <Alert>{readableError(error)}</Alert>}
        {ask?.kind === 'unlink' && <Confirm question={`Remove barcode ${ask.shown}? Scanning it will no longer find ${name}.`} yes="Yes, remove it" busy={unlink.isPending} onYes={() => doUnlink(ask)} onNo={() => setAsk(null)} />}
        {ask?.kind === 'delete' && <Confirm question={`Delete ${name} for good? Only possible if it was never stocked or sold.`} yes="Yes, delete" busy={remove.isPending} onYes={doDelete} onNo={() => setAsk(null)} />}
        {!ask && (
          <>
            {badNumber && <Note style={{ textAlign: 'center' }}>Write the prices as numbers.</Note>}
            <Button title="Save changes" loading={save.isPending} disabled={!dirty || badNumber} onPress={doSave} />
          </>
        )}
      </>
    )}>
      <Stack.Screen options={{ title: v.label ?? p.code }} />
      {!!flash && <Alert tone="ok">{flash}</Alert>}
      <Card>
        <Text style={{ fontSize: 20, fontWeight: '700', color: C.navy }}>{v.label ?? 'Standard'}</Text>
        <Note>{p.name}</Note>
        <Row style={{ flexWrap: 'wrap' }}><Badge label={v.isActive ? 'Active' : 'Inactive'} tone={v.isActive ? 'ok' : 'neutral'} /></Row>
        <Line k="SKU" v={v.sku} />
        <Line k="Our item code" v={v.barcode} />
        <Line k="In stock" v={sv ? `${sv.qty} ${p.unit}` : '…'} strong />
        {store && (
          <Row style={{ flexWrap: 'wrap', gap: 4 }}>
            <LinkButton title="Stock history" icon={<Ionicons name="time-outline" size={18} color={C.teal700} />} onPress={() => router.push(`/staff/stock-reports/ledger/${v.id}`)} />
            <LinkButton title="Adjust stock" icon={<Ionicons name="create-outline" size={18} color={C.teal700} />} onPress={() => router.push(`/staff/stock-reports/adjust?productId=${p.id}&variantId=${v.id}`)} />
          </Row>
        )}
      </Card>

      <Card>
        <H2>Barcode on the box</H2>
        <Note>Link the maker’s barcode once and this item scans everywhere: receiving, invoices, lookup.</Note>
        {!v.gtin && !v.linkedCodes.length && <Alert tone="warn">No barcode linked yet, so this can’t be scanned.</Alert>}
        {!!v.gtin && <CodeRow label="GTIN" code={v.gtin} onRemove={editable ? () => { clear(); setAsk({ kind: 'unlink', gtin: true, shown: v.gtin! }); } : undefined} />}
        {v.linkedCodes.map((c) => <CodeRow key={c} code={show(c)} onRemove={editable ? () => { clear(); setAsk({ kind: 'unlink', code: c, shown: show(c) }); } : undefined} />)}
        {editable ? (
          scanning ? (
            <>
              <Scanner onScan={onScan} height={200} label="Barcode to link" startCamera />
              {link.isPending && <Note>Linking…</Note>}
              <LinkButton tone="muted" title="Close scanner" onPress={() => setScanning(false)} />
            </>
          ) : <Button variant="secondary" title="Link a barcode (scan or type)" icon={<Ionicons name="barcode-outline" size={20} color={C.ink} />} onPress={() => { clear(); setFlash(null); setScanning(true); }} />
        ) : <Note>Ask someone who manages products to link a barcode.</Note>}
      </Card>

      <Card>
        <H2>Settings for this {p.isLens ? 'power' : 'size'}</H2>
        {editable && form ? (
          <>
            <Field label="Reorder level (blank uses the product’s)" keyboardType="number-pad" value={form.reorderLevel} onChangeText={(x) => setForm({ ...form, reorderLevel: x.replace(/\D/g, '') })} maxLength={6} />
            <Field label={`MRP in ₹ (blank uses the product’s ${rupees(p.mrp)})`} keyboardType="decimal-pad" value={form.mrp} onChangeText={(x) => setForm({ ...form, mrp: decimalText(x) })} maxLength={12} />
            {p.canSeeCost && <Field label="Purchase cost in ₹ (blank uses the product’s)" keyboardType="decimal-pad" value={form.purchaseCost} onChangeText={(x) => setForm({ ...form, purchaseCost: decimalText(x) })} maxLength={12} />}
            <Check label="Active" hint="Can be ordered and sold." value={form.isActive} onChange={(x) => setForm({ ...form, isActive: x })} />
          </>
        ) : (
          <>
            <Line k="Reorder level" v={v.reorderLevel == null ? 'Same as the product' : String(v.reorderLevel)} />
            <Line k="MRP" v={v.mrp == null ? `${rupees(p.mrp)} (product)` : rupees(v.mrp)} />
            {v.purchaseCost !== undefined && <Line k="Purchase cost" v={v.purchaseCost == null ? 'Same as the product' : rupees(v.purchaseCost)} />}
          </>
        )}
      </Card>
      {editable && <MoreActions actions={[{ icon: 'trash-outline', title: `Delete this ${p.isLens ? 'power' : 'size'}`, danger: true, onPress: () => { clear(); setFlash(null); setAsk({ kind: 'delete' }); } }]} />}
    </Screen>
  );
}

function CodeRow({ label, code, onRemove }: { label?: string; code: string; onRemove?: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingHorizontal: 10, borderRadius: R.md, backgroundColor: C.aqua50 }}>
      {!!label && <Badge label={label} tone="teal" />}
      <P style={{ flex: 1, fontFamily: 'monospace' }}>{code}</P>
      {onRemove && <LinkButton tone="danger" title="Remove" onPress={onRemove} />}
    </View>
  );
}
