import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/card';
import { requirePermission } from '@/lib/session';
import { SupplierForm } from '@/components/suppliers/supplier-form';

export const metadata: Metadata = { title: 'New supplier' };

export default async function NewSupplierPage() {
  await requirePermission('CREATE_PURCHASE_ORDERS');
  return <><PageHeader title="New supplier" /><SupplierForm /></>;
}
