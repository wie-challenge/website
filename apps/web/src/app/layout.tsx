import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: { default: 'HirfaCare', template: '%s · HirfaCare' },
  description: 'Your HirfaCare account.',
  robots: { index: false, follow: false },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        {process.env.DEMO_MODE === 'true' && (
          <aside className="demo-banner" aria-label="Demo environment">
            Synthetic demonstration environment · Fictional accounts and organizations ·{' '}
            <a href="/demo">Demo information</a>
          </aside>
        )}
        {children}
      </body>
    </html>
  );
}
