import type { Metadata } from 'next';
import { requirePermission } from '@/lib/session';
import { ProformaList } from '@/components/sales/proforma';

export const metadata: Metadata = { title: 'Proforma invoices' };
export default async function Page() { await requirePermission('CREATE_PROFORMA', 'VIEW_ORDERS'); return <ProformaList />; }
