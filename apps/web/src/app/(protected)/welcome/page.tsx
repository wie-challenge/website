import { Welcome } from '@/components/market/welcome';
import { getMe } from '@/lib/server-api';
import { redirect } from 'next/navigation';

export default async function Page() {
  const me = await getMe();
  if (!me) redirect('/auth/login');
  return <Welcome csrfToken={me.csrfToken} />;
}
