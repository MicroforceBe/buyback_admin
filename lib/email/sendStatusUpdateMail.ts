// lib/email/sendStatusUpdateMail.ts
"use server";

import { Resend } from "resend";
import {
  BuybackStatus,
  TemplateContext,
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

  // Render subject + html o.b.v. Supabase template
  const { subject, html } = await renderStatusEmail({
    status: input.status,
    language,
    context: {
      ...input,
      email: input.email || input.to,
    },
  });

  if (!resend) {
    console.warn(
      "[MAIL][status] RESEND_API_KEY missing – mail wordt niet echt verstuurd"
    );
    console.info("[MAIL][status] would send:", { from: fromAddress, to, subject });
    return;
  }

  try {
    await resend.emails.send({
      from: fromAddress,
      to,
      subject,
      html,
    });
    console.info("[MAIL][status] sent OK", { to, subject });
  } catch (e: any) {
    console.error(
      "[MAIL][status] send failed:",
      e?.message || e?.toString() || e
    );
  }
}
