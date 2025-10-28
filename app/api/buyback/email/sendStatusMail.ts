// app/api/buyback/email/sendStatusMail.ts
import { Resend } from "resend";

export type SendStatusMailInput = {
  email: string | null;
  first_name?: string | null;
  last_name?: string | null;
  order_code: string;
  model: string;
  capacity_gb?: number | null;
  final_price_cents: number;
  wants_voucher?: boolean;
  iban?: string | null;
  delivery_method?: "ship" | "dropoff" | null;
  shop_location?: string | null;
  shop_address1?: string | null;
  shop_zip?: string | null;
  shop_city?: string | null;
  opening_hours?: Record<string, string> | null;
};

const resendApiKey = process.env.RESEND_API_KEY;
const FROM = process.env.MAIL_FROM || "";
const REPLY_TO = process.env.MAIL_REPLY_TO || undefined;

const resend = resendApiKey ? new Resend(resendApiKey) : null;

function eur(cents: number) {
  return new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR" }).format(
    (cents || 0) / 100
  );
}

export async function sendStatusMail(input: SendStatusMailInput) {
  const to = (input.email || "").trim();

  console.log("[MAIL][sendStatusMail] send start", {
    to,
    from: FROM,
    order_code: input.order_code,
  });

  // === Harde validering vóór we Resend aanspreken ===
  if (!resend) {
    console.error("[MAIL][sendStatusMail] RESEND_API_KEY ontbreekt of is leeg");
    throw new Error("RESEND_API_KEY missing");
  }
  if (!FROM || !FROM.includes("@")) {
    console.error("[MAIL][sendStatusMail] MAIL_FROM ongeldig/ontbreekt:", FROM);
    throw new Error("MAIL_FROM missing/invalid");
  }
  if (!to || !to.includes("@")) {
    console.error("[MAIL][sendStatusMail] ontvanger (email) ontbreekt/ongeldig:", to);
    throw new Error("Recipient email missing/invalid");
  }

  // === Subject & content ===
  const fullName = [input.first_name, input.last_name].filter(Boolean).join(" ").trim() || "Beste klant";
  const subj = `Bevestiging buyback-aanvraag ${input.order_code}`;
  const prijs = eur(input.final_price_cents);
  const variant = input.capacity_gb ? `${input.capacity_gb} GB` : "";
  const voucherLine = input.wants_voucher ? `<p><strong>Voucher geselecteerd:</strong> ja</p>` : "";
  const ibanLine =
    input.wants_voucher ? `` : `<p><strong>IBAN:</strong> ${input.iban ? input.iban : "—"}</p>`;
  const methodLine =
    input.delivery_method === "dropoff"
      ? `<p><strong>Levering:</strong> Binnenbrengen in winkel</p>`
      : input.delivery_method === "ship"
      ? `<p><strong>Levering:</strong> Verzenden</p>`
      : `<p><strong>Levering:</strong> —</p>`;

  const shopBlock =
    input.delivery_method === "dropoff"
      ? `
        <h3 style="margin:16px 0 8px 0;">Winkel</h3>
        <p style="margin:4px 0;"><strong>${input.shop_location || "—"}</strong></p>
        <p style="margin:4px 0;">${[input.shop_address1, [input.shop_zip, input.shop_city].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "—"}</p>
        ${
          input.opening_hours
            ? `<table cellspacing="0" cellpadding="0" border="0" style="font-size:12px;color:#444;">
                 ${Object.entries(input.opening_hours)
                   .map(
                     ([k, v]) =>
                       `<tr><td style="padding:2px 8px 2px 0;">${k.toUpperCase()}</td><td style="padding:2px 0;">${v || "—"}</td></tr>`
                   )
                   .join("")}
               </table>`
            : ""
        }
      `
      : "";

  const html = `
    <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; color:#111;">
      <h2 style="margin:0 0 12px 0;">Bevestiging van je buyback-aanvraag</h2>
      <p style="margin:0 0 12px 0;">${fullName}, bedankt! We hebben je aanvraag goed ontvangen.</p>

      <p style="margin:8px 0;"><strong>Ordercode:</strong> ${input.order_code}</p>
      <p style="margin:8px 0;"><strong>Toestel:</strong> ${input.model} ${variant}</p>
      <p style="margin:8px 0;"><strong>Geschatte uitbetaling:</strong> ${prijs}</p>
      ${voucherLine}
      ${ibanLine}
      ${methodLine}
      ${shopBlock}

      <hr style="margin:16px 0;border:none;border-top:1px solid #eee;" />
      <p style="margin:6px 0;color:#666;">Je ontvangt nog een update zodra de status wijzigt. Bewaar deze e-mail als referentie.</p>
    </div>
  `;

  const text = [
    `Bevestiging buyback-aanvraag ${input.order_code}`,
    ``,
    `${fullName}, bedankt! We hebben je aanvraag goed ontvangen.`,
    ``,
    `Ordercode: ${input.order_code}`,
    `Toestel: ${input.model} ${variant}`,
    `Geschatte uitbetaling: ${prijs}`,
    input.wants_voucher ? `Voucher: ja` : ``,
    input.wants_voucher ? `` : `IBAN: ${input.iban || "—"}`,
    `Levering: ${
      input.delivery_method === "dropoff" ? "Binnenbrengen in winkel" : input.delivery_method === "ship" ? "Verzenden" : "—"
    }`,
    input.shop_location ? `Winkel: ${input.shop_location}` : ``,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const res = await resend.emails.send({
      from: FROM,
      to: [to],
      ...(REPLY_TO ? { replyTo: REPLY_TO } : {}),
      subject: subj,
      html,
      text,
      headers: {
        "X-Entity-Ref-ID": input.order_code,
      },
      tags: [{ name: "order_code", value: input.order_code }],
    });

    console.log("[MAIL][sendStatusMail] result", res);
    if ((res as any)?.error) {
      console.error("[MAIL][sendStatusMail] provider error:", (res as any).error);
      throw new Error((res as any).error?.message || "Resend error");
    }
    return res;
  } catch (err: any) {
    console.error("[MAIL][sendStatusMail] exception:", err?.message || err);
    throw err;
  }
}
