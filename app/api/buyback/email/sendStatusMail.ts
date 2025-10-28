// app/api/buyback/email/sendStatusMail.ts
import { Resend } from "resend";

type MailInput = {
  email: string | null;
  first_name?: string | null;
  last_name?: string | null;
  order_code: string;
  model: string;
  capacity_gb: number | null;
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

function eur(cents = 0) {
  const v = Math.max(0, Math.round(cents)) / 100;
  return v.toLocaleString("nl-BE", { style: "currency", currency: "EUR" });
}

export async function sendStatusMail(input: MailInput) {
  const {
    email,
    first_name,
    last_name,
    order_code,
    model,
    capacity_gb,
    final_price_cents,
    wants_voucher,
    iban,
    delivery_method,
    shop_location,
    shop_address1,
    shop_zip,
    shop_city,
    opening_hours,
  } = input;

  const API_KEY = process.env.RESEND_API_KEY;
  const FROM = process.env.MAIL_FROM;
  const REPLY_TO = process.env.MAIL_REPLY_TO || undefined;

  // === Harde preflight checks + logs
  if (!email) {
    console.error("[MAIL][sendStatusMail] Geen ontvanger, afbreken.", { order_code });
    return { ok: false, reason: "missing_recipient" };
  }
  if (!API_KEY) {
    console.error("[MAIL][sendStatusMail] RESEND_API_KEY ontbreekt! Mail niet verzonden.", { order_code });
    return { ok: false, reason: "missing_api_key" };
  }
  if (!FROM) {
    console.error("[MAIL][sendStatusMail] MAIL_FROM ontbreekt! Mail niet verzonden.", { order_code });
    return { ok: false, reason: "missing_from" };
  }

  const greet = first_name || last_name ? `Beste ${[first_name, last_name].filter(Boolean).join(" ")},` : "Beste klant,";
  const priceLine = `Geschatte inruilprijs: <strong>${eur(final_price_cents)}</strong>${wants_voucher ? " (incl. voucher)" : ""}`;
  const methodLine =
    delivery_method === "dropoff"
      ? `Binnenbrengen in: <strong>${shop_location || "—"}</strong>${shop_city ? ` (${shop_city})` : ""}`
      : delivery_method === "ship"
      ? "Verzendmethode: <strong>Verzenden</strong>"
      : "Levering: <strong>—</strong>";

  const shopBlock =
    delivery_method === "dropoff"
      ? `
        <table style="font-size:12px;color:#334155">
          <tr><td>Adres</td><td>${[shop_address1, [shop_zip, shop_city].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "—"}</td></tr>
          ${
            opening_hours
              ? Object.entries(opening_hours)
                  .map(
                    ([k, v]) => `<tr><td style="color:#64748b">${k.toUpperCase()}</td><td>${v || "—"}</td></tr>`
                  )
                  .join("")
              : ""
          }
        </table>
      `
      : "";

  const subject = `Bevestiging buyback-aanvraag ${order_code}`;
  const html = `
  <div style="font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;line-height:1.5;color:#0f172a">
    <p>${greet}</p>
    <p>We hebben je buyback-aanvraag goed ontvangen. Hieronder vind je de details.</p>

    <div style="margin:16px 0;padding:12px 14px;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc">
      <div style="font-size:14px"><strong>Order</strong> <span style="font-family:ui-monospace,Menlo,Consolas,monospace">${order_code}</span></div>
      <div style="font-size:14px;margin-top:6px">${priceLine}</div>
      <div style="font-size:14px;margin-top:6px">Toestel: <strong>${model}</strong>${capacity_gb != null ? ` • ${capacity_gb} GB` : ""}</div>
      <div style="font-size:14px;margin-top:6px">${methodLine}</div>
      ${shopBlock ? `<div style="margin-top:8px">${shopBlock}</div>` : ""}
      ${
        wants_voucher
          ? `<div style="font-size:12px;margin-top:10px;color:#15803d">Je koos voor een voucher (+5%).</div>`
          : `<div style="font-size:12px;margin-top:10px;color:#334155">Uitbetaling via overschrijving${iban ? ` naar <strong>${iban}</strong>` : ""}.</div>`
      }
    </div>

    <p style="font-size:12px;color:#475569">Je ontvangt een update zodra de status verandert. Bewaar dit ordernummer goed.</p>

    <p>Met vriendelijke groeten,<br/>Microforce Buyback</p>
  </div>
  `;

  const resend = new Resend(API_KEY);
  console.log("[MAIL][sendStatusMail] send start", { to: email, from: FROM, order_code });

  try {
    const { data, error } = await resend.emails.send({
      from: FROM,       // vb: "Microforce Buyback <noreply@microforce.be>"
      to: email,        // enkel 1 ontvanger hier
      replyTo: REPLY_TO,
      subject,
      html,
    });

    if (error) {
      console.error("[MAIL][sendStatusMail] Resend error", { order_code, error });
      return { ok: false, error };
    }

    console.log("[MAIL][sendStatusMail] Resend OK", { order_code, id: data?.id });
    return { ok: true, id: data?.id };
  } catch (e: any) {
    console.error("[MAIL][sendStatusMail] Throw", { order_code, err: e?.message || e });
    return { ok: false, error: String(e?.message || e) };
  }
}
