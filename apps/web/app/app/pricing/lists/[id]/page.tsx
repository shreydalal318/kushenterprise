import type { Metadata } from 'next';
import { requirePermission } from '@/lib/session';
import { PriceListDetail } from '@/components/pricing/price-list-detail';

export const metadata: Metadata = { title: 'Price list' };

export default async function PriceListPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('VIEW_PRICES_MARGINS');
  return <PriceListDetail id={(await params).id} />;
}
