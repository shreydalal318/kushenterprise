import Link from 'next/link';
import { requireCustomer } from '@/lib/session';
import { SignOutButton } from '@/components/app/sign-out-button';
import { CartProvider } from '@/components/portal/cart';
import { PortalNav } from '@/components/portal/portal-nav';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await requireCustomer();
  return (
    <CartProvider userId={user.id}>
      <div className="min-h-dvh bg-canvas">
        <header className="sticky top-0 z-20 border-b border-line bg-white">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2">
            <Link href="/portal" className="flex items-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/logo-primary.png" alt="Kush Enterprise" className="h-7 w-auto" />
            </Link>
            <div className="order-3 w-full sm:order-2 sm:w-auto sm:flex-1"><div className="flex items-center justify-between gap-2 sm:justify-start"><PortalNav /></div></div>
            <div className="order-2 flex items-center gap-3 text-sm sm:order-3"><span className="hidden max-w-40 truncate text-muted lg:inline">{user.name}</span><SignOutButton className="text-teal-700" /></div>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </div>
    </CartProvider>
  );
}
