import { router } from 'expo-router';
import { Action, type Icon, Note } from '@/components/admin/bits';
import { OwnerOnly } from '@/components/admin/settings-bits';
import { Card, Screen } from '@/components/ui';

/** The same sections as the website's Settings, in the same order. */
const SECTIONS: { to: string; title: string; icon: Icon }[] = [
  { to: 'company', title: 'Company details', icon: 'business-outline' },
  { to: 'bank', title: 'Bank, UPI and signature', icon: 'card-outline' },
  { to: 'numbering', title: 'Document numbers', icon: 'list-outline' },
  { to: 'documents', title: 'Terms and declaration', icon: 'document-text-outline' },
  { to: 'masters', title: 'GST rates and units', icon: 'calculator-outline' },
  { to: 'categories', title: 'Product categories', icon: 'folder-outline' },
  { to: 'inventory', title: 'Stock alerts', icon: 'layers-outline' },
  { to: 'notifications', title: 'Notifications', icon: 'notifications-outline' },
  { to: 'integrations', title: 'Tally and e-filing', icon: 'swap-horizontal-outline' },
];

/** Settings (owner only): company profile, numbering and the defaults used on invoices, POs and the apps. */
export default function SettingsHome() {
  return (
    <OwnerOnly title="Settings">
      <Screen>
        <Note>Company details, document numbers and the defaults used on invoices, purchase orders and the apps.</Note>
        <Card style={{ paddingVertical: 4, gap: 0 }}>
          {SECTIONS.map((s) => <Action key={s.to} icon={s.icon} title={s.title} onPress={() => router.push(`/staff/settings/${s.to}` as never)} />)}
        </Card>
        <Note>To upload or change the signature / stamp image, use the website.</Note>
      </Screen>
    </OwnerOnly>
  );
}
