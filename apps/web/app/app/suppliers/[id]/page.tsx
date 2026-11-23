import type { Metadata } from 'next';
import { requirePermission } from '@/lib/session';
import { SupplierDetail } from '@/components/suppliers/supplier-detail';

export const metadata: Metadata = { title: 'Supplier' };

export default async function SupplierPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('CREATE_PURCHASE_ORDERS', 'MANAGE_STOCK', 'VIEW_PRICES_MARGINS');
  return <SupplierDetail id={(await params).id} />;
}
