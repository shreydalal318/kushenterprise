'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';
import { useMe } from '@/lib/use-me';

/** Sub-navigation for the inventory screens (respects permissions). */
export function StockTabs() {
  const path = usePathname();
  const { can, isOwner } = useMe();
  const tabs = [
    { href: '/app/stock', label: 'Overview', show: true, exact: true },
    { href: '/app/stock/expiring', label: 'Expiring', show: can('MANAGE_STOCK') },
    { href: '/app/stock/low', label: 'Low stock', show: can('MANAGE_STOCK') },
    { href: '/app/stock/receipts', label: 'Receipts', show: true },
    { href: '/app/stock/adjustments', label: 'Adjustments', show: can('MANAGE_STOCK') },
    { href: '/app/stock/returns', label: 'Returns to supplier', show: can('MANAGE_STOCK') },
    { href: '/app/stock/valuation', label: 'Valuation', show: isOwner },
  ].filter((t) => t.show);
  return (
    <nav aria-label="Inventory sections" className="-mx-4 mb-5 overflow-x-auto px-4">
      <ul className="flex gap-1">
        {tabs.map((t) => {
          const on = t.exact ? path === t.href : path.startsWith(t.href);
          return <li key={t.href}><Link href={t.href} aria-current={on ? 'page' : undefined} className={cn('block whitespace-nowrap rounded-lg px-3 py-1.5 text-sm', on ? 'bg-aqua-100 font-semibold text-navy' : 'text-muted hover:bg-white hover:text-ink')}>{t.label}</Link></li>;
        })}
      </ul>
    </nav>
  );
}
