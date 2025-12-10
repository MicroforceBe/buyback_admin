// app/admin/refurb/RefurbTabs.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type TabKey = "receptions" | "suppliers" | "statuses" | "locations";

type Props = {
  active: TabKey;
  isAdmin?: boolean;
};

export default function RefurbTabs({ active, isAdmin }: Props) {
  const pathname = usePathname();

  const tabs = [
    { key: "receptions" as TabKey, href: "/admin/refurb", label: "Recepties", admin: false },
    { key: "suppliers" as TabKey, href: "/admin/refurb/suppliers", label: "Leveranciers", admin: true },
    { key: "statuses" as TabKey, href: "/admin/refurb/statuses", label: "Statussen", admin: true },
    { key: "locations" as TabKey, href: "/admin/refurb/locations", label: "Locaties", admin: true },
  ];

  return (
    <div className="border-b border-slate-200 mb-4">
      <nav className="flex gap-2 text-xs">
        {tabs
          .filter((t) => (t.admin ? isAdmin : true)) // admin-tabs alleen tonen als isAdmin true is
          .map((tab) => {
            const isActive =
              active === tab.key ||
              pathname === tab.href ||
              pathname?.startsWith(tab.href + "/");

            return (
              <Link
                key={tab.key}
                href={tab.href}
                className={`px-3 py-2 border-b-2 -mb-px ${
                  isActive
                    ? "border-sky-500 text-sky-600 font-medium bg-white"
                    : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
      </nav>
    </div>
  );
}
