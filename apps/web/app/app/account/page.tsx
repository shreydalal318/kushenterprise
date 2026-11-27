import type { Metadata } from 'next';
import { Card, CardBody, CardHeader, PageHeader } from '@/components/ui/card';
import { ChangePasswordForm } from '@/components/app/change-password-form';
import { SignOutButton } from '@/components/app/sign-out-button';
import { requireStaff } from '@/lib/session';
import { SessionsList } from './sessions-list';

export const metadata: Metadata = { title: 'My account' };

export default async function AccountPage() {
  const user = await requireStaff();
  return (
    <>
      <PageHeader title="My account" description={[user.email, user.mobile].filter(Boolean).join(' · ')}
        actions={<SignOutButton className="h-10 rounded-lg border border-line bg-white px-4 font-semibold text-ink hover:bg-aqua-50" />} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card><CardHeader title="Change password" /><CardBody><ChangePasswordForm /></CardBody></Card>
        <Card><CardHeader title="Signed-in devices" description="Sign out of any device you don’t recognise." /><CardBody><SessionsList /></CardBody></Card>
      </div>
    </>
  );
}
