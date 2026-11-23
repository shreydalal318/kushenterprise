import { AppShell } from '@/components/app/shell';
import { requireStaff } from '@/lib/session';

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff();
  return (
    <AppShell user={{ role: user.role, permissions: user.permissions, isActive: user.isActive, name: user.name, email: user.email }}>
      {children}
    </AppShell>
  );
}
