'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, FileText, Home, LayoutGrid, Menu, Package, ShoppingCart, User, Wallet, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { trpc } from '@/lib/trpc';
import { useCart } from './cart';

const LINKS = [
  { href: '/portal', label: 'Home', icon: Home },
  { href: '/portal/catalogue', label: 'Catalogue', icon: LayoutGrid },
  { href: '/portal/orders', label: 'My orders', icon: Package },
  { href: '/portal/invoices', label: 'Invoices', icon: FileText },
  { href: '/portal/account', label: 'Account', icon: Wallet },
];

/**
 * Wide screens: the links inline, then the bell, cart and profile (sign out lives on the profile
 * page). Narrower screens: bell and cart stay in the bar; the links open in a side drawer.
 */
export function PortalNav() {
  const path = usePathname();
  const cart = useCart();
  const unread = trpc.notifications.unreadCount.useQuery(undefined, { refetchInterval: 60_000 });
  const [open, setOpen] = useState(false);
  const active = (href: string) => (href === '/portal' ? path === '/portal' : path.startsWith(href));

  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const item = (l: { href: string; label: string; icon: typeof Home }, wide = false) => (
    <Link key={l.href} href={l.href} aria-current={active(l.href) ? 'page' : undefined}
      className={cn('flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm', wide && 'py-2.5 text-base',
        active(l.href) ? 'bg-aqua-100 font-semibold text-navy' : 'text-muted hover:bg-canvas hover:text-ink')}>
      <l.icon className="size-4" aria-hidden /> {l.label}
    </Link>
  );
  const icon = 'relative rounded-lg p-2 text-muted hover:bg-canvas hover:text-ink';

  return (
    <>
      <nav aria-label="Portal" className="hidden flex-1 gap-1 lg:flex">{LINKS.map((l) => item(l))}</nav>
      <div className="ml-auto flex items-center gap-1">
        <Link href="/portal/notifications" aria-label={`Notifications${unread.data ? ` (${unread.data} unread)` : ''}`} className={icon}>
          <Bell className="size-5" aria-hidden />
          {!!unread.data && <span className="absolute right-0.5 top-0.5 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">{unread.data > 99 ? '99+' : unread.data}</span>}
        </Link>
        <Link href="/portal/cart" aria-label={`Cart (${cart.count} items)`} className={icon}>
          <ShoppingCart className="size-5" aria-hidden />
          {cart.count > 0 && <span className="absolute right-0.5 top-0.5 grid min-w-4 place-items-center rounded-full bg-teal-700 px-1 text-[10px] font-bold text-white">{cart.count}</span>}
        </Link>
        <Link href="/portal/profile" aria-label="Profile & settings" className={cn(icon, 'hidden lg:block')}><User className="size-5" aria-hidden /></Link>
        <button type="button" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)} className={cn(icon, 'lg:hidden')}><Menu className="size-5" aria-hidden /></button>
      </div>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-ink/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 right-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-xl">
            <div className="flex h-14 items-center justify-between border-b border-line px-4">
              <span className="font-semibold text-navy">Menu</span>
              <button type="button" aria-label="Close menu" onClick={() => setOpen(false)} className={icon}><X className="size-5" aria-hidden /></button>
            </div>
            <nav aria-label="Portal" className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">{LINKS.map((l) => item(l, true))}</nav>
            <div className="border-t border-line p-3">{item({ href: '/portal/profile', label: 'Profile & settings', icon: User }, true)}</div>
          </aside>
        </div>
      )}
    </>
  );
}
