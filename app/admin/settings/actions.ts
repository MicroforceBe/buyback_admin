"use server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function actionSaveBranding(formData: FormData) {
  try {
    const payload = {
      key: "branding",
      brand_name: (formData.get("brand_name") as string)?.trim() || null,
      logo_url: (formData.get("logo_url") as string)?.trim() || null,
      mail_brand_name: (formData.get("mail_brand_name") as string)?.trim() || null,
      mail_from: (formData.get("mail_from") as string)?.trim() || null,
      mail_reply_to: (formData.get("mail_reply_to") as string)?.trim() || null,
      email_disclaimer_html:
        (formData.get("email_disclaimer_html") as string)?.trim() || null,
    };

    const { error } = await supabaseAdmin
      .from("buyback_settings")
      .upsert(payload, { onConflict: "key" });

    if (error) {
      console.error("[SETTINGS][branding] upsert error:", error);
      throw new Error(error.message);
    }
  } catch (e: any) {
    console.error("[SETTINGS][branding] save error:", e?.message || e);
    throw e;
  }
}
