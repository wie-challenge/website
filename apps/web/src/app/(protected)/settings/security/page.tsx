import { MfaSettings } from '@/components/mfa-settings';
import Link from 'next/link';
export default function Page() {
  return (
    <>
      <MfaSettings />
      <p>
        <Link href="/settings/profile">Manage passwords and signed-in sessions</Link>
      </p>
    </>
  );
}
