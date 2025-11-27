// app/admin/settings/users/page.tsx
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getCurrentAdminUser } from "@/lib/getCurrentAdminUser";
import { hasPermission, ROOT_ADMIN_EMAIL } from "@/lib/adminPermissions";
import { redirect } from "next/navigation";
import UserPermissionsTable from "./UserPermissionsTable";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RawUserRow = {
  email: string;
  role: "admin" | "user";
  permissions: any;
};

export default async function UsersSettingsPage() {
  const adminUser = await getCurrentAdminUser();

  if (!adminUser) {
    redirect("/admin/login");
  }

  const canRead = hasPermission(adminUser, "settings", "read");
  const canWrite = hasPermission(adminUser, "settings", "write");

  if (!canRead) {
    return (
      <div className="w-full p-4">
        <h1 className="text-xl font-semibold mb-2">Instellingen – Users</h1>
        <p className="text-sm text-red-600">
          Je hebt geen rechten om deze pagina te bekijken.
        </p>
      </div>
    );
  }

  const { data, error } = await supabaseAdmin
    .from("buyback_admin_users")
    .select("email, role, permissions")
    .order("email", { ascending: true });

  if (error) {
    console.error("[UsersSettingsPage] load error", error);
  }

  const rows: RawUserRow[] = (data ?? []) as any[];

  const initialUsers = rows.map((r) => ({
    email: r.email,
    role: (r.role as "admin" | "user") ?? "user",
    permissions: (r.permissions as any) ?? {},
  }));

  const currentUserEmail = adminUser?.email ?? null;
  const rootAdminEmail = ROOT_ADMIN_EMAIL ?? null;

  return (
    <div className="w-full p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Instellingen – Users</h1>
        {!canWrite && (
          <span className="text-xs text-gray-500">
            Je hebt alleen leesrechten; wijzigen van rechten is uitgeschakeld.
          </span>
        )}
      </div>

      <UserPermissionsTable
        initialUsers={initialUsers}
        currentUserEmail={currentUserEmail}
        rootAdminEmail={rootAdminEmail}
        canEdit={canWrite}
      />
    </div>
  );
}
