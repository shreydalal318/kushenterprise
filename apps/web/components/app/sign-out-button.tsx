'use client';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/cn';

export function SignOutButton({ className }: { className?: string }) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const logout = trpc.auth.logout.useMutation({
    onSuccess: () => {
      utils.invalidate();
      router.replace('/login');
      router.refresh();
    },
  });
  return (
    <button onClick={() => logout.mutate()} disabled={logout.isPending} className={cn('flex items-center gap-2 text-sm', className)}>
      <LogOut className="size-4" aria-hidden /> Sign out
    </button>
  );
}
