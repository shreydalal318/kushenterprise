import type { Metadata } from 'next';
import { requirePermission } from '@/lib/session';
import { ProformaDetail } from '@/components/sales/proforma';

export const metadata: Metadata = { title: 'Proforma' };
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ new?: string }> }) {
  await requirePermission('CREATE_PROFORMA', 'VIEW_ORDERS');
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  return <ProformaDetail id={id} isNew={!!sp.new} />;
}
