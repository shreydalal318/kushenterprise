'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, ImageOff, Search, ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, Card, CardBody, CardHeader, PageHeader } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import { rupees } from '@/lib/format';
import { trpc } from '@/lib/trpc';
import { useCart } from './cart';
import { fmtPower, LENS_TYPE_LABEL, STOCK_DOT, StockBadge } from './bits';

const sel = 'h-10 rounded-lg border border-line bg-white px-3 text-sm';

export function Catalogue() {
  const [q, setQ] = useState('');
  const [categoryId, setCategory] = useState('');
  const [brandId, setBrand] = useState('');
  const [lensType, setLensType] = useState('');
  const [power, setPower] = useState('');
  const filters = trpc.portal.filters.useQuery();
  const list = trpc.portal.catalogue.useQuery({ q: q || undefined, categoryId: categoryId || undefined, brandId: brandId || undefined, lensType: (lensType || undefined) as never, power: power === '' ? undefined : Number(power) });
  return (
    <>
      <PageHeader title="Catalogue" description="Prices shown are your own rates (GST extra). Stock: Available, Limited, or On request." />
      <div className="mb-4 flex flex-wrap gap-2">
        <label className="relative"><span className="sr-only">Search products</span><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, code or brand" className={`${sel} w-64 pl-9`} /></label>
        <select aria-label="Category" className={sel} value={categoryId} onChange={(e) => setCategory(e.target.value)}><option value="">All categories</option>{filters.data?.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select aria-label="Brand" className={sel} value={brandId} onChange={(e) => setBrand(e.target.value)}><option value="">All brands</option>{filters.data?.brands.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select aria-label="Lens type" className={sel} value={lensType} onChange={(e) => setLensType(e.target.value)}><option value="">Any lens type</option>{filters.data?.lensTypes.map((t) => <option key={t} value={t}>{LENS_TYPE_LABEL[t]}</option>)}</select>
        <input aria-label="Power (D)" type="number" step="0.5" placeholder="Power, e.g. 21.5" className={`${sel} w-40`} value={power} onChange={(e) => setPower(e.target.value)} />
      </div>
      {list.data?.length === 0 && <Card><CardBody className="py-10 text-center text-sm text-muted">Nothing matches. Try clearing a filter.</CardBody></Card>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {list.data?.map((p) => (
          <Link key={p.id} href={`/portal/products/${p.id}`} className="group">
            <Card className="flex h-full flex-col overflow-hidden transition group-hover:ring-2 group-hover:ring-aqua">
              <div className="grid h-36 place-items-center bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {p.image ? <img src={`/api/files/${p.image}`} alt="" className="h-32 w-auto object-contain" /> : <ImageOff className="size-8 text-line" aria-hidden />}
              </div>
              <div className="flex flex-1 flex-col gap-1 border-t border-line px-4 py-3">
                <p className="text-xs text-muted">{p.brand ?? p.category}{p.lensType ? ` · ${LENS_TYPE_LABEL[p.lensType]}` : ''}{p.preloaded ? ' · Preloaded' : ''}</p>
                <p className="font-semibold leading-snug text-navy">{p.name}</p>
                {p.powerRange && <p className="text-xs text-muted">Powers {fmtPower(p.powerRange.min)} to {fmtPower(p.powerRange.max)} D</p>}
                <div className="mt-auto flex items-end justify-between pt-2">
                  <div><p className="text-lg font-semibold">{rupees(p.price)}</p><p className="text-xs text-muted">per {p.unit} · MRP {rupees(p.mrp)}</p></div>
                  <StockBadge stock={p.stock} />
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}

/** Product detail with a power grid: set a quantity against each power, then add them all. */
export function ProductDetail({ id }: { id: string }) {
  const q = trpc.portal.product.useQuery({ id });
  const cart = useCart();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [added, setAdded] = useState(0);
  const groups = useMemo(() => {
    const m = new Map<string, NonNullable<typeof q.data>['variants']>();
    for (const v of q.data?.variants ?? []) {
      const k = [v.cylinder != null ? `Cylinder ${v.cylinder.toFixed(2)} D` : null, v.addPower != null ? `Add +${v.addPower.toFixed(2)} D` : null].filter(Boolean).join(' · ');
      m.set(k, [...(m.get(k) ?? []), v]);
    }
    return [...m.entries()];
  }, [q.data]);
  if (q.error) return <Alert>That product is not available.</Alert>;
  if (!q.data) return <p className="text-sm text-muted">Loading…</p>;
  const p = q.data;
  const total = Object.values(qty).reduce((t, n) => t + n, 0);
  const attrs = [
    ['Type', p.lensType && LENS_TYPE_LABEL[p.lensType]], ['Material', p.material], ['A-constant', p.aConstant], ['Optic size', p.opticSizeMm && `${p.opticSizeMm} mm`],
    ['Overall length', p.overallLenMm && `${p.overallLenMm} mm`], ['Preloaded', p.preloaded == null ? null : p.preloaded ? 'Yes' : 'No'], ['GST', `${p.gstRate}%`],
  ].filter(([, v]) => v != null && v !== '');
  function addAll() {
    const lines = Object.entries(qty).filter(([, n]) => n > 0).map(([variantId, n]) => ({ variantId, qty: n }));
    cart.add(lines);
    setAdded(lines.reduce((t, l) => t + l.qty, 0));
    setQty({});
  }
  return (
    <div className="flex flex-col gap-5">
      <Link href="/portal/catalogue" className="flex w-fit items-center gap-1 text-sm text-teal-700 hover:underline"><ArrowLeft className="size-4" aria-hidden /> Catalogue</Link>
      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <Card className="grid place-items-center bg-white p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {p.images[0] ? <img src={`/api/files/${p.images[0]}`} alt={p.name} className="max-h-72 w-auto object-contain" /> : <ImageOff className="size-12 text-line" aria-hidden />}
        </Card>
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">{[p.brand, p.category, p.code].filter(Boolean).join(' · ')}</p>
          <h1 className="text-2xl font-semibold text-navy">{p.name}</h1>
          <p className="text-2xl font-semibold">{rupees(p.price)} <span className="text-sm font-normal text-muted">per {p.unit} + GST · MRP {rupees(p.mrp)}</span></p>
          {p.priceSource && <p className="text-xs text-teal-700">Your agreed rate</p>}
          {p.description && <p className="text-sm text-ink/80">{p.description}</p>}
          {attrs.length > 0 && <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">{attrs.map(([k, v]) => <div key={k as string}><dt className="text-xs text-muted">{k}</dt><dd>{v}</dd></div>)}</dl>}
        </div>
      </div>
      <Card>
        <CardHeader title={p.isLens && p.variants.length > 1 ? 'Choose powers and quantities' : 'Quantity'}
          description={<span className="flex flex-wrap items-center gap-3 text-xs"><span className="flex items-center gap-1"><i className="size-2 rounded-full bg-ok" />Available</span><span className="flex items-center gap-1"><i className="size-2 rounded-full bg-warn" />Limited</span><span className="flex items-center gap-1"><i className="size-2 rounded-full bg-line" />On request</span></span>} />
        <CardBody className="flex flex-col gap-4">
          {groups.map(([label, vs]) => (
            <div key={label || 'all'}>
              {label && <p className="mb-2 text-sm font-medium text-navy">{label}</p>}
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-8">
                {vs.map((v) => (
                  <label key={v.id} className={cn('flex flex-col gap-1 rounded-lg border p-2 text-center', (qty[v.id] ?? 0) > 0 ? 'border-teal bg-aqua-50' : 'border-line bg-white')}>
                    <span className="flex items-center justify-center gap-1 text-sm font-semibold"><i className={cn('size-2 rounded-full', STOCK_DOT[v.stock])} aria-hidden />{v.powerSph != null ? fmtPower(v.powerSph) : (v.label ?? 'Qty')}</span>
                    <span className="sr-only">{v.stock === 'AVAILABLE' ? 'available' : v.stock === 'LIMITED' ? 'limited stock' : 'on request'}</span>
                    <input type="number" min={0} max={500} inputMode="numeric" aria-label={`Quantity for ${v.label ?? p.name}`} value={qty[v.id] ?? ''} placeholder="0"
                      onChange={(e) => setQty({ ...qty, [v.id]: Math.max(0, Math.min(500, Number(e.target.value) || 0)) })} className="h-9 w-full rounded-md border border-line px-1 text-center text-sm" />
                  </label>
                ))}
              </div>
            </div>
          ))}
          {added > 0 && <Alert tone="ok"><span className="flex flex-wrap items-center gap-2"><Check className="size-4" aria-hidden /> Added {added} unit(s) to your cart. <Link href="/portal/cart" className="font-semibold underline">Go to cart</Link></span></Alert>}
          <div className="flex justify-end"><Button size="lg" disabled={!total} onClick={addAll}><ShoppingCart className="size-4" aria-hidden /> Add {total || ''} to cart{total ? ` · ${rupees(total * p.price)}` : ''}</Button></div>
        </CardBody>
      </Card>
    </div>
  );
}
