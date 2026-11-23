import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/card';
import { BuilderFromOrder } from '@/components/sales/order-prefill';
import { requirePermission } from '@/lib/session';

export const metadata: Metadata = { title: 'New tax invoice' };

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  await requirePermission('CREATE_TAX_INVOICE');
  const { order } = await searchParams;
  return (
    <>
      <PageHeader title="New tax invoice" description="Choose the customer, then scan each box. Prices are the customer’s own; stock comes from the scanned batch or the earliest expiry." />
      <BuilderFromOrder mode="invoice" orderId={order ?? null} />
    </>
  );
}
