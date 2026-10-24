// lib/email/sendStatusUpdateMail.ts
"use server";

import { Resend } from "resend";
import { normalizeCustomerLabelLink } from "@/lib/security/labelLinks";
import {
  type BuybackStatus,
  type TemplateContext,
  renderStatusEmail,
} from "./templates";

const resendApiKey = process.env.RESEND_API_KEY || "";
const resend = resendApiKey ? new Resend(resendApiKey) : null;

export type StatusMailInput = TemplateContext & {
  to: string;
  status: BuybackStatus;
  language?: string;
};

export async function sendStatusUpdateMail(input: StatusMailInput) {
  const to = input.to;
  if (!to) {
    console.warn("[MAIL][status] missing 'to', skipping send");
    return;
  }

  const fromAddress =
    process.env.MAIL_FROM || "no-reply@microforce-buyback.local";
  const language = input.language || "nl";

  const normalizedLabelUrl = normalizeCustomerLabelLink(input.label_pdf_url);

  const { subject, html } = await renderStatusEmail({
    status: input.status,
    language,
    context: {
      ...input,
      email: (input as any).email || input.to,
      label_pdf_url: normalizedLabelUrl ?? (input as any).label_pdf_url,
    } as TemplateContext,
  });

  if (!resend) throw new Error("Maildienst niet ingesteld.");

  try {
    const result = await resend.emails.send({
      from: fromAddress,
      to,
      subject,
      html,
    });
    if (result.error || !result.data?.id) throw new Error("Mailprovider heeft het bericht niet aanvaard.");
    console.info("[MAIL][status] accepted");
    return { id: result.data.id };
  } catch {
    console.error("[MAIL][status] delivery failed");
    throw new Error("Statusmail kon niet verstuurd worden.");
  }
}

