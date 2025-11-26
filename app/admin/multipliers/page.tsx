// app/admin/multipliers/page.tsx
import AdminMultipliersClient from './AdminMultipliersClient';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { redirect } from "next/navigation";
import { getCurrentAdminUser } from "@/lib/getCurrentAdminUser";
import { hasPermission } from "@/lib/adminPermissions";

export default async function Page() {
  // 🔐 1) Auth check
  const adminUser = await getCurrentAdminUser();

  if (!adminUser) {
    redirect("/admin/login?reason=not_logged_in");
  }

  // 🔐 2) Read-rechten check
  if (!hasPermission(adminUser, "multipliers", "read")) {
    return (
      <div className="p-5">
        <h1 className="text-2xl font-semibold mb-4">Multipliers beheer</h1>

        <div className="p-3 bg-red-50 border border-red-200 rounded">
          <div className="text-red-700 font-medium">
            Je hebt geen rechten om deze pagina te bekijken.
          </div>
          <p className="text-xs text-red-600 mt-1">
            Vraag je beheerder om je &quot;multipliers&quot; rechten aan te passen
            onder Settings &gt; Users.
          </p>
        </div>
      </div>
    );
  }

  // 🔐 3) Page content (zoals het was)
  return (
    <div className="p-5 space-y-4">
      <h1 className="text-2xl font-semibold">Multipliers beheer</h1>
      <p className="text-sm text-gray-600">
        Beheer per-categorie multiplier-sets. Zet per-model een custom set op of gebruik de categorie-set.
      </p>
      <AdminMultipliersClient />
    </div>
  );
}
