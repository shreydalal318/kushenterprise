import { Stack, useLocalSearchParams } from 'expo-router';
import { PoEditor } from '@/components/inventory/po-editor';

/** New purchase order (web: Purchase orders → New). ?supplier=… picks the supplier, ?suggest=1 opens the reorder list. */
export default function NewPurchaseOrder() {
  const { supplier, suggest } = useLocalSearchParams<{ supplier?: string; suggest?: string }>();
  return <><Stack.Screen options={{ title: 'New purchase order' }} /><PoEditor supplier={supplier} suggest={suggest === '1'} /></>;
}
