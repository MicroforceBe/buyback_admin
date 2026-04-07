// app/admin/leads/help/page.tsx
import { redirect } from "next/navigation";
import { getCurrentAdminUser } from "@/lib/getCurrentAdminUser";
import { hasPermission } from "@/lib/adminPermissions";
import LeadsHelpClient from "./LeadsHelpClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function LeadsHelpPage() {
  const adminUser = await getCurrentAdminUser();

  if (!adminUser) {
    redirect("/admin/login?reason=not_logged_in");
  }

  if (!hasPermission(adminUser, "leads", "read")) {
    return (
      <div className="w-full p-6">
        <h1 className="text-2xl font-semibold mb-4">Leads – Help</h1>
        <div className="p-3 bg-red-50 border border-red-200 rounded">
          <div className="text-red-700 font-medium">
            Je hebt geen rechten om deze pagina te bekijken.
          </div>
        </div>
      </div>
    );
  }

  return <LeadsHelpClient />;
}
