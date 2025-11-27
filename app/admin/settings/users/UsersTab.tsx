import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentAdminUser } from '@/lib/getCurrentAdminUser';
import UserPermissionsTable from './UserPermissionsTable';

export default async function UsersTab() {
  const adminUser = await getCurrentAdminUser();

  // Alleen iemand met settings:read mag deze tab zien
  // (de eigenlijke settings/page.tsx zou ook al een check moeten doen!)
  if (!adminUser) {
    return <div className="p-4">Niet ingelogd.</div>;
  }

  const { data, error } = await supabaseAdmin
    .from('buyback_admin_users')
    .select('email, role, permissions')
    .order('email', { ascending: true });

  if (error) {
    console.error('[UsersTab] error', error);
  }

  const rootAdminEmail = process.env.BUYBACK_ROOT_ADMIN_EMAIL ?? null;
  const isRootAdmin =
    rootAdminEmail !== null && adminUser.email === rootAdminEmail;

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-lg font-semibold">Users & rechten</h2>
      <p className="text-xs text-gray-600">
        Let op: de root admin ({rootAdminEmail ?? 'niet ingesteld'}) heeft altijd volledige rechten.
      </p>
      <UserPermissionsTable
        initialUsers={data ?? []}
        currentUserEmail={adminUser.email}
        rootAdminEmail={rootAdminEmail}
        canEdit={isRootAdmin}
      />
    </div>
  );
}
