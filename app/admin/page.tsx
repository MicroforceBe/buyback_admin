// app/admin/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAdminUser } from "@/lib/getCurrentAdminUser";
import { hasPermission } from "@/lib/adminPermissions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AdminDashboardPage() {
  // 🔐 1) Ingelogde admin ophalen
  const adminUser = await getCurrentAdminUser();

  if (!adminUser) {
    // Niet ingelogd → altijd naar login
    redirect("/admin/login?reason=not_logged_in");
  }

  // Kleine helper om links alleen te tonen als je rechten hebt
  const can = (feature: Parameters<typeof hasPermission>[1]) =>
    hasPermission(adminUser, feature, "read");

  return (
    <div className="w-full p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Dashboard</h1>
          <p className="text-sm text-gray-500">
            Overzicht van de Buyback admin modules.
          </p>
        </div>
        <div className="text-xs text-gray-500 flex flex-col items-end">
          <span>Ingelogd als:</span>
          <span className="font-medium">
            {adminUser.email}
          </span>
          <span className="text-[11px] text-gray-400">
            rol: {adminUser.role}
          </span>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {can("leads") && (
          <Link
            href="/admin/leads"
            className="block p-4 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
          >
            <h2 className="font-semibold flex items-center gap-2">
              📋 Leads
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Overzicht van alle buyback-aanvragen, status en details.
            </p>
          </Link>
        )}

        {can("catalog") && (
          <Link
            href="/admin/catalog"
            className="block p-4 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
          >
            <h2 className="font-semibold flex items-center gap-2">
              📦 Catalogus
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Modellen en basisprijzen beheren.
            </p>
          </Link>
        )}

        {can("multipliers") && (
          <Link
            href="/admin/multipliers"
            className="block p-4 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
          >
            <h2 className="font-semibold flex items-center gap-2">
              ⚙️ Multipliers
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Vraagsets en prijs-multipliers per categorie beheren.
            </p>
          </Link>
        )}

        {can("uploads") && (
          <Link
            href="/admin/uploads"
            className="block p-4 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
          >
            <h2 className="font-semibold flex items-center gap-2">
              ⤴️ Uploads
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Bestanden en logo&apos;s beheren voor de widget en e-mails.
            </p>
          </Link>
        )}

        {can("settings") && (
          <Link
            href="/admin/settings"
            className="block p-4 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
          >
            <h2 className="font-semibold flex items-center gap-2">
              🛠️ Settings
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Branding, e-mailtemplates en userrechten beheren.
            </p>
          </Link>
        )}
      </div>

      {!(
        can("leads") ||
        can("catalog") ||
        can("multipliers") ||
        can("uploads") ||
        can("settings")
      ) && (
        <div className="p-3 bg-red-50 border border-red-200 rounded">
          <div className="text-red-700 font-medium">
            Je account heeft momenteel geen toegang tot een van de modules.
          </div>
          <p className="text-xs text-red-600 mt-1">
            Vraag een beheerder om je rechten aan te passen onder Settings &gt; Users.
          </p>
        </div>
      )}
    </div>
  );
}
