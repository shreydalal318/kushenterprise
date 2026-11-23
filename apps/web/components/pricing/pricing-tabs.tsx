import Link from 'next/link';
import { cn } from '@/lib/cn';

export function PricingTabs({ active }: { active: 'customer' | 'lists' }) {
  const tab = (href: string, label: string, on: boolean) => (
    <Link href={href} aria-current={on ? 'page' : undefined} className={cn('rounded-lg px-3 py-1.5 text-sm', on ? 'bg-aqua-100 font-semibold text-navy' : 'text-muted hover:bg-white hover:text-ink')}>{label}</Link>
  );
  return <nav aria-label="Pricing sections" className="mb-5 flex gap-1">{tab('/app/pricing', 'Customer prices', active === 'customer')}{tab('/app/pricing/lists', 'Price lists', active === 'lists')}</nav>;
}
