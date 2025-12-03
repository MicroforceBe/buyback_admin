// app/api/buyback/email/templateHelpers.ts
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type TemplateRow = {
  subject: string;
  body_html: string;
};

/** Kleine helper om HTML-entiteiten terug naar echte tekens te zetten */
function unescapeHtml(str: string): string {
  return str
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/**
 * Haal template op uit buyback_email_templates, op basis van key + language,
 * en vervang {{placeholders}} met de meegegeven vars.
 *
 * Voor alle variabelen:
 * - gewone tekst: gewoon als string injecteren
 * - "HTML-blokken" (zoals disclaimer_html, details_table, …):
 *     - eerst HTML-entiteiten unescapen
 *     - dan als ruwe HTML in de template
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

  // Alle placeholders waarvan de waarde HTML mag bevatten
  const HTML_KEYS = new Set([
    "details_table",
    "delivery_block",
    "payout_block",
    "next_steps",
    "disclaimer_html",
    "disclaimer",          // fallback-name
    "delivery_block_html",
    "payout_block_html",
    "next_steps_html",
  ]);

  const replace = (input: string): string =>
    input.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_m, name) => {
      const raw = vars[name];
      if (raw == null) return "";

      const value = String(raw);

      // Als de placeholder bedoeld is voor HTML → eerst unescapen, dan rechtstreeks invoegen
      if (HTML_KEYS.has(name) || name.endsWith("_html")) {
        return unescapeHtml(value);
      }

      // Andere variabelen gewoon als tekst (zonder extra escaping hier;
      // de template zelf is HTML en deze waarden zijn meestal plain text)
      return value;
    });

  return {
    subject: replace(data.subject),
    html: replace(data.body_html),
  };
}
