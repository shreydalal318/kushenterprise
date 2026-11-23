'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LENS_TYPE_LABELS, LENS_TYPES } from '@kush/core';
import { Button } from '@/components/ui/button';
import { Alert, Card, CardBody, CardHeader } from '@/components/ui/card';
import { Checkbox, SelectField, TextAreaField, TextField } from '@/components/ui/field';
import { errorMessage, fieldErrors } from '@/lib/errors';
import { trpc, type RouterOutputs } from '@/lib/trpc';
import { useMe } from '@/lib/use-me';
import { BrandSelect } from './brand-select';
import { PowerRangeFields, emptyRange, rangePreview, toRangeInput, type PowerRange } from './power-range-fields';

type Product = RouterOutputs['products']['get'];

const str = (n: number | null | undefined) => (n == null ? '' : String(n));

function initial(p?: Product) {
  return {
    code: p?.code ?? '', name: p?.name ?? '', categoryId: p?.categoryId ?? '', brandId: p?.brandId ?? null, model: p?.model ?? '',
    hsnCode: p?.hsnCode ?? '', gstRate: str(p?.gstRate ?? 5), unit: p?.unit ?? 'pcs', description: p?.description ?? '',
    purchaseCost: str(p?.purchaseCost), defaultRate: str(p?.defaultRate), mrp: str(p?.mrp), reorderLevel: str(p?.reorderLevel),
    trackBatch: p?.trackBatch ?? true, trackExpiry: p?.trackExpiry ?? true, trackSerial: p?.trackSerial ?? false,
    isLens: p?.isLens ?? false, lensType: (p?.lensType ?? null) as (typeof LENS_TYPES)[number] | null, material: p?.material ?? '',
    aConstant: str(p?.aConstant), opticSizeMm: str(p?.opticSizeMm), overallLenMm: str(p?.overallLenMm), preloaded: p?.preloaded ?? false,
    showOnWebsite: p?.showOnWebsite ?? true,
  };
}

export function ProductForm({ product }: { product?: Product }) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const { can } = useMe();
  const editable = can('MANAGE_PRODUCTS');
  const showCost = can('VIEW_PRICES_MARGINS');
  const settings = trpc.settings.get.useQuery();
  const categories = trpc.settings.categories.useQuery();
  const [v, setV] = useState(() => initial(product));
  const [range, setRange] = useState<PowerRange>(emptyRange);
  const [withRange, setWithRange] = useState(true);
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((s) => ({ ...s, [k]: val }));
  const t = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => set(k, e.target.value as never);

  const create = trpc.products.create.useMutation({ onSuccess: (r) => { void utils.products.list.invalidate(); router.push(`/app/products/${r.id}?created=${r.variantsCreated}`); } });
  const update = trpc.products.update.useMutation({ onSuccess: () => Promise.all([utils.products.get.invalidate({ id: product!.id }), utils.products.list.invalidate()]) });
  const m = product ? update : create;
  const fe = fieldErrors(m.error);

  const margin = useMemo(() => {
    const c = Number(v.purchaseCost), r = Number(v.defaultRate);
    return v.purchaseCost && r ? Math.round(((r - c) / r) * 1000) / 10 : null;
  }, [v.purchaseCost, v.defaultRate]);

  function onCategory(id: string) {
    const name = categories.data?.find((c) => c.id === id)?.name ?? '';
    setV((s) => ({ ...s, categoryId: id, ...(!product && /iol|lens/i.test(name) ? { isLens: true, trackSerial: true, lensType: s.lensType ?? 'MONOFOCAL', hsnCode: s.hsnCode || '90213900' } : {}) }));
  }

  function submit() {
    const payload = {
      ...v,
      gstRate: Number(v.gstRate), defaultRate: Number(v.defaultRate || 0), mrp: Number(v.mrp || 0),
      purchaseCost: showCost ? v.purchaseCost : undefined,
      reorderLevel: v.reorderLevel, aConstant: v.aConstant, opticSizeMm: v.opticSizeMm, overallLenMm: v.overallLenMm,
      lensType: v.isLens ? v.lensType : null, preloaded: v.isLens ? v.preloaded : null,
    };
    type CreateIn = Parameters<typeof create.mutate>[0];
    if (product) update.mutate({ id: product.id, ...(payload as unknown as CreateIn) });
    else {
      const r = v.isLens && withRange ? toRangeInput(range) : null;
      create.mutate({ ...(payload as unknown as CreateIn), ...(r ? { powerRange: r } : {}) });
    }
  }

  const rp = rangePreview(range);
  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="flex flex-col gap-6" noValidate>
      <fieldset disabled={!editable} className="flex flex-col gap-6">
        <Card>
          <CardHeader title="Basics" />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <TextField label="Product name" value={v.name} onChange={t('name')} error={fe.name} required wrapperClassName="sm:col-span-2" />
            <TextField label="Product code / SKU" value={v.code} onChange={t('code')} error={fe.code} className="uppercase" hint="Lens power SKUs are built from this, e.g. CODE-+21.50" required />
            <TextField label="Model (optional)" value={v.model} onChange={t('model')} error={fe.model} />
            <SelectField label="Category" value={v.categoryId} onChange={(e) => onCategory(e.target.value)} error={fe.categoryId}>
              <option value="">Choose…</option>
              {categories.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </SelectField>
            <BrandSelect value={v.brandId} onChange={(id) => set('brandId', id)} error={fe.brandId} canCreate={editable} />
            <TextAreaField label="Description (optional)" value={v.description} onChange={t('description')} wrapperClassName="sm:col-span-2" />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Tax & pricing" description="Selling rate cannot exceed MRP. Customer-specific prices are set on the Pricing screen." />
          <CardBody className="grid gap-4 sm:grid-cols-3">
            <TextField label="HSN code" inputMode="numeric" value={v.hsnCode} onChange={t('hsnCode')} error={fe.hsnCode} />
            <SelectField label="GST rate" value={v.gstRate} onChange={t('gstRate')} error={fe.gstRate}>
              {settings.data?.gstRates.map((r) => <option key={r} value={r}>{r}%</option>)}
            </SelectField>
            <SelectField label="Unit" value={v.unit} onChange={t('unit')} error={fe.unit}>
              {settings.data?.units.map((u) => <option key={u} value={u}>{u}</option>)}
            </SelectField>
            <TextField label="Default selling rate (₹)" type="number" step="0.01" min={0} value={v.defaultRate} onChange={t('defaultRate')} error={fe.defaultRate} />
            <TextField label="MRP (₹)" type="number" step="0.01" min={0} value={v.mrp} onChange={t('mrp')} error={fe.mrp} />
            {showCost ? (
              <TextField label="Purchase cost (₹)" type="number" step="0.01" min={0} value={v.purchaseCost} onChange={t('purchaseCost')} error={fe.purchaseCost}
                hint={margin != null ? `Margin at default rate: ${margin}%` : 'Visible only to people who can view costs'} />
            ) : <div />}
            <TextField label="Reorder level (optional)" type="number" min={0} value={v.reorderLevel} onChange={t('reorderLevel')} error={fe.reorderLevel} hint={`Blank uses the default (${settings.data?.defaultReorderLevel ?? '…'})`} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Lens details" description="Lenses have one variant per power, each with its own stock and barcode." actions={
            <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" className="size-4 accent-teal-700" checked={v.isLens} onChange={(e) => set('isLens', e.target.checked)} /> This is a lens</label>
          } />
          {v.isLens && (
            <CardBody className="grid gap-4 sm:grid-cols-3">
              <SelectField label="Lens type" value={v.lensType ?? ''} onChange={(e) => set('lensType', (e.target.value || null) as never)} error={fe.lensType}>
                <option value="">Choose…</option>
                {LENS_TYPES.map((x) => <option key={x} value={x}>{LENS_TYPE_LABELS[x]}</option>)}
              </SelectField>
              <TextField label="Material" placeholder="Hydrophobic acrylic" value={v.material} onChange={t('material')} />
              <TextField label="A-constant" type="number" step="0.01" placeholder="118.70" value={v.aConstant} onChange={t('aConstant')} error={fe.aConstant} />
              <TextField label="Optic size (mm)" type="number" step="0.01" placeholder="6.00" value={v.opticSizeMm} onChange={t('opticSizeMm')} error={fe.opticSizeMm} />
              <TextField label="Overall length (mm)" type="number" step="0.01" placeholder="13.00" value={v.overallLenMm} onChange={t('overallLenMm')} error={fe.overallLenMm} />
              <Checkbox className="self-end" label="Preloaded injector" checked={!!v.preloaded} onChange={(e) => set('preloaded', e.target.checked)} />
            </CardBody>
          )}
          {v.isLens && !product && (
            <CardBody className="border-t border-line">
              <Checkbox label="Create power variants now" checked={withRange} onChange={(e) => setWithRange(e.target.checked)} />
              {withRange && <div className="mt-3"><PowerRangeFields value={range} onChange={setRange} lensType={v.lensType} /></div>}
            </CardBody>
          )}
        </Card>

        <Card>
          <CardHeader title="Tracking & visibility" />
          <CardBody className="grid gap-1 sm:grid-cols-2">
            <Checkbox label="Track batch / lot number" checked={v.trackBatch} onChange={(e) => set('trackBatch', e.target.checked)} />
            <Checkbox label="Track expiry date (FEFO)" checked={v.trackExpiry} onChange={(e) => set('trackExpiry', e.target.checked)} />
            <Checkbox label="Track serial number per unit" description="Most IOLs carry a unique serial per lens" checked={v.trackSerial} onChange={(e) => set('trackSerial', e.target.checked)} />
            <Checkbox label="Show in the public catalogue" description="Prices are never shown publicly" checked={v.showOnWebsite} onChange={(e) => set('showOnWebsite', e.target.checked)} />
          </CardBody>
        </Card>
      </fieldset>

      {m.error && <Alert>{Object.keys(fe).length ? 'Please correct the highlighted fields.' : errorMessage(m.error)}</Alert>}
      {update.isSuccess && <Alert tone="ok">Saved.</Alert>}
      {editable && (
        <div className="flex justify-end gap-3">
          {!product && <Button type="button" variant="secondary" onClick={() => router.back()}>Cancel</Button>}
          <Button type="submit" loading={m.isPending} disabled={!product && v.isLens && withRange && 'error' in rp}>{product ? 'Save product' : 'Create product'}</Button>
        </div>
      )}
    </form>
  );
}
