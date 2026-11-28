import { Stack, useLocalSearchParams } from 'expo-router';
import { PoEditor } from '@/components/inventory/po-editor';

/** Change a draft purchase order (web: Edit purchase order). A PO can't change once it is marked as sent. */
export default function EditPurchaseOrder() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <><Stack.Screen options={{ title: 'Edit purchase order' }} /><PoEditor poId={id} /></>;
}
