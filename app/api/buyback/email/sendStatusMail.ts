import { Resend } from "resend";

export type Input = {
  to: string | null;
  first_name?: string | null;
  last_name?: string | null;

  order_code: string;

  // toestel & calculatie
  model?: string | null;
  capacity_gb?: number | null;
  base_price_cents?: number | null;
  final_price_cents?: number | null; // => kan al "met voucher" doorgestuurd worden
  wants_voucher?: boolean | null;

  // conditie/antwoorden (keys uit widget)
  answers?: Record<string, string> | null;

  // uitbetaling / levermethode
  iban?: string | null;
  delivery_method?: "ship" | "dropoff" | null;

  // winkel (bij dropoff)
  shop_location?: string | null;
  shop_address1?: string | null;
  shop_zip?: string | null;
  shop_city?: string | null;
  opening_hours?: Record<string, string> | null;

  // klantadres (bij ship)
  street?: string | null;
  house_number?: string | null;
  postal_code?: string | null;
  city?: string | null;
  country?: string | null;
};

const resend = new Resend(process.env.RESEND_API_KEY!);
const FROM = process.env.MAIL_FROM!;          // b.v. "Microforce Buyback <klantenservice@microforce.be>"
const REPLY_TO = process.env.MAIL_REPLY_TO || undefined;
const BRAND = process.env.MAIL_BRAND_NAME || "Microforce Buyback";

function eur(cents?: number | null) {
  const v = typeof cents === "number" ? cents : 0;
  return (v / 100).toLocaleString("nl-BE", { style: "currency", currency: "EUR" });
}

// Vertalingen voor keys/values uit widget-answers
const LABELS: Record<string, string> = {
  functional: "Werkt het toestel?",
  eu_model: "EU-model",
  icloud: "iCloud/Google vergrendeling",
  battery: "Batterijconditie",
  status: "Algemene staat",
  screen: "Scherm",
  housing: "Behuizing",
};
const YESNO: Record<string, string> = {
  yes: "Ja", true: "Ja", ja: "Ja",
  no: "Nee", false: "Nee", nee: "Nee",
};

function humanizeValue(key: string, val: string) {
  const v = (val ?? "").toString().trim();
  const lower = v.toLowerCase();

  if (YESNO[lower] !== undefined) return YESNO[lower];

  if (key === "battery") {
    // "100" -> "100%"
    const n = Number(v);
    if (!Number.isNaN(n) && n >= 0 && n <= 100) return `${n}%`;
  }

  // wat cosmetische vervangingen
  return v
    .replace(/_/g, " ")
    .replace(/\bja\b/gi, "Ja")
    .replace(/\bnee\b/gi, "Nee");
}

function renderAnswersTable(answers?: Record<string, string> | null) {
  if (!answers || typeof answers !== "object" || !Object.keys(answers).length) return "";

  const rows = Object.entries(answers).map(([k, v]) => {
    const label = LABELS[k] ?? k;
    const hv = humanizeValue(k, v);
    return `
      <tr>
        <td style="padding:6px 8px;border:1px solid #e5e7eb;background:#fafafa">${label}</td>
        <td style="padding:6px 8px;border:1px solid #e5e7eb">${hv || "—"}</td>
      </tr>`;
  }).join("");

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin-top:6px">
      <tbody>${rows}</tbody>
    </table>
  `;
}

function customerFullName(first?: string | null, last?: string | null) {
  const s = [first, last].filter(Boolean).join(" ").trim();
  return s || "klant";
}

export async function sendStatusMail(input: Input) {
  if (!input?.to) {
    console.warn("[MAIL][sendStatusMail] geen ontvanger; skipping", { order_code: input?.order_code });
    return { skipped: true, reason: "missing-to" } as const;
  }
  if (!FROM) throw new Error("MAIL_FROM ontbreekt in env");

  const name = customerFullName(input.first_name, input.last_name);
  const subject = `Bevestiging buyback-aanvraag ${input.order_code}`;

  const devLine = input.capacity_gb
    ? `${input.model ?? "—"} • ${input.capacity_gb} GB`
    : (input.model ?? "—");

  const priceLine = typeof input.final_price_cents === "number"
    ? `${eur(input.final_price_cents)}${input.wants_voucher ? " (incl. voucherbonus)" : ""}`
    : "—";

  // Verzend- of dropoff-blok
  const deliveryBlock =
    input.delivery_method === "dropoff"
      ? `
        <h3 style="margin:18px 0 6px;font-size:14px">Binnenbrengen in winkel</h3>
        <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
          <tr><td style="padding:2px 0"><strong>Winkel</strong></td><td style="padding:2px 0">: ${input.shop_location ?? "—"}</td></tr>
          ${
            input.shop_address1 || input.shop_zip || input.shop_city
              ? `<tr><td style="padding:2px 0"><strong>Adres</strong></td><td style="padding:2px 0">: ${
                  [input.shop_address1, [input.shop_zip, input.shop_city].filter(Boolean).join(" ")].filter(Boolean).join(", ")
                }</td></tr>`
              : ""
          }
        </table>
        ${
          input.opening_hours
            ? `<div style="margin-top:6px">
                 <strong>Openingsuren</strong>
                 <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:4px;border-collapse:collapse">
                   ${Object.entries(input.opening_hours).map(([k,v]) =>
                     `<tr><td style="padding:1px 8px 1px 0;color:#6b7280">${k}</td><td style="padding:1px 0">${v || "—"}</td></tr>`
                   ).join("")}
                 </table>
               </div>`
            : ""
        }
      `
      : input.delivery_method === "ship"
      ? `
        <h3 style="margin:18px 0 6px;font-size:14px">Verzenden per post</h3>
        <p style="margin:0">Je ontvangt (of ontving) de verzendinstructies via e-mail.</p>
        ${
          input.street || input.house_number || input.postal_code || input.city || input.country
            ? `<p style="margin:8px 0 0"><strong>Afzenderadres (voor het etiket):</strong><br/>
                ${[
                  [input.street, input.house_number].filter(Boolean).join(" "),
                  [input.postal_code, input.city].filter(Boolean).join(" "),
                  input.country
                ].filter(Boolean).join("<br/>")}
               </p>`
            : ""
        }
      `
      : `
        <h3 style="margin:18px 0 6px;font-size:14px">Leveringskeuze</h3>
        <p style="margin:0">Nog niet gekozen of onbekend.</p>
      `;

  const payoutBlock = input.wants_voucher
    ? `<p style="margin:0"><strong>Uitbetaling:</strong> voucher (in de winkel te gebruiken), +5% bonus reeds verrekend.</p>`
    : `<p style="margin:0"><strong>Uitbetaling:</strong> overschrijving op IBAN ${input.iban ? `<code>${input.iban}</code>` : "—"}.</p>`;

  const answersTable = renderAnswersTable(input.answers);

  // TEXT fallback
  const textParts: string[] = [];
  textParts.push(`Beste ${name},`);
  textParts.push("");
  textParts.push(`Bedankt voor je buyback-aanvraag. Je referentie: ${input.order_code}.`);
  textParts.push(`Toestel: ${input.model ?? "—"}${input.capacity_gb ? ` • ${input.capacity_gb} GB` : ""}`);
  textParts.push(`Indicatieve prijs: ${priceLine}`);
  textParts.push("");
  textParts.push("Conditie/antwoorden:");
  if (input.answers && Object.keys(input.answers).length) {
    for (const [k, v] of Object.entries(input.answers)) {
      const label = LABELS[k] ?? k;
      textParts.push(`- ${label}: ${humanizeValue(k, v)}`);
    }
  } else {
    textParts.push("- —");
  }
  textParts.push("");
  if (input.delivery_method === "dropoff") {
    textParts.push("Binnenbrengen in winkel:");
    textParts.push(`- Winkel: ${input.shop_location ?? "—"}`);
    const addr = [input.shop_address1, [input.shop_zip, input.shop_city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    if (addr) textParts.push(`- Adres: ${addr}`);
  } else if (input.delivery_method === "ship") {
    textParts.push("Verzenden per post — instructies via e-mail.");
    const addr = [
      [input.street, input.house_number].filter(Boolean).join(" "),
      [input.postal_code, input.city].filter(Boolean).join(" "),
      input.country
    ].filter(Boolean).join(", ");
    if (addr) textParts.push(`Afzenderadres: ${addr}`);
  }
  textParts.push("");
  textParts.push(input.wants_voucher
    ? "Uitbetaling: voucher (in de winkel te gebruiken), +5% bonus reeds verrekend."
    : `Uitbetaling: overschrijving${input.iban ? ` op IBAN ${input.iban}` : ""}.`);
  textParts.push("");
  textParts.push(`Met vriendelijke groeten,\n${BRAND}`);
  const text = textParts.join("\n");

  // HTML
  const html = `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;line-height:1.55;color:#0f172a">
    <h2 style="margin:0 0 4px;font-size:18px">${BRAND}</h2>
    <p style="margin:0 0 16px;color:#475569">Bevestiging van je buyback-aanvraag</p>

    <p style="margin:0 0 12px">Beste ${name},</p>
    <p style="margin:0 0 12px">Bedankt voor je buyback-aanvraag. We hebben je gegevens goed ontvangen.</p>

    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb">
      <tbody>
        <tr>
          <td style="padding:8px;border:1px solid #e5e7eb;background:#fafafa"><strong>Referentie</strong></td>
          <td style="padding:8px;border:1px solid #e5e7eb"><code>${input.order_code}</code></td>
        </tr>
        <tr>
          <td style="padding:8px;border:1px solid #e5e7eb;background:#fafafa"><strong>Toestel</strong></td>
          <td style="padding:8px;border:1px solid #e5e7eb">${devLine}</td>
        </tr>
        <tr>
          <td style="padding:8px;border:1px solid #e5e7eb;background:#fafafa"><strong>Indicatieve prijs</strong></td>
          <td style="padding:8px;border:1px solid #e5e7eb">${priceLine}</td>
        </tr>
      </tbody>
    </table>

    <h3 style="margin:18px 0 6px;font-size:14px">Conditie en antwoorden</h3>
    ${answersTable || `<p style="margin:0">—</p>`}

    ${deliveryBlock}

    <h3 style="margin:18px 0 6px;font-size:14px">Uitbetaling</h3>
    ${payoutBlock}

    <h3 style="margin:18px 0 6px;font-size:14px">Volgende stappen</h3>
    <ol style="margin:0 0 12px 20px;padding:0">
      <li>Je toestel wordt gecontroleerd volgens de opgegeven conditie.</li>
      <li>Bij een afwijking nemen we contact op met een aangepast voorstel.</li>
      <li>Na akkoord volgt de uitbetaling (of ontvang je de voucher).</li>
    </ol>

    <p style="margin:12px 0 0;color:#475569">Vragen? Antwoord gerust op deze e-mail.</p>
    <p style="margin:4px 0 0;color:#475569">Met vriendelijke groeten,<br/>${BRAND}</p>

    <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0"/>
    <p style="margin:0;color:#64748b;font-size:12px">
      Dit is een automatische bevestigingsmail. Gelieve je referentie <strong>${input.order_code}</strong> te vermelden bij contact.
    </p>
  </div>
  `;

  console.info("[MAIL][sendStatusMail] send start", { to: input.to, from: FROM, order_code: input.order_code });

  const res = await resend.emails.send({
    from: FROM,
    to: input.to,
    replyTo: REPLY_TO,
    subject,
    html,
    text,
  });

  if ((res as any)?.error) {
    console.error("[MAIL][sendStatusMail] send error:", (res as any).error);
    throw new Error((res as any).error?.message || "Resend send failed");
  }

  console.info("[MAIL][sendStatusMail] send ok:", { id: (res as any).id, to: input.to });
  return res;
}
