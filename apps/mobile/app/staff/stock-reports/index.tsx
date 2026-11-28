import { router, Stack } from 'expo-router';
import { Screen } from '@/components/ui';
import { NavRow, Note, SectionTitle } from '@/components/inventory/common';
import { useAuth, useCan } from '@/lib/auth';
import { trpc } from '@/lib/trpc';

/** The website's stock pages in one list (apps/web/components/stock/stock-tabs.tsx), with the same permissions. */
export default function StockReports() {
  const { me } = useAuth();
  const can = useCan();
  const store = can('MANAGE_STOCK');
  const owner = me?.role === 'OWNER';
  // Counts so the list says where to look first.
  const low = trpc.inventory.lowStock.useQuery({ includeNeverStocked: false }, { enabled: store });
  const expiring = trpc.inventory.expiring.useQuery(undefined, { enabled: store });
  const expired = expiring.data?.rows.filter((r) => r.bucket === 'Expired').length ?? 0;
  return (
    <Screen>
      <Stack.Screen options={{ title: 'Stock reports' }} />
      <NavRow icon="layers-outline" label="Stock now" hint="Every product and power in stock (the Stock tab)" onPress={() => router.push('/staff/stock')} />
      {store && (
        <>
          <SectionTitle>Needs attention</SectionTitle>
          <NavRow icon="trending-down-outline" label="Low stock" hint="At or below the reorder level: time to order" count={low.data?.length} tone="warn" onPress={() => router.push('/staff/stock-reports/low')} />
          <NavRow icon="hourglass-outline" label="Expiring soon" hint={expired ? `${expired} batch${expired === 1 ? ' has' : 'es have'} already expired` : 'Batches that expire in the next few months'} count={expiring.data?.rows.length} tone={expired ? 'danger' : 'warn'} onPress={() => router.push('/staff/stock-reports/expiring')} />
        </>
      )}
      <SectionTitle>Stock in and out</SectionTitle>
      {store && <NavRow icon="download-outline" label="Receive goods" hint="Add stock that came from a supplier" onPress={() => router.push('/staff/receive')} />}
      <NavRow icon="document-text-outline" label="Goods received" hint="Every receipt: what came in, from whom, when" onPress={() => router.push('/staff/stock-reports/receipts')} />
      {store && <NavRow icon="create-outline" label="Adjustments" hint="Damaged, lost, samples, count corrections" onPress={() => router.push('/staff/stock-reports/adjustments')} />}
      {store && <NavRow icon="return-up-back-outline" label="Returns to supplier" hint="Goods sent back, with a debit note" onPress={() => router.push('/staff/stock-reports/returns')} />}
      {store && <NavRow icon="time-outline" label="Stock history" hint="Every movement of one power or size" onPress={() => router.push('/staff/stock-reports/history')} />}
      {owner && (
        <>
          <SectionTitle>Money</SectionTitle>
          <NavRow icon="cash-outline" label="Stock value" hint="What the stock is worth at cost (owner only)" onPress={() => router.push('/staff/stock-reports/value')} />
        </>
      )}
      {!store && <Note>Low stock, expiring stock, adjustments and returns need the “Manage stock” permission. Ask the owner if you need them.</Note>}
    </Screen>
  );
}
