// app/admin/refurb/layout.tsx
import React from "react";
import RefurbTabs from "./RefurbTabs";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function RefurbLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="p-4 space-y-4">
      <RefurbTabs />

      {children}
    </div>
  );
}
