// app/admin/refurb/layout.tsx
import React from "react";
import RefurbTabs from "./RefurbTabs";
import { getCurrentAdminUser } from "@/lib/getCurrentAdminUser";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function RefurbLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentAdminUser();

  const role = (user as any)?.role || null;

  return (
    <div className="p-4 space-y-4">
      <div className="rounded-md border bg-slate-50 px-4 py-2 text-sm text-slate-700">
        Ingelogd als{" "}
        <span className="font-medium">
          {(user as any)?.email ||
            (user as any)?.name ||
            "admin"}
        </span>

        {role && (
          <>
            {" "}
            · rol:{" "}
            <span className="font-medium">
              {role}
            </span>
          </>
        )}
      </div>

      <RefurbTabs role={role} />

      {children}
    </div>
  );
}
