// app/admin/refurb/layout.tsx
import type { ReactNode } from "react";
import { getCurrentAdminUser } from "@/lib/getCurrentAdminUser";
import RefurbTabs from "./RefurbTabs";

export const dynamic = "force-dynamic";

export default async function RefurbLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getCurrentAdminUser();
  const role = user?.role ?? null;

  return (
    <div className="space-y-3">
      {/* Refurb header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Refurb</h1>
          <p className="text-xs text-slate-500">
            Binnenkomende refurb-toestellen verwerken per receptie.
          </p>
        </div>
      </div>

      {/* Tabs voor Refurb-subsecties */}
      <RefurbTabs role={role} />

      {/* Eigenlijke inhoud van de pagina (receptions, suppliers, detail, new, ...) */}
      {children}
    </div>
  );
}
