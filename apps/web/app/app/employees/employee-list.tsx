'use client';
import Link from 'next/link';
import { UserPlus } from 'lucide-react';
import { formatDateTime } from '@kush/core';
import { Badge, Card, PageHeader } from '@/components/ui/card';
import { trpc } from '@/lib/trpc';

export function EmployeeList() {
  const list = trpc.employees.list.useQuery();
  return (
    <>
      <PageHeader
        title="Employees"
        description="Add staff and tick exactly what each person may do. Changes apply on their next click."
        actions={<Link href="/app/employees/new" className="inline-flex h-10 items-center gap-2 rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"><UserPlus className="size-4" aria-hidden /> Add employee</Link>}
      />
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-canvas text-left text-xs uppercase tracking-wide text-muted">
              <tr><th className="px-5 py-2.5 font-medium">Name</th><th className="px-3 py-2.5 font-medium">Contact</th><th className="px-3 py-2.5 font-medium">Access</th><th className="px-3 py-2.5 font-medium">Last sign-in</th><th className="px-5 py-2.5 font-medium">Status</th></tr>
            </thead>
            <tbody>
              {list.data?.length === 0 && <tr><td colSpan={5} className="px-5 py-10 text-center text-muted">No employees yet. Add your first team member.</td></tr>}
              {list.data?.map((e) => (
                <tr key={e.id} className="border-t border-line hover:bg-aqua-50/60">
                  <td className="px-5 py-3"><Link href={`/app/employees/${e.id}`} className="font-medium text-navy hover:underline">{e.name}</Link></td>
                  <td className="px-3 py-3 text-muted">{[e.email, e.mobile].filter(Boolean).join(' · ')}</td>
                  <td className="px-3 py-3">{e.permissions.length ? <Badge tone="teal">{e.permissions.length} permission{e.permissions.length > 1 ? 's' : ''}</Badge> : <Badge>None</Badge>}</td>
                  <td className="px-3 py-3 text-muted">{e.lastLoginAt ? formatDateTime(e.lastLoginAt) : 'Never'}</td>
                  <td className="px-5 py-3">
                    {!e.isActive ? <Badge tone="danger">Deactivated</Badge> : e.lockedUntil && new Date(e.lockedUntil) > new Date() ? <Badge tone="warn">Locked</Badge> : e.mustChangePassword ? <Badge tone="warn">Awaiting first sign-in</Badge> : <Badge tone="ok">Active</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
