import type { Metadata } from 'next';
import { MyOrder } from '@/components/portal/orders';

export const metadata: Metadata = { title: 'Order' };
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ new?: string }> }) {
  return <MyOrder id={(await params).id} isNew={(await searchParams).new === '1'} />;
}
