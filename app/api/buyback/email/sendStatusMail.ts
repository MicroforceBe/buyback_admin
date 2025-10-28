import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY!);
const FROM = process.env.MAIL_FROM!;
const REPLY_TO = process.env.MAIL_REPLY_TO || undefined;

type Input = {
  to: string | null;
  first_name?: string | null;
  last_name?: string | null;
  order_code: string;
  model: string;
  capacity_gb: number | null;
  final_price_cents: number;
  wants_voucher: boolean;
  iban: string | null;
  delivery_method: "ship" | "dropoff" | null;
  shop_location?: string | null;
  shop_address1?: string | null;
  shop_zip?: string | null;
  shop_city?: string | null;
  opening_hours?: Record<string, string> | null;
};

export async function sendStatusMail(input: Input) {
  if (!process.env.RESEND_API_KEY) {
    console.error("[MAIL] Missing RESEND_API_KEY");
    throw new Error("RESEND_API_KEY not set");
  }
  if (!FROM) {
    console.error("[MAIL] Missing MAIL_FROM");
    throw new Error("MAIL_FROM not set");
  }
  if (!input.to) {
    console.warn("[MAIL] No recipient email; skipping send.", { order: input.order_code });
    return { ok: false, reason: "no-recipient" };
  }

  const subject = `Bevestiging buyback aanvraag ${input.order_code}`;
  const amount = (input.final_price_cents / 100).toFixed(2).replace(".", ",");

  // Heel beknopte HTML (jouw uitgebreide template mag hier)
  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif">
      <h2>Bevestiging ${input.order_code}</h2>
      <p>Bedankt, ${input.first_name ?? ""} ${input.last_name ?? ""}.</p>
      <p><strong>Model:</strong> ${input.model}${input.capacity_gb ? ` • ${input.capacity_gb} GB` : ""}</p>
      <p><strong>Indicatieve waarde:</strong> € ${amount}${input.wants_voucher ? " (incl. voucher)" : ""}</p>
      <p><strong>Levering:</strong> ${input.delivery_method === "dropoff" ? `Binnenbrengen — ${input.shop_location ?? "—"}` : "Verzenden"}</p>
    </div>
  `.trim();

  console.log("[MAIL][sendStatusMail] send start", {
    to: input.to,
    from: FROM,
    order_code: input.order_code,
  });

  const { data, error } = await resend.emails.send({
    from: FROM,             // bv. "Microforce Buyback <klantenservice@microforce.be>"
    to: input.to,           // string of string[]
    replyTo: REPLY_TO,      // optioneel
    subject,
    html,
  });

  if (error) {
    console.error("[MAIL][sendStatusMail] Resend error:", error);
    throw error;
  }

  console.log("[MAIL][sendStatusMail] sent id:", data?.id);
  return { ok: true, id: data?.id };
}
