// lib/email/sendStatusMail.ts
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

/** Zet status naar leesbaar label (optioneel voor subject/body) */
function statusLabel(s?: string | null) {
  switch (s) {
    case "new":               return "Nieuw";
    case "received_store":    return "Ontvangen in winkel";
    case "label_created":     return "Verzendlabel aangemaakt";
    case "shipment_received": return "Zending ontvangen";
    case "check_passed":      return "Controle succesvol";
    case "check_failed":      return "Controle gefaald";
    case "done":              return "Afgewerkt";
    case "cancelled":         return "Geannuleerd";
    default:                  return "Update";
  }
}

function subjectFor(lead: any) {
  const oc = lead?.order_code ? ` ${lead.order_code}` : "";
  switch (lead?.status) {
    case "new":               return `Bevestiging van jouw buyback-aanvraag${oc}`;
    case "received_store":    return `We hebben je toestel ontvangen${oc}`;
    case "label_created":     return `Je verzendlabel is aangemaakt${oc}`;
    case "shipment_received": return `Je zending is ontvangen${oc}`;
    case "check_passed":      return `Controle geslaagd — betaling in voorbereiding${oc}`;
    case "check_failed":      return `Update: controle niet geslaagd${oc}`;
    case "done":              return `Buyback afgerond${oc}`;
    case "cancelled":         return `Buyback geannuleerd${oc}`;
    default:                  return `Buyback ${statusLabel(lead?.status)}${oc}`;
  }
}

function eur(cents?: number | null) {
  const v = (cents ?? 0) / 100;
  return new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR" }).format(v);
}

/** Heel eenvoudige HTML-template (pas aan naar wens of zet naar React component) */
function renderHtml(lead: any) {
  const lines: string[] = [];
  lines.push(`<h2 style="margin:0 0 8px 0">Overzicht buyback</h2>`);
  if (lead.order_code) lines.push(`<p><strong>Order:</strong> <code>${lead.order_code}</code></p>`);
  lines.push(`<p><strong>Status:</strong> ${statusLabel(lead.status)}</p>`);

  lines.push(`<h3>Toestel</h3>`);
  lines.push(`<ul>
    <li><strong>Model:</strong> ${lead.model ?? "—"}${lead.capacity_gb ? ` • ${lead.capacity_gb} GB` : ""}</li>
    <li><strong>Geschatte prijs:</strong> ${eur(lead.final_price_cents)}</li>
  </ul>`);

  lines.push(`<h3>Klant</h3>`);
  const naam = [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "—";
  lines.push(`<ul>
    <li><strong>Naam:</strong> ${naam}</li>
    <li><strong>E-mail:</strong> ${lead.email ?? "—"}</li>
    <li><strong>Telefoon:</strong> ${lead.phone ?? "—"}</li>
  </ul>`);

  lines.push(`<h3>Levering</h3>`);
  const method =
    lead.delivery_method === "ship" ? "Verzenden" :
    lead.delivery_method === "dropoff" ? `Binnenbrengen in winkel (${lead.shop_location ?? "—"})` : "—";
  lines.push(`<ul>
    <li><strong>Methode:</strong> ${method}</li>
  </ul>`);

  if (lead.wants_voucher) {
    lines.push(`<p><strong>Uitbetaling:</strong> Voucher (+5%)</p>`);
  } else {
    lines.push(`<p><strong>Uitbetaling:</strong> Overschrijving naar IBAN ${lead.iban ?? "—"}</p>`);
  }

  lines.push(`<hr style="border:none;border-top:1px solid #eee;margin:16px 0" />`);
  lines.push(`<p style="font-size:12px;color:#666">Vragen? Antwoord gerust op deze mail.</p>`);

  return `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.45">${lines.join("\n")}</div>`;
}

/** Publieke helper: verstuurt statusmail naar lead.email */
export async function sendStatusMail(lead: any) {
  if (!process.env.RESEND_API_KEY) throw new Error("RESEND_API_KEY is niet ingesteld");
  const from = process.env.MAIL_FROM || "Buyback <noreply@jouwdomein.be>";
  const to = String(lead.email || "").trim();
  if (!to) throw new Error("Lead heeft geen e-mail");

  const subject = subjectFor(lead);
  const html = renderHtml(lead);

  const res = await resend.emails.send({
    from,
    to,
    subject,
    html,
    // TIP: zet hier reply_to op je supportadres
    replyTo: process.env.MAIL_REPLY_TO || undefined,
  });

  if (res.error) {
    throw new Error(`Resend error: ${res.error.message || String(res.error)}`);
  }
  return res;
}
