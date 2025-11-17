// lib/email/sendStatusEmail.ts
import { Resend } from "resend";
import {
  BuybackStatus,
  TemplateContext,
  renderStatusEmail,
} from "@/lib/email/templates";

const resend = new Resend(process.env.RESEND_API_KEY || "");

export type LeadForEmail = {
  status: BuybackStatus;
  language?: string | null;
  customer_email: string;
  first_name?: string | null;
  last_name?: string | null;
  order_code?: string | null;
  created_at?: string | null;

  // optioneel: als je hier ooit HTML-blocks wil meegeven
  details_table_html?: string;
  delivery_block_html?: string;
  payout_block_html?: string;
  next_steps_html?: string;
};

export async function sendStatusEmail(lead: LeadForEmail) {
  if (!lead.customer_email) {
    console.warn("[MAIL] geen customer_email, mail wordt niet verstuurd");
    return;
  }

  const language = lead.language || "nl";

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
    details_table_html: lead.details_table_html,
    delivery_block_html: lead.delivery_block_html,
    payout_block_html: lead.payout_block_html,
    next_steps_html: lead.next_steps_html,
  };

  const rendered = await renderStatusEmail(lead.status, ctx);
  if (!rendered) {
    console.warn(
      "[MAIL] Geen template gevonden voor status",
      lead.status,
      " / language",
      language
    );
    return;
  }

  await resend.emails.send({
    from: `Micoforce Buyback <klantenservice@microforce.be>`, // eventueel dynamisch maken met settings
    to: lead.customer_email,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });
}
