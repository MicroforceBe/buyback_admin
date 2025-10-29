"use server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * Server Action om branding & e-mail instellingen te bewaren.
 * Pas veldnamen/tabel aan je schema aan (hier: 'buyback_settings' met id='branding').
 */
export async function actionSaveBranding(formData: FormData) {
  const brand_name = (formData.get("brand_name") as string | null) ?? null;
  const email_disclaimer = (formData.get("email_disclaimer") as string | null) ?? null;
  const logo_url = (formData.get("logo_url") as string | null) ?? null;

  // Bewaar centraal in 1 rij (id = 'branding'); wijzig naar je eigen schema indien nodig.
  const { error } = await supabaseAdmin
    .from("buyback_settings")
    .upsert(
      [{ id: "branding", brand_name, email_disclaimer, logo_url }],
      { onConflict: "id" }
    );

  if (error) {
    console.error("[SETTINGS][branding] upsert error:", error);
    throw new Error(error.message);
  }
}
