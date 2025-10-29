"use server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

type BrandingPayload = {
  brand_name: string | null;
  email_disclaimer: string | null;
  logo_url: string | null;
};

export async function actionSaveBranding(formData: FormData) {
  const payload: BrandingPayload = {
    brand_name: (formData.get("brand_name") as string | null) ?? null,
    email_disclaimer: (formData.get("email_disclaimer") as string | null) ?? null,
    logo_url: (formData.get("logo_url") as string | null) ?? null,
  };

  try {
    // Gebruik altijd id=1 (INTEGER) om één enkele settings-rij te beheren
    const { error } = await supabaseAdmin
      .from("buyback_settings")
      .upsert([{ id: 1, ...payload }], { onConflict: "id" });

    if (error) {
      console.error("[SETTINGS][branding] upsert error:", {
        code: (error as any)?.code,
        details: (error as any)?.details,
        hint: (error as any)?.hint,
        message: error.message,
      });
      throw new Error(error.message);
    }

    console.info("[SETTINGS][branding] saved:", payload);
    return { ok: true as const };
  } catch (e: any) {
    console.error("[SETTINGS][branding] action error:", e?.message || e);
    return { ok: false as const, error: String(e?.message || e) };
  }
}
