import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/card';
import { requirePermission } from '@/lib/session';
import { CustomerForm } from '@/components/customers/customer-form';

export const metadata: Metadata = { title: 'New customer' };

export default async function NewCustomerPage({ searchParams }: { searchParams: Promise<{ parentId?: string; type?: string }> }) {
  await requirePermission('MANAGE_CUSTOMERS');
  const sp = await searchParams;
  return <><PageHeader title="New customer" description="Doctor, hospital or clinic. The state decides CGST + SGST or IGST on their invoices." /><CustomerForm presetParentId={sp.parentId} presetType={sp.type} /></>;
}
