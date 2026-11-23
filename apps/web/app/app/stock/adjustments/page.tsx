import type { Metadata } from 'next';
import { requirePermission } from '@/lib/session';
import { AdjustmentsList } from '@/components/stock/reports';

export const metadata: Metadata = { title: 'Stock adjustments' };
export default async function Page() { await requirePermission('MANAGE_STOCK'); return <AdjustmentsList />; }
