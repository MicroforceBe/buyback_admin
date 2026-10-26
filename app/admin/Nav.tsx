"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import AdminIcon,{type AdminIconName} from "./AdminIcon";
import styles from "./AdminShell.module.css";

type NavPermissions = {
  dashboard?: boolean;
  leads?: boolean;
  refurb?: boolean;
  diagnostics?: boolean;
  erp?: boolean;
  catalog?: boolean;
  multipliers?: boolean;
  uploads?: boolean;
  settings?: boolean;
};

type Item = {
  href: string;
  label: string;
  icon: AdminIconName;
  permKey?: keyof NavPermissions;
  adminOnly?: boolean;
};

const items: Item[] = [
  {
    href: "/admin",
    label: "Dashboard",
    icon: "dashboard",
    permKey: "dashboard",
  },

  {
    href: "/admin/leads",
    label: "Leads",
    icon: "leads",
    permKey: "leads",
  },

  {
    href: "/admin/refurb",
    label: "Refurb",
    icon: "refurb",
    permKey: "refurb",
  },

  {
    href: "/admin/diagnostics",
    label: "Diagnostics",
    icon: "diagnostics",
    permKey: "diagnostics",
    adminOnly: true,
  },

  {
    href: "/admin/erp",
    label: "ERP",
    icon: "erp",
    permKey: "erp",
  },

  {
    href: "/admin/catalog",
    label: "Catalogus",
    icon: "catalog",
    permKey: "catalog",
  },

  {
    href: "/admin/multipliers",
    label: "Multipliers",
    icon: "multipliers",
    permKey: "multipliers",
  },

  {
    href: "/admin/uploads",
    label: "Uploads",
    icon: "uploads",
    permKey: "uploads",
  },

  {
    href: "/admin/settings",
    label: "Instellingen",
    icon: "settings",
    permKey: "settings",
  },
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
        if (it.adminOnly && role !== "admin") {
          return false;
        }

        if (
          it.permKey &&
          permissions &&
          permissions[it.permKey] === false
        ) {
          return false;
        }

        if (role === "technician") {
          const allowed = [
            "/admin",
            "/admin/leads",
            "/admin/refurb",
          ];

          return allowed.includes(it.href);
        }

        return true;
      })

      .map((it) => {
        const active =
          pathname === it.href ||
          (it.href !== "/admin" && (pathname?.startsWith(it.href + "/") ?? false));

        return (
          <Link
            key={it.href}
            href={it.href}
            title={it.label}
            aria-label={it.label}
            aria-current={
              active ? "page" : undefined
            }
            className={styles.navLink}
            prefetch={false}
          >
            <AdminIcon name={it.icon} size={19}/>
            <span>{it.label}</span>
          </Link>
        );
      });
  }, [pathname, permissions, role]);

  return (
    <nav className={styles.nav} aria-label="Modules">
      <div className={styles.navHeading}>Werkruimte</div>
      <div className={styles.navLinks}>{links}</div>
    </nav>
  );
}

