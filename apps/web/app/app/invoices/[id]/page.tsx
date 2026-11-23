import type { Metadata } from 'next';
import { requirePermission } from '@/lib/session';
import { InvoiceDetail } from '@/components/sales/invoice-detail';

export const metadata: Metadata = { title: 'Tax invoice' };

export default async function InvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ new?: string }> }) {
  await requirePermission('CREATE_TAX_INVOICE', 'VIEW_ORDERS', 'RECORD_PAYMENTS');
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  return <InvoiceDetail id={id} isNew={!!sp.new} />;
}
