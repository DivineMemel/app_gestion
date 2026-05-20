import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { resolveMember } from '@/lib/auth-server';

export const dynamic = 'force-dynamic';

export default async function AdminAppLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const member = await resolveMember(
    jar.get('muse_admin')?.value,
    jar.get('muse_session')?.value,
  );
  if (!member) redirect('/admin/login');

  return (
    <AdminShell role={member.role} memberName={member.name}>
      {children}
    </AdminShell>
  );
}
