import Link from 'next/link';
import { AcceptInvitation } from '@/components/organizations';
export default function Page() {
  return (
    <>
      <header className="app-header">
        <Link className="wordmark" href="/">
          HirfaCare
          <span className="brand-dot" />
        </Link>
      </header>
      <main className="workspace" id="main-content">
        <AcceptInvitation />
      </main>
      <footer className="app-footer">HirfaCare · Built around people.</footer>
    </>
  );
}
