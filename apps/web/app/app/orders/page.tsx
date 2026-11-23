import type { Metadata } from 'next';
import { Suspense } from 'react';
import { requirePermission } from '@/lib/session';
import { OrderList } from '@/components/sales/order-list';

export const metadata: Metadata = { title: 'Orders' };
export default async function Page() { await requirePermission('VIEW_ORDERS'); return <Suspense><OrderList /></Suspense>; }
