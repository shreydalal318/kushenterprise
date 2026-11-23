import type { Metadata } from 'next';
import { requirePermission } from '@/lib/session';
import { StockLedger } from '@/components/stock/stock-ledger';

export const metadata: Metadata = { title: 'Stock ledger' };

export default async function LedgerPage({ params }: { params: Promise<{ variantId: string }> }) {
  await requirePermission('MANAGE_STOCK');
  return <StockLedger variantId={(await params).variantId} />;
}
