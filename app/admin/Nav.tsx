"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";

type Item = { href: string; label: string; emoji?: string };

const items: Item[] = [
  { href: "/admin", label: "Dashboard", emoji: "🏠" },
  { href: "/admin/leads", label: "Leads", emoji: "📋" },
  { href: "/admin/catalog", label: "Catalogus", emoji: "📦" },
  { href: "/admin/multipliers", label: "Multipliers", emoji: "⚙️" },
  { href: "/admin/uploads", label: "Uploads", emoji: "⤴️" },
];

export default function Nav() {
  const pathname = usePathname();

  const links = useMemo(() => {
    return items.map((it) => {
      const active =
        pathname === it.href || (pathname?.startsWith(it.href + "/") ?? false);

      const base =
        "flex items-center gap-2 px-3 py-2 rounded-md border text-sm";
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
  }, [pathname]);

  return (
    <nav className="flex flex-col gap-2 p-4">
      {links}
    </nav>
  );
}
