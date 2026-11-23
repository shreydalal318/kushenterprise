import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/card';
import { ProductForm } from '@/components/products/product-form';
import { requirePermission } from '@/lib/session';

export const metadata: Metadata = { title: 'New product' };

export default async function NewProductPage() {
  await requirePermission('MANAGE_PRODUCTS');
  return (
    <>
      <PageHeader title="New product" description="For a lens model, choose an IOL / Lens category and generate its powers in one go." />
      <ProductForm />
    </>
  );
}
