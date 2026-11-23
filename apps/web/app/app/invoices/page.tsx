import type { Metadata } from 'next';
import { requirePermission } from '@/lib/session';
import { InvoiceList } from '@/components/sales/invoice-list';

export const metadata: Metadata = { title: 'Tax invoices' };

export default async function InvoicesPage() {
  await requirePermission('CREATE_TAX_INVOICE', 'VIEW_ORDERS', 'RECORD_PAYMENTS');
  return <InvoiceList />;
}
