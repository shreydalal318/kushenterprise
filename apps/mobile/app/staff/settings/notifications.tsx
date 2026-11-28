import { useState } from 'react';
import { Check, Note } from '@/components/admin/bits';
import { SaveBar, useForm, WithSettings, type Settings } from '@/components/admin/settings-bits';
import { Alert, Card, H2, Screen } from '@/components/ui';
import { trpc } from '@/lib/trpc';
import { Done } from '@/components/done';

const CHANNELS = [
  ['inApp', 'In the app and website', 'The bell inbox on the website and in the apps'],
  ['push', 'Phone notifications', 'Pop-ups on phones with the app'],
  ['sms', 'SMS', 'Needs a DLT-registered SMS provider'],
  ['whatsapp', 'WhatsApp', 'Needs the WhatsApp Cloud API set up on the server'],
  ['email', 'Email', 'Needs an email (SMTP) server set up'],
] as const;

export default function NotificationSettings() {
  return <WithSettings title="Notifications">{(s) => <NotificationsForm s={s} />}</WithSettings>;
}

/** Which ways we send messages, and for which events (website: Settings → Notifications). */
function NotificationsForm({ s }: { s: Settings }) {
  const utils = trpc.useUtils();
  const [flash, setFlash] = useState<string | null>(null);
  const f = useForm(s.notificationConfig);
  const save = trpc.settings.updateNotifications.useMutation({ onSuccess: (d) => { utils.settings.get.setData(undefined, d); f.saved(); setFlash('Notification settings saved ✓'); } });
  const v = f.v;
  const set = <K extends keyof typeof v>(k: K, x: (typeof v)[K]) => { setFlash(null); f.set(k, x); };
  return (
    <Screen footer={<SaveBar error={save.error} saving={save.isPending} dirty={f.dirty} onSave={() => save.mutate(v)} />}>
      <Done message={flash} onShown={() => setFlash(null)} />
      <Note>In-app and phone notifications work now. SMS, WhatsApp and email start once their accounts are set up on the server.</Note>
      <Card style={{ gap: 0 }}>
        <H2>Ways to send</H2>
        {CHANNELS.map(([k, label, hint]) => <Check key={k} label={label} hint={hint} value={v.channels[k]} onChange={(x) => set('channels', { ...v.channels, [k]: x })} />)}
      </Card>
      <Card style={{ gap: 0 }}>
        <H2>When to send</H2>
        <Check label="Tell customers when their order moves on" value={v.orderStatusToCustomer} onChange={(x) => set('orderStatusToCustomer', x)} />
        <Check label="Tell the owner about low stock" value={v.lowStockToOwner} onChange={(x) => set('lowStockToOwner', x)} />
        <Check label="Tell the owner about stock that will expire" value={v.expiryToOwner} onChange={(x) => set('expiryToOwner', x)} />
      </Card>
      <Note>Passwords and keys for SMS, WhatsApp and email are kept on the server, never here.</Note>
    </Screen>
  );
}
