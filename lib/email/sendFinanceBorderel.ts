// lib/email/sendFinanceBorderel.ts
"use server";

import { Resend } from "resend";
import type { BuybackStatus, TemplateContext } from "./templates";
import PDFDocument from "pdfkit";

const resendApiKey = process.env.RESEND_API_KEY || "";
const resend = resendApiKey ? new Resend(resendApiKey) : null;

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

type FinanceBorderelInput = TemplateContext & {
  to: string;
  language?: string;
  status?: BuybackStatus;
  customer_number?: string | null;
  brand_name_override?: string | null;
};

async function buildBorderelPdfBuffer(
  input: FinanceBorderelInput
): Promise<Buffer> {
  const brandName =
    input.brand_name_override || process.env.MAIL_BRAND_NAME || "Microforce Buyback";

  const doc = new PDFDocument({ size: "A4", margin: 50 });

  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", (err) => reject(err));
  });

  const fullName = `${input.first_name || ""} ${input.last_name || ""}`.trim() || "Onbekend";
  const orderCode = input.order_code || "—";
  const now = new Date();
  const dateStr = now.toLocaleString("nl-BE", {
    dateStyle: "short",
    timeStyle: "short",
  });

  const deviceParts: string[] = [];
  if (input.model) deviceParts.push(input.model);
  if (input.variant) deviceParts.push(input.variant);
  let deviceLabel = deviceParts.join(" – ");
  if (input.capacity_gb) {
    deviceLabel = deviceLabel
      ? `${deviceLabel} (${input.capacity_gb} GB)`
      : `${input.capacity_gb} GB`;
  }

  const prijsStr = formatCurrency(input.final_price_cents ?? null);
  const payoutMethod = input.wants_voucher
    ? "Voucher"
    : "Bankoverschrijving";

  // ===== PDF layout =====
  doc.fontSize(18).text(`${brandName}`, { align: "left" });
  doc.moveDown(0.5);
  doc.fontSize(14).text("Aankoopborderel – Buyback", { align: "left" });
  doc.moveDown(0.5);
  doc.fontSize(10).text(`Datum: ${dateStr}`);
  doc.text(`Ordercode: ${orderCode}`);
  if (input.status) {
    doc.text(`Status: ${input.status}`);
  }
  doc.moveDown(1);

  // Klant
  doc.fontSize(12).text("Klantgegevens", { underline: true });
  doc.moveDown(0.3);
  doc.fontSize(10);
  doc.text(`Naam: ${fullName}`);
  if (input.customer_number) doc.text(`Klantnummer: ${input.customer_number}`);
  if (input.street || input.house_number || input.postal_code || input.city) {
    const addrLine1 = [input.street, input.house_number].filter(Boolean).join(" ");
    const addrLine2 = [input.postal_code, input.city].filter(Boolean).join(" ");
    if (addrLine1) doc.text(`Adres: ${addrLine1}`);
    if (addrLine2) doc.text(`        ${addrLine2}`);
  }
  if (input.country) doc.text(`Land: ${input.country}`);
  if (input.email) doc.text(`E-mail: ${input.email}`);
  if (input.phone) doc.text(`Telefoon: ${input.phone}`);
  doc.moveDown(1);

  // Toestel
  doc.fontSize(12).text("Toestel", { underline: true });
  doc.moveDown(0.3);
  doc.fontSize(10);
  doc.text(`Model: ${deviceLabel || "—"}`);
  doc.text(`SKU: ${input.sku || "—"}`);
  doc.text(`IMEI/SN: ${input.imei_sn || "—"}`);
  doc.moveDown(1);

  // Uitbetaling
  doc.fontSize(12).text("Uitbetaling", { underline: true });
  doc.moveDown(0.3);
  doc.fontSize(10);
  doc.text(`Methode: ${payoutMethod}`);
  if (!input.wants_voucher) {
    doc.text(`IBAN: ${input.iban || "—"}`);
  }
  doc.text(`Bedrag: ${prijsStr || "—"}`);
  doc.moveDown(1);

  // Verzendinfo
  if (input.delivery_method === "ship" || input.delivery_method === "dropoff") {
    doc.fontSize(12).text("Levering", { underline: true });
    doc.moveDown(0.3);
    doc.fontSize(10);
    if (input.delivery_method === "ship") {
      doc.text("Methode: Verzending");
    } else {
      doc.text("Methode: Binnenbrengen in winkel");
    }
    if (input.shop_location) {
      doc.text(`Locatie: ${input.shop_location}`);
    }
    if (input.shop_address1 || input.shop_zip || input.shop_city) {
      const line1 = input.shop_address1 || "";
      const line2 = [input.shop_zip, input.shop_city].filter(Boolean).join(" ");
      if (line1) doc.text(`Adres: ${line1}`);
      if (line2) doc.text(`       ${line2}`);
    }
    if (input.tracking_code || input.tracking_url || input.label_pdf_url) {
      doc.moveDown(0.3);
      doc.text("Tracking / label:");
      if (input.tracking_code) doc.text(`- Tracking code: ${input.tracking_code}`);
      if (input.tracking_url) doc.text(`- Tracking URL: ${input.tracking_url}`);
      if (input.label_pdf_url) doc.text(`- Label URL: ${input.label_pdf_url}`);
    }
    doc.moveDown(1);
  }

  // Ruimte voor interne notities
  doc.fontSize(12).text("Interne notities", { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(10).text("(ruimte voor stempel / handtekening / interne notities)");

  doc.end();
  return await done;
}

export async function sendFinanceBorderelMail(
  input: FinanceBorderelInput
) {
  if (!resend) {
    console.warn(
      "[MAIL][finance] RESEND_API_KEY missing – borderel wordt niet verstuurd"
    );
    return;
  }
  const to = input.to;
  if (!to) {
    console.warn("[MAIL][finance] missing 'to', skipping send");
    return;
  }

  const fromAddress =
    process.env.MAIL_FROM || "no-reply@microforce-buyback.local";

  const pdfBuffer = await buildBorderelPdfBuffer(input);
  const pdfBase64 = pdfBuffer.toString("base64");

  const brandName =
    input.brand_name_override || process.env.MAIL_BRAND_NAME || "Microforce Buyback";
  const orderCode = input.order_code || "—";

  const subject = `[${brandName}] Aankoopborderel buyback-order ${orderCode}`;

  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:14px;line-height:1.5;color:#0f172a;">
      <p>Beste,</p>
      <p>In de bijlage vind je de aankoopborderel in PDF-formaat voor buyback-order <strong>${orderCode}</strong>.</p>
      <p>Met vriendelijke groeten,<br/>${brandName}</p>
    </div>
  `;

  try {
    await resend.emails.send({
      from: fromAddress,
      to,
      subject,
      html,
      attachments: [
        {
          filename: `buyback-${orderCode}.pdf`,
          content: pdfBase64,
          contentType: "application/pdf",
        },
      ],
    });
    console.info("[MAIL][finance] borderel sent OK", { to, orderCode });
  } catch (e: any) {
    console.error(
      "[MAIL][finance] borderel send failed:",
      e?.message || e?.toString() || e
    );
  }
}

/**
 * Simpele e-mail bij nieuwe order (zonder PDF).
 * Deze kun je later aanroepen vanuit de route die een nieuwe lead aanmaakt.
 */
export type NewOrderMailInput = TemplateContext & {
  to: string;
  brand_name?: string | null;
};

export async function sendNewOrderNotificationMail(
  input: NewOrderMailInput
) {
  if (!resend) {
    console.warn(
      "[MAIL][new-order] RESEND_API_KEY missing – mail wordt niet verstuurd"
    );
    return;
  }
  const to = input.to;
  if (!to) return;

  const fromAddress =
    process.env.MAIL_FROM || "no-reply@microforce-buyback.local";

  const brandName =
    input.brand_name || process.env.MAIL_BRAND_NAME || "Microforce Buyback";
  const orderCode = input.order_code || "—";
  const fullName = `${input.first_name || ""} ${input.last_name || ""}`.trim() || "Onbekend";

  const subject = `[${brandName}] Nieuwe buyback-order ${orderCode}`;

  const modelParts: string[] = [];
  if (input.model) modelParts.push(input.model);
  if (input.variant) modelParts.push(input.variant);
  let deviceLabel = modelParts.join(" – ");
  if (input.capacity_gb) {
    deviceLabel = deviceLabel
      ? `${deviceLabel} (${input.capacity_gb} GB)`
      : `${input.capacity_gb} GB`;
  }

  const prijsStr = formatCurrency(input.final_price_cents ?? null);

  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:14px;line-height:1.5;color:#0f172a;">
      <p>Er is een nieuwe buyback-order aangemaakt.</p>
      <ul>
        <li><strong>Ordercode:</strong> ${orderCode}</li>
        <li><strong>Klant:</strong> ${fullName}</li>
        <li><strong>E-mail:</strong> ${input.email || "—"}</li>
        <li><strong>Telefoon:</strong> ${input.phone || "—"}</li>
        <li><strong>Toestel:</strong> ${deviceLabel || "—"}</li>
        <li><strong>Indicatieve prijs:</strong> ${prijsStr || "—"}</li>
        <li><strong>Methode:</strong> ${
          input.delivery_method === "ship"
            ? "Verzending"
            : input.delivery_method === "dropoff"
            ? "Binnenbrengen"
            : "—"
        }</li>
      </ul>
    </div>
  `;

  try {
    await resend.emails.send({
      from: fromAddress,
      to,
      subject,
      html,
    });
    console.info("[MAIL][new-order] sent OK", { to, orderCode });
  } catch (e: any) {
    console.error(
      "[MAIL][new-order] send failed:",
      e?.message || e?.toString() || e
    );
  }
}
