import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckCircle2, Circle } from 'lucide-react';
import { isOwner, PERMISSIONS, type Permission } from '@kush/core';
import { Alert, Badge, Card, CardBody, CardHeader, PageHeader } from '@/components/ui/card';
import { requireStaff, serverApi } from '@/lib/session';

export const metadata: Metadata = { title: 'Dashboard' };

const PHASES = [
  { n: 1, title: 'Foundation', detail: 'Sign-in, roles & permissions, settings, employees, activity log, branding' },
  { n: 2, title: 'Masters', detail: 'Products with lens powers, suppliers, customers, price lists, customer prices' },
  { n: 3, title: 'Inventory + barcodes', detail: 'Stock ledger, labels, USB & camera scanning, GRN' },
  { n: 4, title: 'Sales', detail: 'Orders, proforma, Tally-style tax invoice, scan-to-invoice, payments' },
  { n: 5, title: 'Purchase orders', detail: 'PO PDF, receive against PO' },
  { n: 6, title: 'Customer portal + mobile app', detail: 'Ordering at own prices, tracking, invoices, notifications' },
  { n: 7, title: 'Analytics & reports', detail: 'Owner dashboard, GST reports, Excel exports' },
  { n: 8, title: 'Public website', detail: 'Home, catalogue, enquiry form' },
];
const CURRENT_PHASE = 4;

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const user = await requireStaff();
  const { denied } = await searchParams;
  const settings = await (await serverApi()).settings.get();
  const placeholders = [settings.gstin, settings.pan, settings.addressLine1, settings.bankAccountNo].filter((v) => /^\[.*\]$/.test(v)).length;

  return (
    <>
      <PageHeader title={`Welcome, ${user.name.split(' ')[0]}`} description="Kush Enterprise: inventory, ordering & billing" />
      {denied && <div className="mb-4"><Alert tone="warn">You don&apos;t have access to that page. Ask the owner if you need it.</Alert></div>}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Build progress" description="Screens unlock as each phase ships. Items marked P2–P8 in the menu are on the way." />
          <CardBody>
            <ol className="flex flex-col gap-3">
              {PHASES.map((p) => (
                <li key={p.n} className="flex items-start gap-3">
                  {p.n <= CURRENT_PHASE ? <CheckCircle2 className="mt-0.5 size-5 text-teal" aria-hidden /> : <Circle className="mt-0.5 size-5 text-line" aria-hidden />}
                  <div>
                    <p className="text-sm font-medium">Phase {p.n}: {p.title} {p.n === CURRENT_PHASE && <Badge tone="teal" className="ml-1">New</Badge>}</p>
                    <p className="text-sm text-muted">{p.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          </CardBody>
        </Card>

        <div className="flex flex-col gap-6">
          {isOwner(user) && placeholders > 0 && (
            <Card>
              <CardHeader title="Finish company setup" />
              <CardBody>
                <p className="text-sm text-muted">{placeholders} company detail{placeholders > 1 ? 's are' : ' is'} still a placeholder (GSTIN, PAN, address or bank). Invoices will print these.</p>
                <Link href="/app/settings" className="mt-3 inline-block text-sm font-semibold text-teal-700 hover:underline">Open settings →</Link>
              </CardBody>
            </Card>
          )}
          <Card>
            <CardHeader title="Your access" />
            <CardBody>
              {isOwner(user) ? (
                <p className="text-sm text-muted">You are the owner and can use every screen.</p>
              ) : user.permissions.length ? (
                <ul className="flex flex-wrap gap-1.5">
                  {user.permissions.map((p) => <li key={p}><Badge tone="teal">{PERMISSIONS[p as Permission]?.label ?? p}</Badge></li>)}
                </ul>
              ) : (
                <p className="text-sm text-muted">No permissions yet. Ask the owner to grant access.</p>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
