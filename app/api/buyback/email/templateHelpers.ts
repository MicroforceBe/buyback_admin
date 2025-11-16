// app/api/buyback/email/templateHelpers.ts
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type TemplateRow = {
  subject: string;
  body_html: string;
};

/**
 * Haal template op uit buyback_email_templates, op basis van key + language,
 * en vervang {{placeholders}} met de meegegeven vars.
 */
export async function renderEmailTemplate(
  key: string,
  language: string,
  vars: Record<string, string>
): Promise<{ subject: string; html: string } | null> {
  const lang = (language || "nl").split("-")[0].toLowerCase(); // 'nl-BE' -> 'nl'

  const { data, error } = await supabaseAdmin
    .from("buyback_email_templates")
    .select("subject, body_html")
    .eq("key", key)
    .eq("language", lang)
    .maybeSingle<TemplateRow>();

  if (error || !data) {
    console.warn("[MAIL][template] not found", { key, lang, error: error?.message });
    return null;
  }

  const replace = (input: string): string =>
    input.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_m, name) => {
      const v = vars[name] ?? "";
      return v;
    });

  return {
    subject: replace(data.subject),
    html: replace(data.body_html),
  };
}
