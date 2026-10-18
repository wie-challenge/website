'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiFetch } from '@/lib/api';
export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  return (
    <span>
      <button
        type="button"
        className="text-button"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError('');
          try {
            await apiFetch('/api/auth/sign-out', { method: 'POST' });
            router.replace('/auth/login');
            router.refresh();
          } catch {
            setError('Unable to sign out. Try again.');
            setPending(false);
          }
        }}
      >
        {pending ? 'Signing out…' : 'Sign out'}
      </button>
      {error && <span role="alert">{error}</span>}
    </span>
  );
}
