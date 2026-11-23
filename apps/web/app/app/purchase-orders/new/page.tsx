import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PageHeader } from '@/components/ui/card';
import { PoEditor } from '@/components/purchasing/po-editor';
import { requirePermission } from '@/lib/session';

export const metadata: Metadata = { title: 'New purchase order' };
export default async function Page() {
  await requirePermission('CREATE_PURCHASE_ORDERS');
  return (
    <>
      <PageHeader title="New purchase order" description="Choose the supplier, then add items (or pick from those below reorder level). Rates start at the last price paid to this supplier." />
      <Suspense><PoEditor /></Suspense>
    </>
  );
}
