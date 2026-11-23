'use client';
import { useRouter } from 'next/navigation';
import { ChangePasswordForm } from '@/components/app/change-password-form';

export function ForcedChange({ home }: { home: string }) {
  const router = useRouter();
  return <ChangePasswordForm onDone={() => { router.replace(home); router.refresh(); }} />;
}
