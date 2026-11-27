'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, ChevronRight, Search, ShoppingCart } from 'lucide-react';
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
      <PageHeader title="Catalogue" description="Your own rates, before GST. Search by name, or by lens power." />
      <div className="mb-4 flex flex-col gap-2">
        <label className="relative"><span className="sr-only">Search products</span><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, code or brand" className={`${sel} w-full pl-9`} /></label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <select aria-label="Category" className={sel} value={categoryId} onChange={(e) => setCategory(e.target.value)}><option value="">All categories</option>{filters.data?.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <select aria-label="Brand" className={sel} value={brandId} onChange={(e) => setBrand(e.target.value)}><option value="">All brands</option>{filters.data?.brands.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <select aria-label="Lens type" className={sel} value={lensType} onChange={(e) => setLensType(e.target.value)}><option value="">Any lens type</option>{filters.data?.lensTypes.map((t) => <option key={t} value={t}>{LENS_TYPE_LABEL[t]}</option>)}</select>
          <input aria-label="Power (D)" type="number" inputMode="decimal" step="0.5" placeholder="Power, e.g. 21.5" className={sel} value={power} onChange={(e) => setPower(e.target.value)} />
        </div>
      </div>
      {list.data && list.data.length > 0 && <p className="mb-3 text-sm text-muted">{list.data.length} product{list.data.length === 1 ? '' : 's'}</p>}
      {list.data?.length === 0 && <Card><CardBody className="py-10 text-center text-sm text-muted">Nothing matches. Try clearing a filter.</CardBody></Card>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-busy={list.isLoading}>
        {list.isLoading && Array.from({ length: 6 }, (_, i) => (
          <Card key={i} className="flex animate-pulse flex-col gap-2 px-4 py-3.5" aria-hidden>
            <div className="h-3 w-24 rounded bg-canvas" /><div className="h-4 w-4/5 rounded bg-canvas" /><div className="mt-3 h-5 w-28 rounded bg-canvas" />
          </Card>
        ))}
        {list.data?.map((p) => (
          <Link key={p.id} href={`/portal/products/${p.id}`} className="group">
            <Card className="flex h-full flex-col gap-1 px-4 py-3.5 transition group-hover:border-teal group-hover:shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs text-muted">{p.brand ?? p.category}{p.lensType ? ` · ${LENS_TYPE_LABEL[p.lensType]}` : ''}{p.preloaded ? ' · Preloaded' : ''}</p>
                <StockBadge stock={p.stock} />
              </div>
              <p className="font-semibold leading-snug text-navy">{p.name}</p>
              {p.powerRange && <p className="text-xs text-muted">Powers {fmtPower(p.powerRange.min)} to {fmtPower(p.powerRange.max)} D</p>}
              <div className="mt-auto flex items-end justify-between gap-2 pt-2">
                <p><span className="text-lg font-semibold">{rupees(p.price)}</span> <span className="text-xs text-muted">/ {p.unit} · MRP {rupees(p.mrp)}</span></p>
                <ChevronRight className="size-4 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-teal-700" aria-hidden />
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
      <Card className="flex flex-col gap-3 p-5">
        <p className="text-sm text-muted">{[p.brand, p.category, p.code].filter(Boolean).join(' · ')}</p>
        <h1 className="text-2xl font-semibold leading-tight text-navy">{p.name}</h1>
        <div>
          <p className="flex flex-wrap items-baseline gap-x-2"><span className="text-2xl font-semibold">{rupees(p.price)}</span><span className="text-sm text-muted">per {p.unit}, GST extra</span>{p.priceSource && <span className="rounded bg-aqua-50 px-1.5 py-0.5 text-xs font-medium text-teal-700">Your agreed rate</span>}</p>
          <p className="text-sm text-muted">MRP {rupees(p.mrp)}</p>
        </div>
        {p.description && <p className="text-sm text-ink/80">{p.description}</p>}
        {attrs.length > 0 && <dl className="grid grid-cols-2 gap-x-6 gap-y-2 border-t border-line pt-3 text-sm sm:grid-cols-4">{attrs.map(([k, v]) => <div key={k as string}><dt className="text-xs text-muted">{k}</dt><dd className="font-medium">{v}</dd></div>)}</dl>}
      </Card>
      <Card>
        <CardHeader title={p.isLens && p.variants.length > 1 ? 'Choose powers and quantities' : 'Quantity'}
          description={<span className="flex flex-wrap items-center gap-3 text-xs"><span className="flex items-center gap-1"><i className="size-2 rounded-full bg-ok" />Available</span><span className="flex items-center gap-1"><i className="size-2 rounded-full bg-warn" />Limited</span><span className="flex items-center gap-1"><i className="size-2 rounded-full bg-white ring-1 ring-inset ring-muted/60" />On request</span></span>} />
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
        </CardBody>
      </Card>
      {/* Stays in view while scrolling a long power grid. */}
      <div className="sticky bottom-0 z-10 -mx-4 border-t border-line bg-white/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
        {added > 0 && !total
          ? <p className="flex flex-wrap items-center justify-between gap-3 text-sm"><span className="flex items-center gap-2 text-ok"><Check className="size-4" aria-hidden /> Added {added} unit{added === 1 ? '' : 's'} to your cart</span><Link href="/portal/cart" className="inline-flex h-10 items-center gap-2 rounded-lg bg-teal-700 px-4 font-semibold text-white hover:bg-teal-800"><ShoppingCart className="size-4" aria-hidden /> Go to cart</Link></p>
          : <div className="flex items-center justify-between gap-3">
              <p className="text-sm">{total ? <><span className="font-semibold">{total} unit{total === 1 ? '' : 's'}</span><span className="text-muted"> · {rupees(total * p.price)} + GST</span></> : <span className="text-muted">Enter a quantity{p.isLens && p.variants.length > 1 ? ' against each power' : ''}</span>}</p>
              <Button size="lg" disabled={!total} onClick={addAll}><ShoppingCart className="size-4" aria-hidden /> Add to cart</Button>
            </div>}
      </div>
    </div>
  );
}
