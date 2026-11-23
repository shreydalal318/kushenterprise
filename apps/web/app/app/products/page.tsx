import type { Metadata } from 'next';
import { requireStaff } from '@/lib/session';
import { ProductList } from '@/components/products/product-list';

export const metadata: Metadata = { title: 'Products' };

export default async function ProductsPage() {
  await requireStaff();
  return <ProductList />;
}
