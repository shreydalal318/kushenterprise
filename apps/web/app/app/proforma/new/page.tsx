import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/card';
import { BuilderFromOrder } from '@/components/sales/order-prefill';
import { requirePermission } from '@/lib/session';

export const metadata: Metadata = { title: 'New proforma' };
export default async function Page({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  await requirePermission('CREATE_PROFORMA');
  const { order } = await searchParams;
  return <><PageHeader title="New proforma invoice" description="A quotation / advance-payment invoice at the customer’s prices. No stock is taken." /><BuilderFromOrder mode="proforma" orderId={order ?? null} /></>;
}
