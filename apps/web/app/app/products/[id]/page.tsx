import type { Metadata } from 'next';
import { requireStaff } from '@/lib/session';
import { ProductDetail } from '@/components/products/product-detail';

export const metadata: Metadata = { title: 'Product' };

export default async function ProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  await requireStaff();
  const [{ id }, { created }] = await Promise.all([params, searchParams]);
  return <ProductDetail id={id} created={created} />;
}
