import { redirect } from 'next/navigation';
import type { Page, UserView } from '@hirfacare/contracts';
import { getMe, serverApi } from '@/lib/server-api';
import { AdminUsers } from '@/components/admin-users';
export default async function UsersPage() {
  const me = await getMe();
  if (!me) redirect('/auth/login');
  if (me.user.role !== 'ADMIN') redirect('/settings/profile');
  const data = await serverApi<Page<UserView>>('/api/v1/admin/users');
  if (!data) redirect('/settings/profile');
  return <AdminUsers initial={data} />;
}
