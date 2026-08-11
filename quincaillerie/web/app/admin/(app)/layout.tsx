import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { resolveMember } from '@/lib/auth-server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { AdminShell } from '@/components/admin/AdminShell';
import { ServiceWorker } from '@/components/admin/ServiceWorker';

// Le rôle est résolu côté serveur à chaque rendu : un membre désactivé perd
// l'accès au rechargement suivant, sans attendre l'expiration de son cookie.
export const dynamic = 'force-dynamic';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const jar = await cookies();
  const member = await resolveMember(
    jar.get('qc_admin')?.value,
    jar.get('qc_session')?.value,
  );
  if (!member) redirect('/admin/login');

  let shopName = 'NADAL MULTISERVICES';
  try {
    const { data } = await supabaseAdmin()
      .from('shop_settings')
      .select('name')
      .eq('id', 1)
      .maybeSingle();
    if (data?.name) shopName = data.name;
  } catch {
    // Base injoignable : on affiche quand même la coquille, les pages
    // signaleront l'erreur individuellement.
  }

  return (
    <AdminShell
      memberId={member.id}
      roles={member.roles}
      memberName={member.name}
      shopName={shopName}
    >
      <ServiceWorker />
      {children}
    </AdminShell>
  );
}
