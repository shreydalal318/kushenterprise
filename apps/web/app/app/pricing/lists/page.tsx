import type { Metadata } from 'next';
import { requirePermission } from '@/lib/session';
import { PriceListsScreen } from '@/components/pricing/price-lists';

export const metadata: Metadata = { title: 'Price lists' };

export default async function PriceListsPage() {
  await requirePermission('VIEW_PRICES_MARGINS');
  return <PriceListsScreen />;
}
