// lib/email/sendFinanceBorderel.ts
"use server";

import { Resend } from "resend";
import PDFDocument from "pdfkit";
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

function buildBorderelPdf(input: FinanceBorderelInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 40,
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", (err) => reject(err));

    const brandName = input.brand_name_override || "Microforce Buyback";
    const fullName = [input.first_name, input.last_name].filter(Boolean).join(" ");
    const orderRef = input.order_code || "-";
    const amountStr = formatCurrency(input.final_price_cents ?? null);

    const createdStr = safeDateString(input.created_at);
    const finishedStr = safeDateString(input.finished_at);

    // ===== HEADER =====
    doc.fontSize(18).text(`${brandName} - Aankoopborderel`, { align: "left" });
    doc.moveDown(0.5);
    doc
      .fontSize(10)
      .text(`Datum document: ${new Date().toLocaleString("nl-BE")}`, {
        align: "right",
      });
    doc.moveDown(0.5);
    doc.fontSize(11).text(`Buyback-order: ${orderRef}`, { align: "left" });

    doc.moveDown(1);

    // ===== KLANTGEGEVENS =====
    doc.fontSize(12).text("Klantgegevens");
    doc.moveDown(0.3);
    doc.fontSize(10);
    if (fullName) doc.text(`Naam: ${fullName}`);
    if (input.customer_number) doc.text(`Klantnummer: ${input.customer_number}`);
    if (input.email) doc.text(`E-mail: ${input.email}`);
    if (input.phone) doc.text(`Telefoon: ${input.phone}`);

    if (input.street || input.house_number || input.postal_code || input.city) {
      const addrLine1 = [input.street, input.house_number].filter(Boolean).join(" ");
      const addrLine2 = [input.postal_code, input.city].filter(Boolean).join(" ");
      if (addrLine1) doc.text(`Adres: ${addrLine1}`);
      if (addrLine2) doc.text(`       ${addrLine2}`);
    }
    if (input.country) doc.text(`Land: ${input.country}`);

    // Datums
    if (createdStr || finishedStr) {
      doc.moveDown(0.5);
      doc.fontSize(11).text("Datums");
      doc.fontSize(10);
      if (createdStr) doc.text(`Aanvraag: ${createdStr}`);
      if (finishedStr) doc.text(`Afgewerkt: ${finishedStr}`);
    }

    doc.moveDown(1);

    // ===== TOESTEL =====
    doc.fontSize(12).text("Toestel");
    doc.moveDown(0.3);
    doc.fontSize(10);

    const deviceParts: string[] = [];
    if (input.model) deviceParts.push(input.model);
    if (input.variant) deviceParts.push(input.variant);
    let deviceLabel = deviceParts.join(" - ");
    if (input.capacity_gb) {
      deviceLabel = deviceLabel
        ? `${deviceLabel} (${input.capacity_gb} GB)`
        : `${input.capacity_gb} GB`;
    }

    if (deviceLabel) doc.text(`Model: ${deviceLabel}`);
    if (input.sku) doc.text(`SKU: ${input.sku}`);
    if (input.imei_sn) doc.text(`IMEI/SN: ${input.imei_sn}`);
    if (amountStr) doc.text(`Overnameprijs: ${amountStr}`);
    doc.moveDown(1);

    // ===== UITBETALING =====
    doc.fontSize(12).text("Uitbetaling");
    doc.moveDown(0.3);
    doc.fontSize(10);

    if (input.wants_voucher) {
      doc.text(
        "Methode: Voucher (te gebruiken als korting bij aankoop van een toestel)."
      );
      if (amountStr) doc.text(`Voucherwaarde: ${amountStr}`);
    } else {
      doc.text("Methode: Bankoverschrijving");
      if (amountStr) doc.text(`Bedrag: ${amountStr}`);
      if (input.iban) doc.text(`IBAN: ${input.iban}`);
    }
    doc.moveDown(1);

    // ===== LEVERING / INNAME =====
    doc.fontSize(12).text("Levering / Inname");
    doc.moveDown(0.3);
    doc.fontSize(10);

    const method = input.delivery_method;
    if (method === "ship") {
      doc.text("Methode: Verzending naar Microforce (gratis verzendlabel).");
    } else if (method === "dropoff") {
      doc.text("Methode: Binnenbrengen in de winkel.");
    } else {
      doc.text("Methode: Onbekend / niet ingevuld.");
    }

    if (method === "dropoff" && input.shop_location) {
      doc.text(`Winkel: ${input.shop_location}`);
      const shopAddr1 = input.shop_address1;
      const shopAddr2 = [input.shop_zip, input.shop_city]
        .filter(Boolean)
        .join(" ");
      if (shopAddr1) doc.text(`Adres winkel: ${shopAddr1}`);
      if (shopAddr2) doc.text(`             ${shopAddr2}`);
    }

    doc.moveDown(1);

    // ===== TRACKING =====
    doc.fontSize(12).text("Tracking");
    doc.moveDown(0.3);
    doc.fontSize(10);

    if (input.tracking_code || input.tracking_url || input.label_pdf_url) {
      if (input.tracking_code) doc.text(`Tracking code: ${input.tracking_code}`);
      if (input.tracking_url) doc.text(`Tracking URL: ${input.tracking_url}`);
      if (input.label_pdf_url) doc.text(`Label URL: ${input.label_pdf_url}`);
    } else {
      doc.text("Geen trackinginformatie beschikbaar.");
    }

    doc.moveDown(1);

    // ===== STATUS =====
    doc.fontSize(12).text("Status");
    doc.moveDown(0.3);
    doc.fontSize(10);

    if (input.status) {
      doc.text(`Status: ${input.status}`);
    } else {
      doc.text("Status: (niet opgegeven)");
    }

    doc.moveDown(1);

    // Kleine voetnoot
    doc
      .fontSize(8)
      .fillColor("gray")
      .text(
        "Dit document is een aankoopborderel voor een buyback-order. " +
          "Gelieve dit document intern te bewaren voor de boekhouding.",
        { align: "left" }
      );

    doc.end();
  });
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
