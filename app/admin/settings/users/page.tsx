import { getCurrentAdminUser } from "@/lib/getCurrentAdminUser";
import { hasPermission } from "@/lib/adminPermissions";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { redirect } from "next/navigation";
import UserPermissionsTable from "./UserPermissionsTable";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function loadUsers() {
  const { data } = await supabaseAdmin
    .from("buyback_admin_users")
    .select("email, role, permissions")
    .order("email");

  return data || [];
}

export default async function UsersSettingsPage() {
  const adminUser = await getCurrentAdminUser();

  if (!adminUser) redirect("/admin/login");
  if (!hasPermission(adminUser, "settings", "read")) {
    return <div className="p-4 text-red-600">Geen rechten om deze pagina te bekijken.</div>;
  }

  const users = await loadUsers();

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Userbeheer</h2>
      <p className="text-sm text-gray-600">
        Voeg users toe en beheer hun toegangsrechten.
      </p>

      <UserPermissionsTable
        initialUsers={users}
        currentUserEmail={adminUser.email}
        rootAdminEmail={process.env.BUYBACK_ROOT_ADMIN_EMAIL ?? null}
      />
    </div>
  );
}
