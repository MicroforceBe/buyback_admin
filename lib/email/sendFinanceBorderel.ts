// lib/email/sendFinanceBorderel.ts
"use server";

import { Resend } from "resend";
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

  // optioneel: Q&A
  questions_answers_html?: string | null;
};

function formatCurrency(cents?: number | null): string {
  if (cents == null) return "";
  const eur = cents / 100;
  // Simpel houden om rare symbolen te vermijden
  return `${eur.toFixed(2)} EUR`;
}

/**
 * Eenvoudige PDF-generator (single page, tekst) zonder externe fonts/files.
 * We bouwen een minimale PDF-structuur in memory.
 */
function buildBorderelPdf(input: FinanceBorderelInput): Promise<Buffer> {
  return new Promise((resolve) => {
    const brandName = input.brand_name_override || "Microforce Buyback";
    const fullName = [input.first_name, input.last_name].filter(Boolean).join(" ");
    const orderRef = input.order_code || "-";
    const amountStr = formatCurrency(input.final_price_cents ?? null);

    const lines: string[] = [];

    // HEADER
    lines.push(`${brandName} - Aankoopborderel`);
    lines.push(`Datum: ${new Date().toLocaleString("nl-BE")}`);
    lines.push(`Buyback-order: ${orderRef}`);
    lines.push("");

    // KLANTGEGEVENS
    lines.push("Klantgegevens");
    if (fullName) lines.push(`Naam: ${fullName}`);
    if (input.customer_number) lines.push(`Klantnummer: ${input.customer_number}`);
    if (input.email) lines.push(`E-mail: ${input.email}`);
    if (input.phone) lines.push(`Telefoon: ${input.phone}`);
    if (input.street || input.house_number || input.postal_code || input.city) {
      const addrLine1 = [input.street, input.house_number].filter(Boolean).join(" ");
      const addrLine2 = [input.postal_code, input.city].filter(Boolean).join(" ");
      if (addrLine1) lines.push(`Adres: ${addrLine1}`);
      if (addrLine2) lines.push(`        ${addrLine2}`);
    }
    if (input.country) lines.push(`Land: ${input.country}`);
    lines.push("");

    // TOESTEL
    lines.push("Toestel");
    const deviceParts: string[] = [];
    if (input.model) deviceParts.push(input.model);
    if (input.variant) deviceParts.push(input.variant);
    let deviceLabel = deviceParts.join(" - ");
    if (input.capacity_gb) {
      deviceLabel = deviceLabel
        ? `${deviceLabel} (${input.capacity_gb} GB)`
        : `${input.capacity_gb} GB`;
    }
    if (deviceLabel) lines.push(`Model: ${deviceLabel}`);
    if (input.sku) lines.push(`SKU: ${input.sku}`);
    if (input.imei_sn) lines.push(`IMEI/SN: ${input.imei_sn}`);
    if (amountStr) lines.push(`Overnameprijs: ${amountStr}`);
    lines.push("");

    // UITBETALING
    lines.push("Uitbetaling");
    if (input.wants_voucher) {
      lines.push(
        "Methode: Voucher (te gebruiken als korting bij aankoop van een toestel)."
      );
      if (amountStr) lines.push(`Voucherwaarde: ${amountStr}`);
    } else {
      lines.push("Methode: Bankoverschrijving");
      if (amountStr) lines.push(`Bedrag: ${amountStr}`);
      if (input.iban) lines.push(`IBAN: ${input.iban}`);
    }
    lines.push("");

    // LEVERING / INNAME
    lines.push("Levering / Inname");
    const method = input.delivery_method;
    if (method === "ship") {
      lines.push("Methode: Verzending naar Microforce (gratis verzendlabel).");
    } else if (method === "dropoff") {
      lines.push("Methode: Binnenbrengen in de winkel.");
    } else {
      lines.push("Methode: Onbekend / niet ingevuld.");
    }

    if (method === "dropoff" && input.shop_location) {
      lines.push(`Winkel: ${input.shop_location}`);
      const shopAddr1 = input.shop_address1;
      const shopAddr2 = [input.shop_zip, input.shop_city]
        .filter(Boolean)
        .join(" ");
      if (shopAddr1) lines.push(`Adres winkel: ${shopAddr1}`);
      if (shopAddr2) lines.push(`              ${shopAddr2}`);
    }
    lines.push("");

    // TRACKING
    lines.push("Tracking");
    if (input.tracking_code || input.tracking_url || input.label_pdf_url) {
      if (input.tracking_code) lines.push(`Tracking code: ${input.tracking_code}`);
      if (input.tracking_url) lines.push(`Tracking URL: ${input.tracking_url}`);
      if (input.label_pdf_url) lines.push(`Label URL: ${input.label_pdf_url}`);
    } else {
      lines.push("Geen trackinginformatie beschikbaar.");
    }
    lines.push("");

    // STATUS
    lines.push("Status");
    if (input.status) {
      lines.push(`Status: ${input.status}`);
    } else {
      lines.push("Status: (niet opgegeven)");
    }
    lines.push("");

    // FOOTER
    lines.push(
      "Dit document is een aankoopborderel voor een buyback-order."
    );
    lines.push(
      "Gelieve dit document intern te bewaren voor de boekhouding."
    );

    // ==== PDF STRUCTUUR BOUWEN ====

    // Helper: PDF-string escapen
    const escapePdfString = (s: string) =>
      s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

    // Content stream: eenvoudige tekstregels met Helvetica 10pt
    let y = 800;
    const lineHeight = 14;
    const contentParts: string[] = [];
    for (const line of lines) {
      const safe = escapePdfString(line);
      contentParts.push(
        "BT",
        "/F1 10 Tf",
        `50 ${y} Td`,
        `(${safe}) Tj`,
        "ET"
      );
      y -= lineHeight;
      if (y < 50) break; // één pagina is genoeg
    }
    const contentStream = contentParts.join("\n") + "\n";
    const contentLength = Buffer.byteLength(contentStream, "utf8");

    let pdf = "%PDF-1.4\n";
    const offsets: number[] = [];

    const addObject = (index: number, body: string) => {
      const offset = Buffer.byteLength(pdf, "utf8");
      offsets.push(offset);
      pdf += `${index} 0 obj\n${body}\nendobj\n`;
    };

    // 1: Catalog
    addObject(1, "<< /Type /Catalog /Pages 2 0 R >>");

    // 2: Pages
    addObject(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");

    // 3: Page
    addObject(
      3,
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] " +
        "/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>"
    );

    // 4: Font (standaard Helvetica, ingebouwd in PDF viewers)
    addObject(
      4,
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
    );

    // 5: Content stream
    addObject(
      5,
      `<< /Length ${contentLength} >>\nstream\n${contentStream}endstream`
    );

    // xref + trailer
    const xrefOffset = Buffer.byteLength(pdf, "utf8");
    let xref = `xref\n0 ${offsets.length + 1}\n0000000000 65535 f \n`;
    for (let i = 0; i < offsets.length; i++) {
      const off = offsets[i].toString().padStart(10, "0");
      xref += `${off} 00000 n \n`;
    }
    xref +=
      "trailer\n" +
      `<< /Size ${offsets.length + 1} /Root 1 0 R >>\n` +
      "startxref\n" +
      `${xrefOffset}\n` +
      "%%EOF";

    pdf += xref;

    resolve(Buffer.from(pdf, "utf8"));
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
  const amountStr = formatCurrency(input.final_price_cents ?? null);

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

  const safeOrder = escapeHtml(orderRef);
  const safeModel = escapeHtml(
    [input.model, input.variant].filter(Boolean).join(" - ") ||
      "(model onbekend)"
  );
  const safeSku = input.sku ? escapeHtml(input.sku) : "(geen SKU)";
  const safeImei = input.imei_sn ? escapeHtml(input.imei_sn) : "(geen IMEI/SN)";
  const safeAmount = amountStr ? escapeHtml(amountStr) : "(geen prijs)";
  const safeCustomer =
    input.customer_number && input.customer_number.trim()
      ? escapeHtml(input.customer_number)
      : "(geen klantnummer)";

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
