import type { Metadata } from 'next';
import { Card, CardBody, PageHeader } from '@/components/ui/card';

export const metadata: Metadata = { title: 'My account' };

export default function PortalHome() {
  return (
    <>
      <PageHeader title="Welcome" description="Your Kush Enterprise customer account" />
      <Card><CardBody className="py-12 text-center text-sm text-muted">Ordering at your prices, order tracking and invoice downloads arrive here in Phase 6.</CardBody></Card>
    </>
  );
}
