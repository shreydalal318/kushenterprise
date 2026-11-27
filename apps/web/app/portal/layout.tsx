import Link from 'next/link';
import { requireCustomer } from '@/lib/session';
import { CartProvider } from '@/components/portal/cart';
import { PortalNav } from '@/components/portal/portal-nav';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await requireCustomer();
  return (
    <CartProvider userId={user.id}>
      <div className="min-h-dvh bg-canvas">
        <header className="sticky top-0 z-20 border-b border-line bg-white">
          <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
            <Link href="/portal" className="flex shrink-0 items-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/logo-primary.png" alt="Kush Enterprise" className="h-7 w-auto" />
            </Link>
            <PortalNav />
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </div>
    </CartProvider>
  );
}
