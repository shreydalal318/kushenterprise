import type { Metadata } from 'next';
import { requireStaff } from '@/lib/session';
import { StockOverview } from '@/components/stock/stock-overview';

export const metadata: Metadata = { title: 'Stock' };

export default async function StockPage() {
  await requireStaff();
  return <StockOverview />;
}
