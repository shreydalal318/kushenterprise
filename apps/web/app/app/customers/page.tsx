import type { Metadata } from 'next';
import { requirePermission } from '@/lib/session';
import { CustomerList } from '@/components/customers/customer-list';

export const metadata: Metadata = { title: 'Customers' };

export default async function CustomersPage() {
  await requirePermission('MANAGE_CUSTOMERS');
  return <CustomerList />;
}
