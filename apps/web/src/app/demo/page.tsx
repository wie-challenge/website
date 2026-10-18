import Link from 'next/link';
import { notFound } from 'next/navigation';
export default function DemoPage() {
  if (process.env.DEMO_MODE !== 'true') notFound();
  return (
    <main className="workspace" id="main-content">
      <p className="eyebrow">SYNTHETIC DEMONSTRATION</p>
      <h1>Explore HirfaCare.</h1>
      <p className="lead">
        This demonstration uses a separate database and fictional identities. Use the demonstration
        credentials supplied by the presenter to explore buyer, artisan, association and staff
        workspaces.
      </p>
      <p>
        Each identity retains its own scoped permissions. Switching organization context never
        changes platform privileges. This environment contains no production users, health
        information or real financial records.
      </p>
      <Link className="button" href="/auth/login">
        Sign in to the demonstration
      </Link>
    </main>
  );
}
