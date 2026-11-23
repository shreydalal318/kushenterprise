import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function LinkButton({ href, children, variant = 'primary', className }: { href: string; children: ReactNode; variant?: 'primary' | 'secondary'; className?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors',
        variant === 'primary' ? 'bg-teal-700 text-white hover:bg-teal-800' : 'border border-line bg-white text-ink hover:bg-aqua-50',
        className,
      )}
    >
      {children}
    </Link>
  );
}
