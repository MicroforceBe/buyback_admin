"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";

type NavPermissions = {
  dashboard?: boolean;
  leads?: boolean;
  refurb?: boolean;   // ← NIEUW
  catalog?: boolean;
  multipliers?: boolean;
  uploads?: boolean;
  settings?: boolean;
};

type Item = {
  href: string;
  label: string;
  emoji?: string;
  permKey?: keyof NavPermissions;
};

// ⭐ Toegevoegd: Refurb direct na Leads – knoppen maximaal smal gemaakt
const items: Item[] = [
  { href: "/admin", label: "Dashboard", emoji: "🏠", permKey: "dashboard" },
  { href: "/admin/leads", label: "Leads", emoji: "📋", permKey: "leads" },

  // ← HIER NIEUW
  { href: "/admin/refurb", label: "Refurb", emoji: "🔧", permKey: "refurb" },

  { href: "/admin/catalog", label: "Catalogus", emoji: "📦", permKey: "catalog" },
  { href: "/admin/multipliers", label: "Multipliers", emoji: "⚙️", permKey: "multipliers" },
  { href: "/admin/uploads", label: "Uploads", emoji: "⤴️", permKey: "uploads" },

  { href: "/admin/settings", label: "Settings", emoji: "🛠️", permKey: "settings" },
];

export default function Nav({ permissions }: { permissions?: NavPermissions }) {
  const pathname = usePathname();

  const links = useMemo(() => {
    return items
      .filter((it) => {
        if (!it.permKey) return true;
        return permissions?.[it.permKey] !== false;
      })
      .map((it) => {
        const active =
          pathname === it.href ||
          (pathname?.startsWith(it.href + "/") ?? false);

        // ⭐ KNOP ZO SMAL MOGELIJK
        const base =
          "flex items-center gap-1 px-2 py-1.5 rounded border text-[12px] leading-tight transition-colors whitespace-nowrap";

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
            <span className="text-[13px]">{it.emoji}</span>
            <span>{it.label}</span>
          </Link>
        );
      });
  }, [pathname, permissions]);

  return <nav className="flex flex-col gap-1.5 p-3">{links}</nav>;
}
