import { redirect } from 'next/navigation';
import { getMe, getIdentityContext } from '@/lib/server-api';
import { AppShell } from '@/components/app-shell';
export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  if (!me) redirect('/auth/login');
  const context = await getIdentityContext();
  return (
    <AppShell
      demo={process.env.NODE_ENV !== 'production' || process.env.DEMO_MODE === 'true'}
      context={context}
      name={me.user.name}
      email={me.user.email}
      capabilities={{
        buyer: Boolean(context?.personas.includes('BUYER_REPRESENTATIVE')),
        artisan: Boolean(context?.linkedArtisanProfileId),
        operator: Boolean(
          context?.organizations.some(
            (o) =>
              o.type === 'INTERNAL' &&
              o.permissions.some((p) =>
                [
                  'production.manage',
                  'finance.payout.read',
                  'quality.inspection.create',
                  'inventory.manage',
                ].includes(p),
              ),
          ),
        ),
        admin: me.user.role === 'ADMIN',
      }}
    >
      {children}
    </AppShell>
  );
}
