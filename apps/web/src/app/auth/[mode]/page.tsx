import { notFound } from 'next/navigation';
import Link from 'next/link';
import { AuthForm, type AuthMode } from '@/components/auth-form';
import { safeNext } from '@/lib/navigation';
export default async function AuthPage({
  params,
  searchParams,
}: {
  params: Promise<{ mode: string }>;
  searchParams: Promise<{ next?: string }>;
}) {
  const { mode } = await params;
  if (!['login', 'register', 'forgot-password', 'reset-password', 'verify-email'].includes(mode))
    notFound();
  const query = await searchParams;
  return (
    <main className="auth-layout" id="main-content">
      <aside className="auth-aside">
        <Link href="/" className="wordmark">
          HirfaCare
          <span className="brand-dot" />
        </Link>
        <div>
          <p className="eyebrow">MADE WITH CARE</p>
          <h2>
            Good work
            <br />
            begins with
            <br />
            <em>connection.</em>
          </h2>
          <p>A shared place to take the next step.</p>
        </div>
        <span className="aside-footer">Built around people.</span>
      </aside>
      <div className="auth-main">
        <AuthForm mode={mode as AuthMode} next={safeNext(query.next)} />
      </div>
    </main>
  );
}
