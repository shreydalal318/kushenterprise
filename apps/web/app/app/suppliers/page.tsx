import type { Metadata } from 'next';
import { requirePermission } from '@/lib/session';
import { SupplierList } from '@/components/suppliers/supplier-list';

export const metadata: Metadata = { title: 'Suppliers' };

export default async function SuppliersPage() {
  await requirePermission('CREATE_PURCHASE_ORDERS', 'MANAGE_STOCK', 'VIEW_PRICES_MARGINS');
  return <SupplierList />;
}
