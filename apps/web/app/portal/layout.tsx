import { requireCustomer } from '@/lib/session';
import { SignOutButton } from '@/components/app/sign-out-button';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await requireCustomer();
  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-primary.png" alt="Kush Enterprise" className="h-7 w-auto" />
          <div className="flex items-center gap-4 text-sm"><span className="hidden text-muted sm:inline">{user.name}</span><SignOutButton className="text-teal-700" /></div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
