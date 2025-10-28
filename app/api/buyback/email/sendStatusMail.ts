// app/api/buyback/email/sendStatusMail.ts
import { Resend } from "resend";
import { format } from "date-fns";
import { nlBE } from "date-fns/locale";

const resend = new Resend(process.env.RESEND_API_KEY!);

/** Eventuele eigen afzender + reply-to configuratie */
const FROM = process.env.RESEND_FROM || "Microforce Buyback <no-reply@microforce.be>";
const REPLY_TO = process.env.RESEND_REPLY_TO || "support@microforce.be";

/** Helper: € formatteren */
function eur(cents?: number | null) {
  const v = ((cents ?? 0) / 100);
  return new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR" }).format(v);
}

/** Label voor status (NL) */
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

/** Type van de lead zoals we 'm nodig hebben in de mail */
type Lead = {
  id: string;
  order_code?: string | null;
  created_at?: string | null;

  // toestel
  model?: string | null;
  capacity_gb?: number | null;

  // prijzen
  base_price_cents?: number | null;
  final_price_cents?: number | null;
  final_price_with_voucher_cents?: number | null;
  voucher_bonus_cents?: number | null;

  // klant
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;

  // levering
  delivery_method?: "ship" | "dropoff" | null;
  shop_location?: string | null;

  // betaling
  iban?: string | null;
  wants_voucher?: boolean | null;

  // admin
  status?: string | null;

  // optioneel: antwoorden
  answers?: any;
};

/** Subject + intro per status */
function subjectFor(lead: Lead) {
  const oc = lead.order_code ? ` ${lead.order_code}` : "";
  const base = `Buyback ${statusLabel(lead.status)}${oc}`;
  switch (lead.status) {
    case "new":
      return `Bevestiging van jouw buyback-aanvraag${oc}`;
    case "received_store":
      return `We hebben je toestel ontvangen${oc}`;
    case "label_created":
      return `Je verzendlabel is aangemaakt${oc}`;
    case "shipment_received":
      return `Je zending is ontvangen${oc}`;
    case "check_passed":
      return `Controle geslaagd — betaling in voorbereiding${oc}`;
    case "check_failed":
      return `Update: controle niet geslaagd${oc}`;
    case "done":
      return `Buyback afgerond${oc}`;
    case "cancelled":
      return `Buyback geannuleerd${oc}`;
    default:
      return base;
  }
}

/** Korte status-specifieke lead-in tekst */
function introFor(lead: Lead) {
  switch (lead.status) {
    case "new":
      return "Bedankt! We hebben je buyback-aanvraag goed ontvangen. Hieronder vind je een overzicht van je bestelling.";
    case "received_store":
      return "We hebben je toestel in de winkel ontvangen. We plannen nu de controle in.";
    case "label_created":
      return "Je verzendlabel is aangemaakt. Volg de instructies in de bijlage of in je account/overzicht.";
    case "shipment_received":
      return "Je zending is aangekomen bij ons. We starten met de controle van het toestel.";
    case "check_passed":
      return "Goed nieuws! Je toestel is succesvol door de controle. We bereiden de betaling voor.";
    case "check_failed":
      return "Tijdens de controle voldeed het toestel niet aan alle voorwaarden. Hieronder vind je je orderdetails. Neem contact op als je vragen hebt.";
    case "done":
      return "Je buyback is afgerond. Bedankt voor je vertrouwen!";
    case "cancelled":
      return "Je buyback is geannuleerd. Als dit niet de bedoeling was, neem dan even contact met ons op.";
    default:
      return "Hieronder vind je de meest recente informatie over je buyback-aanvraag.";
  }
}

/** Optionele ‘volgende stap’ tip per status */
function nextStepHint(lead: Lead) {
  switch (lead.status) {
    case "new":
      return lead.delivery_method === "ship"
        ? "Je ontvangt apart instructies om je toestel veilig op te sturen."
        : lead.delivery_method === "dropoff"
          ? `Breng je toestel binnen in ${lead.shop_location ?? "de gekozen winkel"}.`
          : null;
    case "label_created":
      return "Print het label, verpak je toestel stevig en geef het pakket af volgens de instructies.";
    case "check_passed":
      return lead.wants_voucher
        ? "Je ontvangt je voucher per e-mail. Deze kan je gebruiken in onze winkels/webshop."
        : "De betaling wordt per overschrijving verwerkt op het door jou opgegeven IBAN.";
    case "check_failed":
      return "Neem contact op met onze support als je een herbeoordeling wilt bespreken.";
    default:
      return null;
  }
}

/** (optioneel) antwoorden overzicht in HTML (compact, veilig) */
function answersHtml(a: any) {
  if (!a || typeof a !== "object") return "";
  try {
    const entries = Object.entries(a as Record<string, any>);
    if (!entries.length) return "";
    const rows = entries.map(([k, v]) => {
      const val = typeof v === "string" ? v : JSON.stringify(v);
      return `<tr><td style="padding:4px 8px; color:#666;">${escapeHtml(k)}</td><td style="padding:4px 8px;">${escapeHtml(val)}</td></tr>`;
    }).join("");
    return `
      <h3 style="margin:18px 0 8px;">Jouw antwoorden</h3>
      <table style="width:100%; border-collapse:collapse; border:1px solid #eee;">
        ${rows}
      </table>
    `;
  } catch {
    return "";
  }
}

function escapeHtml(s: any) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Hoofd-template */
function renderHtml(lead: Lead) {
  const created = lead.created_at
    ? format(new Date(lead.created_at), "dd MMMM yyyy 'om' HH:mm", { locale: nlBE })
    : "Onbekend";
  const total = lead.wants_voucher
    ? (lead.final_price_with_voucher_cents ?? lead.final_price_cents)
    : lead.final_price_cents;

  const paymentLine = lead.wants_voucher
    ? `Uitbetaling: <strong>Voucher</strong>${lead.voucher_bonus_cents ? ` (incl. +5% bonus)` : ""}`
    : `Uitbetaling: Overschrijving naar <strong>${escapeHtml(lead.iban || "—")}</strong>`;

  const deliverLine =
    lead.delivery_method === "dropoff"
      ? `Levering: <strong>Binnenbrengen in winkel</strong>${lead.shop_location ? ` — ${escapeHtml(lead.shop_location)}` : ""}`
      : lead.delivery_method === "ship"
        ? "Levering: <strong>Verzenden</strong>"
        : "Levering: —";

  const hint = nextStepHint(lead);

  return `
  <div style="font-family:Arial, sans-serif; max-width:640px; margin:auto; color:#222; line-height:1.5;">
    <div style="padding:16px 0;">
      <h2 style="margin:0; color:#0a7c46;">${statusLabel(lead.status)} — Buyback</h2>
      <p style="margin:8px 0 0;">${introFor(lead)}</p>
      ${hint ? `<p style="margin:6px 0 0; color:#444;">${hint}</p>` : ""}
    </div>

    <div style="border:1px solid #e5e7eb; border-radius:8px; padding:16px;">
      <h3 style="margin:0 0 10px;">Order</h3>
      <table style="width:100%; border-collapse:collapse;">
        <tr><td style="padding:4px 8px; color:#666;">Ordernummer</td><td style="padding:4px 8px;"><strong>${escapeHtml(lead.order_code || "—")}</strong></td></tr>
        <tr><td style="padding:4px 8px; color:#666;">Datum</td><td style="padding:4px 8px;">${created}</td></tr>
        <tr><td style="padding:4px 8px; color:#666;">Model</td><td style="padding:4px 8px;">${escapeHtml(lead.model || "—")}${lead.capacity_gb ? ` • ${lead.capacity_gb} GB` : ""}</td></tr>
        <tr><td style="padding:4px 8px; color:#666;">Bedrag</td><td style="padding:4px 8px;"><strong>${eur(total ?? 0)}</strong>${lead.wants_voucher && lead.final_price_cents ? ` <span style="color:#059669;">(was ${eur(lead.final_price_cents)} + bonus)</span>` : ""}</td></tr>
        <tr><td style="padding:4px 8px; color:#666;">Status</td><td style="padding:4px 8px;">${escapeHtml(statusLabel(lead.status))}</td></tr>
        <tr><td style="padding:4px 8px; color:#666;">${lead.wants_voucher ? "Voucher" : "IBAN"}</td><td style="padding:4px 8px;">${lead.wants_voucher ? "Ja" : escapeHtml(lead.iban || "—")}</td></tr>
        <tr><td style="padding:4px 8px; color:#666;">Levering</td><td style="padding:4px 8px;">${deliverLine}</td></tr>
      </table>
    </div>

    ${answersHtml(lead.answers)}

    <p style="margin:20px 0 0; font-size:13px; color:#666;">
      Vragen of iets onjuist? Antwoord gerust op deze e-mail of mail ons via
      <a href="mailto:${REPLY_TO}" style="color:#0a7c46; text-decoration:underline;">${REPLY_TO}</a>.
    </p>

    <hr style="margin:16px 0; border:none; border-top:1px solid #eee;">
    <p style="margin:0; font-size:12px; color:#889;">Deze e-mail werd automatisch verstuurd door Microforce Buyback.</p>
  </div>
  `;
}

/**
 * Publieke functie: verstuur statusmail naar klant.
 * - Roept niets aan als er geen klant-e-mailadres is.
 * - Maakt onderwerp + HTML op basis van lead.status
 */
export async function sendStatusMail(lead: Lead) {
  if (!lead?.email) return;

  const subject = subjectFor(lead);
  const html = renderHtml(lead);

  await resend.emails.send({
    from: FROM,
    to: lead.email,
    replyTo: REPLY_TO,
    subject,
    html,
  });
}

2.

import { sendStatusMail } from "@/app/api/buyback/email/sendStatusMail";

// ... na je Supabase update:
const { data: updated, error } = await supabaseAdmin
  .from("buyback_leads")
  .select("*")
  .eq("id", id)
  .single();

// alleen mailen als status écht veranderd is
if (!error && updated && prevStatus !== updated.status) {
  await sendStatusMail(updated);
}
