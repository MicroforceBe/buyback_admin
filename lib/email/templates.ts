// lib/emailTemplates.ts
import { supabaseAdmin } from "@/lib/supabaseAdmin"; import type { Status } from "@/app/admin/leads/actions"; // of waar jouw Status-type staat

type SettingsRow = {
  brand_name: string | null;
  brand_color: string | null;
  logo_url: string | null;
  email_disclaimer: string | null;
};

type EmailTemplateRow = {
  key: string;
  language: string;
  subject: string | null;
  body_html: string | null;
  body_text: string | null;
};

export type TemplateContext = {
  status: Status;
  language: string;

  // klant / order
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  order_code?: string | null;
  order_date?: string | null; // als string geformatteerd

  // dingen die je nu waarschijnlijk al hebt
  details_table_html?: string;
  delivery_block_html?: string;
  payout_block_html?: string;
  next_steps_html?: string;
};

type RenderedEmail = {
  subject: string;
  html: string;
  text?: string;
};

/**
 * Helper om settings (brand + disclaimer) op te halen  */ async function loadSettings(): Promise<SettingsRow> {
  const { data } = await supabaseAdmin
    .from("buyback_settings")
    .select("brand_name, brand_color, logo_url, email_disclaimer")
    .eq("id", 1)
    .single();

  return {
    brand_name: data?.brand_name ?? "",
    brand_color: data?.brand_color ?? "",
    logo_url: data?.logo_url ?? "",
    email_disclaimer: data?.email_disclaimer ?? "",
  };
}

/**
 * Haalt template voor een bepaalde key + language op,
 * met eenvoudige fallback naar 'nl' en/of eerste gevonden rij.
 */
async function loadTemplate(
  key: string,
  language: string
): Promise<EmailTemplateRow | null> {
  // 1. proberen exacte match key + language
  const { data, error } = await supabaseAdmin
    .from("buyback_email_templates")
    .select("key, language, subject, body_html, body_text")
    .eq("key", key)
    .eq("language", language)
    .maybeSingle();

  if (data && !error) return data as EmailTemplateRow;

  // 2. fallback: zelfde key, 'nl'
  if (language !== "nl") {
    const { data: dataNl } = await supabaseAdmin
      .from("buyback_email_templates")
      .select("key, language, subject, body_html, body_text")
      .eq("key", key)
      .eq("language", "nl")
      .maybeSingle();

    if (dataNl) return dataNl as EmailTemplateRow;
  }

  // 3. fallback: eerste rij met deze key
  const { data: anyLang } = await supabaseAdmin
    .from("buyback_email_templates")
    .select("key, language, subject, body_html, body_text")
    .eq("key", key)
    .limit(1)
    .maybeSingle();

  if (anyLang) return anyLang as EmailTemplateRow;

  return null;
}

/**
 * Vervangt {{placeholders}} in subject/body  */ function replacePlaceholders(
  template: string,
  vars: Record<string, string | undefined>
): string {
  return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, name) => {
    const v = vars[name];
    return v == null ? "" : v;
  });
}

/**
 * Bouwt de variabelen voor de placeholders ({{first_name}}, {{order_code}}, ...)  */ function buildVariables(ctx: TemplateContext, settings: SettingsRow) {
  const full_name =
    (ctx.first_name ?? "") || (ctx.last_name ?? "")
      ? [ctx.first_name, ctx.last_name].filter(Boolean).join(" ")
      : "";

  return {
    // contact
    first_name: ctx.first_name ?? "",
    last_name: ctx.last_name ?? "",
    full_name,
    email: ctx.email ?? "",

    // order
    order_code: ctx.order_code ?? "",
    order_date: ctx.order_date ?? "",
    status: ctx.status ?? "",

    // branding
    brand_name: settings.brand_name ?? "",
    logo_url: settings.logo_url ?? "",

    // blocks (HTML)
    details_table: ctx.details_table_html ?? "",
    delivery_block: ctx.delivery_block_html ?? "",
    payout_block: ctx.payout_block_html ?? "",
    next_steps: ctx.next_steps_html ?? "",

    // disclaimer
    disclaimer_html: settings.email_disclaimer ?? "",
  };
}

/**
 * Publieke helper: haal template op voor een status-key (bv. 'check_passed')
 * en render subject + html + text.
 */
export async function renderStatusEmail(
  statusKey: Status,
  ctx: TemplateContext
): Promise<RenderedEmail | null> {
  const [settings, template] = await Promise.all([
    loadSettings(),
    loadTemplate(statusKey, ctx.language || "nl"),
  ]);

  if (!template) {
    // geen rij in DB -> je kan hier fallback tekst hardcoden indien gewenst
    return null;
  }

  const vars = buildVariables(ctx, settings);

  const subjectRaw = template.subject || "";
  const htmlRaw = template.body_html || "";
  const textRaw = template.body_text || "";

  const subject = replacePlaceholders(subjectRaw, vars);
  const html = replacePlaceholders(htmlRaw, vars);
  const text = textRaw ? replacePlaceholders(textRaw, vars) : undefined;

  return { subject, html, text };
}
