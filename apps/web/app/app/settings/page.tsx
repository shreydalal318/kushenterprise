import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PageHeader } from '@/components/ui/card';
import { requireOwner } from '@/lib/session';
import { SettingsScreen } from '@/components/settings/settings-screen';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage() {
  await requireOwner();
  return (
    <>
      <PageHeader title="Settings" description="Company profile, document numbering and defaults used across invoices, POs and the apps." />
      <Suspense><SettingsScreen /></Suspense>
    </>
  );
}
