import { router, useLocalSearchParams } from 'expo-router';
import { BillForm } from '@/components/bill-form';

/** Tax invoice for one order, pushed over the order screen so back (and "Dispatch this order") returns to it. */
export default function OrderInvoice() {
  const { orderId } = useLocalSearchParams<{ orderId?: string }>();
  return <BillForm orderId={orderId} onDone={() => (router.canGoBack() ? router.back() : router.replace(`/staff/order/${orderId}`))} />;
}
