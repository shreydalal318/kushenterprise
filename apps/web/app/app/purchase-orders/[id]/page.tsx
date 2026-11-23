import type { Metadata } from 'next';
import { PoDetail } from '@/components/purchasing/po-detail';
import { requirePermission } from '@/lib/session';

export const metadata: Metadata = { title: 'Purchase order' };
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ new?: string }> }) {
  await requirePermission('CREATE_PURCHASE_ORDERS', 'MANAGE_STOCK');
  return <PoDetail id={(await params).id} isNew={(await searchParams).new === '1'} />;
}
