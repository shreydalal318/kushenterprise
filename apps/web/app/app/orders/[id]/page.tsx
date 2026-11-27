import type { Metadata } from 'next';
import { requirePermission } from '@/lib/session';
import { OrderDetail } from '@/components/sales/order-detail';

export const metadata: Metadata = { title: 'Order' };
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ new?: string; dispatch?: string }> }) {
  await requirePermission('VIEW_ORDERS');
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  return <OrderDetail id={id} isNew={!!sp.new} openDispatch={sp.dispatch === '1'} />;
}
