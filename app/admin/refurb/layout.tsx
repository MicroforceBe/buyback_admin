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
      <RefurbTabs role={role} />

      {children}
    </div>
  );
}
