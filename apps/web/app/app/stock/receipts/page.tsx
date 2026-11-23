import type { Metadata } from 'next';
import { requireStaff } from '@/lib/session';
import { ReceiptList } from '@/components/stock/receipts';

export const metadata: Metadata = { title: 'Goods receipts' };

export default async function ReceiptsPage() {
  await requireStaff();
  return <ReceiptList />;
}
