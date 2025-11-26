"use server";

import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { AdminFeature } from "./adminPermissions";

export type AdminRole = "admin" | "user";

export type AdminPermissions = {
  [K in AdminFeature]?: {
    read?: boolean;
    write?: boolean;
  };
};

type RawAdminUserRow = {
  email: string;
  role: AdminRole | null;
  permissions: any | null;
};

export type AdminUser = {
  email: string;
  role: AdminRole;
  permissions: AdminPermissions;
};

const ALL_FEATURES: AdminFeature[] = [
  "dashboard",
  "leads",
  "catalog",
  "multipliers",
  "uploads",
  "settings",
];

function normalizePermissions(
  raw: any,
  role: AdminRole
): AdminPermissions {
  const base: AdminPermissions = {};

  // Admins: altijd full access, ongeacht JSON
  if (role === "admin") {
    for (const f of ALL_FEATURES) {
      base[f] = { read: true, write: true };
    }
  }

  if (!raw || typeof raw !== "object") return base;

  for (const f of ALL_FEATURES) {
    const src = raw[f];
    if (!src || typeof src !== "object") continue;

    const current = base[f] ?? {};
    base[f] = {
      read: src.read ?? current.read ?? false,
      write: src.write ?? current.write ?? false,
    };
  }

  return base;
}

/**
 * Bepaalt de huidige admin-user op basis van een login-cookie + Supabase-row.
 * - Cookie: bb_admin_email
 * - Tabel: buyback_admin_users (email, role, permissions)
 */
export async function getCurrentAdminUser(): Promise<AdminUser | null> {
  const cookieStore = cookies();
  const emailCookie = cookieStore.get("bb_admin_email")?.value;

  const email = emailCookie?.trim().toLowerCase();
  if (!email) {
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from("buyback_admin_users")
    .select("email, role, permissions")
    .eq("email", email)
    .maybeSingle();

  if (error) {
    console.error("[ADMIN_AUTH] error loading admin user:", error.message);
    return null;
  }

  if (!data) {
    // cookie wijst naar user die niet (meer) bestaat
    return null;
  }

  const row = data as RawAdminUserRow;

  const role: AdminRole = row.role ?? "user";
  const permissions = normalizePermissions(row.permissions, role);

  return {
    email: row.email.toLowerCase(),
    role,
    permissions,
  };
}
