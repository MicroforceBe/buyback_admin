// app/admin/layout.tsx
import type { ReactNode } from "react";
import Nav from "./Nav";
import { getCurrentAdminUser } from "@/lib/getCurrentAdminUser";
import UserBadge from "./UserBadge";
import IdleLogout from "./IdleLogout";
import LogoutButton from "./LogoutButton";

export const metadata = {
  title: "Buyback Admin",
  description: "Beheer",
};

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const currentUser = await getCurrentAdminUser();

  // NIET ingelogd → géén sidebar/topbar, gewoon de page zelf (login)
  if (!currentUser) {
    return <>{children}</>;
  }

  const role = currentUser.role as string | undefined;

  // WÉL ingelogd → normale admin layout
  return (
    <div className="min-h-screen grid grid-cols-1 md:grid-cols-[auto,1fr] bg-gray-50 text-gray-900">
      {/* Sidebar */}
      <aside
        className="
          group 
          border-r border-gray-200 bg-gray-100 
          flex flex-col
          md:w-[64px] md:hover:w-[200px]
          transition-[width] duration-200 ease-out
        "
      >
        {/* Logo / titelblok – compact, verbergt tekst als sidebar collapsed is */}
        <div className="p-3 border-b border-gray-200 flex items-center gap-2 overflow-hidden">
          <div className="h-7 w-7 flex items-center justify-center rounded bg-sky-500 text-white text-sm font-bold flex-shrink-0">
            BB
          </div>
          {/* Tekst alleen zichtbaar als er ruimte is (expanded) */}
          <div className="hidden md:block truncate">
            <h1 className="text-sm font-semibold leading-tight">Buyback Admin</h1>
            <p className="text-[11px] text-gray-500 leading-tight">
              Beheerpanelen
            </p>
          </div>
        </div>

        {/* Nav krijgt role mee zodat we rol-afhankelijke items kunnen tonen */}
        <Nav role={role} />

        {/* Optioneel: onderaan iets (bv. versie) */}
        {/* <div className="mt-auto p-2 text-[10px] text-gray-400 text-center">
          v1.0.0
        </div> */}
      </aside>

      {/* Main content */}
      <main className="p-4 md:p-6 overflow-auto">
        {/* Automatische logout na inactiviteit, bv. 15 minuten */}
        <IdleLogout timeoutMs={15 * 60 * 1000} />

        {/* Topbar in main met user-badge en afmelden-knop rechtsboven */}
        <div className="mb-4 flex items-center justify-between">
          {/* Optioneel: titel voor mobile weergave */}
          <div className="md:hidden">
            <h2 className="text-base font-semibold">Buyback Admin</h2>
            <p className="text-xs text-gray-500">Beheerpanelen</p>
          </div>

          <div className="flex items-center gap-3 ml-auto">
            <UserBadge user={currentUser} />
            <LogoutButton />
          </div>
        </div>

        {children}
      </main>
    </div>
  );
}
