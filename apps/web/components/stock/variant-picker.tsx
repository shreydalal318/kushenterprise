'use client';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { keepPreviousData } from '@tanstack/react-query';
import { Loader2, Search, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { errorMessage } from '@/lib/errors';
import { trpc, type RouterOutputs } from '@/lib/trpc';

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

type Row = RouterOutputs['products']['search']['rows'][number];

/**
 * Type part of the name, code or power ("akreos 21.5") and pick the exact item from the list, by tap or
 * arrows + Enter. Many items have no barcode, so this is the way to add them; a code scanned into the
 * box is picked straight away when it matches one item.
 */
export function VariantPicker({ onPick, buttonLabel = 'Add' }: { onPick: (v: VariantChoice) => void; buttonLabel?: string }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const pickOnLoad = useRef<string | null>(null);
  useEffect(() => { const t = setTimeout(() => setTerm(q.trim()), 200); return () => clearTimeout(t); }, [q]);
  useEffect(() => setActive(0), [term]);
  useEffect(() => { if (open) document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: 'nearest' }); }, [active, open, id]);
  const res = trpc.products.search.useQuery({ q: term }, { enabled: term.length > 0, placeholderData: keepPreviousData, staleTime: 30_000 });
  const rows = term ? (res.data?.rows ?? []) : [];
  const searching = q.trim() !== term || res.isFetching;

  function pick(r: Row) {
    onPick({ variantId: r.variantId, productId: r.productId, productName: r.productName, label: r.label, sku: r.sku, trackSerial: r.trackSerial, trackBatch: r.trackBatch, trackExpiry: r.trackExpiry });
    setOpen(false);
    input.current?.focus();
    input.current?.select(); // ready for the next search, or Arrow down to pick another from the same list
  }

  // Enter pressed before the results came back (typed fast, or a scanner): pick the single match once they do.
  useEffect(() => {
    if (!pickOnLoad.current || pickOnLoad.current !== term || !res.data || res.isPlaceholderData || res.isFetching) return;
    pickOnLoad.current = null;
    if (res.data.rows.length === 1) pick(res.data.rows[0]!);
    else setOpen(true);
  }, [res.data, res.isPlaceholderData, res.isFetching, term]); // eslint-disable-line react-hooks/exhaustive-deps

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (open) setActive((a) => Math.max(0, Math.min(rows.length - 1, a + 1))); else setOpen(true); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Escape') setOpen(false);
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (!q.trim()) return;
      if (searching) { pickOnLoad.current = q.trim(); setTerm(q.trim()); return; }
      if (open && rows[active]) pick(rows[active]);
      else setOpen(true);
    }
  }

  const show = open && !!term;
  return (
    <div className="flex flex-col">
      <label className="relative">
        <span className="sr-only">Find product</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <input ref={input} value={q} placeholder="Find a product: name, code or power (e.g. 21.5)" autoComplete="off" spellCheck={false}
          role="combobox" aria-expanded={show} aria-controls={`${id}-list`} aria-autocomplete="list" aria-activedescendant={show && rows[active] ? `${id}-${active}` : undefined}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => q && setOpen(true)} onBlur={() => setOpen(false)} onKeyDown={onKeyDown}
          className="h-11 w-full rounded-lg border border-line bg-white pl-9 pr-10 text-sm" />
        {searching && term ? <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted" aria-hidden />
          : q && <button type="button" aria-label="Clear search" onMouseDown={(e) => e.preventDefault()} onClick={() => { setQ(''); setTerm(''); input.current?.focus(); }} className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1.5 text-muted hover:bg-canvas"><X className="size-4" /></button>}
      </label>
      {show && (
        // Mouse down here would blur the box and close the list before the click lands.
        <div className="mt-1 overflow-hidden rounded-lg border border-line bg-white shadow-sm" onMouseDown={(e) => e.preventDefault()}>
          {res.error ? <p role="alert" className="px-3 py-3 text-sm text-danger">{errorMessage(res.error)}</p>
            : !rows.length && (searching || !res.data) ? <p className="px-3 py-3 text-sm text-muted">Searching…</p>
              : !rows.length ? <p className="px-3 py-3 text-sm text-muted">Nothing matches “{term}”. Try part of the name or code, or a power such as 21.5.</p>
                : (
                  <>
                    <ul id={`${id}-list`} role="listbox" aria-label="Matching products" className={cn('max-h-80 overflow-y-auto', searching && 'opacity-60')}>
                      {rows.map((r, i) => (
                        <li key={r.variantId} id={`${id}-${i}`} role="option" aria-selected={i === active} onMouseEnter={() => setActive(i)} onClick={() => pick(r)}
                          className={cn('flex min-h-12 cursor-pointer items-center gap-3 border-t border-line px-3 py-2 first:border-t-0', i === active ? 'bg-aqua-50' : 'hover:bg-canvas')}>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-navy">{r.productName}{r.label && <span className="font-normal text-ink"> · {r.label}</span>}</p>
                            <p className="truncate text-xs text-muted">{r.code}{r.sku !== r.code ? ` · ${r.sku}` : ''}</p>
                          </div>
                          <span className={cn('shrink-0 text-xs font-medium', r.inStock > 0 ? 'text-ok' : 'text-muted')}>{r.inStock > 0 ? `${r.inStock} in stock` : 'None in stock'}</span>
                          <span aria-hidden className={cn('hidden shrink-0 rounded-md border px-2 py-1 text-xs font-semibold sm:inline', i === active ? 'border-teal text-teal-700' : 'border-line text-muted')}>{buttonLabel}</span>
                        </li>
                      ))}
                    </ul>
                    {res.data?.more && <p className="border-t border-line px-3 py-2 text-xs text-muted">More items match. Add a word or the power to narrow the list.</p>}
                  </>
                )}
        </div>
      )}
    </div>
  );
}
