import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/card';
import { requirePermission } from '@/lib/session';
import { prisma } from '@kush/db';
import { CustomerForm } from '@/components/customers/customer-form';

export const metadata: Metadata = { title: 'New customer' };

export default async function NewCustomerPage({ searchParams }: { searchParams: Promise<{ parentId?: string; type?: string; fromLead?: string }> }) {
  await requirePermission('MANAGE_CUSTOMERS');
  const sp = await searchParams;
  // Converting a website enquiry: prefill from the lead and mark it converted when saved.
  const lead = sp.fromLead ? await prisma.lead.findUnique({ where: { id: sp.fromLead }, select: { id: true, name: true, organisation: true, type: true, mobile: true, email: true, city: true, notes: true, status: true } }) : null;
  return <><PageHeader title="New customer" description={lead ? `From the website enquiry by ${lead.name}. Add the state, address and GSTIN, then save.` : 'Doctor, hospital or clinic. The state decides CGST + SGST or IGST on their invoices.'} /><CustomerForm presetParentId={sp.parentId} presetType={sp.type} lead={lead && lead.status !== 'CONVERTED' ? lead : null} /></>;
}
