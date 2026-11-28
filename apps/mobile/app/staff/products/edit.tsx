import { Stack, useLocalSearchParams } from 'expo-router';
import { Loading } from '@/components/ui';
import { FailedScreen } from '@/components/inventory/common';
import { ProductForm } from '@/components/inventory/product-form';
import { trpc } from '@/lib/trpc';

/** Change a product's details, prices, lens data and tracking (web: product page form). */
export default function EditProduct() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = trpc.products.get.useQuery({ id: id! });
  return (
    <>
      <Stack.Screen options={{ title: 'Edit product' }} />
      {q.data ? <ProductForm key={q.data.updatedAt.toString()} product={q.data} /> : q.error ? <FailedScreen error={q.error} busy={q.isFetching} onRetry={() => void q.refetch()} /> : <Loading />}
    </>
  );
}
