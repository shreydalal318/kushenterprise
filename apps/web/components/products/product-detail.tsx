'use client';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { LENS_TYPE_LABELS } from '@kush/core';
import { Button } from '@/components/ui/button';
import { Alert, Badge, Card, CardBody, CardHeader, PageHeader } from '@/components/ui/card';
import { errorMessage } from '@/lib/errors';
import { rupees } from '@/lib/format';
import { trpc } from '@/lib/trpc';
import { useMe } from '@/lib/use-me';
import { PriceHistory } from '@/components/pricing/price-history';
import { ProductForm } from './product-form';
import { VariantsCard } from './variants-card';

export function ProductDetail({ id, created }: { id: string; created?: string }) {
  const utils = trpc.useUtils();
  const { can } = useMe();
  const q = trpc.products.get.useQuery({ id });
  const active = trpc.products.setActive.useMutation({ onSuccess: () => Promise.all([utils.products.get.invalidate({ id }), utils.products.list.invalidate()]) });
  if (q.error) return <Alert>{errorMessage(q.error)}</Alert>;
  if (!q.data) return <p className="text-sm text-muted">Loading…</p>;
  const p = q.data;
  const editable = can('MANAGE_PRODUCTS');

  return (
    <div className="flex flex-col gap-6">
      <Link href="/app/products" className="flex w-fit items-center gap-1 text-sm text-teal-700 hover:underline"><ArrowLeft className="size-4" aria-hidden /> All products</Link>
      <PageHeader
        title={p.name}
        description={<span className="flex flex-wrap items-center gap-2"><span className="font-mono">{p.code}</span>·<span>{p.category.name}</span>{p.brand && <>·<span>{p.brand.name}</span></>}{p.lensType && <Badge tone="teal">{LENS_TYPE_LABELS[p.lensType]}</Badge>}{!p.isActive && <Badge tone="danger">Inactive</Badge>}</span>}
        actions={editable && <Button variant={p.isActive ? 'danger' : 'secondary'} loading={active.isPending} onClick={() => active.mutate({ id, isActive: !p.isActive })}>{p.isActive ? 'Deactivate' : 'Activate'}</Button>}
      />
      {created !== undefined && <Alert tone="ok">Product created{Number(created) > 0 ? ` with ${created} power variants` : ''}.</Alert>}
      <VariantsCard product={p} editable={editable} />
      <ProductForm key={p.updatedAt.toString()} product={p} />
      {p.supplierLinks.length > 0 && (
        <Card>
          <CardHeader title="Supplied by" />
          <CardBody>
            <ul className="divide-y divide-line">
              {p.supplierLinks.map((l) => (
                <li key={l.supplier.id} className="flex justify-between py-2 text-sm">
                  <Link href={`/app/suppliers/${l.supplier.id}`} className="text-teal-700 hover:underline">{l.supplier.name}</Link>
                  <span className="text-muted">{l.supplierSku ?? ''}{l.lastPurchaseRate !== undefined ? ` · last rate ${rupees(l.lastPurchaseRate)}` : ''}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
      {can('VIEW_PRICES_MARGINS') && (
        <Card className="overflow-hidden">
          <CardHeader title="Price history" description="Every change to the default rate, MRP, cost, price lists and special prices." />
          <PriceHistory productId={p.id} />
        </Card>
      )}
    </div>
  );
}
