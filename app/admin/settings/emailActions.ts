// app/admin/settings/emailActions.ts
"use server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { revalidatePath } from "next/cache";

export async function saveEmailTemplateAction(formData: FormData) {
  "use server";

  const idRaw = (formData.get("template_id") as string | null) ?? "";
  // id=0 (nieuwe template) => undefined, zodat DB zelf een id kan geven
  const id = idRaw && idRaw !== "0" ? Number(idRaw) : undefined;

  const keyInput =
    ((formData.get("template_key") as string | null) ?? "").trim();
  const languageInput =
    ((formData.get("template_language") as string | null) ?? "nl").trim() ||
    "nl";
  const subject = (formData.get("subject") as string | null) ?? "";
  const body_html = (formData.get("body_html") as string | null) ?? "";
  const body_text = (formData.get("body_text") as string | null) ?? "";

  if (!keyInput) {
    return { ok: false as const, message: "Template key ontbreekt." };
  }

  const key = keyInput;
  const language = languageInput;

  // Alleen de kernkolommen wegschrijven (verwachte schema)
  const payload: any = {
    key,
    language,
    subject,
    body_html,
    body_text,
    updated_at: new Date().toISOString(),
  };
  if (id && Number.isFinite(id)) {
    payload.id = id;
  }

  try {
    const { error } = await supabaseAdmin
      .from("buyback_email_templates")
      .upsert(payload);

    if (error) {
      console.error("[SETTINGS][email-templates] upsert error:", error);
      return { ok: false as const, message: error.message };
    }
  } catch (e: any) {
    console.error(
      "[SETTINGS][email-templates] upsert exception:",
      e?.message || e
    );
    return {
      ok: false as const,
      message: "Onbekende fout bij bewaren van template.",
    };
  }

  revalidatePath("/admin/settings");
  return { ok: true as const, message: "Template bewaard." };
}
