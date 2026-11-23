import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/card';
import { DocBuilder } from '@/components/sales/doc-builder';
import { requirePermission } from '@/lib/session';

export const metadata: Metadata = { title: 'New order' };
export default async function Page() {
  await requirePermission('CREATE_ORDERS');
  return <><PageHeader title="New order" description="For phone or WhatsApp orders. Rates are locked at the customer’s current price." /><DocBuilder mode="order" /></>;
}
