import { router, Stack } from 'expo-router';
import { Card, H2, Screen } from '@/components/ui';
import { NoAccess, Note } from '@/components/inventory/common';
import { VariantSearch } from '@/components/inventory/variant-search';
import { useCan } from '@/lib/auth';

/** Find the power or size whose stock history you want to see. */
export default function History() {
  const can = useCan();
  if (!can('MANAGE_STOCK')) return <NoAccess title="Stock history">Stock history needs the “Manage stock” permission. Ask the owner.</NoAccess>;
  return (
    <Screen>
      <Stack.Screen options={{ title: 'Stock history' }} />
      <Card>
        <H2>Which item?</H2>
        <Note>Type part of the name and the power, then tap the item to see every time it came in or went out.</Note>
        <VariantSearch action="History" onPick={(v) => router.push(`/staff/stock-reports/ledger/${v.variantId}`)} />
      </Card>
    </Screen>
  );
}
