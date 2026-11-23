'use client';
import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc';

export interface VariantChoice {
  variantId: string;
  productId: string;
  productName: string;
  label: string | null;
  sku: string;
  trackSerial: boolean;
  trackBatch: boolean;
  trackExpiry: boolean;
}

/** Search a product, then (for lenses) pick the power. */
export function VariantPicker({ onPick, buttonLabel = 'Add' }: { onPick: (v: VariantChoice) => void; buttonLabel?: string }) {
  const [q, setQ] = useState('');
  const [variantId, setVariantId] = useState('');
  // Picking a suggestion fills "CODE · Name"; keep searching by the code so the list stays put.
  const term = q.includes(' · ') ? q.split(' · ')[0]! : q;
  const list = trpc.products.list.useQuery({ q: term || undefined }, { enabled: term.length >= 2, placeholderData: (prev) => prev });
  const productId = useMemo(() => list.data?.find((p) => `${p.code} · ${p.name}` === q)?.id ?? '', [list.data, q]);
  useEffect(() => setVariantId(''), [productId]);
  const product = trpc.products.get.useQuery({ id: productId }, { enabled: !!productId });
  const variants = (product.data?.variants ?? []).filter((v) => v.isActive);
  const chosen = variants.length === 1 ? variants[0] : variants.find((v) => v.id === variantId);

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="relative min-w-56 flex-1">
        <span className="sr-only">Find product</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <input list="variant-picker-products" value={q} placeholder="Find a product by name or code"
          onChange={(e) => setQ(e.target.value)}
          className="h-10 w-full rounded-lg border border-line bg-white pl-9 pr-3 text-sm" />
        <datalist id="variant-picker-products">
          {list.data?.map((p) => <option key={p.id} value={`${p.code} · ${p.name}`} />)}
        </datalist>
      </label>
      {variants.length > 1 && (
        <select aria-label="Power / variant" value={variantId} onChange={(e) => setVariantId(e.target.value)} className="h-10 rounded-lg border border-line bg-white px-3 text-sm">
          <option value="">Choose power…</option>
          {variants.map((v) => <option key={v.id} value={v.id}>{v.label ?? v.sku}</option>)}
        </select>
      )}
      <Button type="button" variant="secondary" disabled={!chosen || !product.data}
        onClick={() => {
          const p = product.data!;
          onPick({ variantId: chosen!.id, productId: p.id, productName: p.name, label: chosen!.label, sku: chosen!.sku, trackSerial: p.trackSerial, trackBatch: p.trackBatch, trackExpiry: p.trackExpiry });
          setVariantId('');
        }}>
        {buttonLabel}
      </Button>
    </div>
  );
}
