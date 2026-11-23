import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSessionUser, homeFor } from '@/lib/session';
import { ForcedChange } from './forced-change';

export const metadata: Metadata = { title: 'Set a new password' };

export default async function ChangePasswordPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (!user.mustChangePassword) redirect(homeFor(user));
  return (
    <main className="grid min-h-dvh place-items-center bg-canvas px-4">
      <div className="w-full max-w-sm rounded-[var(--radius-card)] border border-line bg-white p-6 shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo-primary.png" alt="Kush Enterprise" className="mb-6 h-8 w-auto" />
        <h1 className="text-lg font-semibold text-navy">Set your own password</h1>
        <p className="mb-5 mt-1 text-sm text-muted">Hi {user.name.split(' ')[0]}, your account was set up with a temporary password. Choose a new one to continue.</p>
        <ForcedChange home={user.role === 'CUSTOMER' ? '/portal' : '/app'} />
      </div>
    </main>
  );
}
