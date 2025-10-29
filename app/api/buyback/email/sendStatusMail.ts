import { Resend } from "resend";

export type Input = {
  to: string | null;
  first_name?: string | null;
  last_name?: string | null;
  order_code: string;
  model?: string | null;
  capacity_gb?: number | null;
  final_price_cents?: number | null;
  wants_voucher?: boolean | null;
  iban?: string | null;
  delivery_method?: "ship" | "dropoff" | null;
  shop_location?: string | null;
  shop_address1?: string | null;
  shop_zip?: string | null;
  shop_city?: string | null;
  opening_hours?: Record<string, string> | null;
};

const resend = new Resend(process.env.RESEND_API_KEY!);

const FROM = process.env.MAIL_FROM!;           // bv. "Microforce Buyback <klantenservice@microforce.be>"
const REPLY_TO = process.env.MAIL_REPLY_TO || undefined;

function eur(cents?: number | null) {
  const v = typeof cents === "number" ? cents : 0;
  return (v / 100).toLocaleString("nl-BE", { style: "currency", currency: "EUR" });
}

export async function sendStatusMail(input: Input) {
  if (!input?.to) {
    console.warn("[MAIL][sendStatusMail] geen ontvanger; skipping", { order_code: input?.order_code });
    return { skipped: true, reason: "missing-to" } as const;
  }
  if (!FROM) {
    throw new Error("MAIL_FROM ontbreekt in env");
  }

  const fullName = [input.first_name, input.last_name].filter(Boolean).join(" ").trim() || "klant";
  const subject = `Bevestiging buyback-aanvraag ${input.order_code}`;

  const lines: string[] = [];
  lines.push(`Beste ${fullName},`);
  lines.push("");
  lines.push(`Bedankt voor je buyback-aanvraag. Je referentie: ${input.order_code}.`);
  if (input.model) {
    const modelBits = [input.model, input.capacity_gb ? `${input.capacity_gb} GB` : null].filter(Boolean).join(" • ");
    lines.push(`Toestel: ${modelBits}`);
  }
  if (typeof input.final_price_cents === "number") {
    lines.push(`Indicatieve prijs: ${eur(input.final_price_cents)}${input.wants_voucher ? " (incl. voucher)" : ""}`);
  }
  if (input.delivery_method === "dropoff") {
    lines.push("");
    lines.push("Binnenbrengen in winkel:");
    lines.push(`- Winkel: ${input.shop_location ?? "—"}`);
    const addr = [input.shop_address1, [input.shop_zip, input.shop_city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    if (addr) lines.push(`- Adres: ${addr}`);
    if (input.opening_hours && typeof input.opening_hours === "object") {
      lines.push("- Openingsuren:");
      for (const [k, v] of Object.entries(input.opening_hours)) {
        lines.push(`  • ${k}: ${v || "—"}`);
      }
    }
  } else if (input.delivery_method === "ship") {
    lines.push("");
    lines.push("Verzendmethode: verzenden per post. Je ontvangt per mail verzendinstructies.");
    if (input.iban) lines.push(`Uitbetaling op IBAN: ${input.iban}`);
  }
  lines.push("");
  lines.push("Met vriendelijke groeten,");
  lines.push("Microforce Buyback");

  const text = lines.join("\n");
  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;line-height:1.5;color:#111">
      <p>Beste ${fullName},</p>
      <p>Bedankt voor je buyback-aanvraag.</p>
      <p><strong>Referentie:</strong> ${input.order_code}</p>
      ${input.model ? `<p><strong>Toestel:</strong> ${input.model}${input.capacity_gb ? ` • ${input.capacity_gb} GB` : ""}</p>` : ""}
      ${typeof input.final_price_cents === "number" ? `<p><strong>Indicatieve prijs:</strong> ${eur(input.final_price_cents)}${input.wants_voucher ? " (incl. voucher)" : ""}</p>` : ""}
      ${
        input.delivery_method === "dropoff"
          ? `
        <h3 style="margin:1em 0 .25em;font-size:14px">Binnenbrengen in winkel</h3>
        <p><strong>Winkel:</strong> ${input.shop_location ?? "—"}</p>
        ${
          input.shop_address1 || input.shop_zip || input.shop_city
            ? `<p><strong>Adres:</strong> ${[
                input.shop_address1,
                [input.shop_zip, input.shop_city].filter(Boolean).join(" "),
              ]
                .filter(Boolean)
                .join(", ")}</p>`
            : ""
        }
        ${
          input.opening_hours
            ? `<div><strong>Openingsuren:</strong><ul style="margin:.25em 0;padding-left:1.2em">${Object.entries(
                input.opening_hours
              )
                .map(([k, v]) => `<li>${k}: ${v || "—"}</li>`)
                .join("")}</ul></div>`
            : ""
        }
      `
          : input.delivery_method === "ship"
          ? `
        <h3 style="margin:1em 0 .25em;font-size:14px">Verzenden per post</h3>
        <p>Je ontvangt per mail de verzendinstructies.</p>
        ${input.iban ? `<p><strong>Uitbetaling op IBAN:</strong> ${input.iban}</p>` : ""}
      `
          : ""
      }
      <p style="margin-top:1em">Met vriendelijke groeten,<br/>Microforce Buyback</p>
    </div>
  `;

  console.info("[MAIL][sendStatusMail] send start", {
    to: input.to,
    from: FROM,
    order_code: input.order_code,
  });

  const res = await resend.emails.send({
    from: FROM,
    to: input.to,
    replyTo: REPLY_TO,
    subject,
    html,
    text,
  });

  // Resend geeft { id?: string; error?: { name, message } }
  if ((res as any)?.error) {
    console.error("[MAIL][sendStatusMail] send error:", (res as any).error);
    throw new Error((res as any).error?.message || "Resend send failed");
  }

  console.info("[MAIL][sendStatusMail] send ok:", { id: (res as any).id, to: input.to });
  return res;
}
