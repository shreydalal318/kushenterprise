import type { Metadata } from 'next';
import { Suspense } from 'react';
import { requirePermission } from '@/lib/session';
import { PaymentsScreen } from '@/components/sales/payments';

export const metadata: Metadata = { title: 'Payments' };
export default async function Page() { await requirePermission('RECORD_PAYMENTS'); return <Suspense><PaymentsScreen /></Suspense>; }
