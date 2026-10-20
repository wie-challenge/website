import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getMe } from '@/lib/server-api';
import { LogoutButton } from '@/components/logout-button';
export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  if (!me) redirect('/auth/login');
  return (
    <>
      <header className="app-header">
        <Link className="wordmark" href="/settings/profile">
          HirfaCare
          <span className="brand-dot" />
        </Link>
        <nav aria-label="Account navigation">
          <Link href="/settings/profile">Your account</Link>
          <Link href="/settings/organizations">Organizations</Link>
          <Link href="/artisan/profile">Artisan workspace</Link>
          <Link href="/commerce/buyer">Synthetic commerce</Link>
          <Link href="/commerce/catalog">Craft catalog</Link>
          <Link href="/support/cases">Support</Link>
          {me.user.role === 'ADMIN' && <Link href="/admin/organizations">Administration</Link>}
          <LogoutButton />
        </nav>
      </header>
      <main className="workspace" id="main-content">
        {children}
      </main>
      <footer className="app-footer">HirfaCare · Built around people.</footer>
    </>
  );
}
