// app/api/buyback/email/sendStatusUpdateMail.ts
import { Resend } from "resend";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/** Statussen waarvoor we mails sturen (moet matchen met actions.ts) */
export type Status =
  | "new"                // toegevoegd om typing in actions.ts te dekken (meestal niet verzonden)
  | "received_store"
  | "label_created"
  | "shipment_received"
  | "check_passed"
  | "check_failed"
  | "done";

/** Payload van status-update mails (matcht aanroep in actions.ts) */
export type Input = {
  // ontvanger + basis
  to: string | null;
  first_name?: string | null;
  last_name?: string | null;
  order_code: string;

  // statuscontext
  status: Status;

  // toestel/prijs
  model?: string | null;
  capacity_gb?: number | null;
  final_price_cents?: number | null;
  wants_voucher?: boolean | null;
  iban?: string | null;

  // levering
  delivery_method?: "ship" | "dropoff" | null;

  // shopinfo (voor dropoff)
  shop_location?: string | null;
  shop_address1?: string | null;
  shop_zip?: string | null;
  shop_city?: string | null;
  opening_hours?: Record<string, string> | null;

  // tracking / label (voor label_created)
  tracking_code?: string | null;
  tracking_url?: string | null;
  label_pdf_url?: string | null;
};

// ---------- helpers gedeeld ----------

function eur(cents?: number | null) {
  const v = typeof cents === "number" ? cents : 0;
  return (v / 100).toLocaleString("nl-BE", { style: "currency", currency: "EUR" });
}

function fullName(first?: string | null, last?: string | null) {
  const s = [first, last].filter(Boolean).join(" ").trim();
  return s || "klant";
}

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ---------- branding laden (in lijn met buyback_settings kolommen) ----------

type BrandingCfg = {
  brand_name: string;
  brand_color: string;       // uit DB (hex)
  email_from: string;        // uit ENV
  email_reply_to?: string | undefined; // uit ENV
  email_disclaimer?: string | null;    // uit DB
  logo_url?: string | null;            // uit DB
};

async function loadBrandingFromDB(): Promise<Partial<BrandingCfg>> {
  try {
    const { data, error } = await supabaseAdmin
      .from("buyback_settings")
      .select("brand_name, brand_color, logo_url, email_disclaimer")
      .eq("id", 1)
      .single();
    if (error) {
      console.warn("[MAIL][branding] load error:", error);
      return {};
    }
    return {
      brand_name: data?.brand_name ?? undefined,
      brand_color: data?.brand_color ?? undefined,
      logo_url: data?.logo_url ?? undefined,
      email_disclaimer: data?.email_disclaimer ?? undefined,
    };
  } catch (e) {
    console.warn("[MAIL][branding] exception during load:", e);
    return {};
  }
}

function mergeBrandingWithEnv(partial: Partial<BrandingCfg>): BrandingCfg {
  return {
    brand_name: partial.brand_name || process.env.MAIL_BRAND_NAME || "Microforce Buyback",
    brand_color: partial.brand_color || "#0ea5e9",
    email_from: process.env.MAIL_FROM || "",
    email_reply_to: process.env.MAIL_REPLY_TO || undefined,
    email_disclaimer: partial.email_disclaimer ?? "",
    logo_url: partial.logo_url ?? "",
  };
}

// ---------- openingsuren (ma → zo, dagen voluit NL) ----------

const DAY_ORDER = ["maandag","dinsdag","woensdag","donderdag","vrijdag","zaterdag","zondag"];
const DAY_ALIASES: Record<string, string> = {
  ma: "maandag", maandag: "maandag", mon: "maandag",
  di: "dinsdag", dinsdag: "dinsdag", tue: "dinsdag",
  wo: "woensdag", woensdag: "woensdag", wed: "woensdag",
  do: "donderdag", donderdag: "donderdag", thu: "donderdag",
  vr: "vrijdag", vrijdag: "vrijdag", fri: "vrijdag",
  za: "zaterdag", zaterdag: "zaterdag", sat: "zaterdag",
  zo: "zondag", zondag: "zondag", sun: "zondag",
};

function normalizeOpeningHours(input?: Record<string, string> | null): Record<string, string> | null {
  if (!input || typeof input !== "object") return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(input)) {
    const keyNorm = DAY_ALIASES[k.trim().toLowerCase()] || k.trim().toLowerCase();
    const pretty = DAY_ALIASES[keyNorm] || keyNorm;
    out[pretty] = (v ?? "").toString().trim() || "Gesloten";
  }
  for (const d of DAY_ORDER) if (!(d in out)) out[d] = "Gesloten";
  return out;
}

function renderOpeningHoursTable(oh?: Record<string, string> | null) {
  const hours = normalizeOpeningHours(oh);
  if (!hours) return "";
  const rows = DAY_ORDER.map((d) => {
    const v = hours[d] || "Gesloten";
    return `<tr><td style="padding:1px 8px 1px 0;color:#6b7280">${d}</td><td style="padding:1px 0">${escapeHtml(v)}</td></tr>`;
  }).join("");
  return `
    <div style="margin-top:6px">
      <strong>Openingsuren</strong>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:4px;border-collapse:collapse">
        ${rows}
      </table>
    </div>
  `;
}

// ---------- copy per status ----------

function subjectFor(status: Status, brand: string, order: string) {
  const base = `[${brand}]`;
  switch (status) {
    case "received_store":     return `${base} Ontvangen in de winkel — ${order}`;
    case "label_created":      return `${base} Verzendlabel aangemaakt — ${order}`;
    case "shipment_received":  return `${base} Zending ontvangen — ${order}`;
    case "check_passed":       return `${base} Controle geslaagd — ${order}`;
    case "check_failed":       return `${base} Afwijking vastgesteld — ${order}`;
    case "done":               return `${base} Afgewerkt — ${order}`;
    case "new":                return `${base} Status update — ${order}`; // fallback; normaal niet verstuurd
  }
}

function leadInFor(status: Status, name: string) {
  switch (status) {
    case "received_store":
      return `Beste ${name},<br/>we bevestigen dat je toestel in onze winkel is ontvangen.`;
    case "label_created":
      return `Beste ${name},<br/>je verzendlabel is aangemaakt. Volg de instructies om je toestel op te sturen.`;
    case "shipment_received":
      return `Beste ${name},<br/>we hebben je zending ontvangen. Je toestel gaat nu naar controle.`;
    case "check_passed":
      return `Beste ${name},<br/>goed nieuws: je toestel is conform bevonden met je opgave.`;
    case "check_failed":
      return `Beste ${name},<br/>tijdens de controle merkten we een afwijking t.o.v. je opgave. We bezorgen je een aangepast voorstel.`;
    case "done":
      return `Beste ${name},<br/>je buyback-dossier is afgewerkt. Dankjewel!`;
    case "new":
      return `Beste ${name},<br/>je dossier is aangemaakt. Je ontvangt updates naarmate het vordert.`;
  }
}

function actionBlockFor(status: Status, input: Input) {
  switch (status) {
    case "received_store":
      return `<p style="margin:0 0 12px">We houden je op de hoogte zodra de controle is gebeurd.</p>`;
    case "label_created": {
      const trackingPart = input.tracking_url
        ? `<p style="margin:8px 0 0">Volg je zending via: <a href="${input.tracking_url}" target="_blank" rel="noopener">tracking</a>${input.tracking_code ? ` (<code>${escapeHtml(input.tracking_code)}</code>)` : ""}.</p>`
        : (input.tracking_code ? `<p style="margin:8px 0 0">Trackingcode: <code>${escapeHtml(input.tracking_code)}</code></p>` : "");
      const labelPart = input.label_pdf_url
        ? `<p style="margin:8px 0 0">Download je label: <a href="${input.label_pdf_url}" target="_blank" rel="noopener">label (PDF)</a>.</p>`
        : "";
      return `
        <p style="margin:0 0 12px">Print het label en verstuur je toestel goed beschermd binnen 5 werkdagen.</p>
        ${labelPart}
        ${trackingPart}
      `;
    }
    case "shipment_received":
      return `<p style="margin:0 0 12px">De technische controle volgt zo snel mogelijk.</p>`;
    case "check_passed": {
      const payout = input.wants_voucher
        ? `Fantastisch dat je voor een voucher koos! Eénmaal jouw toestel is gecontroleerd en aanvaard, ontvang je een voucher code ter waarde van <strong>${eur(input.final_price_cents ?? 0)}</strong> waarmee je online of in één van onze winkels een aankoop kan doen.`
        : `We starten de uitbetaling${input.iban ? ` naar <code>${escapeHtml(input.iban)}</code>` : ""} op.`;
      return `<p style="margin:0 0 12px">${payout}</p>`;
    }
    case "check_failed":
      return `<p style="margin:0 0 12px">Je ontvangt per mail een nieuw voorstel. Ga je akkoord, dan verwerken we de uitbetaling (of bezorgen we je voucher).</p>`;
    case "done":
      return `<p style="margin:0 0 12px">Het dossier is afgerond. Indien van toepassing is je betaling of voucher verwerkt.</p>`;
    case "new":
      return `<p style="margin:0 0 12px">We brengen je op de hoogte zodra er nieuws is.</p>`;
  }
}

// ---------- hoofdmail ----------

export async function sendStatusUpdateMail(input: Input) {
  if (!input?.to) {
    console.warn("[MAIL][statusUpdate] missing to; skip", { order: input?.order_code });
    return { skipped: true as const };
  }
  if (!process.env.RESEND_API_KEY) throw new Error("RESEND_API_KEY ontbreekt in env");

  const branding = mergeBrandingWithEnv(await loadBrandingFromDB());
  if (!branding.email_from) throw new Error("MAIL_FROM ontbreekt (env)");

  const resend = new Resend(process.env.RESEND_API_KEY);

  const name = fullName(input.first_name, input.last_name);
  const subject = subjectFor(input.status, branding.brand_name, input.order_code);

  // header (logo toont, geen merknaam eronder)
  const header = branding.logo_url
    ? `<div style="display:flex;align-items:center;gap:12px;margin-bottom:10px">
         <img src="${branding.logo_url}" alt="${branding.brand_name}" height="40" style="height:40px;width:auto;display:block" />
       </div>`
    : `<h2 style="margin:0 0 8px;font-size:18px;color:${branding.brand_color}">${branding.brand_name}</h2>`;

  // compact detailtabel (referentie, toestel, berekende prijs)
  const devLine = input.capacity_gb ? `${input.model ?? "—"} • ${input.capacity_gb} GB` : (input.model ?? "—");
  const priceLine = typeof input.final_price_cents === "number"
    ? `${eur(input.final_price_cents)}${input.wants_voucher ? " (incl. voucherbonus)" : ""}` : "—";

  const detailsTable = `
    <table role="presentation" cellpadding="0" cellspacing="0"
           style="width:100%;border-collapse:collapse;margin:12px 0;border:1px solid #e5e7eb">
      <colgroup><col style="width:35%"><col style="width:65%"></colgroup>
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
          <td style="padding:8px;border:1px solid #e5e7eb;background:#fafafa"><strong>Berekende prijs</strong></td>
          <td style="padding:8px;border:1px solid #e5e7eb">${priceLine}</td>
        </tr>
      </tbody>
    </table>
  `;

  // leveringsblok (alleen tonen indien relevant)
  const openingHoursHtml = renderOpeningHoursTable(input.opening_hours);
  const deliveryBlock =
    input.delivery_method === "dropoff"
      ? `
        <h3 style="margin:18px 0 6px;font-size:14px">Winkel</h3>
        <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
          <tr><td style="padding:2px 0"><strong>Locatie</strong></td><td style="padding:2px 0">: ${input.shop_location ?? "—"}</td></tr>
          ${
            input.shop_address1 || input.shop_zip || input.shop_city
              ? `<tr><td style="padding:2px 0"><strong>Adres</strong></td><td style="padding:2px 0">: ${
                  [input.shop_address1, [input.shop_zip, input.shop_city].filter(Boolean).join(" ")].filter(Boolean).join(", ")
                }</td></tr>`
              : ""
          }
        </table>
        ${openingHoursHtml}
      `
      : input.delivery_method === "ship"
      ? `
        <h3 style="margin:18px 0 6px;font-size:14px">Verzending</h3>
        <p style="margin:0">Je toestel wordt per post verwerkt.</p>
      `
      : "";

  const leadIn = leadInFor(input.status, name);
  const actionBlock = actionBlockFor(input.status, input);

  // “volgende stappen” vaste tekst
  const nextSteps = `
    <h3 style="margin:18px 0 6px;font-size:14px">Volgende stappen</h3>
    <p style="margin:0 0 12px">
      Bij ontvangst van jouw toestel word je op de hoogte gesteld van het verdere verloop van jouw verkoop.
      Indien alles conform jouw opgave is, wordt jouw aanvraag en uitbetaling verwerkt binnen 1 tot 3 werkdagen.
    </p>
  `;

  // disclaimer
  const disclaimer = branding.email_disclaimer
    ? `<p style="margin:0;color:#64748b;font-size:12px;white-space:pre-wrap">${escapeHtml(branding.email_disclaimer || "")}</p>`
    : `<p style="margin:0;color:#64748b;font-size:12px">Vermeld je referentie <strong>${input.order_code}</strong> bij contact.</p>`;

  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;line-height:1.55;color:#0f172a">
      ${header}
      <p style="margin:0 0 12px">${leadIn}</p>
      ${detailsTable}
      ${actionBlock}
      ${deliveryBlock}
      ${nextSteps}
      <p style="margin:12px 0 0;color:#475569">Vragen? Antwoord gerust op deze e-mail.</p>
      <p style="margin:4px 0 0;color:#475569">Met vriendelijke groeten,<br/>${branding.brand_name}</p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0"/>
      ${disclaimer}
    </div>
  `;

  // text fallback (incl. tracking/label waar mogelijk)
  const textParts: string[] = [];
  textParts.push(leadIn.replace(/<[^>]+>/g, ""));
  textParts.push("");
  textParts.push(`Referentie: ${input.order_code}`);
  textParts.push(`Toestel: ${input.model ?? "—"}${input.capacity_gb ? ` • ${input.capacity_gb} GB` : ""}`);
  textParts.push(`Berekende prijs: ${typeof input.final_price_cents === "number" ? eur(input.final_price_cents) : "—"}`);
  if (input.status === "label_created") {
    if (input.label_pdf_url) textParts.push(`Label (PDF): ${input.label_pdf_url}`);
    if (input.tracking_url) textParts.push(`Tracking: ${input.tracking_url}${input.tracking_code ? ` (${input.tracking_code})` : ""}`);
    else if (input.tracking_code) textParts.push(`Trackingcode: ${input.tracking_code}`);
  }
  textParts.push("");
  if (input.delivery_method === "dropoff") {
    textParts.push(`Winkel: ${input.shop_location ?? "—"}`);
    const addr = [input.shop_address1, [input.shop_zip, input.shop_city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    if (addr) textParts.push(`Adres: ${addr}`);
  } else if (input.delivery_method === "ship") {
    textParts.push("Verzending per post");
  }
  textParts.push("");
  textParts.push("Bij ontvangst word je op de hoogte gesteld van het verdere verloop van jouw verkoop.");
  textParts.push("Indien alles conform jouw opgave is, verwerken we je aanvraag en uitbetaling binnen 1 tot 3 werkdagen.");
  textParts.push("");
  textParts.push("Met vriendelijke groeten,");
  textParts.push(branding.brand_name);
  if (branding.email_disclaimer) {
    textParts.push("");
    textParts.push(`--`);
    textParts.push(branding.email_disclaimer);
  }
  const text = textParts.join("\n");

  // verzenden
  const res = await resend.emails.send({
    from: branding.email_from,
    to: input.to!,
    replyTo: branding.email_reply_to,
    subject,
    html,
    text,
  });

  if ((res as any)?.error) {
    console.error("[MAIL][statusUpdate] send error:", (res as any).error);
    throw new Error((res as any).error?.message || "Resend send failed");
  }

  console.info("[MAIL][statusUpdate] send ok:", { id: (res as any).id, to: input.to, status: input.status });
  return res;
}
