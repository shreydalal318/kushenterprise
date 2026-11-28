import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LENS_TYPE_LABELS, formatDate } from '@kush/core';
import { readableError } from '@/components/errors';
import { Alert, Badge, Button, Card, H2, LinkButton, P, Row, Screen } from '@/components/ui';
import { Confirm, FailedScreen, Line, MoreActions, Note, SearchBox, useFlash, type MoreAction, LoadingScreen } from '@/components/inventory/common';
import { useCan } from '@/lib/auth';
import { rupees } from '@/lib/format';
import { C } from '@/lib/theme';
import { trpc } from '@/lib/trpc';
import { Done } from '@/components/done';

const SHOW = 60;

/** One product (web: Products → product): prices, stock, every power or size with its barcode, and suppliers. */
export default function ProductDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const can = useCan();
  const utils = trpc.useUtils();
  const q = trpc.products.get.useQuery({ id: id! });
  const st = trpc.inventory.productStock.useQuery({ productId: id! });
  const active = trpc.products.setActive.useMutation();
  const [flash, setFlash] = useFlash(`product:${id}`);
  const [confirmOff, setConfirmOff] = useState(false);
  const [filter, setFilter] = useState('');
  const [all, setAll] = useState(false);
  if (!q.data) return q.error ? <FailedScreen title="Product" error={q.error} busy={q.isFetching} onRetry={() => void q.refetch()} /> : <LoadingScreen title="Product" />;
  const p = q.data;
  const editable = can('MANAGE_PRODUCTS');
  const seesSuppliers = can('CREATE_PURCHASE_ORDERS') || can('MANAGE_STOCK') || can('VIEW_PRICES_MARGINS');
  const stock = new Map((st.data?.variants ?? []).map((v) => [v.id, v.qty]));
  const total = (st.data?.variants ?? []).reduce((t, v) => t + v.qty, 0);
  const term = filter.trim().toLowerCase();
  const matching = p.variants.filter((v) => !term || [v.sku, v.label, v.barcode, v.gtin, ...v.linkedCodes].some((x) => x?.toLowerCase().includes(term)));
  const shown = all || term ? matching : matching.slice(0, SHOW);
  const noCode = p.variants.filter((v) => v.isActive && !v.gtin && !v.linkedCodes.length).length;
  const margin = p.purchaseCost !== undefined && p.defaultRate ? Math.round(((p.defaultRate - p.purchaseCost) / p.defaultRate) * 1000) / 10 : null;
  const word = p.isLens ? 'power' : 'size';

  const setOn = (on: boolean) => active.mutate({ id: p.id, isActive: on }, {
    onSuccess: () => { void utils.products.invalidate(); void utils.inventory.invalidate(); setConfirmOff(false); setFlash(on ? 'Product is active again ✓ It can be ordered and sold.' : 'Product deactivated. It no longer shows when ordering or selling.'); },
  });
  const more: MoreAction[] = editable ? [
    ...(p.isLens ? [{ icon: 'add-circle-outline' as const, title: 'Add powers', onPress: () => router.push(`/staff/products/generate?id=${p.id}`) }] : []),
    p.isActive
      ? { icon: 'close-circle-outline' as const, title: 'Deactivate product', danger: true, onPress: () => { active.reset(); setFlash(null); setConfirmOff(true); } }
      : { icon: 'checkmark-circle-outline' as const, title: 'Activate product', onPress: () => setOn(true) },
  ] : [];

  return (
    <Screen footer={editable && (
      <>
        {active.error && <Alert>{readableError(active.error)}</Alert>}
        {confirmOff
          ? <Confirm question={`Deactivate ${p.name}? It won’t show when ordering or selling until you activate it again.`} yes="Yes, deactivate" busy={active.isPending} onYes={() => setOn(false)} onNo={() => setConfirmOff(false)} />
          : <Button title="Edit product" icon={<Ionicons name="create-outline" size={20} color={C.white} />} onPress={() => router.push(`/staff/products/edit?id=${p.id}`)} />}
      </>
    )}>
      <Stack.Screen options={{ title: p.code }} />
      <Done message={flash} onShown={() => setFlash(null)} />
      <Card>
        <Text style={{ fontSize: 20, fontWeight: '700', color: C.navy }}>{p.name}</Text>
        <Note>{p.code} · {p.category.name}{p.brand ? ` · ${p.brand.name}` : ''}{p.model ? ` · model ${p.model}` : ''}</Note>
        <Row style={{ flexWrap: 'wrap' }}>
          {p.lensType && <Badge label={LENS_TYPE_LABELS[p.lensType]} tone="teal" />}
          <Badge label={p.isActive ? 'Active' : 'Inactive'} tone={p.isActive ? 'ok' : 'danger'} />
        </Row>
        {p.description ? <P>{p.description}</P> : null}
      </Card>

      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <H2>Stock</H2>
          <P style={{ fontWeight: '700' }}>{st.data ? `${total} ${p.unit}` : '…'}</P>
        </Row>
        <View style={{ alignItems: 'flex-start' }}><LinkButton title="Stock, batches and expiry" icon={<Ionicons name="layers-outline" size={18} color={C.teal700} />} onPress={() => router.push(`/staff/stock-reports/product/${p.id}`)} /></View>
      </Card>

      <Card>
        <H2>Prices and tax</H2>
        <Line k="Our selling rate" v={rupees(p.defaultRate)} strong />
        <Line k="MRP" v={rupees(p.mrp)} />
        {p.purchaseCost !== undefined && <Line k="Purchase cost" v={`${rupees(p.purchaseCost)}${margin != null ? ` · ${margin}% margin` : ''}`} />}
        <Line k="HSN · GST" v={`${p.hsnCode} · ${p.gstRate}%`} />
        <Line k="Unit" v={p.unit} />
        <Line k="Reorder level" v={p.reorderLevel == null ? 'Usual level' : String(p.reorderLevel)} />
      </Card>

      {p.isLens && (
        <Card>
          <H2>Lens details</H2>
          {p.lensType && <Line k="Type" v={LENS_TYPE_LABELS[p.lensType]} />}
          {!!p.material && <Line k="Material" v={p.material} />}
          {p.aConstant != null && <Line k="A-constant" v={String(p.aConstant)} />}
          {p.opticSizeMm != null && <Line k="Optic size" v={`${p.opticSizeMm} mm`} />}
          {p.overallLenMm != null && <Line k="Overall length" v={`${p.overallLenMm} mm`} />}
          {p.preloaded != null && <Line k="Preloaded injector" v={p.preloaded ? 'Yes' : 'No'} />}
        </Card>
      )}

      <Card>
        <H2>Tracking</H2>
        <P>{[p.trackBatch && 'Batch number', p.trackExpiry && 'Expiry date', p.trackSerial && 'Serial number for each unit'].filter(Boolean).join(' · ') || 'Nothing tracked'}</P>
        <Note>{p.showOnWebsite ? 'Shown on the website catalogue (without prices).' : 'Not shown on the website.'}</Note>
      </Card>

      <Row style={{ justifyContent: 'space-between' }}>
        <H2>{p.isLens ? 'Powers' : 'Sizes'} ({p.variants.length})</H2>
        {editable && p.isLens && <LinkButton title="Add powers" icon={<Ionicons name="add" size={18} color={C.teal700} />} onPress={() => router.push(`/staff/products/generate?id=${p.id}`)} />}
      </Row>
      <Note>Tap one to link the barcode on its box, or to change its reorder level or MRP.</Note>
      {noCode > 0 && <Alert tone="warn">{noCode} {word}{noCode === 1 ? ' has' : 's have'} no barcode linked, so {noCode === 1 ? 'it' : 'they'} can’t be scanned yet.</Alert>}
      {p.variants.length > 12 && <SearchBox value={filter} onChange={setFilter} placeholder={p.isLens ? 'Find a power, e.g. 21.5' : 'Find a size, SKU or barcode'} />}
      {!p.variants.length && <Card><Note style={{ textAlign: 'center' }}>{p.isLens ? 'No powers yet. Tap Add powers.' : 'No sizes.'}</Note></Card>}
      {!!(term && !matching.length) && <Note>Nothing matches “{filter.trim()}”.</Note>}
      {shown.length > 0 && (
        <Card style={{ gap: 0, paddingVertical: 4 }}>
          {shown.map((v, i) => {
            const linked = !!v.gtin || v.linkedCodes.length > 0;
            const qty = stock.get(v.id);
            return (
              <Pressable key={v.id} accessibilityRole="button" accessibilityLabel={`${v.label ?? 'Standard'}, ${qty ?? 0} in stock, ${linked ? 'barcode linked' : 'no barcode'}`}
                onPress={() => router.push(`/staff/products/power?productId=${p.id}&variantId=${v.id}`)}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 56, paddingVertical: 6, borderTopWidth: i ? 1 : 0, borderTopColor: C.line, opacity: pressed ? 0.6 : 1 })}>
                <View style={{ flex: 1, gap: 2 }}>
                  <P style={{ fontWeight: '700', color: v.isActive ? C.ink : C.muted }}>{v.label ?? 'Standard'}</P>
                  <Row style={{ flexWrap: 'wrap', gap: 6 }}>
                    {linked ? <Badge label="Barcode linked" tone="ok" /> : <Badge label="No barcode" tone="warn" />}
                    {!v.isActive && <Badge label="Inactive" />}
                  </Row>
                </View>
                <Text style={{ fontSize: 15, fontWeight: '700', color: qty ? C.ink : C.muted }}>{qty ? `${qty} in stock` : 'None'}</Text>
                <Ionicons name="chevron-forward" size={18} color={C.muted} />
              </Pressable>
            );
          })}
        </Card>
      )}
      {!term && !all && matching.length > SHOW && <Button variant="secondary" title={`Show all ${matching.length} ${word}s`} onPress={() => setAll(true)} />}

      {p.supplierLinks.length > 0 && (
        <>
          <H2>Supplied by</H2>
          <Card style={{ gap: 0, paddingVertical: 4 }}>
            {p.supplierLinks.map((l, i) => (
              <Pressable key={l.supplier.id} accessibilityRole="button" disabled={!seesSuppliers} onPress={() => router.push(`/staff/suppliers/${l.supplier.id}`)}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 52, paddingVertical: 6, borderTopWidth: i ? 1 : 0, borderTopColor: C.line, opacity: pressed ? 0.6 : 1 })}>
                <View style={{ flex: 1 }}>
                  <P style={{ fontWeight: '600' }}>{l.supplier.name}</P>
                  <Note>{[l.supplierSku && `their code ${l.supplierSku}`, l.lastPurchaseRate != null && `last paid ${rupees(l.lastPurchaseRate)}`, l.lastPurchasedAt && `on ${formatDate(l.lastPurchasedAt)}`].filter(Boolean).join(' · ') || l.supplier.code}</Note>
                </View>
                {seesSuppliers && <Ionicons name="chevron-forward" size={18} color={C.muted} />}
              </Pressable>
            ))}
          </Card>
        </>
      )}
      <MoreActions actions={more} />
    </Screen>
  );
}
