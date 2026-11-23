'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, Badge, Card, CardHeader, PageHeader } from '@/components/ui/card';
import { LinkButton } from '@/components/ui/link-button';
import { EmptyRow, Table, Td, Th, THead, Tr } from '@/components/ui/table';
import { errorMessage } from '@/lib/errors';
import { trpc } from '@/lib/trpc';
import { useMe } from '@/lib/use-me';
import { SupplierForm } from './supplier-form';

type Row = { productId: string; code: string; name: string; supplierSku: string; lastPurchaseRate: string };

export function SupplierDetail({ id }: { id: string }) {
  const utils = trpc.useUtils();
  const { can } = useMe();
  const editable = can('CREATE_PURCHASE_ORDERS');
  const q = trpc.suppliers.get.useQuery({ id });
  const products = trpc.products.list.useQuery({ includeInactive: false }, { enabled: editable });
  const active = trpc.suppliers.setActive.useMutation({ onSuccess: () => utils.suppliers.get.invalidate({ id }) });
  const save = trpc.suppliers.setProducts.useMutation({ onSuccess: () => utils.suppliers.get.invalidate({ id }) });
  const [rows, setRows] = useState<Row[]>([]);
  const [pick, setPick] = useState('');
  useEffect(() => {
    if (q.data) setRows(q.data.products.map((p) => ({ productId: p.productId, code: p.product.code, name: p.product.name, supplierSku: p.supplierSku ?? '', lastPurchaseRate: p.lastPurchaseRate == null ? '' : String(p.lastPurchaseRate) })));
  }, [q.data]);
  const available = useMemo(() => (products.data ?? []).filter((p) => !rows.some((r) => r.productId === p.id)), [products.data, rows]);

  if (q.error) return <Alert>{errorMessage(q.error)}</Alert>;
  if (!q.data) return <p className="text-sm text-muted">Loading…</p>;
  const s = q.data;
  const showRates = s.products.every((p) => p.lastPurchaseRate !== undefined);

  return (
    <div className="flex flex-col gap-6">
      <Link href="/app/suppliers" className="flex w-fit items-center gap-1 text-sm text-teal-700 hover:underline"><ArrowLeft className="size-4" aria-hidden /> All suppliers</Link>
      <PageHeader title={s.name} description={<>{s.code}{!s.isActive && <Badge tone="danger" className="ml-2">Inactive</Badge>}</>}
        actions={editable && <div className="flex gap-2">
          {s.isActive && <LinkButton href={`/app/purchase-orders/new?supplier=${id}`}>New purchase order</LinkButton>}
          <LinkButton variant="secondary" href={`/app/purchase-orders?supplier=${id}`}>Purchase orders</LinkButton>
          <Button variant={s.isActive ? 'danger' : 'secondary'} loading={active.isPending} onClick={() => active.mutate({ id, isActive: !s.isActive })}>{s.isActive ? 'Deactivate' : 'Activate'}</Button>
        </div>} />
      <SupplierForm key={s.updatedAt.toString()} supplier={s} editable={editable} />
      <Card className="overflow-hidden">
        <CardHeader title="Products supplied" description="Used to suggest suppliers and last purchase rates on purchase orders." actions={editable && (
          <div className="flex gap-2">
            <select aria-label="Add a product" value={pick} onChange={(e) => setPick(e.target.value)} className="h-9 max-w-64 rounded-lg border border-line bg-white px-2 text-sm">
              <option value="">Add a product…</option>
              {available.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
            </select>
            <Button size="sm" variant="secondary" disabled={!pick} onClick={() => { const p = products.data!.find((x) => x.id === pick)!; setRows([...rows, { productId: p.id, code: p.code, name: p.name, supplierSku: '', lastPurchaseRate: '' }]); setPick(''); }}>Add</Button>
          </div>
        )} />
        <Table minWidth={600}>
          <THead><tr><Th>Product</Th><Th>Supplier&apos;s SKU</Th>{showRates && <Th className="text-right">Last purchase rate (₹)</Th>}{editable && <Th className="w-12" />}</tr></THead>
          <tbody>
            {rows.length === 0 && <EmptyRow cols={4}>No products linked yet.</EmptyRow>}
            {rows.map((r, i) => (
              <Tr key={r.productId}>
                <Td><span className="font-mono text-xs">{r.code}</span> {r.name}</Td>
                <Td><input aria-label={`Supplier SKU for ${r.code}`} disabled={!editable} value={r.supplierSku} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, supplierSku: e.target.value } : x)))} className="h-9 w-40 rounded-md border border-line px-2 text-sm" /></Td>
                {showRates && <Td className="text-right"><input aria-label={`Last purchase rate for ${r.code}`} disabled={!editable} type="number" step="0.01" value={r.lastPurchaseRate} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, lastPurchaseRate: e.target.value } : x)))} className="h-9 w-32 rounded-md border border-line px-2 text-right text-sm" /></Td>}
                {editable && <Td><button aria-label={`Remove ${r.code}`} className="rounded p-1.5 text-muted hover:bg-danger-50 hover:text-danger" onClick={() => setRows(rows.filter((_, j) => j !== i))}><Trash2 className="size-4" /></button></Td>}
              </Tr>
            ))}
          </tbody>
        </Table>
        {editable && (
          <div className="flex items-center justify-end gap-3 border-t border-line px-5 py-3">
            {save.error && <span className="text-sm text-danger">{errorMessage(save.error)}</span>}
            {save.isSuccess && <span className="text-sm text-ok">Saved</span>}
            <Button loading={save.isPending} onClick={() => save.mutate({ supplierId: id, rows: rows.map((r) => ({ productId: r.productId, supplierSku: r.supplierSku, lastPurchaseRate: r.lastPurchaseRate as never })) })}>Save products</Button>
          </div>
        )}
      </Card>
    </div>
  );
}
