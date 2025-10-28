// app/api/buyback/email/sendStatusMail.ts
import { Resend } from "resend";

/**
 * Vereiste ENV variabelen op Vercel:
 * - RESEND_API_KEY      (uit Resend dashboard)
 * - MAIL_FROM           (bv. "Microforce Buyback <noreply@jouwdomein.be>")
 * - MAIL_REPLY_TO       (bv. "info@jouwdomein.be")
 */

const resend = new Resend(process.env.RESEND_API_KEY!);
const FROM = process.env.MAIL_FROM!;
const REPLY_TO = process.env.MAIL_REPLY_TO || "info@microforce.be";

type DeliveryMethod = "ship" | "dropoff" | null;

type LeadForMail = {
  // ontvanger
  email: string | null;
  first_name?: string | null;
  last_name?: string | null;

  // order
  order_code?: string | null;
  model?: string | null;
  capacity_gb?: number | null;
  final_price_cents?: number | null;
  wants_voucher?: boolean | null;
  iban?: string | null;

  // levering
  delivery_method?: DeliveryMethod;

  // winkel (optioneel, bij dropoff)
  shop_location?: string | null; // naam
  shop_address1?: string | null;
  shop_zip?: string | null;
  shop_city?: string | null;
  opening_hours?:
    | Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", string | null | undefined>
    | string
    | null;
};

const DAYS_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const DAY_LABEL: Record<(typeof DAYS_ORDER)[number], string> = {
  mon: "Maandag",
  tue: "Dinsdag",
  wed: "Woensdag",
  thu: "Donderdag",
  fri: "Vrijdag",
  sat: "Zaterdag",
  sun: "Zondag",
};

function eur(cents: number | null | undefined): string {
  const v = typeof cents === "number" ? cents / 100 : 0;
  return new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR" }).format(v);
}

function safe(s: unknown): string {
  return String(s ?? "").replace(/[<>&]/g, (m) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[m]!));
}

function compactAddress(parts: Array<string | null | undefined>) {
  return parts.filter(Boolean).join(", ");
}

function renderOpeningHours(hours: LeadForMail["opening_hours"]): { inline: string; htmlList: string } {
  if (!hours) return { inline: "—", htmlList: "<em>—</em>" };

  if (typeof hours === "string") {
    const txt = hours.trim();
    return { inline: txt || "—", htmlList: txt ? safe(txt) : "<em>—</em>" };
  }

  const lines: string[] = [];
  for (const d of DAYS_ORDER) {
    const v = (hours as any)?.[d];
    if (v && String(v).trim()) {
      lines.push(`${DAY_LABEL[d]}: ${String(v).trim()}`);
    }
  }
  if (lines.length === 0) return { inline: "—", htmlList: "<em>—</em>" };
  return {
    inline: lines.join(" • "),
    htmlList:
      "<ul style=\"margin:8px 0 0 0;padding-left:18px;\">" +
      lines.map((l) => `<li>${safe(l)}</li>`).join("") +
      "</ul>",
  };
}

export async function sendStatusMail(lead: LeadForMail) {
  // Minimale validatie
  if (!lead?.email) {
    return { ok: false, error: "Missing recipient email" };
  }
  if (!FROM) {
    return { ok: false, error: "MAIL_FROM is not configured" };
  }

  const firstName = lead.first_name?.trim() || "";
  const fullName =
    [lead.first_name?.trim(), lead.last_name?.trim()].filter(Boolean).join(" ") || "klant";
  const orderCode = lead.order_code || "—";
  const price = eur(lead.final_price_cents ?? 0);
  const subject = `Bevestiging van jouw Buyback-aanvraag – order ${orderCode}`;

  const isDropoff = lead.delivery_method === "dropoff";
  const address = compactAddress([lead.shop_address1, [lead.shop_zip, lead.shop_city].filter(Boolean).join(" ")]);
  const hours = renderOpeningHours(lead.opening_hours);

  // HTML body
  const html = `<!DOCTYPE html>
<html lang="nl">
  <body style="font-family: Arial, sans-serif; background-color:#f7f7f7; padding:40px;">
    <div style="max-width:600px;margin:auto;background:white;padding:30px;border-radius:8px;border:1px solid #e5e5e5;">
      <h2 style="color:#0078d7;margin-bottom:5px;">Bevestiging van jouw Buyback-aanvraag</h2>
      <p style="margin-top:0;color:#555;">Bedankt, <strong>${safe(firstName || fullName)}</strong>! We hebben je aanvraag succesvol ontvangen.</p>
      <p style="font-size:14px;">Jouw ordernummer is: <strong style="font-size:16px;">${safe(orderCode)}</strong></p>

      <h3 style="border-bottom:1px solid #ddd;padding-bottom:4px;">Toestelgegevens</h3>
      <ul style="list-style:none;padding-left:0;line-height:1.6;">
        <li><strong>Model:</strong> ${safe(lead.model || "—")}</li>
        <li><strong>Opslagcapaciteit:</strong> ${lead.capacity_gb ?? "—"} GB</li>
        <li><strong>Prijsvoorstel:</strong> ${safe(price)}</li>
        ${
          lead.wants_voucher
            ? `<li><strong>Uitbetaling:</strong> Voucher (+5% bonus)</li>`
            : `<li><strong>Uitbetaling:</strong> Overschrijving</li>
               <li><strong>IBAN:</strong> ${safe(lead.iban || "—")}</li>`
        }
      </ul>

      <h3 style="border-bottom:1px solid #ddd;padding-bottom:4px;">Leveringsmethode</h3>
      ${
        isDropoff
          ? `<p>Je hebt gekozen om het toestel <strong>binnen te brengen in de winkel</strong>:</p>
             <p>
               <strong>${safe(lead.shop_location || "—")}</strong><br />
               ${safe(address || "—")}<br />
               <span style="font-size:13px;color:#666;">Openingsuren:</span>
               ${hours.htmlList}
             </p>`
          : `<p>Je ontvangt binnenkort een verzendlabel via e-mail.<br>
             Verpak het toestel goed en verstuur het gratis naar ons.</p>`
      }

      <p style="margin-top:30px;color:#555;">Je ontvangt een update zodra we jouw toestel hebben ontvangen en gecontroleerd.</p>

      <div style="margin-top:32px;padding-top:16px;border-top:1px solid #eee;color:#777;font-size:13px;">
        Vragen? Antwoord op deze e-mail of contacteer ons via
        <a href="mailto:${safe(REPLY_TO)}">${safe(REPLY_TO)}</a>.<br/><br/>
        <em>Met vriendelijke groeten,<br/>Het Microforce Buyback-team</em>
      </div>
    </div>
  </body>
</html>`;

  // Tekstversie
  const text = [
    `Bedankt, ${firstName || fullName}!`,
    ``,
    `We hebben je buyback-aanvraag succesvol ontvangen.`,
    `Ordernummer: ${orderCode}`,
    ``,
    `Toestel: ${lead.model || "—"} (${lead.capacity_gb ?? "—"} GB)`,
    `Prijsvoorstel: ${price}`,
    ``,
    lead.wants_voucher
      ? `Uitbetaling via voucher (+5% bonus)`
      : `Uitbetaling via overschrijving (IBAN: ${lead.iban || "—"})`,
    ``,
    isDropoff
      ? [
          `Je brengt het toestel binnen in:`,
          `${lead.shop_location || "—"}`,
          `${address || "—"}`,
          `Openingsuren: ${
            typeof lead.opening_hours === "string"
              ? lead.opening_hours || "—"
              : hours.inline
          }`,
        ].join("\n")
      : `Je ontvangt binnenkort een verzendlabel per e-mail.`,
    ``,
    `Met vriendelijke groeten,`,
    `Het Microforce Buyback-team`,
  ].join("\n");

  try {
    const { data, error } = await resend.emails.send({
      from: FROM,
      to: lead.email!,
      replyTo: REPLY_TO,
      subject,
      html,
      text,
    });
    if (error) throw error;

    console.log(`[MAIL] Confirmation sent to ${lead.email} for order ${orderCode} (id: ${data?.id || "n/a"})`);
    return { ok: true, id: data?.id || null };
  } catch (e: any) {
    console.error("[MAIL ERROR]", e);
    return { ok: false, error: String(e?.message || e) };
  }
}
