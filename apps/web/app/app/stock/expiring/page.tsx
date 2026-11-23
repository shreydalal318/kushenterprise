import type { Metadata } from 'next';
import { requirePermission } from '@/lib/session';
import { ExpiringReport } from '@/components/stock/reports';

export const metadata: Metadata = { title: 'Expiring stock' };
export default async function Page() { await requirePermission('MANAGE_STOCK'); return <ExpiringReport />; }
