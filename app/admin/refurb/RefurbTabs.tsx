// app/admin/refurb/RefurbTabs.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type TabKey = "receptions" | "suppliers" | "statuses" | "locations" | "models";

type Props = {
  /**
   * Optioneel: expliciet actieve tab.
   * Als je dit niet meegeeft, wordt de actieve tab op basis van de URL bepaald.
   */
  active?: TabKey;

  /**
   * Optioneel: expliciet aangeven of de user admin is.
   * Als niet meegegeven, wordt er gekeken naar `role === "admin"`.
   */
  isAdmin?: boolean;

  /**
   * Backwards compat: oude prop die je in layout.tsx gebruikt.
   * Mag bv. AdminRole | null zijn in je layout, hier behandelen we het als string | null.
   */
  role?: string | null;
};

export default function RefurbTabs({ active, isAdmin, role }: Props) {
  const pathname = usePathname();

  // Bepalen of het om een admin gaat:
  const admin = typeof isAdmin === "boolean" ? isAdmin : role === "admin";

  const tabs: { key: TabKey; href: string; label: string; adminOnly: boolean }[] = [
    { key: "receptions", href: "/admin/refurb", label: "Recepties", adminOnly: false },
    { key: "suppliers", href: "/admin/refurb/suppliers", label: "Leveranciers", adminOnly: true },
    { key: "statuses", href: "/admin/refurb/statuses", label: "Statussen", adminOnly: true },
    { key: "locations", href: "/admin/refurb/locations", label: "Locaties", adminOnly: true },
    { key: "models", href: "/admin/refurb/models", label: "Modellen", adminOnly: true },
  ];

  return (
    <div className="border-b border-slate-200 mb-4">
      <nav className="flex gap-2 text-xs">
        {tabs
          .filter((t) => (t.adminOnly ? admin : true)) // admin-only tabs verbergen voor niet-admins
          .map((tab) => {
            const isActive =
              (active && active === tab.key) ||
              pathname === tab.href ||
              (pathname?.startsWith(tab.href + "/") ?? false);

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
