import type { Metadata } from 'next';
import { requireOwner } from '@/lib/session';
import { ValuationReport } from '@/components/stock/reports';

export const metadata: Metadata = { title: 'Stock valuation' };
export default async function Page() { await requireOwner(); return <ValuationReport />; }
