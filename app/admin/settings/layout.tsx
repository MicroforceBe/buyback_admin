"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/admin/settings", label: "Branding", emoji: "🎨", exact: true },
  { href: "/admin/settings/email-templates", label: "Email templates", emoji: "✉️" },
  { href: "/admin/settings/shops", label: "Shops", emoji: "🏬" },
  { href: "/admin/settings/users", label: "Users", emoji: "👤" },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Settings</h1>
      </div>

      <div className="flex gap-2 border-b border-gray-200">
        {tabs.map((t) => {
          const active = t.exact ? pathname === t.href : pathname?.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`px-3 py-2 text-sm border-b-2 -mb-px ${
                active
                  ? "border-gray-900 text-gray-900 font-medium"
                  : "border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300"
              }`}
              aria-current={active ? "page" : undefined}
            >
              <span className="mr-1">{t.emoji}</span>
              {t.label}
            </Link>
          );
        })}
      </div>

      {/* Tab content */}
      <div>{children}</div>
    </div>
  );
}
