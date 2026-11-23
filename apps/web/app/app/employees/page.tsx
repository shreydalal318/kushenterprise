import type { Metadata } from 'next';
import { requireOwner } from '@/lib/session';
import { EmployeeList } from './employee-list';

export const metadata: Metadata = { title: 'Employees' };

export default async function EmployeesPage() {
  await requireOwner();
  return <EmployeeList />;
}
