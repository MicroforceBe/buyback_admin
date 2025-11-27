// app/admin/settings/users/page.tsx
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentAdminUser } from '@/lib/getCurrentAdminUser';
import {
  hasPermission,
  type AdminRole,
  type PermissionsMap,
} from '@/lib/adminPermissions';
import UserPermissionsTable from './UserPermissionsTable';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type DbAdminUserRow = {
  email: string;
  role: AdminRole;
  permissions: PermissionsMap | null;
};

export default async function Page() {
  const current = await getCurrentAdminUser();

  // Niet ingelogd of geen user gevonden → blokkeren
  if (!current) {
    return (
      <div className="p-4">
        <h1 className="text-xl font-semibold mb-2">Users</h1>
        <p className="text-sm text-red-600">
          Je hebt geen rechten om deze pagina te bekijken (niet ingelogd).
        </p>
      </div>
    );
  }

  const canWrite = hasPermission(current, 'settings', 'write');
  const canRead = hasPermission(current, 'settings', 'read') || canWrite;

  if (!canRead) {
    return (
      <div className="p-4">
        <h1 className="text-xl font-semibold mb-2">Users</h1>
        <p className="text-sm text-red-600">
          Je hebt geen rechten om deze pagina te bekijken.
        </p>
      </div>
    );
  }

  const { data, error } = await supabaseAdmin
    .from('buyback_admin_users')
    .select('email, role, permissions')
    .order('email', { ascending: true });

  if (error) {
    console.error('[admin/users] load error', error);
  }

  const rows: DbAdminUserRow[] = (data || []) as any[];

  const initialUsers = rows.map((r) => ({
    email: r.email,
    role: r.role,
    permissions: (r.permissions as PermissionsMap | null) ?? {},
  }));

  // Root admin e-mail puur voor UI (tag "(root)" + delete blokkeren in client)
  const rootAdminEmail = process.env.ROOT_ADMIN_EMAIL ?? null;

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-semibold">Users</h1>
      <p className="text-sm text-gray-600">
        Beheer welke e-mailadressen toegang hebben tot de Buyback Admin en welke rechten ze hebben.
      </p>

      <UserPermissionsTable
        initialUsers={initialUsers}
        currentUserEmail={current.email}
        rootAdminEmail={rootAdminEmail}
        canEdit={canWrite}
      />
    </div>
  );
}
