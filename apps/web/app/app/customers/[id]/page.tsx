import type { Metadata } from 'next';
import { requirePermission } from '@/lib/session';
import { CustomerDetail } from '@/components/customers/customer-detail';

export const metadata: Metadata = { title: 'Customer' };

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('MANAGE_CUSTOMERS');
  return <CustomerDetail id={(await params).id} />;
}
