// app/admin/refurb/RefurbTabs.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function RefurbTabs({ role }: { role?: string | null }) {
  const pathname = usePathname();

  const isSuppliers = pathname?.startsWith("/admin/refurb/suppliers");
  const isReceptions = !isSuppliers; // alles onder /refurb behalve /suppliers

  return (
    <div className="border-b border-slate-200 mb-3">
      <div className="flex gap-2 text-xs">
        {/* Tab: Recepties */}
        <Link
          href="/admin/refurb"
          className={[
            "px-3 py-2 -mb-px border-b-2",
            "transition-colors",
            isReceptions
              ? "border-sky-500 text-sky-700 font-medium"
              : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300",
          ].join(" ")}
        >
          Recepties
        </Link>

        {/* Tab: Leveranciers (alleen admin) */}
        {role === "admin" && (
          <Link
            href="/admin/refurb/suppliers"
            className={[
              "px-3 py-2 -mb-px border-b-2",
              "transition-colors",
              isSuppliers
                ? "border-sky-500 text-sky-700 font-medium"
                : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300",
            ].join(" ")}
          >
            Leveranciers
          </Link>
        )}
      </div>
    </div>
  );
}
