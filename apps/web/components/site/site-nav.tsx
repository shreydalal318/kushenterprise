'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { cn } from '@/lib/cn';

const LINKS = [['/', 'Home'], ['/products', 'Products'], ['/about', 'About'], ['/contact', 'Contact']] as const;

export function SiteNav() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const active = (h: string) => (h === '/' ? path === '/' : path.startsWith(h));
  return (
    <>
      <nav aria-label="Website" className="hidden items-center gap-1 md:flex">
        {LINKS.map(([h, l]) => <Link key={h} href={h} aria-current={active(h) ? 'page' : undefined} className={cn('rounded-lg px-3 py-2 text-sm', active(h) ? 'font-semibold text-navy' : 'text-muted hover:text-ink')}>{l}</Link>)}
        <Link href="/login" className="ml-2 inline-flex h-10 items-center rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800">Customer login</Link>
      </nav>
      <button className="rounded-md p-2 md:hidden" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <X className="size-5" /> : <Menu className="size-5" />}</button>
      {open && (
        <nav aria-label="Website" className="absolute inset-x-0 top-16 border-b border-line bg-white px-4 py-3 shadow-sm md:hidden">
          {LINKS.map(([h, l]) => <Link key={h} href={h} onClick={() => setOpen(false)} className={cn('block rounded-lg px-3 py-2.5', active(h) ? 'bg-aqua-50 font-semibold text-navy' : 'text-ink')}>{l}</Link>)}
          <Link href="/login" onClick={() => setOpen(false)} className="mt-2 flex h-11 items-center justify-center rounded-lg bg-teal-700 font-semibold text-white">Customer login</Link>
        </nav>
      )}
    </>
  );
}
