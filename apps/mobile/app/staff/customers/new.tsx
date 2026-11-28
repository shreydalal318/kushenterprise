import { router, Stack, useLocalSearchParams } from 'expo-router';
import { NotAllowed, Waiting } from '@/components/admin/bits';
import { CustomerForm, TYPE_LABEL, type CustomerType } from '@/components/admin/customer-form';
import { Alert, Screen } from '@/components/ui';
import { useCan } from '@/lib/auth';
import { trpc } from '@/lib/trpc';

/** A new doctor, hospital or clinic. `?parentId=&type=DOCTOR` adds a doctor under a hospital; `?fromLead=` turns a website enquiry into a customer. */
export default function NewCustomer() {
  const { parentId, type, fromLead } = useLocalSearchParams<{ parentId?: string; type?: string; fromLead?: string }>();
  const can = useCan();
  const allowed = can('MANAGE_CUSTOMERS');
  const lead = trpc.leads.get.useQuery({ id: fromLead ?? '' }, { enabled: !!fromLead && allowed });
  const title = <Stack.Screen options={{ title: 'New customer' }} />;
  if (!allowed) return <Screen>{title}<NotAllowed what="add customers" /></Screen>;
  if (fromLead && !lead.data) return <Screen>{title}<Waiting q={lead} /></Screen>;
  const open = lead.data && lead.data.status !== 'CONVERTED' ? lead.data : null;
  const preset = type && type in TYPE_LABEL ? (type as CustomerType) : undefined;
  return (
    <CustomerForm presetParentId={parentId} presetType={preset} lead={open} onBack={() => router.back()}
      onSaved={({ id }) => router.replace(`/staff/customers/${id}?saved=${fromLead ? 'lead' : 'new'}`)}>
      {title}
      {open && <Alert tone="info">{`From the website enquiry by ${open.name}. Add the state, address and GSTIN, then save.`}</Alert>}
      {lead.data?.status === 'CONVERTED' && <Alert tone="warn">This enquiry is already a customer. Saving adds another customer.</Alert>}
    </CustomerForm>
  );
}
