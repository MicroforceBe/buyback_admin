import { Resend } from "resend";

// Keep this type aligned with your caller
export type Input = {
  to: string | null;
  first_name?: string | null;
  last_name?: string | null;
  order_code: string;
  model: string;
  capacity_gb: number | null;
  final_price_cents: number;
  wants_voucher: boolean;
  iban: string | null;
  delivery_method: "ship" | "dropoff" | null;
  shop_location: string | null;
  shop_address1?: string | null;
  shop_zip?: string | null;
  shop_city?: string | null;
  opening_hours?: Record<string, string> | null;
};

const resendApiKey = process.env.RESEND_API_KEY;
const FROM = process.env.MAIL_FROM;          // e.g. "Microforce Buyback <klantenservice@microforce.be>"
const REPLY_TO = process.env.MAIL_REPLY_TO || undefined;

const resend = resendApiKey ? new Resend(resendApiKey) : null;

export async function sendStatusMail(input: Input) {
  // Basic validation + *explicit* logging so we see what's missing
  if (!resendApiKey) {
    console.error("[MAIL][sendStatusMail] Missing RESEND_API_KEY env");
    return { ok: false, reason: "missing_api_key" };
  }
  if (!FROM) {
    console.error("[MAIL][sendStatusMail] Missing MAIL_FROM env");
    return { ok: false, reason: "missing_from" };
  }
  if (!input?.to) {
    console.error("[MAIL][sendStatusMail] Missing recipient 'to' in input", input);
    return { ok: false, reason: "missing_to" };
  }

  // Subject + HTML (keep it simple for now)
  const fullName =
    [input.first_name, input.last_name].filter(Boolean).join(" ") || "Beste klant";
  const gb = input.capacity_gb != null ? `${input.capacity_gb} GB` : "";
  const price = (input.final_price_cents / 100).toFixed(2).replace(".", ",");
  const method =
    input.delivery_method === "dropoff"
      ? `Binnenbrengen • ${input.shop_location ?? "—"}`
      : input.delivery_method === "ship"
      ? "Verzenden"
      : "—";

  const subject = `Bevestiging buyback-aanvraag ${input.order_code}`;
  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.45;color:#111">
      <h2 style="margin:0 0 12px">Bedankt, ${fullName}</h2>
      <p style="margin:0 0 12px">We hebben je buyback-aanvraag ontvangen.</p>

      <table style="border-collapse:collapse;width:100%;max-width:640px;margin:12px 0">
        <tbody>
          <tr>
            <td style="padding:6px 8px;border:1px solid #eee;width:180px">Referentie</td>
            <td style="padding:6px 8px;border:1px solid #eee"><strong>${input.order_code}</strong></td>
          </tr>
          <tr>
            <td style="padding:6px 8px;border:1px solid #eee">Toestel</td>
            <td style="padding:6px 8px;border:1px solid #eee">${input.model} ${gb}</td>
          </tr>
          <tr>
            <td style="padding:6px 8px;border:1px solid #eee">Geschatte waarde</td>
            <td style="padding:6px 8px;border:1px solid #eee"><strong>€ ${price}</strong>${input.wants_voucher ? " (incl. +5% voucher)" : ""}</td>
          </tr>
          <tr>
            <td style="padding:6px 8px;border:1px solid #eee">Uitbetaling</td>
            <td style="padding:6px 8px;border:1px solid #eee">
              ${input.wants_voucher ? "Voucher (aankooptegoed)" : (input.iban ? `Bankoverschrijving — IBAN: ${input.iban}` : "Bankoverschrijving")}
            </td>
          </tr>
          <tr>
            <td style="padding:6px 8px;border:1px solid #eee">Aanlevering</td>
            <td style="padding:6px 8px;border:1px solid #eee">${method}</td>
          </tr>
        </tbody>
      </table>

      ${
        input.delivery_method === "dropoff"
          ? `
        <div style="margin:10px 0;padding:10px;border:1px solid #eee;background:#fafafa">
          <div style="font-weight:600;margin-bottom:6px">Gekozen winkel</div>
          <div>${input.shop_location ?? "—"}</div>
          <div>${[input.shop_address1, [input.shop_zip, input.shop_city].filter(Boolean).join(" ")].filter(Boolean).join(", ")}</div>
          ${
            input.opening_hours
              ? `<table style="border-collapse:collapse;margin-top:8px">
                  ${Object.entries(input.opening_hours).map(([k,v]) =>
                    `<tr><td style="padding:2px 8px;color:#666">${k.toUpperCase()}</td><td style="padding:2px 8px">${v || "—"}</td></tr>`
                  ).join("")}
                </table>`
              : ""
          }
        </div>`
          : ""
      }

      <p style="margin:14px 0 0">Vragen? Reageer op deze e-mail of bel ons.</p>
      <p style="margin:6px 0 0;color:#666;font-size:12px">Ref: ${input.order_code}</p>
    </div>
  `;

  console.info("[MAIL][sendStatusMail] send start", {
    to: input.to,
    from: FROM,
    order_code: input.order_code,
  });

  try {
    const res = await resend!.emails.send({
      from: FROM,
      to: input.to,
      replyTo: REPLY_TO,
      subject,
      html,
      headers: { "X-Entity-Ref-ID": input.order_code },
    });

    // Resend returns { id?: string, error?: { name, message, ... } }
    if ((res as any)?.error) {
      console.error("[MAIL][sendStatusMail] Resend error:", (res as any).error);
      return { ok: false, reason: "resend_error", detail: (res as any).error };
    }

    console.info("[MAIL][sendStatusMail] send ok:", res);
    return { ok: true, detail: res };
  } catch (err: any) {
    // Log rich error (Resend often returns .response.data)
    const detail =
      err?.response?.data ??
      err?.message ??
      err;
    console.error("[MAIL][sendStatusMail] send exception:", detail);
    return { ok: false, reason: "exception", detail };
  }
}
