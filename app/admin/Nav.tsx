"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";

type NavPermissions = {
  dashboard?: boolean;
  leads?: boolean;
  refurb?: boolean;
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

const items: Item[] = [
  { href: "/admin", label: "Dashboard", emoji: "🏠", permKey: "dashboard" },
  { href: "/admin/leads", label: "Leads", emoji: "📋", permKey: "leads" },
  { href: "/admin/refurb", label: "Refurb", emoji: "🔧", permKey: "refurb" },
  { href: "/admin/catalog", label: "Catalogus", emoji: "📦", permKey: "catalog" },
  { href: "/admin/multipliers", label: "Multipliers", emoji: "⚙️", permKey: "multipliers" },
  { href: "/admin/uploads", label: "Uploads", emoji: "⤴️", permKey: "uploads" },
  { href: "/admin/settings", label: "Settings", emoji: "🛠️", permKey: "settings" },
];

export default function Nav({
  permissions,
  role,
}: {
  permissions?: NavPermissions;
  role?: string;
}) {
  const pathname = usePathname();

  const links = useMemo(() => {
    return items
      .filter((it) => {
        // PERMISSIES (optioneel, backward compatible)
        if (it.permKey && permissions && permissions[it.permKey] === false) {
          return false;
        }

        // ROLE-BASED filtering
        if (role === "technician") {
          // Technicians zien alleen Dashboard, Leads en Refurb
          const allowed = ["/admin", "/admin/leads", "/admin/refurb"];
          return allowed.includes(it.href);
        }

        // Andere rollen: alles tonen (of verfijnen indien gewenst)
        return true;
      })
      .map((it) => {
        const active =
          pathname === it.href ||
          (pathname?.startsWith(it.href + "/") ?? false);

        // ⭐ Extra smalle knoppen
        const base =
          "flex items-center gap-1 px-2 py-1.5 rounded border text-[12px] leading-tight transition-colors whitespace-nowrap overflow-hidden";

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
            {/* Emoji altijd zichtbaar */}
            <span className="text-[14px] flex-shrink-0">{it.emoji}</span>
            {/* Label verdwijnt als de sidebar te smal is (overflow-hidden + group-hover in layout) */}
            <span className="truncate">{it.label}</span>
          </Link>
        );
      });
  }, [pathname, permissions, role]);

  return (
    <nav className="flex flex-col gap-1.5 p-3">
      {links}
    </nav>
  );
}
