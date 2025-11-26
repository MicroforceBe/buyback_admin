"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";

type NavPermissions = {
  dashboard?: boolean;
  leads?: boolean;
  catalog?: boolean;
  multipliers?: boolean;
  uploads?: boolean;
  settings?: boolean;
};

type Item = { href: string; label: string; emoji?: string; permKey?: keyof NavPermissions };

const items: Item[] = [
  { href: "/admin", label: "Dashboard", emoji: "🏠", permKey: "dashboard" },
  { href: "/admin/leads", label: "Leads", emoji: "📋", permKey: "leads" },
  { href: "/admin/catalog", label: "Catalogus", emoji: "📦", permKey: "catalog" },
  { href: "/admin/multipliers", label: "Multipliers", emoji: "⚙️", permKey: "multipliers" },
  { href: "/admin/uploads", label: "Uploads", emoji: "⤴️", permKey: "uploads" },
  // ✅ Nieuw hoofdniveau: algemene instellingen
  { href: "/admin/settings", label: "Settings", emoji: "🛠️", permKey: "settings" },
];

export default function Nav({ permissions }: { permissions?: NavPermissions }) {
  const pathname = usePathname();

  const links = useMemo(() => {
    return items
      .filter((it) => {
        // Als er geen permKey is, altijd tonen
        if (!it.permKey) return true;
        // Standaard: als er niets doorgegeven is → tonen
        const value = permissions?.[it.permKey];
        return value !== false;
      })
      .map((it) => {
        const active =
          pathname === it.href || (pathname?.startsWith(it.href + "/") ?? false);

        const base =
          "flex items-center gap-2 px-3 py-2 rounded-md border text-sm transition-colors";
        const activeCls =
          "bg-white border-gray-300 text-gray-900 font-medium shadow-sm";
        const inactiveCls =
          "bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100";

        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active ? "page" : undefined}
            className={`${base} ${active ? activeCls : inactiveCls}`}
          >
            <span>{it.emoji}</span>
            <span>{it.label}</span>
          </Link>
        );
      });
  }, [pathname, permissions]);

  return <nav className="flex flex-col gap-2 p-4">{links}</nav>;
}
