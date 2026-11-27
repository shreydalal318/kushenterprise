'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { Menu, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { NAV, navFor, type NavItem } from '@/lib/nav';
import type { Principal } from '@kush/core';
import { SignOutButton } from './sign-out-button';
import { StaffBell } from './staff-bell';

interface ShellUser extends Principal { name: string; email: string | null }

export function AppShell({ user, children }: { user: ShellUser; children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const sections = navFor(user);
  const all = sections.flatMap((s) => s.items.map((i) => i.href));
  // Most specific match wins (so "Receive goods" doesn't also light up "Stock").
  const isActive = (i: NavItem) =>
    i.href === '/app' ? pathname === '/app' : pathname.startsWith(i.href) && !all.some((h) => h !== i.href && h.startsWith(i.href) && pathname.startsWith(h));

  const nav = (
    <nav aria-label="Main" className="flex flex-col gap-4 px-3 py-3">
      {sections.map((s) => (
        <div key={s.section || 'root'}>
          {s.section && <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-white/50">{s.section}</p>}
          <ul className="flex flex-col gap-0.5">
            {s.items.map((i) => (
              <li key={i.href}>
                <Link
                  href={i.href}
                  onClick={() => setOpen(false)}
                  aria-current={isActive(i) ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm transition-colors',
                    isActive(i) ? 'bg-white/12 font-semibold text-white shadow-[inset_3px_0_0_var(--color-teal)]' : 'text-white/80 hover:bg-white/8 hover:text-white',
                  )}
                >
                  <i.icon className="size-4 shrink-0" aria-hidden />
                  <span className="flex-1">{i.label}</span>
                  {i.phase && <span className="rounded bg-white/10 px-1.5 text-[10px] font-medium text-white/60">P{i.phase}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_1fr]">
      {/* Sidebar (desktop) / drawer (mobile & tablet portrait) */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col bg-navy text-white transition-transform lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 items-center gap-3 border-b border-white/10 px-5">
          <span className="grid size-9 place-items-center rounded-lg bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo-icon.png" alt="" className="h-5 w-auto" />
          </span>
          <span className="font-semibold tracking-tight">Kush Enterprise</span>
          <button className="ml-auto lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu"><X className="size-5" /></button>
        </div>
        <div className="scroll-dark flex-1 overflow-y-auto">{nav}</div>
        <div className="border-t border-white/10 p-4">
          <Link href="/app/account" className="block rounded-lg p-2 hover:bg-white/8">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-white/60">{user.role === 'OWNER' ? 'Owner' : 'Employee'}{user.email ? ` · ${user.email}` : ''}</p>
          </Link>
          <StaffBell label className="mt-1 rounded-lg px-2 py-1.5 text-white/80 hover:bg-white/8 hover:text-white" />
          <SignOutButton className="mt-1 px-2 text-white/80 hover:text-white" />
        </div>
      </aside>
      {open && <button aria-label="Close menu" className="fixed inset-0 z-30 bg-ink/40 lg:hidden" onClick={() => setOpen(false)} />}

      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-white/90 px-4 backdrop-blur lg:hidden">
          <button onClick={() => setOpen(true)} aria-label="Open menu" className="rounded-md p-1.5 hover:bg-aqua-50"><Menu className="size-5" /></button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-primary.png" alt="Kush Enterprise" className="h-6 w-auto" />
          <StaffBell className="ml-auto rounded-md p-1.5 text-muted hover:bg-aqua-50" />
        </header>
        <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}

export { NAV };
