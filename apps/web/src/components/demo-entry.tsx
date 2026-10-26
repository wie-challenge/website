'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiFetch } from '@/lib/api';

const personas = [
  ['buyer', 'Buyer', 'demo.buyer@demo.invalid'],
  ['artisan', 'Artisan', 'demo.artisan@demo.invalid'],
  ['coordinator', 'Coordinator', 'demo.coordinator@demo.invalid'],
  ['production', 'Production', 'demo.production@demo.invalid'],
  ['qa', 'QA', 'demo.qa@demo.invalid'],
  ['finance', 'Finance', 'demo.finance@demo.invalid'],
] as const;

export function DemoEntry({ next }: { next: string }) {
  const router = useRouter();
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');
  return (
    <section className="demo-entry" aria-labelledby="demo-entry-title">
      <p className="eyebrow">SYNTHETIC DEMONSTRATION</p>
      <h2 id="demo-entry-title">Try the demo — synthetic data only</h2>
      <p>Choose a fictional role. No password is required and no production account is used.</p>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      <div className="demo-persona-grid">
        {personas.map(([key, role, email]) => (
          <article className="demo-persona-card" key={key}>
            <span className="demo-indicator">
              <span>DEMO</span>
            </span>
            <h3>{role}</h3>
            <code>{email}</code>
            <button
              className="button"
              type="button"
              disabled={Boolean(pending)}
              onClick={async () => {
                setPending(key);
                setError('');
                try {
                  await apiFetch('/api/auth/demo/sign-in', {
                    method: 'POST',
                    body: { persona: key },
                  });
                  router.replace(next === '/dashboard' ? '/dashboard' : next);
                  router.refresh();
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'The demo is unavailable.');
                  setPending('');
                }
              }}
            >
              {pending === key ? 'Entering…' : `Enter as ${role}`}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
