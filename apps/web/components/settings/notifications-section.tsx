'use client';
import { Alert } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/field';
import { trpc } from '@/lib/trpc';
import { SectionForm, useFormState } from './section-form';
import type { Settings } from './types';

const CHANNELS = [
  ['inApp', 'In-app', 'Inbox in the web portal and mobile app'],
  ['push', 'Push', 'Mobile app notifications'],
  ['sms', 'SMS', 'Needs a DLT-registered SMS provider'],
  ['whatsapp', 'WhatsApp', 'Needs a WhatsApp Business API account'],
  ['email', 'Email', 'Needs an email sending service'],
] as const;

export function NotificationsSection({ s }: { s: Settings }) {
  const utils = trpc.useUtils();
  const f = useFormState(s.notificationConfig);
  const save = trpc.settings.updateNotifications.useMutation({ onSuccess: (d) => { utils.settings.get.setData(undefined, d); f.setDirty(false); } });
  const v = f.values!;
  return (
    <SectionForm title="Notifications" description="Which channels are used and for which events. Messages start sending in Phase 6."
      onSubmit={() => save.mutate(v)} saving={save.isPending} saved={save.isSuccess} dirty={f.dirty} error={save.error}>
      <fieldset>
        <legend className="mb-1 text-sm font-medium">Channels</legend>
        <div className="grid gap-1 sm:grid-cols-2">
          {CHANNELS.map(([k, label, desc]) => (
            <Checkbox key={k} label={label} description={desc} checked={v.channels[k]} onChange={(e) => f.set('channels', { ...v.channels, [k]: e.target.checked })} />
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-1 text-sm font-medium">Events</legend>
        <Checkbox label="Tell customers when their order status changes" checked={v.orderStatusToCustomer} onChange={(e) => f.set('orderStatusToCustomer', e.target.checked)} />
        <Checkbox label="Alert the owner about low stock" checked={v.lowStockToOwner} onChange={(e) => f.set('lowStockToOwner', e.target.checked)} />
        <Checkbox label="Alert the owner about expiring stock" checked={v.expiryToOwner} onChange={(e) => f.set('expiryToOwner', e.target.checked)} />
      </fieldset>
      <Alert tone="info">API keys for SMS, WhatsApp and email are kept in the server&apos;s secret store, never in this database, so they can&apos;t leak through a backup or export.</Alert>
    </SectionForm>
  );
}
