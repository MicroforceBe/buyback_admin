// lib/email/sendFinanceBorderel.ts
"use server";

import { Resend } from "resend";
import { PDFDocument, StandardFonts } from "pdf-lib";
import type { BuybackStatus } from "./templates";

const resendApiKey = process.env.RESEND_API_KEY || "";
const resend = resendApiKey ? new Resend(resendApiKey) : null;

export type FinanceBorderelInput = {
  to: string;
  status?: BuybackStatus;

  // basis + identificatie
  first_name?: string | null;
  last_name?: string | null;
  order_code?: string | null;
  email?: string | null;

  // toestel
  model?: string | null;
  capacity_gb?: number | null;
  variant?: string | null;
  sku?: string | null;
  imei_sn?: string | null;

  // prijs / uitbetaling
  final_price_cents?: number | null;
  wants_voucher?: boolean | null;
  iban?: string | null;

  // klant & adres
  street?: string | null;
  house_number?: string | null;
  postal_code?: string | null;
  city?: string | null;
  country?: string | null;
  phone?: string | null;

  // levering / shop
  delivery_method?: string | null;
  shop_location?: string | null;
  shop_address1?: string | null;
  shop_zip?: string | null;
  shop_city?: string | null;
  opening_hours?: Record<string, string> | null;

  // tracking
  tracking_code?: string | null;
  tracking_url?: string | null;
  label_pdf_url?: string | null;

  // extra voor finance
  customer_number?: string | null;
  brand_name_override?: string | null;

  // datums
  created_at?: string | null;
  finished_at?: string | null;

  // optioneel: Q&A
  questions_answers_html?: string | null;
};

function formatCurrency(
  cents?: number | null,
  locale: string = "nl-BE",
  currency: string = "EUR"
): string {
  if (cents == null) return "";
  const eur = cents / 100;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(eur);
  } catch {
    return `${eur.toFixed(2)} €`;
  }
}

function safeDateString(raw?: string | null): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleString("nl-BE");
}

async function buildBorderelPdf(input: FinanceBorderelInput): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage();

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const baseFontSize = 10;
  const lineHeight = baseFontSize * 1.4;

  const { width, height } = page.getSize();
  const marginLeft = 40;
  let y = height - 40;

  function line(text: string = "", fontSize: number = baseFontSize) {
    if (text) {
      page.drawText(text, {
        x: marginLeft,
        y,
        size: fontSize,
        font,
      });
    }
    y -= lineHeight;
  }

  function sectionTitle(title: string) {
    line(title, 12);
  }

  const brandName = input.brand_name_override || "Microforce Buyback";
  const fullName = [input.first_name, input.last_name].filter(Boolean).join(" ");
  const orderRef = input.order_code || "-";
  const amountStr = formatCurrency(input.final_price_cents ?? null);

  const createdStr = safeDateString(input.created_at);
  const finishedStr = safeDateString(input.finished_at);

  // ===== HEADER =====
  line(`${brandName} - Aankoopborderel`, 18);
  line(`Datum document: ${new Date().toLocaleString("nl-BE")}`, 10);
  line(`Buyback-order: ${orderRef}`, 11);
  line(); // lege regel

  // ===== KLANTGEGEVENS =====
  sectionTitle("Klantgegevens");
  if (fullName) line(`Naam: ${fullName}`);
  if (input.customer_number) line(`Klantnummer: ${input.customer_number}`);
  if (input.email) line(`E-mail: ${input.email}`);
  if (input.phone) line(`Telefoon: ${input.phone}`);

  if (input.street || input.house_number || input.postal_code || input.city) {
    const addrLine1 = [input.street, input.house_number].filter(Boolean).join(" ");
    const addrLine2 = [input.postal_code, input.city].filter(Boolean).join(" ");
    if (addrLine1) line(`Adres: ${addrLine1}`);
    if (addrLine2) line(`       ${addrLine2}`);
  }
  if (input.country) line(`Land: ${input.country}`);

  if (createdStr || finishedStr) {
    line();
    sectionTitle("Datums");
    if (createdStr) line(`Datum aanvraag: ${createdStr}`);
    if (finishedStr) line(`Datum afgewerkt: ${finishedStr}`);
  }

  line();

  // ===== TOESTEL =====
  sectionTitle("Toestel");
  const deviceParts: string[] = [];
  if (input.model) deviceParts.push(input.model);
  if (input.variant) deviceParts.push(input.variant);
  let deviceLabel = deviceParts.join(" - ");
  if (input.capacity_gb) {
    deviceLabel = deviceLabel
      ? `${deviceLabel} (${input.capacity_gb} GB)`
      : `${input.capacity_gb} GB`;
  }

  if (deviceLabel) line(`Model: ${deviceLabel}`);
  if (input.sku) line(`SKU: ${input.sku}`);
  if (input.imei_sn) line(`IMEI/SN: ${input.imei_sn}`);
  if (amountStr) line(`Overnameprijs: ${amountStr}`);
  line();

  // ===== UITBETALING =====
  sectionTitle("Uitbetaling");
  if (input.wants_voucher) {
    line(
      "Methode: Voucher (te gebruiken als korting bij aankoop van een toestel)."
    );
    if (amountStr) line(`Voucherwaarde: ${amountStr}`);
  } else {
    line("Methode: Bankoverschrijving");
    if (amountStr) line(`Bedrag: ${amountStr}`);
    if (input.iban) line(`IBAN: ${input.iban}`);
  }
  line();

  // ===== LEVERING / INNAME =====
  sectionTitle("Levering / Inname");
  const method = input.delivery_method;
  if (method === "ship") {
    line("Methode: Verzending naar Microforce (gratis verzendlabel).");
  } else if (method === "dropoff") {
    line("Methode: Binnenbrengen in de winkel.");
  } else {
    line("Methode: Onbekend / niet ingevuld.");
  }

  if (method === "dropoff" && input.shop_location) {
    line(`Winkel: ${input.shop_location}`);
    const shopAddr1 = input.shop_address1;
    const shopAddr2 = [input.shop_zip, input.shop_city]
      .filter(Boolean)
      .join(" ");
    if (shopAddr1) line(`Adres winkel: ${shopAddr1}`);
    if (shopAddr2) line(`             ${shopAddr2}`);
  }

  line();

  // ===== TRACKING =====
  sectionTitle("Tracking");
  if (input.tracking_code || input.tracking_url || input.label_pdf_url) {
    if (input.tracking_code) line(`Tracking code: ${input.tracking_code}`);
    if (input.tracking_url) line(`Tracking URL: ${input.tracking_url}`);
    if (input.label_pdf_url) line(`Label URL: ${input.label_pdf_url}`);
  } else {
    line("Geen trackinginformatie beschikbaar.");
  }

  line();

  // ===== STATUS =====
  sectionTitle("Status");
  if (input.status) {
    line(`Status: ${input.status}`);
  } else {
    line("Status: (niet opgegeven)");
  }

  line();
  line(
    "Dit document is een aankoopborderel voor een buyback-order. Gelieve dit document intern te bewaren voor de boekhouding.",
    8
  );

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

export async function sendFinanceBorderelMail(
  input: FinanceBorderelInput
): Promise<void> {
  const to = input.to;
  if (!to) {
    console.warn("[FINANCE][borderel] missing 'to', skipping send");
    return;
  }

  const brandName = input.brand_name_override || "Microforce Buyback";
  const orderRef = input.order_code || "-";

  // PDF bouwen
  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await buildBorderelPdf(input);
  } catch (e: any) {
    console.error(
      "[FINANCE][borderel] failed to build PDF:",
      e?.message || e
    );
    return;
  }

  if (!resend) {
    console.warn(
      "[FINANCE][borderel] RESEND_API_KEY missing – mail wordt niet echt verstuurd"
    );
    console.info("[FINANCE][borderel] would send:", {
      to,
      subject: `[${brandName}] Aankoopborderel buyback-order ${orderRef}`,
    });
    return;
  }

  const fromAddress =
    process.env.MAIL_FROM || "no-reply@microforce-buyback.local";

  const safeCustomer = input.customer_number || "-";
  const safeOrder = orderRef;
  const safeModel =
    [input.model, input.variant, input.capacity_gb ? `${input.capacity_gb} GB` : null]
      .filter(Boolean)
      .join(" - ") || "-";
  const safeSku = input.sku || "-";
  const safeImei = input.imei_sn || "-";
  const safeAmount = formatCurrency(input.final_price_cents ?? null) || "-";
  const createdStr = safeDateString(input.created_at) || "(geen datum)";
  const finishedStr =
    safeDateString(input.finished_at) || "(nog niet afgewerkt)";

  const html = `
    <p>In de bijlage vind je de aankoopborderel van deze buyback-order als PDF.</p>
    <p><strong>Samenvatting:</strong></p>
    <ul>
      <li>Klantnummer: ${safeCustomer}</li>
      <li>Ordernummer: ${safeOrder}</li>
      <li>Model: ${safeModel}</li>
      <li>SKU: ${safeSku}</li>
      <li>IMEI/SN: ${safeImei}</li>
      <li>Overnameprijs: ${safeAmount}</li>
      <li>Datum aanvraag: ${createdStr}</li>
      <li>Datum afgewerkt: ${finishedStr}</li>
    </ul>
  `;

  try {
    await resend.emails.send({
      from: fromAddress,
      to,
      subject: `[${brandName}] Aankoopborderel buyback-order ${orderRef}`,
      html,
      attachments: [
        {
          filename: `Aankoopborderel_${orderRef || "buyback"}.pdf`,
          content: pdfBuffer.toString("base64"),
          contentType: "application/pdf",
        },
      ],
    });
    console.info("[FINANCE][borderel] sent OK", { to, orderRef });
  } catch (e: any) {
    console.error(
      "[FINANCE][borderel] send failed:",
      e?.message || e?.toString() || e
    );
  }
}
