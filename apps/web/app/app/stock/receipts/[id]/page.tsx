import type { Metadata } from 'next';
import { requireStaff } from '@/lib/session';
import { ReceiptDetail } from '@/components/stock/receipts';

export const metadata: Metadata = { title: 'Goods receipt' };

export default async function ReceiptPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ new?: string }> }) {
  await requireStaff();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  return <ReceiptDetail id={id} isNew={!!sp.new} />;
}
