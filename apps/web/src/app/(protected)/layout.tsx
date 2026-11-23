import { redirect } from 'next/navigation';
import { getMe, getIdentityContext, ServerRequestBlocked } from '@/lib/server-api';
import { AppShell } from '@/components/app-shell';
export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const identity = await (async () => {
    const me = await getMe();
    if (!me) redirect('/auth/login');
    return { me, context: await getIdentityContext() };
  })().catch((error: unknown) => {
    if (error instanceof ServerRequestBlocked) return error;
    throw error;
  });
  if (identity instanceof ServerRequestBlocked)
    return (
      <main className="panel">
        <h1>Request blocked</h1>
        <p>Reload this page in a moment. If the block continues, contact NASJ.</p>
        {identity.requestId && <p>Request reference: {identity.requestId}</p>}
      </main>
    );
  const { me, context } = identity;
  return (
    <AppShell
      context={context}
      name={me.user.name}
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
                  'buyer.relationship.manage',
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
