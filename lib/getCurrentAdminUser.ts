// lib/getCurrentAdminUser.ts
"use server";

import { cookies, headers } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { AdminRole, AdminPermissions, AdminFeature } from "@/lib/adminPermissions";

export type AdminUser = {
  email: string;
  role: AdminRole;
  permissions: AdminPermissions;
};

type RawAdminUserRow = {
  email: string;
  role: AdminRole | null;
  permissions: any | null;
  is_active: boolean | null;
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

  // Admins: altijd full access
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
 * Haalt de huidige admin-user op via sessietoken in cookie.
 * - Cookie: bb_admin_session
 * - Tabel: buyback_admin_sessions + buyback_admin_users
 */
export async function getCurrentAdminUser(): Promise<AdminUser | null> {
  const cookieStore = cookies();
  const sessionToken = cookieStore.get("bb_admin_session")?.value;

  if (!sessionToken) return null;

  const now = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("buyback_admin_sessions")
    .select(
      `
      session_token,
      expires_at,
      revoked_at,
      user_email,
      user:buyback_admin_users (
        email,
        role,
        permissions,
        is_active
      )
    `
    )
    .eq("session_token", sessionToken)
    .maybeSingle();

  if (error || !data) {
    // Ongeldige sessie → cookie verwijderen?
    cookieStore.delete("bb_admin_session");
    return null;
  }

  const revoked = data.revoked_at;
  if (revoked) {
    cookieStore.delete("bb_admin_session");
    return null;
  }

  if (data.expires_at && data.expires_at < now) {
    cookieStore.delete("bb_admin_session");
    return null;
  }

  const user = (data as any).user as RawAdminUserRow | null;
  if (!user || user.is_active === false) {
    cookieStore.delete("bb_admin_session");
    return null;
  }

  const role: AdminRole = user.role ?? "user";
  const permissions = normalizePermissions(user.permissions, role);

  return {
    email: user.email.toLowerCase(),
    role,
    permissions,
  };
}
