import type { Metadata } from 'next';
import Link from 'next/link';
import { isOwner, PERMISSIONS, type Permission } from '@kush/core';
import { Alert, Badge, Card, CardBody, CardHeader, PageHeader } from '@/components/ui/card';
import { Dashboard } from '@/components/analytics/dashboard';
import { requireStaff, serverApi } from '@/lib/session';

export const metadata: Metadata = { title: 'Dashboard' };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const user = await requireStaff();
  const { denied } = await searchParams;
  const settings = await (await serverApi()).settings.get();
  const placeholders = [settings.gstin, settings.pan, settings.addressLine1, settings.bankAccountNo].filter((v) => /^\[.*\]$/.test(v)).length;

  return (
    <>
      <PageHeader title={`Welcome, ${user.name.split(' ')[0]}`} description="Kush Enterprise: inventory, ordering & billing" />
      {denied && <div className="mb-4"><Alert tone="warn">You don&apos;t have access to that page. Ask the owner if you need it.</Alert></div>}

      {isOwner(user) && placeholders > 0 && (
        <div className="mb-5"><Alert tone="info">{placeholders} company detail{placeholders > 1 ? 's are' : ' is'} still a placeholder (GSTIN, PAN, address or bank) and will print on invoices. <Link href="/app/settings" className="font-semibold underline">Open settings</Link></Alert></div>
      )}
      <Dashboard />
      {!isOwner(user) && (
        <Card className="mt-8">
          <CardHeader title="Your access" />
          <CardBody>
            {user.permissions.length ? (
              <ul className="flex flex-wrap gap-1.5">{user.permissions.map((p) => <li key={p}><Badge tone="teal">{PERMISSIONS[p as Permission]?.label ?? p}</Badge></li>)}</ul>
            ) : <p className="text-sm text-muted">No permissions yet. Ask the owner to grant access.</p>}
          </CardBody>
        </Card>
      )}
    </>
  );
}
