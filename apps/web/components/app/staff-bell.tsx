'use client';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import { cn } from '@/lib/cn';
import { trpc } from '@/lib/trpc';

/** Unread in-app notifications for staff (new portal orders, change requests…). */
export function StaffBell({ className, label = false }: { className?: string; label?: boolean }) {
  const q = trpc.notifications.unreadCount.useQuery(undefined, { refetchInterval: 60_000 });
  const n = q.data ?? 0;
  return (
    <Link href="/app/notifications" aria-label={`Notifications${n ? ` (${n} unread)` : ''}`} className={cn('relative flex items-center gap-2', className)}>
      <Bell className="size-5" aria-hidden />{label && <span className="text-sm">Notifications</span>}
      {n > 0 && <span className="grid min-w-5 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">{n > 99 ? '99+' : n}</span>}
    </Link>
  );
}
