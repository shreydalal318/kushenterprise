import type { Metadata } from 'next';
import { requirePermission } from '@/lib/session';
import { SupplierReturns } from '@/components/stock/supplier-returns';

export const metadata: Metadata = { title: 'Returns to supplier' };
export default async function Page() { await requirePermission('MANAGE_STOCK'); return <SupplierReturns />; }
