'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { trpc } from '@/lib/trpc';
import { CompanySection } from './company-section';
import { BankSection } from './bank-section';
import { NumberingSection } from './numbering-section';
import { DocumentsSection } from './documents-section';
import { MastersSection } from './masters-section';
import { CategoriesSection } from './categories-section';
import { InventorySection } from './inventory-section';
import { NotificationsSection } from './notifications-section';
import { LabelsSection } from './labels-section';

const TABS = [
  ['company', 'Company'],
  ['bank', 'Bank, UPI & signature'],
  ['numbering', 'Document numbering'],
  ['documents', 'Terms & declaration'],
  ['masters', 'GST rates & units'],
  ['categories', 'Categories'],
  ['inventory', 'Inventory'],
  ['notifications', 'Notifications'],
  ['labels', 'Label printing'],
] as const;
type Tab = (typeof TABS)[number][0];

export function SettingsScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const tab = (TABS.find(([k]) => k === params.get('tab'))?.[0] ?? 'company') as Tab;
  const settings = trpc.settings.get.useQuery();

  return (
    <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
      <nav aria-label="Settings sections" className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
        <ul className="flex gap-1 lg:flex-col">
          {TABS.map(([k, label]) => (
            <li key={k}>
              <button
                onClick={() => router.replace(`/app/settings?tab=${k}`, { scroll: false })}
                aria-current={tab === k ? 'page' : undefined}
                className={cn(
                  'w-full whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm',
                  tab === k ? 'bg-aqua-100 font-semibold text-navy' : 'text-muted hover:bg-white hover:text-ink',
                )}
              >
                {label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0">
        {!settings.data ? (
          <div className="flex items-center gap-2 text-sm text-muted"><Loader2 className="size-4 animate-spin" /> Loading settings…</div>
        ) : (
          <>
            {tab === 'company' && <CompanySection s={settings.data} />}
            {tab === 'bank' && <BankSection s={settings.data} />}
            {tab === 'numbering' && <NumberingSection />}
            {tab === 'documents' && <DocumentsSection s={settings.data} />}
            {tab === 'masters' && <MastersSection s={settings.data} />}
            {tab === 'categories' && <CategoriesSection />}
            {tab === 'inventory' && <InventorySection s={settings.data} />}
            {tab === 'notifications' && <NotificationsSection s={settings.data} />}
            {tab === 'labels' && <LabelsSection s={settings.data} />}
          </>
        )}
      </div>
    </div>
  );
}
