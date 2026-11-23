'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, SlidersHorizontal } from 'lucide-react';
import { formatDate } from '@kush/core';
import { Button } from '@/components/ui/button';
import { Alert, Badge, Card, CardHeader, PageHeader } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { SelectField, TextField } from '@/components/ui/field';
import { EmptyRow, Table, Td, Th, THead, Tr } from '@/components/ui/table';
import { cn } from '@/lib/cn';
import { errorMessage, fieldErrors } from '@/lib/errors';
import { pct, rupees } from '@/lib/format';
import { trpc, type RouterOutputs } from '@/lib/trpc';
import { useMe } from '@/lib/use-me';
import { ExcelButtons } from './import-dialog';
import { PriceHistory } from './price-history';
import { PricingTabs } from './pricing-tabs';

type Row = RouterOutputs['pricing']['customerSheet']['rows'][number];
type Draft = { rate: string; validFrom: string; validTo: string };
const SOURCE: Record<string, { label: string; tone: 'teal' | 'navy' | 'neutral' }> = {
  CUSTOMER: { label: 'Special', tone: 'teal' }, PRICE_LIST: { label: 'Price list', tone: 'navy' }, DEFAULT: { label: 'Default', tone: 'neutral' },
};
const draftOf = (r: Row): Draft => ({ rate: r.override ? String(r.override.rate) : '', validFrom: r.override?.validFrom ?? '', validTo: r.override?.validTo ?? '' });
const select = 'h-9 rounded-lg border border-line bg-white px-3 text-sm';

export function PricingWorkbench() {
  const params = useSearchParams();
  const router = useRouter();
  const { isOwner } = useMe();
  const customers = trpc.pricing.customers.useQuery();
  const categories = trpc.settings.categories.useQuery();
  const customerId = params.get('customer') ?? '';
  const [q, setQ] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [onlySpecial, setOnlySpecial] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [tab, setTab] = useState<'prices' | 'history'>('prices');
  const utils = trpc.useUtils();

  const sheet = trpc.pricing.customerSheet.useQuery(
    { customerId, q: q || undefined, categoryId: categoryId || undefined, onlySpecial },
    { enabled: !!customerId },
  );
  useEffect(() => { setDrafts({}); setSelected(new Set()); }, [customerId]);

  const save = trpc.pricing.setCustomerPrices.useMutation({
    onSuccess: async () => { setDrafts({}); await Promise.all([utils.pricing.customerSheet.invalidate(), utils.pricing.history.invalidate()]); },
  });
  const rowsById = useMemo(() => new Map((sheet.data?.rows ?? []).map((r) => [r.productId, r])), [sheet.data]);
  const changed = Object.entries(drafts).filter(([id, d]) => {
    const r = rowsById.get(id);
    if (!r) return false;
    const o = draftOf(r);
    return o.rate !== d.rate || o.validFrom !== d.validFrom || o.validTo !== d.validTo;
  });
  const fe = fieldErrors(save.error);

  function setDraft(r: Row, patch: Partial<Draft>) {
    setDrafts((s) => ({ ...s, [r.productId]: { ...(s[r.productId] ?? draftOf(r)), ...patch } }));
  }
  function saveDrafts() {
    save.mutate({
      customerId, source: 'ui',
      rows: changed.map(([productId, d]) => ({ productId, rate: d.rate.trim() === '' ? null : Number(d.rate), validFrom: d.validFrom || null, validTo: d.validTo || null, note: rowsById.get(productId)?.override?.note ?? null })),
    });
  }

  const rows = sheet.data?.rows ?? [];
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.productId));

  return (
    <>
      <PageHeader title="Pricing" description="Each customer pays: their special price → their price list → the default rate. Customers only ever see their own price." />
      <PricingTabs active="customer" />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <SelectField label="Customer" wrapperClassName="w-full sm:w-96" value={customerId} onChange={(e) => router.replace(e.target.value ? `/app/pricing?customer=${e.target.value}` : '/app/pricing')}>
          <option value="">Choose a doctor, hospital or clinic…</option>
          {customers.data?.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.code}){c.priceList ? ` · ${c.priceList.name}` : ''}</option>)}
        </SelectField>
        {sheet.data && (
          <div className="flex flex-wrap items-center gap-2 pb-1 text-sm text-muted">
            Price list: <Badge tone={sheet.data.customer.priceList?.isActive ? 'navy' : 'neutral'}>{sheet.data.customer.priceList ? `${sheet.data.customer.priceList.name}${sheet.data.customer.priceList.isActive ? '' : ' (inactive)'}` : 'None'}</Badge>
            · Prices as on {formatDate(sheet.data.onDate)}
          </div>
        )}
      </div>

      {!customerId ? (
        <Card><p className="px-5 py-12 text-center text-sm text-muted">Choose a customer to see every product at their price.</p></Card>
      ) : (
        <Card className="overflow-hidden">
          <CardHeader
            title={sheet.data?.customer.name ?? 'Loading…'}
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <div role="tablist" className="flex rounded-lg bg-canvas p-0.5">
                  {(['prices', 'history'] as const).map((t) => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cn('h-8 rounded-md px-3 text-sm', tab === t ? 'bg-white font-semibold shadow-sm' : 'text-muted')}>{t === 'prices' ? 'Prices' : 'History'}</button>)}
                </div>
                <ExcelButtons query={`customerId=${customerId}`} canImport={isOwner} applying={save.isPending}
                  onApply={(changes) => save.mutateAsync({ customerId, source: 'excel-import', rows: changes.map((c) => ({ productId: c.productId, rate: c.newRate, validFrom: c.validFrom, validTo: c.validTo, note: c.note })) })} />
              </div>
            }
          />
          {tab === 'history' ? <PriceHistory customerId={customerId} showProduct /> : (
            <>
              <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
                <label className="relative">
                  <span className="sr-only">Search products</span>
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products" className={`${select} w-56 pl-9`} />
                </label>
                <select aria-label="Category" className={select} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                  <option value="">All categories</option>
                  {categories.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" className="accent-teal-700" checked={onlySpecial} onChange={(e) => setOnlySpecial(e.target.checked)} /> Only non-default prices</label>
                {isOwner && (
                  <div className="ml-auto flex items-center gap-2">
                    {selected.size > 0 && <Button size="sm" variant="secondary" onClick={() => setBulkOpen(true)}><SlidersHorizontal className="size-4" aria-hidden /> Bulk edit {selected.size}</Button>}
                    <Button size="sm" disabled={!changed.length} loading={save.isPending} onClick={saveDrafts}>Save {changed.length || ''} change{changed.length === 1 ? '' : 's'}</Button>
                  </div>
                )}
              </div>
              {save.error && <div className="px-5 pt-3"><Alert>{Object.keys(fe).length ? 'Check the highlighted rows (rate above zero, dates in order).' : errorMessage(save.error)}</Alert></div>}
              <Table minWidth={1040}>
                <THead>
                  <tr>
                    {isOwner && <Th className="w-8"><input type="checkbox" aria-label="Select all" className="accent-teal-700" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.productId)))} /></Th>}
                    <Th>Product</Th><Th className="text-right">MRP</Th><Th className="text-right">Default</Th><Th className="text-right">Price list</Th>
                    <Th>Special price (₹)</Th><Th>Valid from → to</Th><Th className="text-right">They pay</Th><Th className="text-right">vs default</Th><Th className="text-right">Margin</Th>
                  </tr>
                </THead>
                <tbody>
                  {sheet.isLoading && <EmptyRow cols={10}>Loading…</EmptyRow>}
                  {rows.length === 0 && !sheet.isLoading && <EmptyRow cols={10}>No products match.</EmptyRow>}
                  {rows.map((r, i) => {
                    const d = drafts[r.productId] ?? draftOf(r);
                    const dirty = changed.some(([id]) => id === r.productId);
                    const idx = changed.findIndex(([id]) => id === r.productId);
                    const rowErr = idx >= 0 ? (fe[`rows.${idx}.rate`] ?? fe[`rows.${idx}.validTo`]) : undefined;
                    const cell = 'h-8 rounded-md border border-line px-2 text-sm disabled:bg-transparent disabled:border-transparent aria-[invalid=true]:border-danger';
                    return (
                      <Tr key={r.productId} className={cn(dirty && 'bg-aqua-50', !r.isActive && 'opacity-60')}>
                        {isOwner && <Td><input type="checkbox" aria-label={`Select ${r.code}`} className="accent-teal-700" checked={selected.has(r.productId)} onChange={() => { const s = new Set(selected); if (s.has(r.productId)) s.delete(r.productId); else s.add(r.productId); setSelected(s); }} /></Td>}
                        <Td className="min-w-[240px]"><div className="font-medium">{r.name}</div><div className="text-xs text-muted">{r.code} · {r.category}</div></Td>
                        <Td className="num text-muted">{rupees(r.mrp)}</Td>
                        <Td className="num">{rupees(r.defaultRate)}</Td>
                        <Td className="num">{r.listRate ? <span title={r.listRate.validFrom || r.listRate.validTo ? `Valid ${r.listRate.validFrom ?? '…'} → ${r.listRate.validTo ?? '…'}` : undefined}>{rupees(r.listRate.rate)}</span> : <span className="text-muted">—</span>}</Td>
                        <Td>
                          <input aria-label={`Special price for ${r.code}`} aria-invalid={!!rowErr} disabled={!isOwner} type="number" step="0.01" min={0} value={d.rate} placeholder="—" onChange={(e) => setDraft(r, { rate: e.target.value })} className={`${cell} w-28 text-right`} data-row={i} />
                          {rowErr && <div className="text-xs text-danger">{rowErr}</div>}
                        </Td>
                        <Td>
                          {isOwner || d.validFrom || d.validTo ? (
                            <div className="flex flex-col gap-1">
                              <input aria-label={`Valid from for ${r.code}`} disabled={!isOwner} type="date" value={d.validFrom} onChange={(e) => setDraft(r, { validFrom: e.target.value })} className={`${cell} h-7 w-36 text-xs`} />
                              <input aria-label={`Valid to for ${r.code}`} disabled={!isOwner} type="date" value={d.validTo} onChange={(e) => setDraft(r, { validTo: e.target.value })} className={`${cell} h-7 w-36 text-xs`} />
                            </div>
                          ) : <span className="text-muted">Always</span>}
                        </Td>
                        <Td className="num"><div className="font-semibold">{rupees(r.effective.rate)}</div><Badge tone={SOURCE[r.effective.source]!.tone}>{SOURCE[r.effective.source]!.label}</Badge></Td>
                        <Td className={cn('num', r.effective.diff > 0 ? 'text-ok' : r.effective.diff < 0 ? 'text-danger' : 'text-muted')}>{r.effective.diff === 0 ? '—' : `${r.effective.diff > 0 ? '−' : '+'}${pct(Math.abs(r.effective.diffPct))}`}</Td>
                        <Td className={cn('num', (r.marginPct ?? 0) < 10 ? 'text-warn' : 'text-muted')}>{pct(r.marginPct)}</Td>
                      </Tr>
                    );
                  })}
                </tbody>
              </Table>
            </>
          )}
        </Card>
      )}
      {bulkOpen && <BulkDialog customerId={customerId} productIds={[...selected]} onClose={() => setBulkOpen(false)} onDone={() => { setSelected(new Set()); setBulkOpen(false); void utils.pricing.customerSheet.invalidate(); void utils.pricing.history.invalidate(); }} />}
    </>
  );
}

function BulkDialog({ customerId, productIds, onClose, onDone }: { customerId: string; productIds: string[]; onClose: () => void; onDone: () => void }) {
  const [mode, setMode] = useState<'PERCENT_OFF_DEFAULT' | 'FIXED' | 'CLEAR'>('PERCENT_OFF_DEFAULT');
  const [value, setValue] = useState('10');
  const [validFrom, setValidFrom] = useState('');
  const [validTo, setValidTo] = useState('');
  const bulk = trpc.pricing.bulkAdjust.useMutation({ onSuccess: onDone });
  const fe = fieldErrors(bulk.error);
  return (
    <Dialog open onClose={onClose} title={`Bulk edit ${productIds.length} product(s)`} size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={bulk.isPending} onClick={() => bulk.mutate({ customerId, productIds, mode, value: mode === 'CLEAR' ? undefined : Number(value), validFrom: validFrom || null, validTo: validTo || null })}>Apply</Button></>}>
      <div className="flex flex-col gap-4">
        <SelectField label="Change" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
          <option value="PERCENT_OFF_DEFAULT">Set special price = default rate minus %</option>
          <option value="FIXED">Set the same special price for all</option>
          <option value="CLEAR">Remove special prices</option>
        </SelectField>
        {mode !== 'CLEAR' && <TextField label={mode === 'FIXED' ? 'Rate (₹)' : 'Discount (%)'} type="number" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} error={fe.value} hint={mode === 'PERCENT_OFF_DEFAULT' ? 'Rounded to the nearest rupee' : undefined} />}
        {mode !== 'CLEAR' && (
          <div className="grid grid-cols-2 gap-3">
            <TextField label="Valid from (optional)" type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
            <TextField label="Valid to (optional)" type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} error={fe.validTo} />
          </div>
        )}
        {bulk.error && !Object.keys(fe).length && <p className="text-sm text-danger">{errorMessage(bulk.error)}</p>}
      </div>
    </Dialog>
  );
}
