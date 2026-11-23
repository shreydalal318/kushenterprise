import type { Metadata } from 'next';
import { requirePermission } from '@/lib/session';
import { CustomerLedger } from '@/components/sales/ledger';

export const metadata: Metadata = { title: 'Customer ledger' };
export default async function Page({ params }: { params: Promise<{ customerId: string }> }) {
  await requirePermission('RECORD_PAYMENTS', 'MANAGE_CUSTOMERS');
  return <CustomerLedger customerId={(await params).customerId} />;
}
