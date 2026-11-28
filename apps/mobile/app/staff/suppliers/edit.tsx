import { Stack, useLocalSearchParams } from 'expo-router';
import { Loading } from '@/components/ui';
import { FailedScreen } from '@/components/inventory/common';
import { SupplierForm } from '@/components/inventory/supplier-form';
import { trpc } from '@/lib/trpc';

/** Change a supplier's address, GSTIN, contact and payment terms. */
export default function EditSupplier() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = trpc.suppliers.get.useQuery({ id: id! });
  return (
    <>
      <Stack.Screen options={{ title: 'Edit supplier' }} />
      {q.data ? <SupplierForm key={q.data.updatedAt.toString()} supplier={q.data} /> : q.error ? <FailedScreen error={q.error} busy={q.isFetching} onRetry={() => void q.refetch()} /> : <Loading />}
    </>
  );
}
