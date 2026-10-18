import Link from 'next/link';
export default function Home() {
  return (
    <>
      <header className="app-header">
        <Link href="/" className="wordmark">
          HirfaCare
          <span className="brand-dot" />
        </Link>
        <Link href="/auth/login">Sign in</Link>
      </header>
      <main className="welcome" id="main-content">
        <p className="eyebrow">MADE WITH CARE</p>
        <h1>
          Good work.
          <br />
          <em>Shared beginnings.</em>
        </h1>
        <p className="lead">
          A shared place to take the next step.
          <br />
          Create your account and make yourself at home.
        </p>
        <div className="welcome-actions">
          <Link className="button" href="/auth/register">
            Create an account <span aria-hidden="true">↗</span>
          </Link>
          <Link className="text-button" href="/auth/login">
            Already a member? Sign in
          </Link>
        </div>
        <div className="welcome-mark" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </main>
      <footer className="app-footer">HirfaCare · Built around people.</footer>
    </>
  );
}
