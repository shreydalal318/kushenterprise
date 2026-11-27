'use client';
import { useRouter } from 'next/navigation';
import { Crown, Store, Truck, UserRound, Zap } from 'lucide-react';
import { Alert, Card } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import { errorMessage } from '@/lib/errors';
import { trpc } from '@/lib/trpc';

type DevUser = { id: string; name: string; role: string; email: string | null; mobile: string | null; permissions: string[] };

const kind = (u: DevUser) =>
  u.role === 'OWNER' ? { label: 'Owner', Icon: Crown }
    : u.role === 'CUSTOMER' ? { label: 'Customer', Icon: UserRound }
      : u.permissions.length ? { label: 'Staff', Icon: Store } : { label: 'Delivery', Icon: Truck };

/**
 * Demo and development only: one click signs in as any user. Rendered only when the server has
 * DEV_QUICK_LOGIN=true in development, or DEMO_QUICK_LOGIN=true on a hosted demo (the API refuses otherwise too).
 */
export function DevQuickLogin({ className }: { className?: string }) {
  const router = useRouter();
  const users = trpc.auth.devUsers.useQuery();
  const login = trpc.auth.devLogin.useMutation({
    onSuccess: (r) => {
      router.replace(r.user.role === 'CUSTOMER' ? '/portal' : '/app');
      router.refresh();
    },
  });
  if (!users.data?.length) return null;

  return (
    <Card className={cn('border-amber-300 bg-amber-50 p-4', className)}>
      <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
        <Zap className="size-4" aria-hidden /> Quick login (demo)
      </div>
      <p className="mt-1 text-xs text-amber-800">Click anyone to see the app as them. No password or OTP needed.</p>
      <div className="mt-3 grid gap-2">
        {users.data.map((u) => {
          const { label, Icon } = kind(u);
          return (
            <button
              key={u.id}
              type="button"
              disabled={login.isPending}
              onClick={() => login.mutate({ userId: u.id, client: 'web' })}
              className="flex items-center gap-3 rounded-lg border border-amber-200 bg-white px-3 py-2 text-left hover:border-amber-400 hover:bg-amber-100/50 disabled:opacity-60"
            >
              <Icon className="size-4 shrink-0 text-amber-700" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">{u.name}</span>
                <span className="block truncate text-xs text-muted">{u.email ?? u.mobile}</span>
              </span>
              <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">{label}</span>
            </button>
          );
        })}
      </div>
      {login.error && <div className="mt-3"><Alert>{errorMessage(login.error)}</Alert></div>}
    </Card>
  );
}
