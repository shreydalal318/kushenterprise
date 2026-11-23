import type { Metadata } from 'next';
import { requireStaff } from '@/lib/session';
import { ScanLookup } from '@/components/scan/scan-lookup';

export const metadata: Metadata = { title: 'Scan' };

export default async function ScanPage() {
  await requireStaff();
  return <ScanLookup />;
}
