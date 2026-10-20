import { redirect } from 'next/navigation';
import { getMe } from '@/lib/server-api';
import { AppShell } from '@/components/app-shell';
export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  if (!me) redirect('/auth/login');
  return (
    <AppShell
      user={{ name: me.user.name, email: me.user.email, isAdmin: me.user.role === 'ADMIN' }}
    >
      {children}
    </AppShell>
  );
}
