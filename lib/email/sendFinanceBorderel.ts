// lib/email/sendFinanceBorderel.ts
"use server";

import { Resend } from "resend";
import type { BuybackStatus } from "./templates";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

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

  // optioneel: Q&A
  questions_answers_html?: string | null;

  // datums
  created_at?: string | null;
  done_at?: string | null;

  // batterij + gebruikte onderdelen
  battery_percentage?: number | null;
  used_parts_skus?: string[] | null;
};

function formatCurrencyPlain(cents?: number | null): string {
  if (cents == null) return "";
  const eur = cents / 100;
  // Bewust zonder € symbool om vreemde blokjes te vermijden
  return eur.toFixed(2).replace(".", ",") + " EUR";
}

function fmtDateTime(input?: string | null): string {
  if (!input) return "-";
  try {
    const d = new Date(input);
    return d.toLocaleString("nl-BE", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return input;
  }
}

async function buildBorderelPdf(input: FinanceBorderelInput): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage();

  const width = page.getWidth();
  const height = page.getHeight();

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const margin = 40;
  let cursorY = height - margin;

  const brandName = input.brand_name_override || "Microforce Buyback";
  const fullName = [input.first_name, input.last_name].filter(Boolean).join(" ");
  const orderRef = input.order_code || "-";
  const amountStr = formatCurrencyPlain(input.final_price_cents ?? null);
  const createdStr = fmtDateTime(input.created_at);
  const doneStr = fmtDateTime(input.done_at);

  const lineHeight = 14;

  const drawLine = (text: string, opts?: { bold?: boolean }) => {
    const f = opts?.bold ? fontBold : font;
    page.drawText(text, {
      x: margin,
      y: cursorY,
      size: 10,
      font: f,
      color: rgb(0, 0, 0),
    });
    cursorY -= lineHeight;
  };

  const drawTitle = (text: string) => {
    page.drawText(text, {
      x: margin,
      y: cursorY,
      size: 16,
      font: fontBold,
      color: rgb(0, 0, 0),
    });
    cursorY -= lineHeight * 1.8;
  };

  const drawSectionHeader = (text: string) => {
    page.drawText(text, {
      x: margin,
      y: cursorY,
      size: 12,
      font: fontBold,
      color: rgb(0, 0, 0),
    });
    cursorY -= lineHeight * 1.2;
  };

  const moveDown = (lines = 1) => {
    cursorY -= lineHeight * lines;
  };

  // ===== HEADER =====
  drawTitle(`${brandName} – Aankoopborderel`);
  drawLine(`Buyback-order: ${orderRef}`);
  // Datum borderel expliciet NIET meer tonen (vraag gebruiker)
  drawLine(`Datum aanvraag: ${createdStr}`);
  drawLine(`Datum afgewerkt: ${doneStr}`);
  moveDown(1);

  // ===== KLANTGEGEVENS =====
  drawSectionHeader("Klantgegevens");
  if (fullName) drawLine(`Naam: ${fullName}`);
  if (input.customer_number) drawLine(`Klantnummer: ${input.customer_number}`);
  if (input.email) drawLine(`E-mail: ${input.email}`);
  if (input.phone) drawLine(`Telefoon: ${input.phone}`);

  if (input.street || input.house_number || input.postal_code || input.city) {
    const addrLine1 = [input.street, input.house_number].filter(Boolean).join(" ");
    const addrLine2 = [input.postal_code, input.city].filter(Boolean).join(" ");
    if (addrLine1) drawLine(`Adres: ${addrLine1}`);
    if (addrLine2) drawLine(`       ${addrLine2}`);
  }
  if (input.country) drawLine(`Land: ${input.country}`);
  moveDown(1);

  // ===== TOESTEL =====
  drawSectionHeader("Toestel");

  const deviceParts: string[] = [];
  if (input.model) deviceParts.push(input.model);
  if (input.variant) deviceParts.push(input.variant);
  let deviceLabel = deviceParts.join(" – ");
  if (input.capacity_gb) {
    deviceLabel = deviceLabel
      ? `${deviceLabel} (${input.capacity_gb} GB)`
      : `${input.capacity_gb} GB`;
  }
  if (deviceLabel) drawLine(`Model: ${deviceLabel}`);
  if (input.sku) drawLine(`SKU: ${input.sku}`);
  if (input.imei_sn) drawLine(`IMEI/SN: ${input.imei_sn}`);

  if (typeof input.battery_percentage === "number") {
    drawLine(`Batterij: ${input.battery_percentage}%`);
  }

  if (Array.isArray(input.used_parts_skus) && input.used_parts_skus.length > 0) {
    const partsStr = input.used_parts_skus.join(", ");
    drawLine(`Gebruikte onderdelen: ${partsStr}`);
  }

  drawLine(`Finale overname prijs: ${amountStr || "-"}`);
  moveDown(1);

  // ===== UITBETALING =====
  drawSectionHeader("Uitbetaling");
  if (input.wants_voucher) {
    drawLine("Methode: Voucher (korting bij aankoop van een toestel).");
    if (amountStr) drawLine(`Voucherwaarde: ${amountStr}`);
  } else {
    drawLine("Methode: Bankoverschrijving.");
    if (amountStr) drawLine(`Bedrag: ${amountStr}`);
    if (input.iban) drawLine(`IBAN: ${input.iban}`);
  }
  moveDown(1);

  // ===== LEVERING / INNAME =====
  drawSectionHeader("Levering / Inname");
  const method = input.delivery_method;
  if (method === "ship") {
    drawLine("Methode: Verzending naar Microforce (gratis verzendlabel).");
  } else if (method === "dropoff") {
    drawLine("Methode: Binnenbrengen in de winkel.");
  } else {
    drawLine("Methode: Onbekend / niet ingevuld.");
  }

  if (method === "dropoff" && input.shop_location) {
    drawLine(`Winkel: ${input.shop_location}`);
    const shopAddr1 = input.shop_address1;
    const shopAddr2 = [input.shop_zip, input.shop_city].filter(Boolean).join(" ");
    if (shopAddr1) drawLine(`Adres winkel: ${shopAddr1}`);
    if (shopAddr2) drawLine(`              ${shopAddr2}`);
  }
  moveDown(1);

  // ===== TRACKING =====
  drawSectionHeader("Tracking");
  // Volgens vraag: geen tracking URL en geen label URL meer tonen, enkel eventueel code
  if (input.tracking_code) {
    drawLine(`Tracking code: ${input.tracking_code}`);
  } else {
    drawLine("Geen trackinginformatie beschikbaar.");
  }
  moveDown(1);

  // ===== STATUS =====
  drawSectionHeader("Status");
  if (input.status) {
    drawLine(`Status: ${input.status}`);
  } else {
    drawLine("Status: (niet opgegeven)");
  }
  moveDown(1);

  // kleine voetnoot
  page.drawText(
    "Dit document is een aankoopborderel voor een buyback-order. " +
      "Gelieve dit document intern te bewaren voor de boekhouding.",
    {
      x: margin,
      y: margin,
      size: 8,
      font,
      color: rgb(0.3, 0.3, 0.3),
      maxWidth: width - margin * 2,
    }
  );

  const pdfBytes = await pdfDoc.save();
  return pdfBytes;
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
  const amountStr = formatCurrencyPlain(input.final_price_cents ?? null);

  const modelParts: string[] = [];
  if (input.model) modelParts.push(input.model);
  if (input.variant) modelParts.push(input.variant);
  if (input.capacity_gb) modelParts.push(`${input.capacity_gb} GB`);
  const modelLabel = modelParts.join(" – ");

  const createdStr = fmtDateTime(input.created_at);
  const doneStr = fmtDateTime(input.done_at);

  // PDF bouwen (pdf-lib, geen pdfkit/Helvetica.afm meer)
  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await buildBorderelPdf(input);
  } catch (e: any) {
    console.error(
      "[FINANCE][borderel] failed to build PDF:",
      e?.message || e
    );
    return;
  }

  const pdfBase64 = Buffer.from(pdfBytes).toString("base64");

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

  const htmlSummaryParts: string[] = [];
  if (input.customer_number)
    htmlSummaryParts.push(`<strong>Klantnr</strong>: ${input.customer_number}`);
  htmlSummaryParts.push(`<strong>Order</strong>: ${orderRef}`);
  if (modelLabel) htmlSummaryParts.push(`<strong>Model</strong>: ${modelLabel}`);
  if (input.sku) htmlSummaryParts.push(`<strong>SKU</strong>: ${input.sku}`);
  if (input.imei_sn)
    htmlSummaryParts.push(`<strong>IMEI/SN</strong>: ${input.imei_sn}`);
  if (typeof input.battery_percentage === "number") {
    htmlSummaryParts.push(
      `<strong>Batterij</strong>: ${input.battery_percentage}%`
    );
  }
  if (Array.isArray(input.used_parts_skus) && input.used_parts_skus.length > 0) {
    htmlSummaryParts.push(
      `<strong>Gebruikte onderdelen</strong>: ${input.used_parts_skus.join(", ")}`
    );
  }
  if (amountStr)
    htmlSummaryParts.push(
      `<strong>Finale overname prijs</strong>: ${amountStr}`
    );
  htmlSummaryParts.push(`<strong>Datum aanvraag</strong>: ${createdStr}`);
  htmlSummaryParts.push(`<strong>Datum afgewerkt</strong>: ${doneStr}`);

  const htmlSummary =
    "<p>Overzicht van deze buyback-order:</p><ul>" +
    htmlSummaryParts.map((p) => `<li>${p}</li>`).join("") +
    "</ul>";

  try {
    await resend.emails.send({
      from: fromAddress,
      to,
      subject: `[${brandName}] Aankoopborderel buyback-order ${orderRef}`,
      html:
        htmlSummary +
        "<p>In de bijlage vind je de aankoopborderel van deze buyback-order als PDF.</p>",
      attachments: [
        {
          filename: `Aankoopborderel_${orderRef || "buyback"}.pdf`,
          content: pdfBase64,
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

