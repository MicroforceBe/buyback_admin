// lib/email/sendStatusMail.ts
import { Resend } from "resend";
import {
  BuybackStatus,
  TemplateContext,
  renderStatusEmail,
} from "@/lib/email/templates";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  buildEmailBlocks,
  type EmailBlocksInput,
} from "@/lib/email/buildBlocks";

const resend = new Resend(process.env.RESEND_API_KEY || "");

export type LeadForEmail = {
  status: BuybackStatus;
  language?: string | null;
  customer_email: string;
  first_name?: string | null;
  last_name?: string | null;
  order_code?: string | null;
  created_at?: string | null;

  model?: string | null;
  capacity_gb?: number | null;
  final_price_cents?: number | null;

  delivery_method?: string | null;
  shop_location?: string | null;

  wants_voucher?: boolean | null;
  iban?: string | null;

  tracking_url?: string | null;
  label_pdf_url?: string | null;
};

// Haal brand_name op voor weergavenaam in de from-header
async function loadBrandSettings() {
  const { data } = await supabaseAdmin
    .from("buyback_settings")
    .select("brand_name")
    .eq("id", 1)
    .single();

  return {
    brand_name: data?.brand_name || "Buyback",
  };
}

function buildFromHeader(brandName: string): string {
  const raw = process.env.MAIL_FROM;

  if (!raw) {
    console.warn(
      "[MAIL] MAIL_FROM is niet gezet, fallback naar dummy-from. Stel MAIL_FROM in in je environment."
    );
    return `${brandName} <noreply@example.com>`;
  }

  // Als MAIL_FROM al de vorm 'Naam <email@domein>' heeft -> gebruik 1-op-1
  if (raw.includes("<") && raw.includes(">")) {
    return raw;
  }

  // Anders gaan we ervan uit dat het een kaal e-mailadres is
  return `${brandName} <${raw}>`;
}

export async function sendStatusMail(lead: LeadForEmail) {
  if (!lead.customer_email) {
    console.warn("[MAIL] geen customer_email — mail niet verstuurd");
    return;
  }

  const language = lead.language || "nl";

  const brand = await loadBrandSettings();
  const from = buildFromHeader(brand.brand_name);

  // 1) Blocks opbouwen (details, levering, uitbetaling, next steps)
  const blocksInput: EmailBlocksInput = {
    status: lead.status,
    model: lead.model,
    capacity_gb: lead.capacity_gb,
    final_price_cents: lead.final_price_cents,
    delivery_method: lead.delivery_method,
    shop_location: lead.shop_location,
    wants_voucher: lead.wants_voucher,
    iban: lead.iban,
    tracking_url: lead.tracking_url,
    label_pdf_url: lead.label_pdf_url,
  };

  const blocks = buildEmailBlocks(blocksInput);

  // 2) Context voor template rendering
  const ctx: TemplateContext = {
    status: lead.status,
    language,
    first_name: lead.first_name,
    last_name: lead.last_name,
    email: lead.customer_email,
    order_code: lead.order_code,
    order_date: lead.created_at
      ? new Date(lead.created_at).toLocaleDateString("nl-BE")
      : "",
    details_table_html: blocks.details_table_html,
    delivery_block_html: blocks.delivery_block_html,
    payout_block_html: blocks.payout_block_html,
    next_steps_html: blocks.next_steps_html,
  };

  const rendered = await renderStatusEmail(lead.status, ctx);
  if (!rendered) {
    console.warn(
      "[MAIL] Geen template gevonden voor status",
      lead.status,
      "(language:",
      language + ")"
    );
    return;
  }

  await resend.emails.send({
    from,
    to: lead.customer_email,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });
}
