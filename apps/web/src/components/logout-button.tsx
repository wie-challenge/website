'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Button } from './ui/button';
import { LogOut } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
export function LogoutButton({ menuItem = false }: { menuItem?: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const button = (
    <Button
      type="button"
      variant="ghost"
      className="w-full justify-start text-muted-foreground"
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
      <LogOut size={16} aria-hidden="true" />
      {pending ? 'Signing out…' : 'Sign out'}
    </Button>
  );
  return (
    <span>
      {menuItem ? (
        <DropdownMenu.Item asChild onSelect={(event) => event.preventDefault()}>
          {button}
        </DropdownMenu.Item>
      ) : (
        button
      )}
      {error && <span role="alert">{error}</span>}
    </span>
  );
}
