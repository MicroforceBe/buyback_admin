// lib/getCurrentAdminUser.ts
"use server";

import { cookies } from "next/headers";
import { ALL_FEATURES } from "@/lib/adminPermissions";
import { validSessionTime } from "@/lib/security/policy";
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
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("bb_admin_session")?.value;

  if (!sessionToken || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionToken)) return null;


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
    return null;
  }

  if (!validSessionTime(data.expires_at, data.revoked_at)) return null;

  const relation = (data as any).user;
  const user = (Array.isArray(relation) ? relation[0] : relation) as RawAdminUserRow | null;
  if (!user || user.is_active !== true || !["admin", "user"].includes(user.role || "")) {
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



