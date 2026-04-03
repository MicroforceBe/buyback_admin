//lib/email/templates.ts
"use server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type BuybackStatus =
  | "new"
  | "label_created"
  | "reminder_1_dropoff"
  | "reminder_2_dropoff"
  | "reminder_3_dropoff"
  | "received_store"
  | "reminder_1_ship"
  | "reminder_2_ship"
  | "reminder_3_ship"
  | "shipment_received"
  | "check_passed"
  | "check_failed_technical"
  | "check_failed_grading"
  | "done";

export type TemplateContext = {
  // basis
  first_name?: string | null;
  last_name?: string | null;
  order_code?: string | null;
  email?: string | null;

  // toestel
  model?: string | null;
  variant?: string | null;
  capacity_gb?: number | null;

  // prijs / uitbetaling
  final_price_cents?: number | null;
  wants_voucher?: boolean | null;
  iban?: string | null;

  // levering / shop
  delivery_method?: string | null;
  shop_location?: string | null;
  shop_address1?: string | null;
  shop_zip?: string | null;
  shop_city?: string | null;
  opening_hours?: Record<string, string> | null;

  // tracking / label
  tracking_code?: string | null;
  tracking_url?: string | null;
  label_pdf_url?: string | null;

  // HTML met vragen/antwoorden uit lead
  questions_answers_html?: string | null;
};

type BrandSettings = {
  brand_name: string;
  brand_color: string;
  logo_url: string | null;
  email_disclaimer: string | null;
};

type EmailTemplateRow = {
  id: number;
  key: string;
  language: string;
  subject: string | null;
  body_html: string | null;
};

export type RenderStatusEmailOptions = {
  status: BuybackStatus;
  language?: string;
  context: TemplateContext;
};

/* ========== Helpers ========== */

async function getBrandSettings(): Promise<BrandSettings> {
  const { data, error } = await supabaseAdmin
    .from("buyback_settings")
    .select("brand_name, brand_color, logo_url, email_disclaimer")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    console.warn("[EMAIL][settings] load error:", error.message);
  }

  return {
    brand_name: (data?.brand_name as string | null) || "Microforce Buyback",
    brand_color: (data?.brand_color as string | null) || "#0EA5E9",
    logo_url: (data?.logo_url as string | null) || null,
    email_disclaimer: (data?.email_disclaimer as string | null) || null,
  };
}

async function getStatusTemplate(
  status: BuybackStatus,
  language: string
): Promise<EmailTemplateRow | null> {
  const { data, error } = await supabaseAdmin
    .from("buyback_email_templates")
    .select("id, key, language, subject, body_html")
    .eq("key", status)
    .eq("language", language)
    .maybeSingle();

  if (error) {
    console.error(
      "[EMAIL][templates] load error:",
      status,
      language,
      error.message
    );
    return null;
  }

  if (!data) {
    if (language !== "nl") {
      const { data: fallback, error: fbErr } = await supabaseAdmin
        .from("buyback_email_templates")
        .select("id, key, language, subject, body_html")
        .eq("key", status)
        .eq("language", "nl")
        .maybeSingle();

      if (fbErr) {
        console.error(
          "[EMAIL][templates] fallback load error:",
          status,
          fbErr.message
        );
        return null;
      }
      return (fallback as EmailTemplateRow | null) || null;
    }
    return null;
  }

  return data as EmailTemplateRow;
}

function nl2br(text: string | null | undefined): string {
  if (!text) return "";
  return text.replace(/\r\n|\r|\n/g, "<br/>");
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatCurrency(
  cents?: number | null,
  locale: string = "nl-BE",
  currency: string = "EUR"
): string {
  if (cents == null) return "";
  const eur = cents / 100;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(eur);
  } catch {
    return `${eur.toFixed(2)} €`;
  }
}

/**
 * Bouwt reusable HTML-snippers
 */
function buildBlocks(
  status: BuybackStatus,
  ctx: TemplateContext,
  brand: BrandSettings
) {
  const full_name = `${ctx.first_name || ""} ${ctx.last_name || ""}`.trim();

  const header = `
    <div style="margin-bottom:16px;">
      ${
        brand.logo_url
          ? `<img src="${brand.logo_url}" alt="${escapeHtml(
              brand.brand_name
            )}" style="max-height:40px;margin-bottom:12px;"/>`
          : `<h1 style="margin:0;font-size:20px;color:#0f172a;">${escapeHtml(
              brand.brand_name
            )}</h1>`
      }
    </div>
  `;

  const priceStr = formatCurrency(ctx.final_price_cents ?? null);

  let deviceLabel = "";
  const deviceParts: string[] = [];
  if (ctx.model) deviceParts.push(ctx.model);
  if (ctx.variant) deviceParts.push(ctx.variant);
  deviceLabel = deviceParts.join(" – ");
  if (ctx.capacity_gb) {
    deviceLabel = deviceLabel
      ? `${deviceLabel} (${ctx.capacity_gb} GB)`
      : `${ctx.capacity_gb} GB`;
  }

  const details_table = `
    <table style="border-collapse:collapse;width:100%;margin:16px 0;font-size:14px;">
      <tbody>
        ${
          deviceLabel
            ? `<tr>
                <td style="padding:6px 8px;border:1px solid #e5e7eb;width:30%;color:#6b7280;">Toestel</td>
                <td style="padding:6px 8px;border:1px solid #e5e7eb;">${escapeHtml(
                  deviceLabel
                )}</td>
              </tr>`
            : ""
        }
        ${
          priceStr
            ? `<tr>
                <td style="padding:6px 8px;border:1px solid #e5e7eb;width:30%;color:#6b7280;">Indicatieve prijs</td>
                <td style="padding:6px 8px;border:1px solid #e5e7eb;">${escapeHtml(
                  priceStr
                )}</td>
              </tr>`
            : ""
        }
        ${
          ctx.order_code
            ? `<tr>
                <td style="padding:6px 8px;border:1px solid #e5e7eb;width:30%;color:#6b7280;">Ordercode</td>
                <td style="padding:6px 8px;border:1px solid #e5e7eb;">${escapeHtml(
                  ctx.order_code
                )}</td>
              </tr>`
            : ""
        }
      </tbody>
    </table>
  `;

  let delivery_block = "";

  const isDropoff = ctx.delivery_method === "dropoff" || ctx.delivery_method === "store";
  const isShip = ctx.delivery_method === "ship";

  if (isDropoff) {
    const addr = [ctx.shop_address1, ctx.shop_zip, ctx.shop_city]
      .filter(Boolean)
      .join(" ");

    delivery_block = `
      <h3 style="margin:18px 0 6px;font-size:14px;">Binnenbrengen in de winkel</h3>
      <p style="margin:0 0 10px;">
        Breng je toestel binnen bij ${
          ctx.shop_location
            ? escapeHtml(ctx.shop_location)
            : "de geselecteerde winkel"
        }.
      </p>
      ${
        addr
          ? `<p style="margin:0 0 10px;color:#475569;">Adres: ${escapeHtml(
              addr
            )}</p>`
          : ""
      }
    `;
  } else if (isShip) {
    const labelUrl = ctx.label_pdf_url || "";
    const trackUrl = ctx.tracking_url || "";

    delivery_block = `
      <div style="margin:20px 0;padding:16px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;">
        <h3 style="margin:0 0 8px;font-size:14px;">Verzending</h3>
        <p style="margin:0 0 12px;font-size:14px;color:#374151;">
          Je koos voor <strong>gratis verzending</strong> van jouw toestel naar ons.
          Hieronder vind je je verzendlabel.
        </p>
        ${
          labelUrl
            ? `<a href="${labelUrl}"
                 style="display:inline-block;margin:0 0 10px;padding:10px 14px;background:${brand.brand_color};color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">
                 Verzendlabel downloaden
               </a>`
            : ""
        }
        ${
          trackUrl
            ? `<a href="${trackUrl}"
                 style="display:inline-block;padding:10px 14px;background:#111827;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">
                 Jouw pakket volgen
               </a>`
            : ""
        }
      </div>
    `;
  }

  let payout_block = "";
  if (ctx.wants_voucher) {
    payout_block = `
      <p style="margin:0 0 10px;">
        Je hebt gekozen voor uitbetaling via <strong>voucher</strong>. Na een succesvolle controle ontvang je een voucher ter waarde van ${escapeHtml(
          priceStr || ""
        )}.
      </p>
    `;
  } else {
    payout_block = `
      <p style="margin:0 0 10px;">
        Je hebt gekozen voor uitbetaling via <strong>bankoverschrijving</strong>.
      </p>
      ${
        ctx.iban
          ? `<p style="margin:0 0 10px;color:#475569;">Rekeningnummer (IBAN): ${escapeHtml(
              ctx.iban
            )}</p>`
          : ""
      }
    `;
  }

  let next_steps = "";
  switch (status) {
    case "new":
      next_steps = `
        <h3 style="margin:18px 0 6px;font-size:14px;">Volgende stappen</h3>
        <p style="margin:0 0 10px;">
          Volg de instructies in deze e-mail om je toestel binnen te brengen of op te sturen.
          Na ontvangst en controle brengen we je verder op de hoogte.
        </p>
      `;
      break;

    case "label_created":
      next_steps = `
        <h3 style="margin:18px 0 6px;font-size:14px;">Volgende stappen</h3>
        <p style="margin:0 0 10px;">
          Print het verzendlabel, verpak je toestel veilig en geef het pakket af bij een verzendpunt.
        </p>
      `;
      break;

    case "reminder_1_dropoff":
    case "reminder_2_dropoff":
    case "reminder_3_dropoff":
      next_steps = `
        <h3 style="margin:18px 0 6px;font-size:14px;">Herinnering</h3>
        <p style="margin:0 0 10px;">
          We wachten nog op je toestel in de winkel. Breng het toestel binnen om je buyback-aanvraag verder te verwerken.
        </p>
      `;
      break;

    case "received_store":
      next_steps = `
        <h3 style="margin:18px 0 6px;font-size:14px;">Volgende stappen</h3>
        <p style="margin:0 0 10px;">
          Je toestel werd ontvangen in de winkel. Onze techniekers voeren binnenkort de controle uit.
        </p>
      `;
      break;

    case "reminder_1_ship":
    case "reminder_2_ship":
    case "reminder_3_ship":
      next_steps = `
        <h3 style="margin:18px 0 6px;font-size:14px;">Herinnering</h3>
        <p style="margin:0 0 10px;">
          We wachten nog op je verzending. Gebruik je verzendlabel en stuur je toestel naar ons op.
        </p>
      `;
      break;

    case "shipment_received":
      next_steps = `
        <h3 style="margin:18px 0 6px;font-size:14px;">Volgende stappen</h3>
        <p style="margin:0 0 10px;">
          Je toestel is aangekomen. Onze techniekers voeren binnenkort de controle uit.
        </p>
      `;
      break;

    case "check_passed":
      next_steps = `
        <h3 style="margin:18px 0 6px;font-size:14px;">Volgende stappen</h3>
        <p style="margin:0 0 10px;">
          De controle is geslaagd. We verwerken je uitbetaling zo snel mogelijk.
        </p>
      `;
      break;

    case "check_failed_technical":
      next_steps = `
        <h3 style="margin:18px 0 6px;font-size:14px;">Volgende stappen</h3>
        <p style="margin:0 0 10px;">
          Tijdens de controle werd een technisch defect vastgesteld. Je wordt apart gecontacteerd over het verdere verloop.
        </p>
      `;
      break;

    case "check_failed_grading":
      next_steps = `
        <h3 style="margin:18px 0 6px;font-size:14px;">Volgende stappen</h3>
        <p style="margin:0 0 10px;">
          Tijdens de controle werd een afwijking in de gradering vastgesteld. Je wordt apart gecontacteerd over het verdere verloop.
        </p>
      `;
      break;

    case "done":
      next_steps = `
        <h3 style="margin:18px 0 6px;font-size:14px;">Volgende stappen</h3>
        <p style="margin:0 0 10px;">
          Je buyback-aanvraag werd volledig afgehandeld. Bedankt!
        </p>
      `;
      break;
  }

  const disclaimer_html = brand.email_disclaimer
    ? nl2br(brand.email_disclaimer)
    : "";

  const questions_answers = ctx.questions_answers_html || "";

  return {
    full_name,
    header,
    details_table,
    delivery_block,
    payout_block,
    next_steps,
    disclaimer_html,
    brand_name: brand.brand_name,
    questions_answers,
  };
}

function renderWithPlaceholders(
  text: string,
  replacements: Record<string, string>
): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const k = key as keyof typeof replacements;
    const v = replacements[k];
    return v != null ? v : "";
  });
}

/* ========== Publieke functie ========== */

export async function renderStatusEmail(
  options: RenderStatusEmailOptions
): Promise<{ subject: string; html: string }> {
  const language = options.language || "nl";
  const status = options.status;
  const ctx = options.context;

  const [brand, template] = await Promise.all([
    getBrandSettings(),
    getStatusTemplate(status, language),
  ]);

  if (!template) {
    const fallbackSubject = `[${brand.brand_name}] Update buyback-order ${
      ctx.order_code || ""
    }`;
    const fallbackHtml = `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;line-height:1.55;color:#0f172a">
        <p>Beste ${escapeHtml(
          `${ctx.first_name || ""} ${ctx.last_name || ""}`.trim() || "klant"
        )},</p>
        <p>De status van je buyback-aanvraag is gewijzigd naar: <strong>${escapeHtml(
          status
        )}</strong>.</p>
      </div>
    `;
    return { subject: fallbackSubject, html: fallbackHtml };
  }

  const blocks = buildBlocks(status, ctx, brand);

  const subjectTemplate = template.subject || "";
  const bodyTemplate = template.body_html || "";

  const replacements: Record<string, string> = {
    first_name: ctx.first_name || "",
    last_name: ctx.last_name || "",
    full_name: blocks.full_name || "",
    order_code: ctx.order_code || "",
    email: ctx.email || "",
    model: ctx.model || "",
    variant: ctx.variant || "",
    capacity_gb: ctx.capacity_gb != null ? String(ctx.capacity_gb) : "",
    final_price: formatCurrency(ctx.final_price_cents ?? null),
    brand_name: brand.brand_name,
    brand_color: brand.brand_color,
    logo_url: brand.logo_url || "",
    header: blocks.header,
    details_table: blocks.details_table,
    delivery_block: blocks.delivery_block,
    payout_block: blocks.payout_block,
    next_steps: blocks.next_steps,
    disclaimer_html: blocks.disclaimer_html,
    tracking_code: ctx.tracking_code || "",
    tracking_url: ctx.tracking_url || "",
    label_pdf_url: ctx.label_pdf_url || "",
    iban: ctx.iban || "",
    questions_answers: blocks.questions_answers || "",
    questions_answers_html: blocks.questions_answers || "",
  };

  const subject = renderWithPlaceholders(subjectTemplate, replacements);
  const html = renderWithPlaceholders(bodyTemplate, replacements);

  return { subject, html };
}
