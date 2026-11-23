import type { Metadata } from 'next';
import { requireStaff } from '@/lib/session';
import { ProductStock } from '@/components/stock/product-stock';

export const metadata: Metadata = { title: 'Product stock' };

export default async function ProductStockPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  return <ProductStock id={(await params).id} />;
}
