import type { Metadata } from 'next';
import Link from 'next/link';
import { Lock, Search } from 'lucide-react';
import { LENS_TYPES } from '@kush/core';
import { fmtPower, LENS_TYPE_LABEL } from '@/components/site/bits';
import { publicApi } from '@/lib/public-api';

export const metadata: Metadata = { title: 'Products', description: 'Intraocular lenses, ophthalmic surgical instruments and consumables. Search by category, brand, lens type or power.' };

type SP = { q?: string; category?: string; brand?: string; type?: string; power?: string };
const sel = 'h-11 rounded-lg border border-line bg-white px-3 text-sm';

export default async function Products({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const api = await publicApi();
  const lensType = (LENS_TYPES as readonly string[]).includes(sp.type ?? '') ? (sp.type as (typeof LENS_TYPES)[number]) : undefined;
  const power = sp.power && !Number.isNaN(Number(sp.power)) ? Number(sp.power) : undefined;
  const [f, rows] = await Promise.all([api.website.filters(), api.website.catalogue({ q: sp.q || undefined, categoryId: sp.category || undefined, brandId: sp.brand || undefined, lensType, power })]);
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-3xl font-semibold text-navy">Products</h1>
      <p className="mt-2 text-muted">Prices are shown to registered customers after they log in.</p>
      <form method="get" className="mt-6 flex flex-wrap gap-2" role="search">
        <label className="relative"><span className="sr-only">Search products</span><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input name="q" defaultValue={sp.q} placeholder="Search name, brand or code" className={`${sel} w-64 pl-9`} /></label>
        <select name="category" aria-label="Category" defaultValue={sp.category ?? ''} className={sel}><option value="">All categories</option>{f.categories.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.count})</option>)}</select>
        <select name="brand" aria-label="Brand" defaultValue={sp.brand ?? ''} className={sel}><option value="">All brands</option>{f.brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
        <select name="type" aria-label="Lens type" defaultValue={sp.type ?? ''} className={sel}><option value="">Any lens type</option>{f.lensTypes.map((t) => <option key={t} value={t}>{LENS_TYPE_LABEL[t]}</option>)}</select>
        <input name="power" aria-label="Power (D)" type="number" step="0.5" defaultValue={sp.power} placeholder="Power, e.g. 21.5" className={`${sel} w-40`} />
        <button className="h-11 rounded-lg bg-teal-700 px-5 text-sm font-semibold text-white hover:bg-teal-800">Search</button>
        {(sp.q || sp.category || sp.brand || sp.type || sp.power) && <Link href="/products" className="inline-flex h-11 items-center px-2 text-sm text-teal-700 hover:underline">Clear</Link>}
      </form>
      <p className="mt-6 text-sm text-muted">{rows.length} product{rows.length === 1 ? '' : 's'}</p>
      {rows.length === 0 && <div className="mt-4 rounded-2xl border border-line p-10 text-center text-muted">Nothing matches. Try clearing a filter, or <Link href="/contact" className="text-teal-700 hover:underline">ask us</Link>.</div>}
      <ul className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((p) => (
          <li key={p.id}>
            <Link href={`/products/${encodeURIComponent(p.code)}`} className="group flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-white transition hover:border-teal hover:shadow-sm">
              <div className="flex flex-1 flex-col gap-1 p-5">
                <p className="text-xs text-muted">{[p.brand ?? p.category, p.lensType && LENS_TYPE_LABEL[p.lensType], p.preloaded && 'Preloaded'].filter(Boolean).join(' · ')}</p>
                <h2 className="font-semibold leading-snug text-navy group-hover:underline">{p.name}</h2>
                {p.powerRange && <p className="text-sm text-muted">Powers {fmtPower(p.powerRange.min)} to {fmtPower(p.powerRange.max)} D</p>}
                <p className="mt-auto flex items-center gap-1.5 pt-3 text-sm font-medium text-teal-700"><Lock className="size-3.5" aria-hidden /> Login to see your price</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
