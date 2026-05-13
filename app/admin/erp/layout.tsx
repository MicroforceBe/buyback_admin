// app/admin/erp/layout.tsx

import { redirect } from "next/navigation";
import { getCurrentAdminUser } from "@/lib/getCurrentAdminUser";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

async function getAdminRole() {
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
    console.error("[ERP] role lookup error", error);
  }

  return {
    user,
    role: String(data?.role || (user as any).role || "").toLowerCase(),
  };
}

export default async function ErpLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await getAdminRole();

  return <>{children}</>;
}
