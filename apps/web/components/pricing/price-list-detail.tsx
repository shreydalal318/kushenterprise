'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, Badge, Card, CardBody, CardHeader, PageHeader } from '@/components/ui/card';
import { Checkbox, TextField } from '@/components/ui/field';
import { EmptyRow, Table, Td, Th, THead, Tr } from '@/components/ui/table';
import { cn } from '@/lib/cn';
import { errorMessage } from '@/lib/errors';
import { pct, rupees } from '@/lib/format';
import { trpc } from '@/lib/trpc';
import { useMe } from '@/lib/use-me';
import { ExcelButtons } from './import-dialog';
import { PriceHistory } from './price-history';

type Item = { productId: string; code: string; name: string; rate: string; validFrom: string; validTo: string; defaultRate: number; mrp: number; purchaseCost: number; isNew?: boolean };

export function PriceListDetail({ id }: { id: string }) {
  const utils = trpc.useUtils();
  const { isOwner } = useMe();
  const q = trpc.priceLists.get.useQuery({ id });
  const products = trpc.products.list.useQuery({}, { enabled: isOwner });
  const customers = trpc.pricing.customers.useQuery(undefined, { enabled: isOwner });
  const refresh = () => Promise.all([utils.priceLists.get.invalidate({ id }), utils.priceLists.list.invalidate(), utils.pricing.history.invalidate()]);
  const [items, setItems] = useState<Item[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [meta, setMeta] = useState({ name: '', description: '', isActive: true });
  const [pick, setPick] = useState('');
  const [assignPick, setAssignPick] = useState('');

  useEffect(() => {
    if (!q.data) return;
    setItems(q.data.items.map((i) => ({ ...i, rate: String(i.rate), validFrom: i.validFrom ?? '', validTo: i.validTo ?? '' })));
    setRemoved([]);
    setMeta({ name: q.data.name, description: q.data.description ?? '', isActive: q.data.isActive });
  }, [q.data]);

  const original = useMemo(() => new Map((q.data?.items ?? []).map((i) => [i.productId, i])), [q.data]);
  const dirtyItems = items.filter((i) => {
    const o = original.get(i.productId);
    return !o || String(o.rate) !== i.rate || (o.validFrom ?? '') !== i.validFrom || (o.validTo ?? '') !== i.validTo;
  });
  const updateMeta = trpc.priceLists.update.useMutation({ onSuccess: refresh });
  const setRows = trpc.priceLists.setItems.useMutation({ onSuccess: refresh });
  const assign = trpc.priceLists.assignCustomers.useMutation({ onSuccess: () => { setAssignPick(''); void refresh(); } });

  if (q.error) return <Alert>{errorMessage(q.error)}</Alert>;
  if (!q.data) return <p className="text-sm text-muted">Loading…</p>;
  const l = q.data;
  const available = (products.data ?? []).filter((p) => !items.some((i) => i.productId === p.id));

  return (
    <div className="flex flex-col gap-6">
      <Link href="/app/pricing/lists" className="flex w-fit items-center gap-1 text-sm text-teal-700 hover:underline"><ArrowLeft className="size-4" aria-hidden /> All price lists</Link>
      <PageHeader title={l.name} description={l.description ?? undefined} actions={l.isActive ? <Badge tone="ok">Active</Badge> : <Badge>Inactive</Badge>} />

      {isOwner && (
        <Card>
          <form onSubmit={(e) => { e.preventDefault(); updateMeta.mutate({ id, ...meta }); }}>
            <CardHeader title="Details" />
            <CardBody className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <TextField label="Name" value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.target.value })} />
              <TextField label="Description" value={meta.description} onChange={(e) => setMeta({ ...meta, description: e.target.value })} />
              <Checkbox label="Active" checked={meta.isActive} onChange={(e) => setMeta({ ...meta, isActive: e.target.checked })} />
            </CardBody>
            <div className="flex items-center justify-end gap-3 border-t border-line px-5 py-3">
              {updateMeta.error && <span className="text-sm text-danger">{errorMessage(updateMeta.error)}</span>}
              {updateMeta.isSuccess && <span className="text-sm text-ok">Saved</span>}
              <Button type="submit" variant="secondary" loading={updateMeta.isPending}>Save details</Button>
            </div>
          </form>
        </Card>
      )}

      <Card className="overflow-hidden">
        <CardHeader title={`Rates (${items.length})`} description="Products not on the list use the default rate."
          actions={<div className="flex flex-wrap items-center gap-2">
            <ExcelButtons query={`priceListId=${id}`} canImport={isOwner} applying={setRows.isPending}
              onApply={(changes) => setRows.mutateAsync({ priceListId: id, source: 'excel-import', rows: changes.map((c) => ({ productId: c.productId, rate: c.newRate, validFrom: c.validFrom, validTo: c.validTo })) })} />
            {isOwner && (
              <>
                <select aria-label="Add a product" value={pick} onChange={(e) => setPick(e.target.value)} className="h-9 max-w-56 rounded-lg border border-line bg-white px-2 text-sm">
                  <option value="">Add a product…</option>
                  {available.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
                </select>
                <Button size="sm" variant="secondary" className="h-9" disabled={!pick} onClick={() => { const p = products.data!.find((x) => x.id === pick)!; setItems([...items, { productId: p.id, code: p.code, name: p.name, rate: String(p.defaultRate), validFrom: '', validTo: '', defaultRate: p.defaultRate, mrp: p.mrp, purchaseCost: p.purchaseCost ?? 0, isNew: true }]); setRemoved(removed.filter((r) => r !== p.id)); setPick(''); }}><Plus className="size-4" aria-hidden /> Add</Button>
              </>
            )}
          </div>} />
        <Table minWidth={900}>
          <THead><tr><Th>Product</Th><Th className="text-right">Default</Th><Th className="text-right">MRP</Th><Th>List rate (₹)</Th><Th>Valid from</Th><Th>Valid to</Th><Th className="text-right">vs default</Th><Th className="text-right">Margin</Th>{isOwner && <Th className="w-10" />}</tr></THead>
          <tbody>
            {items.length === 0 && <EmptyRow cols={9}>No products on this list yet.</EmptyRow>}
            {items.map((i, idx) => {
              const rate = Number(i.rate);
              const diffPct = i.defaultRate ? ((i.defaultRate - rate) / i.defaultRate) * 100 : 0;
              const margin = rate ? ((rate - i.purchaseCost) / rate) * 100 : null;
              const dirty = dirtyItems.includes(i);
              const cell = 'h-8 rounded-md border border-line px-2 text-sm disabled:border-transparent disabled:bg-transparent';
              const upd = (patch: Partial<Item>) => setItems(items.map((x, j) => (j === idx ? { ...x, ...patch } : x)));
              return (
                <Tr key={i.productId} className={cn(dirty && 'bg-aqua-50')}>
                  <Td><span className="font-mono text-xs">{i.code}</span> {i.name}</Td>
                  <Td className="num">{rupees(i.defaultRate)}</Td>
                  <Td className="num text-muted">{rupees(i.mrp)}</Td>
                  <Td><input aria-label={`List rate for ${i.code}`} disabled={!isOwner} type="number" step="0.01" value={i.rate} onChange={(e) => upd({ rate: e.target.value })} className={cn(cell, 'w-28 text-right', rate > i.mrp && 'border-danger')} /></Td>
                  <Td><input aria-label={`Valid from for ${i.code}`} disabled={!isOwner} type="date" value={i.validFrom} onChange={(e) => upd({ validFrom: e.target.value })} className={`${cell} w-36`} /></Td>
                  <Td><input aria-label={`Valid to for ${i.code}`} disabled={!isOwner} type="date" value={i.validTo} onChange={(e) => upd({ validTo: e.target.value })} className={`${cell} w-36`} /></Td>
                  <Td className="num">{diffPct ? `${diffPct > 0 ? '−' : '+'}${pct(Math.abs(diffPct))}` : '—'}</Td>
                  <Td className="num text-muted">{pct(margin)}</Td>
                  {isOwner && <Td><button aria-label={`Remove ${i.code}`} className="rounded p-1.5 text-muted hover:bg-danger-50 hover:text-danger" onClick={() => { setItems(items.filter((_, j) => j !== idx)); if (original.has(i.productId)) setRemoved([...removed, i.productId]); }}><Trash2 className="size-4" /></button></Td>}
                </Tr>
              );
            })}
          </tbody>
        </Table>
        {isOwner && (
          <div className="flex items-center justify-end gap-3 border-t border-line px-5 py-3">
            {setRows.error && <span className="text-sm text-danger">{errorMessage(setRows.error)}</span>}
            <Button disabled={!dirtyItems.length && !removed.length} loading={setRows.isPending}
              onClick={() => setRows.mutate({ priceListId: id, source: 'ui', rows: [
                ...dirtyItems.map((i) => ({ productId: i.productId, rate: Number(i.rate), validFrom: i.validFrom || null, validTo: i.validTo || null })),
                ...removed.map((productId) => ({ productId, rate: null, validFrom: null, validTo: null })),
              ] })}>
              Save {dirtyItems.length + removed.length || ''} change{dirtyItems.length + removed.length === 1 ? '' : 's'}
            </Button>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title={`Customers on this list (${l.customers.length})`} actions={isOwner && (
          <div className="flex gap-2">
            <select aria-label="Assign a customer" value={assignPick} onChange={(e) => setAssignPick(e.target.value)} className="h-9 max-w-56 rounded-lg border border-line bg-white px-2 text-sm">
              <option value="">Assign a customer…</option>
              {customers.data?.filter((c) => !l.customers.some((x) => x.id === c.id)).map((c) => <option key={c.id} value={c.id}>{c.name}{c.priceList ? ` (now: ${c.priceList.name})` : ''}</option>)}
            </select>
            <Button size="sm" variant="secondary" className="h-9" disabled={!assignPick} loading={assign.isPending} onClick={() => assign.mutate({ priceListId: id, customerIds: [assignPick] })}>Assign</Button>
          </div>
        )} />
        <CardBody>
          {l.customers.length === 0 ? <p className="text-sm text-muted">No customers use this list yet.</p> : (
            <ul className="flex flex-wrap gap-2">{l.customers.map((c) => <li key={c.id}><Link href={`/app/pricing?customer=${c.id}`} className="inline-block rounded-full border border-line px-3 py-1 text-sm hover:border-teal hover:bg-aqua-50">{c.name}</Link></li>)}</ul>
          )}
        </CardBody>
      </Card>

      <Card className="overflow-hidden"><CardHeader title="Change history" /><PriceHistory priceListId={id} showProduct /></Card>
    </div>
  );
}
