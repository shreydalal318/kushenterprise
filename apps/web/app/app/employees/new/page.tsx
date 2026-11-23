import type { Metadata } from 'next';
import { requireOwner } from '@/lib/session';
import { NewEmployeeForm } from './new-employee-form';

export const metadata: Metadata = { title: 'Add employee' };

export default async function NewEmployeePage() {
  await requireOwner();
  return <NewEmployeeForm />;
}
