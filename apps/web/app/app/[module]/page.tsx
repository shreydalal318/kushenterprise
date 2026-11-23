import { notFound } from 'next/navigation';
import { Hammer } from 'lucide-react';
import { Card, CardBody, PageHeader } from '@/components/ui/card';
import { allowed, NAV } from '@/lib/nav';
import { requireStaff } from '@/lib/session';

/** Placeholder for modules that ship in later phases; respects the same permission rules. */
export default async function UpcomingModule({ params }: { params: Promise<{ module: string }> }) {
  const user = await requireStaff();
  const { module } = await params;
  const item = NAV.flatMap((s) => s.items).find((i) => i.href === `/app/${module}`);
  if (!item?.phase || !allowed(user, item)) notFound();
  return (
    <>
      <PageHeader title={item.label} />
      <Card>
        <CardBody className="flex flex-col items-center gap-3 py-16 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-aqua-100 text-teal-700"><Hammer className="size-6" aria-hidden /></span>
          <p className="text-base font-semibold text-navy">Coming in Phase {item.phase}</p>
          <p className="max-w-md text-sm text-muted">This screen is part of the approved plan and will appear here when that phase is delivered.</p>
        </CardBody>
      </Card>
    </>
  );
}
