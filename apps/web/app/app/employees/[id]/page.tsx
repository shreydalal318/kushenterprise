import type { Metadata } from 'next';
import { requireOwner } from '@/lib/session';
import { EmployeeDetail } from './employee-detail';

export const metadata: Metadata = { title: 'Employee' };

export default async function EmployeePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  await requireOwner();
  const [{ id }, { created }] = await Promise.all([params, searchParams]);
  return <EmployeeDetail id={id} created={!!created} />;
}
