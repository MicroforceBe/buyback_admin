// lib/requireAdminUser.ts

import { redirect } from "next/navigation";
import { getCurrentAdminUser } from "@/lib/getCurrentAdminUser";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function requireAdminUser() {
  const user = await getCurrentAdminUser();

  if (!user) {
    redirect("/admin/login");
  }

  const email = String((user as any).email || "").trim().toLowerCase();

  if (!email) {
    redirect("/admin/login");
  }

  const { data, error } = await supabaseAdmin
    .from("buyback_admin_users")
    .select("role")
    .eq("email", email)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[ADMIN GUARD] role lookup error", error);
  }

  const role = String(data?.role || (user as any).role || "").toLowerCase();

  if (role !== "admin") {
    redirect("/admin/erp/articles");
  }

  return user;
}
