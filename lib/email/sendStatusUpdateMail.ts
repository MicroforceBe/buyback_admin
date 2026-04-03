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

  /**
   * === Label-URL normaliseren ===
   *
   * In de DB/flow krijgen we bij label_created meestal een "label_pdf_url"
   * die in feite een parcel_id is (bv. "574848212").
   *
   * Hier maken we daar een publieke URL van naar onze eigen proxy:
   *   {BASE}/api/admin/sendcloud/label?parcel_id=574848212
   *
   * BASE haal je idealiter uit MAIL_PUBLIC_BASE_URL, en anders uit
   * bv. NEXT_PUBLIC_SITE_URL of een vergelijkbare env.
   */
  let normalizedLabelUrl = (input as any).label_pdf_url as string | undefined;

  const baseUrl =
    process.env.MAIL_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.MAIL_BRAND_URL;

  if (
    normalizedLabelUrl &&
    /^\d+$/.test(normalizedLabelUrl) &&
    baseUrl
  ) {
    const trimmedBase = baseUrl.replace(/\/+$/, "");
    normalizedLabelUrl = `${trimmedBase}/api/admin/sendcloud/label?parcel_id=${normalizedLabelUrl}`;
  }

  const { subject, html } = await renderStatusEmail({
    status: input.status,
    language,
    context: {
      ...input,
      email: (input as any).email || input.to,
      label_pdf_url: normalizedLabelUrl ?? (input as any).label_pdf_url,
    } as TemplateContext,
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
