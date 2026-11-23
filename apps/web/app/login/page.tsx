import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSessionUser, homeFor } from '@/lib/session';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const user = await getSessionUser();
  if (user) redirect(homeFor(user));
  const { next } = await searchParams;
  return (
    <main className="grid min-h-dvh place-items-center bg-white px-4 py-10">
      <div className="w-full max-w-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo-stacked.png" alt="Kush Enterprise" className="mx-auto mb-8 h-24 w-auto" />
        <LoginForm next={next ?? null} />
        <p className="mt-6 text-center text-xs text-muted">
          Doctors, hospitals and clinics: sign in with the mobile number registered with Kush Enterprise.
        </p>
      </div>
    </main>
  );
}
