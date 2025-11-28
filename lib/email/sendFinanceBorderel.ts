// lib/email/sendFinanceBorderel.ts
"use server";

import { Resend } from "resend";
import PDFDocument from "pdfkit";
import type { BuybackStatus } from "./templates";

const resendApiKey = process.env.RESEND_API_KEY || "";
const resend = resendApiKey ? new Resend(resendApiKey) : null;

export interface FinanceBorderelInput {
  // wie ontvangt de mail
  to: string;
  status: BuybackStatus;

  // basis + identificatie
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  order_code: string | null;

  // toestel
  model: string | null;
  capacity_gb: number | null;
  variant: string | null;
  sku: string | null;
  imei_sn: string | null;

  // prijs / uitbetaling
  final_price_cents: number | null;
  wants_voucher: boolean | null;
  iban: string | null;

  // klant & adres
  customer_number: string | null;
  street: string | null;
  house_number: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;

  // levering / shop
  delivery_method: "ship" | "dropoff" | null;
  shop_location: string | null;
  shop_address1: string | null;
  shop_zip: string | null;
  shop_city: string | null;
  opening_hours: Record<string, string> | null;

  // tracking / label
  tracking_code?: string;
  tracking_url?: string;
  label_pdf_url?: string;

  // branding
  brand_name_override?: string | null;

  // optioneel: Q&A info
  questions_answers_html?: string | null;
}

/**
 * Maak een PDF-buffer met een aankoopborderel-stijl document.
 */
function buildBorderelPdf(input: FinanceBorderelInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 40 });

      const chunks: Buffer[] = [];
      doc.on("data", (chunk) => chunks.push(chunk as Buffer));
      doc.on("end", () => {
        resolve(Buffer.concat(chunks));
      });
      doc.on("error", (err) => reject(err));

      const brand =
        input.brand_name_override ||
        process.env.MAIL_BRAND_NAME ||
        "Microforce Buyback";

      const fullName = [input.first_name, input.last_name]
        .filter(Boolean)
        .join(" ") || "-";

      const amountEur =
        typeof input.final_price_cents === "number"
          ? (input.final_price_cents / 100).toFixed(2)
          : "-";

      // Header
      doc.fontSize(18).text(brand, { align: "left" });
      doc.moveDown(0.5);
      doc
        .fontSize(12)
        .text("Aankoopborderel – toestelovername", { align: "left" });
      doc.moveDown(0.3);
      doc
        .fontSize(10)
        .text(`Datum: ${new Date().toLocaleDateString("nl-BE")}`, {
          align: "left",
        });
      doc
        .fontSize(10)
        .text(`Ordernummer: ${input.order_code || "-"}`, { align: "left" });
      if (input.tracking_code) {
        doc
          .fontSize(9)
          .fillColor("#555")
          .text(`Tracking: ${input.tracking_code}`, { align: "left" });
      }
      doc.moveDown(1);
      doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
      doc.moveDown(0.6);

      // Klantblok
      doc.fontSize(12).fillColor("#000").text("Klantgegevens", {
        underline: false,
      });
      doc.moveDown(0.4);
      doc.fontSize(10);

      doc.text(`Naam: ${fullName}`);
      if (input.customer_number) {
        doc.text(`Klantnummer: ${input.customer_number}`);
      }
      if (input.street || input.house_number || input.postal_code || input.city) {
        const addrLine1 = [input.street, input.house_number]
          .filter(Boolean)
          .join(" ");
        const addrLine2 = [input.postal_code, input.city]
          .filter(Boolean)
          .join(" ");
        if (addrLine1) doc.text(`Adres: ${addrLine1}`);
        if (addrLine2) doc.text(addrLine2);
      }
      if (input.country) {
        doc.text(`Land: ${input.country}`);
      }
      if (input.phone) {
        doc.text(`Tel: ${input.phone}`);
      }
      if (input.email) {
        doc.text(`E-mail: ${input.email}`);
      }

      doc.moveDown(0.8);
      doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
      doc.moveDown(0.6);

      // Toestelblok
      doc.fontSize(12).fillColor("#000").text("Toestelgegevens");
      doc.moveDown(0.4);
      doc.fontSize(10);

      const modelParts: string[] = [];
      if (input.model) modelParts.push(input.model);
      if (input.capacity_gb) modelParts.push(`${input.capacity_gb} GB`);
      if (input.variant) modelParts.push(input.variant);
      doc.text(`Model: ${modelParts.join(" • ") || "-"}`);
      if (input.sku) doc.text(`SKU: ${input.sku}`);
      if (input.imei_sn) doc.text(`IMEI/SN: ${input.imei_sn}`);

      if (input.delivery_method === "dropoff") {
        doc.text(`Aflevermethode: Binnenbrengen`);
      } else if (input.delivery_method === "ship") {
        doc.text(`Aflevermethode: Verzending`);
      } else {
        doc.text(`Aflevermethode: -`);
      }

      if (input.shop_location || input.shop_city || input.shop_address1) {
        doc.moveDown(0.3);
        doc.fontSize(10).text("Inleverpunt:");
        if (input.shop_location)
          doc.text(`  Naam: ${input.shop_location}`, { indent: 10 });
        if (input.shop_address1)
          doc.text(`  Adres: ${input.shop_address1}`, { indent: 10 });
        const shopZipCity = [input.shop_zip, input.shop_city]
          .filter(Boolean)
          .join(" ");
        if (shopZipCity) doc.text(`  ${shopZipCity}`, { indent: 10 });
      }

      doc.moveDown(0.8);
      doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
      doc.moveDown(0.6);

      // Uitbetaling
      doc.fontSize(12).fillColor("#000").text("Uitbetaling");
      doc.moveDown(0.4);
      doc.fontSize(10);

      doc.text(`Overnamebedrag: € ${amountEur}`);
      if (input.wants_voucher) {
        doc.text("Uitbetalingswijze: Voucher / waardebon");
      } else {
        doc.text("Uitbetalingswijze: Overschrijving");
      }

      if (!input.wants_voucher && input.iban) {
        doc.text(`IBAN: ${input.iban}`);
      }

      doc.moveDown(0.8);
      doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
      doc.moveDown(0.6);

      // Opmerkingen / status
      doc.fontSize(12).fillColor("#000").text("Status & opmerkingen");
      doc.moveDown(0.4);
      doc.fontSize(10);

      doc.text(`Status: ${input.status}`);
      if (input.tracking_url) {
        doc.moveDown(0.3);
        doc.text(`Tracking URL: ${input.tracking_url}`, {
          link: input.tracking_url,
          underline: true,
        });
      }

      if (input.questions_answers_html) {
        // Heel basic: HTML strippen naar platte tekst (minimalistisch)
        const plain = input.questions_answers_html
          .replace(/<br\s*\/?>/gi, "\n")
          .replace(/<[^>]+>/g, "")
          .trim();
        if (plain) {
          doc.moveDown(0.8);
          doc.fontSize(11).text("Technische vragen & antwoorden");
          doc.moveDown(0.3);
          doc.fontSize(9).text(plain, { width: 515 });
        }
      }

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Stuur een mail naar finance met aankoopborderel-PDF in bijlage.
 */
export async function sendFinanceBorderelMail(input: FinanceBorderelInput) {
  if (!input.to) {
    console.warn("[FINANCE][borderel] missing 'to', skipping send");
    return;
  }

  const fromAddress =
    process.env.MAIL_FROM || "no-reply@microforce-buyback.local";

  const subjectBase = input.brand_name_override || "Microforce Buyback";
  const subject = `${subjectBase} – aankoopborderel ${
    input.order_code ? `#${input.order_code}` : ""
  }`.trim();

  // PDF genereren
  const pdfBuffer = await buildBorderelPdf(input);

  if (!resend) {
    console.warn(
      "[FINANCE][borderel] RESEND_API_KEY missing – mail wordt niet echt verstuurd"
    );
    console.info("[FINANCE][borderel] would send:", {
      from: fromAddress,
      to: input.to,
      subject,
    });
    return;
  }

  try {
    await resend.emails.send({
      from: fromAddress,
      to: input.to,
      subject,
      html:
        "<p>In de bijlage vind je de aankoopborderel als PDF.</p>" +
        (input.order_code
          ? `<p>Ordernummer: <strong>${input.order_code}</strong></p>`
          : ""),
      attachments: [
        {
          filename: `aankoopborderel-${input.order_code || "order"}.pdf`,
          content: pdfBuffer.toString("base64"),
        },
      ],
    });

    console.info("[FINANCE][borderel] sent OK", {
      to: input.to,
      subject,
    });
  } catch (e: any) {
    console.error(
      "[FINANCE][borderel] send failed:",
      e?.message || e?.toString() || e
    );
  }
}
