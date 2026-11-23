'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Plus, Search } from 'lucide-react';
import { LENS_TYPE_LABELS, LENS_TYPES, formatPower, type LensType } from '@kush/core';
import { Badge, Card, PageHeader } from '@/components/ui/card';
import { LinkButton } from '@/components/ui/link-button';
import { EmptyRow, Table, Td, Th, THead, Tr } from '@/components/ui/table';
import { rupees } from '@/lib/format';
import { trpc } from '@/lib/trpc';
import { useMe } from '@/lib/use-me';

const select = 'h-10 rounded-lg border border-line bg-white px-3 text-sm';

export function ProductList() {
  const { can } = useMe();
  const [q, setQ] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [brandId, setBrandId] = useState('');
  const [lensType, setLensType] = useState('');
  const [power, setPower] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const categories = trpc.settings.categories.useQuery();
  const brands = trpc.brands.list.useQuery();
  const powerNum = power.trim() === '' ? undefined : Number(power);
  const list = trpc.products.list.useQuery({
    q: q || undefined, categoryId: categoryId || undefined, brandId: brandId || undefined,
    lensType: (lensType || undefined) as LensType | undefined,
    power: powerNum !== undefined && Number.isFinite(powerNum) ? powerNum : undefined,
    includeInactive,
  });
  const showCost = can('VIEW_PRICES_MARGINS');

  return (
    <>
      <PageHeader
        title="Products"
        description="Lens models with their powers, instruments and consumables."
        actions={can('MANAGE_PRODUCTS') && <LinkButton href="/app/products/new"><Plus className="size-4" aria-hidden /> New product</LinkButton>}
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <label className="relative flex-1 sm:max-w-xs">
          <span className="sr-only">Search products</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, code, SKU or barcode" className={`${select} w-full pl-9`} />
        </label>
        <select aria-label="Category" className={select} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">All categories</option>
          {categories.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select aria-label="Brand" className={select} value={brandId} onChange={(e) => setBrandId(e.target.value)}>
          <option value="">All brands</option>
          {brands.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select aria-label="Lens type" className={select} value={lensType} onChange={(e) => setLensType(e.target.value)}>
          <option value="">Any lens type</option>
          {LENS_TYPES.map((t) => <option key={t} value={t}>{LENS_TYPE_LABELS[t]}</option>)}
        </select>
        <input aria-label="Power (dioptre)" type="number" step="0.25" value={power} onChange={(e) => setPower(e.target.value)} placeholder="Power, e.g. 21.5" className={`${select} w-40`} />
        <label className="flex items-center gap-2 px-1 text-sm text-muted"><input type="checkbox" className="accent-teal-700" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} /> Show inactive</label>
      </div>
      <Card className="overflow-hidden">
        <Table minWidth={860}>
          <THead>
            <tr><Th>Product</Th><Th>Category</Th><Th>Powers</Th><Th>HSN · GST</Th><Th className="text-right">Default rate</Th><Th className="text-right">MRP</Th>{showCost && <Th className="text-right">Cost</Th>}</tr>
          </THead>
          <tbody>
            {list.data?.length === 0 && <EmptyRow cols={showCost ? 7 : 6}>No products match. {can('MANAGE_PRODUCTS') && <Link className="text-teal-700 underline" href="/app/products/new">Add one</Link>}</EmptyRow>}
            {list.data?.map((p) => (
              <Tr key={p.id} className="hover:bg-aqua-50/60">
                <Td>
                  <Link href={`/app/products/${p.id}`} className="font-medium text-navy hover:underline">{p.name}</Link>
                  <div className="text-xs text-muted">{p.code}{p.brand ? ` · ${p.brand.name}` : ''}{!p.isActive && <Badge tone="danger" className="ml-2">Inactive</Badge>}</div>
                </Td>
                <Td>{p.category.name}{p.lensType && <div className="text-xs text-muted">{LENS_TYPE_LABELS[p.lensType]}</div>}</Td>
                <Td className="whitespace-nowrap">
                  {p.isLens ? (p.variantCount ? <>{formatPower(p.powerMin!)} to {formatPower(p.powerMax!)}<div className="text-xs text-muted">{p.variantCount} variants</div></> : <Badge tone="warn">No powers yet</Badge>) : <span className="text-muted">—</span>}
                </Td>
                <Td className="whitespace-nowrap">{p.hsnCode} · {p.gstRate}%</Td>
                <Td className="num">{rupees(p.defaultRate)}</Td>
                <Td className="num">{rupees(p.mrp)}</Td>
                {showCost && <Td className="num text-muted">{rupees(p.purchaseCost)}</Td>}
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
      {list.data && list.data.length >= 500 && <p className="mt-2 text-xs text-muted">Showing the first 500; refine the search to see more.</p>}
    </>
  );
}
