import type { ReactNode } from "react";
import Nav from "./Nav";

export const metadata = {
  title: "Buyback Admin",
  description: "Beheer",
};

export default function AdminLayout({ children }: { children: ReactNode }) {
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
        {children}
      </main>
    </div>
  );
}
