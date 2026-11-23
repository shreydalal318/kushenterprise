import type { Metadata } from 'next';
import { Suspense } from 'react';
import { requirePermission } from '@/lib/session';
import { PricingWorkbench } from '@/components/pricing/workbench';

export const metadata: Metadata = { title: 'Pricing' };

export default async function PricingPage() {
  await requirePermission('VIEW_PRICES_MARGINS');
  return <Suspense><PricingWorkbench /></Suspense>;
}
