// app/admin/layout.tsx
import type { ReactNode } from "react";
import Nav from "./Nav";
import { getCurrentAdminUser } from "@/lib/getCurrentAdminUser";
import UserBadge from "./UserBadge";

export const metadata = {
  title: "Buyback Admin",
  description: "Beheer",
};

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const currentUser = await getCurrentAdminUser();

  return (
    <div className="min-h-screen grid grid-cols-1 md:grid-cols-[260px,1fr] bg-gray-50 text-gray-900">
      {/* Sidebar */}
      <aside className="border-r border-gray-200 bg-gray-100">
        <div className="p-4 border-b border-gray-200">
          <h1 className="text-lg font-semibold">Buyback Admin</h1>
          <p className="text-xs text-gray-500">Beheerpanelen</p>
        </div>
        <Nav />
      </aside>

      {/* Main content */}
      <main className="p-4 md:p-6">
        {/* Topbar in main met user-badge rechtsboven */}
        <div className="mb-4 flex items-center justify-between">
          {/* Optioneel: titel voor mobile weergave */}
          <div className="md:hidden">
            <h2 className="text-base font-semibold">Buyback Admin</h2>
            <p className="text-xs text-gray-500">Beheerpanelen</p>
          </div>

          <UserBadge user={currentUser} />
        </div>

        {children}
      </main>
    </div>
  );
}
