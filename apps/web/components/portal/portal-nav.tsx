'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, FileText, Home, LayoutGrid, Package, ShoppingCart, User, Wallet } from 'lucide-react';
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

export function PortalNav() {
  const path = usePathname();
  const cart = useCart();
  const unread = trpc.notifications.unreadCount.useQuery(undefined, { refetchInterval: 60_000 });
  const active = (href: string) => (href === '/portal' ? path === '/portal' : path.startsWith(href));
  return (
    <>
      <nav aria-label="Portal" className="flex gap-1 overflow-x-auto">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} aria-current={active(l.href) ? 'page' : undefined}
            className={cn('flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm', active(l.href) ? 'bg-aqua-100 font-semibold text-navy' : 'text-muted hover:bg-canvas hover:text-ink')}>
            <l.icon className="size-4" aria-hidden /> {l.label}
          </Link>
        ))}
      </nav>
      <div className="flex items-center gap-1">
        <Link href="/portal/notifications" aria-label={`Notifications${unread.data ? ` (${unread.data} unread)` : ''}`} className="relative rounded-lg p-2 text-muted hover:bg-canvas hover:text-ink">
          <Bell className="size-5" aria-hidden />
          {!!unread.data && <span className="absolute right-0.5 top-0.5 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">{unread.data > 99 ? '99+' : unread.data}</span>}
        </Link>
        <Link href="/portal/cart" aria-label={`Cart (${cart.count} items)`} className="relative rounded-lg p-2 text-muted hover:bg-canvas hover:text-ink">
          <ShoppingCart className="size-5" aria-hidden />
          {cart.count > 0 && <span className="absolute right-0.5 top-0.5 grid min-w-4 place-items-center rounded-full bg-teal-700 px-1 text-[10px] font-bold text-white">{cart.count}</span>}
        </Link>
        <Link href="/portal/profile" aria-label="Profile" className="rounded-lg p-2 text-muted hover:bg-canvas hover:text-ink"><User className="size-5" aria-hidden /></Link>
      </div>
    </>
  );
}
