// lib/buybackSettings.ts
"use server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type NotificationSettings = {
  finance_email: string | null;
  new_order_email: string | null;
  brand_name: string;
};

export async function getNotificationSettings(): Promise<NotificationSettings> {
  const { data, error } = await supabaseAdmin
    .from("buyback_settings")
    .select("finance_email, new_order_email, brand_name")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    console.warn("[SETTINGS][notifications] load error:", error.message);
  }

  return {
    finance_email: (data?.finance_email as string | null) || null,
    new_order_email: (data?.new_order_email as string | null) || null,
    brand_name:
      (data?.brand_name as string | null) || "Microforce Buyback",
  };
}
