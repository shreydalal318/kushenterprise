import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { LENS_TYPE_LABELS, LENS_TYPES, isValidHsn, type LensType } from '@kush/core';
import { readableError } from '@/components/errors';
import { Alert, Button, Card, Field, H2, LinkButton, Loading, Screen } from '@/components/ui';
import { useCan } from '@/lib/auth';
import { C } from '@/lib/theme';
import { trpc, type RouterOutputs } from '@/lib/trpc';
import { Check, decimalText, Failed, flashNext, Note, PickList, Pills } from './common';
import { emptyRange, PowerRangeFields, rangePreview, toRangeInput, type PowerRange } from './power-range';
import { Done } from '@/components/done';

type Product = RouterOutputs['products']['get'];
const str = (n: number | null | undefined) => (n == null ? '' : String(n));
const numOr = (v: string, empty: number | null) => (v.trim() === '' ? empty : Number(v.trim()));

function initial(p?: Product) {
  return {
    code: p?.code ?? '', name: p?.name ?? '', categoryId: p?.categoryId ?? null as string | null, brandId: p?.brandId ?? null as string | null, model: p?.model ?? '',
    hsnCode: p?.hsnCode ?? '', gstRate: p?.gstRate ?? 5, unit: p?.unit ?? 'pcs', description: p?.description ?? '',
    purchaseCost: str(p?.purchaseCost), defaultRate: str(p?.defaultRate), mrp: str(p?.mrp), reorderLevel: str(p?.reorderLevel),
    trackBatch: p?.trackBatch ?? true, trackExpiry: p?.trackExpiry ?? true, trackSerial: p?.trackSerial ?? false,
    isLens: p?.isLens ?? false, lensType: (p?.lensType ?? null) as LensType | null, material: p?.material ?? '',
    aConstant: str(p?.aConstant), opticSizeMm: str(p?.opticSizeMm), overallLenMm: str(p?.overallLenMm), preloaded: p?.preloaded ?? false,
    showOnWebsite: p?.showOnWebsite ?? true,
  };
}

/** New product, or change one (web: ProductForm). Product images are left out of the app on purpose. */
export function ProductForm({ product }: { product?: Product }) {
  const utils = trpc.useUtils();
  const can = useCan();
  const showCost = can('VIEW_PRICES_MARGINS');
  const settings = trpc.settings.get.useQuery();
  const categories = trpc.settings.categories.useQuery();
  const brands = trpc.brands.list.useQuery();
  const [v, setV] = useState(() => initial(product));
  const [range, setRange] = useState<PowerRange>(emptyRange);
  const [withRange, setWithRange] = useState(true);
  const [brandForm, setBrandForm] = useState<{ name: string; manufacturer: string } | null>(null);
  const [brandAdded, setBrandAdded] = useState<string | null>(null);
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((s) => ({ ...s, [k]: val }));
  const create = trpc.products.create.useMutation();
  const update = trpc.products.update.useMutation();
  const addBrand = trpc.brands.create.useMutation();
  const m = product ? update : create;
  // A unit or GST rate the settings no longer offer would be refused; start a new product on the first offered.
  useEffect(() => {
    if (product || !settings.data) return;
    setV((s) => ({ ...s, unit: settings.data.units.includes(s.unit) ? s.unit : settings.data.units[0] ?? s.unit, gstRate: settings.data.gstRates.includes(s.gstRate) ? s.gstRate : settings.data.gstRates[0] ?? s.gstRate }));
  }, [settings.data, product]);

  if (!can('MANAGE_PRODUCTS')) return <Screen><Alert tone="warn">Adding or changing products needs the “Manage products” permission. Ask the owner.</Alert></Screen>;
  const failed = settings.error ?? categories.error;
  if (failed) return <Screen><Failed error={failed} onRetry={() => { void settings.refetch(); void categories.refetch(); }} /></Screen>;
  if (!settings.data || !categories.data) return <Loading />;

  function onCategory(id: string | null) {
    const name = categories.data?.find((c) => c.id === id)?.name ?? '';
    setV((s) => ({ ...s, categoryId: id, ...(!product && /iol|lens/i.test(name) ? { isLens: true, trackSerial: true, lensType: s.lensType ?? 'MONOFOCAL', hsnCode: s.hsnCode || '90213900' } : {}) }));
  }

  const rate = Number(v.defaultRate || 0), mrp = Number(v.mrp || 0), cost = Number(v.purchaseCost);
  const margin = v.purchaseCost.trim() && rate ? Math.round(((rate - cost) / rate) * 1000) / 10 : null;
  const rp = rangePreview(range);
  const makeRange = !product && v.isLens && withRange;
  const missing = [
    v.name.trim().length < 2 && 'write the product name',
    v.code.trim().length < 2 && 'write the product code',
    !v.categoryId && 'choose the category',
    !isValidHsn(v.hsnCode.trim()) && 'write the HSN code (4, 6 or 8 digits)',
    (!Number.isFinite(rate) || !Number.isFinite(mrp)) && 'write the prices as numbers',
    rate > mrp && 'the selling rate can’t be above the MRP',
    v.isLens && !v.lensType && 'choose the lens type',
    makeRange && 'error' in rp && 'fix the powers to make',
  ].filter((x): x is string => !!x);

  function save() {
    const payload = {
      code: v.code.trim(), name: v.name.trim(), categoryId: v.categoryId!, brandId: v.brandId, model: v.model.trim() || null,
      hsnCode: v.hsnCode.trim(), gstRate: v.gstRate, unit: v.unit, description: v.description.trim() || null,
      defaultRate: rate, mrp, reorderLevel: numOr(v.reorderLevel, null),
      ...(showCost ? { purchaseCost: numOr(v.purchaseCost, null) } : {}),
      trackBatch: v.trackBatch, trackExpiry: v.trackExpiry, trackSerial: v.trackSerial, showOnWebsite: v.showOnWebsite,
      isLens: v.isLens, lensType: v.isLens ? v.lensType : null, material: v.isLens ? v.material.trim() || null : null,
      aConstant: v.isLens ? numOr(v.aConstant, null) : null, opticSizeMm: v.isLens ? numOr(v.opticSizeMm, null) : null, overallLenMm: v.isLens ? numOr(v.overallLenMm, null) : null,
      preloaded: v.isLens ? v.preloaded : null,
    };
    if (product) {
      update.mutate({ id: product.id, ...payload }, {
        onSuccess: () => { void utils.products.invalidate(); void utils.inventory.invalidate(); flashNext(`product:${product.id}`, 'Product saved ✓'); router.back(); },
      });
    } else {
      const r = makeRange ? toRangeInput(range) : null;
      create.mutate({ ...payload, ...(r ? { powerRange: r } : {}) }, {
        onSuccess: (res) => {
          void utils.products.invalidate();
          flashNext(`product:${res.id}`, `Product created ✓${res.variantsCreated ? ` with ${res.variantsCreated} powers` : ''}`);
          router.replace(`/staff/products/${res.id}`);
        },
      });
    }
  }

  return (
    <Screen footer={
      <>
        {m.error && <Alert>{readableError(m.error)}</Alert>}
        {missing.length > 0 && <Note style={{ textAlign: 'center' }}>To save: {missing.join(', ')}.</Note>}
        <Button title={product ? 'Save product' : makeRange && 'count' in rp ? `Create product with ${rp.count} powers` : 'Create product'} loading={m.isPending} disabled={missing.length > 0} onPress={save} />
      </>
    }>
      <Card>
        <H2>Basics</H2>
        <Field label="Product name" value={v.name} onChangeText={(x) => set('name', x)} maxLength={160} />
        <Field label="Product code" autoCapitalize="characters" autoCorrect={false} value={v.code} onChangeText={(x) => set('code', x.toUpperCase())} maxLength={30} />
        <Note>Letters, numbers, - / _ only. Lens power codes are made from it, e.g. CODE-+21.50.</Note>
        <Field label="Model (optional)" value={v.model} onChangeText={(x) => set('model', x)} maxLength={80} />
        <PickList label="Category" value={v.categoryId} placeholder="Choose the category" items={categories.data.map((c) => ({ id: c.id, label: c.name }))} onChange={onCategory} />
        <PickList label="Brand / manufacturer" value={v.brandId} none="No brand" items={(brands.data ?? []).map((b) => ({ id: b.id, label: b.name, hint: b.manufacturer ?? undefined }))} onChange={(id) => set('brandId', id)} />
        {!brandForm ? (
          <>
            <Done message={brandAdded} onShown={() => setBrandAdded(null)} />
            <View style={{ alignItems: 'flex-start' }}><LinkButton title="Add a new brand" onPress={() => { addBrand.reset(); setBrandAdded(null); setBrandForm({ name: '', manufacturer: '' }); }} /></View>
          </>
        ) : (
          <Card style={{ backgroundColor: C.canvas }}>
            <Field label="New brand name" value={brandForm.name} onChangeText={(x) => setBrandForm({ ...brandForm, name: x })} maxLength={80} autoFocus />
            <Field label="Manufacturer (optional)" value={brandForm.manufacturer} onChangeText={(x) => setBrandForm({ ...brandForm, manufacturer: x })} maxLength={120} />
            {addBrand.error && <Alert>{readableError(addBrand.error)}</Alert>}
            <Button variant="secondary" title="Add brand" loading={addBrand.isPending} disabled={brandForm.name.trim().length < 2}
              onPress={() => addBrand.mutate({ name: brandForm.name.trim(), manufacturer: brandForm.manufacturer.trim() || null }, { onSuccess: (b) => { void utils.brands.list.invalidate(); set('brandId', b.id); setBrandForm(null); setBrandAdded(`Brand ${b.name} added ✓ and chosen.`); } })} />
            <LinkButton tone="muted" title="Never mind" onPress={() => setBrandForm(null)} />
          </Card>
        )}
        <Field label="Description (optional)" value={v.description} onChangeText={(x) => set('description', x)} multiline maxLength={4000} />
      </Card>

      <Card>
        <H2>Tax and prices</H2>
        <Field label="HSN code" keyboardType="number-pad" value={v.hsnCode} onChangeText={(x) => set('hsnCode', x.replace(/\D/g, ''))} maxLength={8} />
        <Note>GST rate</Note>
        <Pills options={settings.data.gstRates.map((r) => [r, `${r}%`] as [number, string])} value={v.gstRate} onChange={(r) => set('gstRate', r)} />
        <Note>Unit</Note>
        <Pills options={settings.data.units.map((u) => [u, u] as [string, string])} value={v.unit} onChange={(u) => set('unit', u)} />
        <Field label="Our selling rate (₹)" keyboardType="decimal-pad" value={v.defaultRate} onChangeText={(x) => set('defaultRate', decimalText(x))} maxLength={12} error={rate > mrp ? 'Can’t be above the MRP' : null} />
        <Field label="MRP (₹)" keyboardType="decimal-pad" value={v.mrp} onChangeText={(x) => set('mrp', decimalText(x))} maxLength={12} />
        {showCost && <Field label="Purchase cost (₹)" keyboardType="decimal-pad" value={v.purchaseCost} onChangeText={(x) => set('purchaseCost', decimalText(x))} maxLength={12} />}
        {showCost && <Note>{margin != null ? `Margin at our selling rate: ${margin}%` : 'Only people who can see costs see this.'}</Note>}
        <Field label="Reorder level (optional)" keyboardType="number-pad" value={v.reorderLevel} onChangeText={(x) => set('reorderLevel', x.replace(/\D/g, ''))} maxLength={6} />
        <Note>Blank uses the usual level ({settings.data.defaultReorderLevel}). Special prices for customers are set under Pricing.</Note>
      </Card>

      <Card>
        <H2>Lens</H2>
        <Check label="This is a lens" hint="Lenses have one entry per power, each with its own stock and barcode." value={v.isLens} onChange={(x) => set('isLens', x)} />
        {v.isLens && (
          <>
            <Note>Lens type</Note>
            <Pills options={LENS_TYPES.map((t) => [t, LENS_TYPE_LABELS[t]] as [LensType, string])} value={v.lensType} onChange={(t) => set('lensType', t)} />
            <Field label="Material (optional)" placeholder="Hydrophobic acrylic" value={v.material} onChangeText={(x) => set('material', x)} maxLength={80} />
            <Field label="A-constant (optional)" placeholder="118.70" keyboardType="decimal-pad" value={v.aConstant} onChangeText={(x) => set('aConstant', decimalText(x))} maxLength={7} />
            <Field label="Optic size in mm (optional)" placeholder="6.00" keyboardType="decimal-pad" value={v.opticSizeMm} onChangeText={(x) => set('opticSizeMm', decimalText(x))} maxLength={6} />
            <Field label="Overall length in mm (optional)" placeholder="13.00" keyboardType="decimal-pad" value={v.overallLenMm} onChangeText={(x) => set('overallLenMm', decimalText(x))} maxLength={6} />
            <Check label="Comes in a preloaded injector" value={!!v.preloaded} onChange={(x) => set('preloaded', x)} />
            {!product && (
              <>
                <Check label="Make its powers now" hint="You can also add powers later." value={withRange} onChange={setWithRange} />
                {withRange && <PowerRangeFields value={range} onChange={setRange} lensType={v.lensType} />}
              </>
            )}
          </>
        )}
      </Card>

      <Card>
        <H2>Tracking</H2>
        <Check label="Track batch / lot number" value={v.trackBatch} onChange={(x) => set('trackBatch', x)} />
        <Check label="Track expiry date" hint="The batch that expires first is picked first." value={v.trackExpiry} onChange={(x) => set('trackExpiry', x)} />
        <Check label="Track a serial number for each unit" hint="Most lenses have their own serial number." value={v.trackSerial} onChange={(x) => set('trackSerial', x)} />
        <Check label="Show on the website catalogue" hint="Prices are never shown publicly." value={v.showOnWebsite} onChange={(x) => set('showOnWebsite', x)} />
      </Card>
    </Screen>
  );
}
