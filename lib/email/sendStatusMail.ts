// lib/email/sendStatusMail.ts
import { Resend } from "resend";

/** Vereiste env variabelen (Vercel Project Settings → Environment Variables) */
const RESEND_API_KEY = process.env.RESEND_API_KEY!;
const FROM = process.env.MAIL_FROM!;        // bv. "Microforce Buyback <noreply@jouwdomein.be>"
const REPLY_TO = process.env.MAIL_REPLY_TO; // optioneel, bv. "support@jouwdomein.be"

if (!RESEND_API_KEY) {
  console.warn("[sendStatusMail] RESEND_API_KEY ontbreekt.");
}
if (!FROM) {
  console.warn("[sendStatusMail] MAIL_FROM ontbreekt.");
}

const resend = new Resend(RESEND_API_KEY);

/* ---------- Types ---------- */

export type MailKind =
  | "registered"; // order is aangemaakt / bevestigd

export type LeadMini = {
  id: string;
  order_code: string | null;
  created_at: string | null;

  // klant
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  street: string | null;
  house_number: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
  iban: string | null;

  // toestel
  model: string | null;
  capacity_gb: number | null;

  // prijzen
  base_price_cents: number | null;
  final_price_cents: number | null;
  wants_voucher: boolean | null;

  // levering
  delivery_method: "ship" | "dropoff" | null;
  shop_location: string | null;

  // overige
  answers: Record<string, any> | null;
  status: string | null;
};

type SendStatusMailArgs = {
  kind: MailKind;
  to: string;     // ontvanger (klant)
  lead: LeadMini; // data voor de template
};

/* ---------- Helpers ---------- */

function eur(cents?: number | null) {
  const n = typeof cents === "number" ? cents : 0;
  return new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR" }).format(n / 100);
}

function fmtDate(ts?: string | null) {
  if (!ts) return "—";
  try {
    return new Intl.DateTimeFormat("nl-BE", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(ts));
  } catch {
    return ts;
  }
}

function esc(s: any) {
  const str = String(s ?? "");
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function fullName(lead: LeadMini) {
  return [lead.first_name, lead.last_name].filter(Boolean).join(" ").trim() || "Klant";
}

/* ---------- Registered (order bevestigd) ---------- */

function subjectRegistered(lead: LeadMini) {
  const ref = lead.order_code || lead.id.slice(0, 8).toUpperCase();
  return `Bevestiging van je buyback-aanvraag ${ref}`;
}

function htmlRegistered(lead: LeadMini) {
  const ref = lead.order_code || lead.id.slice(0, 8).toUpperCase();
  const naam = esc(fullName(lead));
  const toestel = [
    lead.model ? esc(lead.model) : null,
    typeof lead.capacity_gb === "number" ? `${lead.capacity_gb} GB` : null,
  ].filter(Boolean).join(" • ") || "—";

  const levering =
    lead.delivery_method === "ship"
      ? "Verzenden"
      : lead.delivery_method === "dropoff"
      ? `Binnenbrengen in winkel${lead.shop_location ? `: ${esc(lead.shop_location)}` : ""}`
      : "—";

  const uitbetaling =
    lead.wants_voucher
      ? "Voucher (+5% extra)"
      : (lead.iban ? `Overschrijving op IBAN ${esc(lead.iban)}` : "Overschrijving");

  // Optioneel: antwoorden weergeven (compact)
  const answersHtml = lead.answers
    ? `<ul style="margin:8px 0 0; padding-left:16px; line-height:1.4; color:#111827;">
        ${Object.entries(lead.answers).map(([k, v]) =>
          `<li><strong style="text-transform:capitalize">${esc(k)}</strong>: ${esc(v)}</li>`
        ).join("")}
      </ul>`
    : `<p style="margin:8px 0 0; color:#6B7280;">—</p>`;

  return `
  <div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif; background:#f9fafb; padding:24px;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px; margin:0 auto; background:#ffffff; border:1px solid #e5e7eb; border-radius:12px; overflow:hidden;">
      <tr>
        <td style="padding:20px 24px; border-bottom:1px solid #e5e7eb;">
          <div style="font-size:18px; font-weight:700; color:#065f46;">Buyback bevestiging</div>
          <div style="margin-top:4px; font-size:12px; color:#6b7280;">Referentie <span style="font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace">${esc(ref)}</span> • ${esc(fmtDate(lead.created_at))}</div>
        </td>
      </tr>
      <tr>
        <td style="padding:20px 24px;">
          <p style="margin:0 0 12px; color:#111827;">Beste ${naam},</p>
          <p style="margin:0 0 16px; color:#111827;">
            Bedankt voor je aanvraag. We hebben je buyback-order succesvol geregistreerd. Hieronder vind je het overzicht.
          </p>

          <h3 style="margin:16px 0 8px; font-size:14px; color:#111827;">Ordergegevens</h3>
          <table role="presentation" style="width:100%; border-collapse:collapse;">
            <tr><td style="padding:6px 0; color:#6b7280; width:160px;">Referentie</td><td style="padding:6px 0; color:#111827; font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace">${esc(ref)}</td></tr>
            <tr><td style="padding:6px 0; color:#6b7280;">Datum</td><td style="padding:6px 0; color:#111827;">${esc(fmtDate(lead.created_at))}</td></tr>
            <tr><td style="padding:6px 0; color:#6b7280;">Toestel</td><td style="padding:6px 0; color:#111827;">${toestel}</td></tr>
            <tr><td style="padding:6px 0; color:#6b7280;">Prijs</td><td style="padding:6px 0; color:#111827;">${eur(lead.final_price_cents)} ${lead.wants_voucher ? `<span style="color:#047857;">(+5% voucher)</span>` : ""}</td></tr>
            <tr><td style="padding:6px 0; color:#6b7280;">Levering</td><td style="padding:6px 0; color:#111827;">${levering}</td></tr>
            <tr><td style="padding:6px 0; color:#6b7280;">Uitbetaling</td><td style="padding:6px 0; color:#111827;">${uitbetaling}</td></tr>
          </table>

          <h3 style="margin:16px 0 8px; font-size:14px; color:#111827;">Jouw antwoorden</h3>
          ${answersHtml}

          ${
            lead.delivery_method === "ship"
              ? `
                <h3 style="margin:16px 0 8px; font-size:14px; color:#111827;">Verzendadres</h3>
                <p style="margin:0; color:#111827;">
                  ${esc(lead.street)} ${esc(lead.house_number)}<br/>
                  ${esc(lead.postal_code)} ${esc(lead.city)}${lead.country ? `<br/>${esc(lead.country)}` : ""}
                </p>
              `
              : ""
          }

          ${
            lead.delivery_method === "dropoff"
              ? `
                <h3 style="margin:16px 0 8px; font-size:14px; color:#111827;">Binnenbrengen in winkel</h3>
                <p style="margin:0; color:#111827;">
                  ${lead.shop_location ? esc(lead.shop_location) : "—"}
                </p>
              `
              : ""
          }

          <p style="margin:16px 0 0; color:#6b7280; font-size:12px;">
            Heb je nog vragen of klopt er iets niet? Antwoord gerust op deze e-mail met je referentienummer.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:14px 24px; background:#f9fafb; border-top:1px solid #e5e7eb; color:#6b7280; font-size:12px;">
          Dit is een automatische bevestiging op jouw aanvraag.
        </td>
      </tr>
    </table>
  </div>
  `;
}

function textRegistered(lead: LeadMini) {
  const ref = lead.order_code || lead.id.slice(0, 8).toUpperCase();
  const lines: string[] = [];
  lines.push(`Bevestiging buyback-aanvraag ${ref}`);
  lines.push(`Datum: ${fmtDate(lead.created_at)}`);
  lines.push("");
  lines.push(`Toestel: ${lead.model ?? "-"} ${typeof lead.capacity_gb === "number" ? `• ${lead.capacity_gb} GB` : ""}`);
  lines.push(`Prijs: ${eur(lead.final_price_cents)}${lead.wants_voucher ? " (+5% voucher)" : ""}`);
  lines.push(`Levering: ${
    lead.delivery_method === "ship" ? "Verzenden"
    : lead.delivery_method === "dropoff" ? `Binnenbrengen in winkel${lead.shop_location ? `: ${lead.shop_location}` : ""}`
    : "-"
  }`);
  lines.push(`Uitbetaling: ${lead.wants_voucher ? "Voucher (+5% extra)" : (lead.iban ? `Overschrijving op IBAN ${lead.iban}` : "Overschrijving")}`);
  lines.push("");
  lines.push("Jouw antwoorden:");
  if (lead.answers) {
    Object.entries(lead.answers).forEach(([k, v]) => {
      lines.push(`- ${k}: ${String(v)}`);
    });
  } else {
    lines.push("- —");
  }
  if (lead.delivery_method === "ship") {
    lines.push("");
    lines.push("Verzendadres:");
    lines.push(`${lead.street ?? ""} ${lead.house_number ?? ""}`.trim());
    lines.push(`${lead.postal_code ?? ""} ${lead.city ?? ""}`.trim());
    if (lead.country) lines.push(lead.country);
  }
  if (lead.delivery_method === "dropoff") {
    lines.push("");
    lines.push("Binnenbrengen in winkel:");
    lines.push(lead.shop_location ?? "—");
  }
  lines.push("");
  lines.push("Vragen? Antwoord op deze mail met je referentie.");
  return lines.join("\n");
}

/* ---------- Dispatcher ---------- */

export async function sendStatusMail(args: SendStatusMailArgs) {
  const { kind, to, lead } = args;

  if (!RESEND_API_KEY || !FROM) {
    throw new Error("RESEND_API_KEY of MAIL_FROM ontbreekt in de omgeving.");
  }

  let subject = "";
  let html = "";
  let text = "";

  switch (kind) {
    case "registered":
      subject = subjectRegistered(lead);
      html = htmlRegistered(lead);
      text = textRegistered(lead);
      break;

    default:
      throw new Error(`Onbekend mailtype: ${kind}`);
  }

  const mailOptions: Parameters<typeof resend.emails.send>[0] = {
    from: FROM,
    to,
    subject,
    html,
    text,
  };

  if (REPLY_TO) {
    // Resend gebruikt camelCase: replyTo
    (mailOptions as any).replyTo = REPLY_TO;
  }

  const result = await resend.emails.send(mailOptions);
  // Je kunt hier logging doen wanneer gewenst:
  // console.log("[sendStatusMail] sent", { to, kind, id: result?.data?.id });

  return result;
}
