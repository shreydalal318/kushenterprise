import type { Metadata } from 'next';
import { Suspense } from 'react';
import { requirePermission } from '@/lib/session';
import { ReceiveForm } from '@/components/stock/receive-form';

export const metadata: Metadata = { title: 'Receive goods' };

export default async function ReceivePage() {
  await requirePermission('MANAGE_STOCK');
  return <Suspense><ReceiveForm /></Suspense>;
}
