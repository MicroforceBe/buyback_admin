// app/api/buyback/email/sendStatusMail.ts
import { Resend } from "resend";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { renderEmailTemplate } from "./templateHelpers";

/** Inkomende payload vanuit routes */
export type Input = {
  to: string | null;
  first_name?: string | null;
  last_name?: string | null;

  order_code: string;

  // toestel & calculatie
  model?: string | null;
  capacity_gb?: number | null;
  base_price_cents?: number | null;
  final_price_cents?: number | null; // mag reeds "met voucher" doorgestuurd worden
  wants_voucher?: boolean | null;

  // conditie/antwoorden
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

  // taal / locale (optioneel, voor templates)
  language?: string | null;
};

// ---------- Helpers

function eur(cents?: number | null) {
  const v = typeof cents === "number" ? cents : 0;
  return (v / 100).toLocaleString("nl-BE", {
    style: "currency",
    currency: "EUR",
  });
}

// Fallback labels (indien DB-labels niet beschikbaar zijn)
const FALLBACK_LABELS: Record<string, string> = {
  functional: "Werkt het toestel?",
  eu_model: "EU-model",
  icloud: "iCloud/Google-vergrendeling",
  battery: "Batterijconditie",
  status: "Algemene staat",
  screen: "Scherm",
  housing: "Behuizing",
};

const YESNO: Record<string, string> = {
  yes: "Ja",
  true: "Ja",
  ja: "Ja",
  no: "Nee",
  false: "Nee",
  nee: "Nee",
};

function humanizeValue(key: string, val: string) {
  const v = (val ?? "").toString().trim();
  const lower = v.toLowerCase();

  if (YESNO[lower] !== undefined) return YESNO[lower];

  if (key === "battery") {
    const n = Number(v);
    if (!Number.isNaN(n) && n >= 0 && n <= 100) return `${n}%`;
  }
  return v
    .replace(/_/g, " ")
    .replace(/\bja\b/gi, "Ja")
    .replace(/\bnee\b/gi, "Nee");
}

function customerFullName(first?: string | null, last?: string | null) {
  const s = [first, last].filter(Boolean).join(" ").trim();
  return s || "klant";
}

// ---------- Branding-config (aangesloten op bestaand schema)

type BrandingCfg = {
  brand_name: string;
  brand_color: string; // hex uit DB
  email_from: string; // uit ENV
  email_reply_to?: string | null; // uit ENV
  email_disclaimer?: string | null; // uit DB
  logo_url?: string | null; // uit DB
};

/** Haal branding rechtstreeks uit buyback_settings (id=1) */
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

/** Probeer labels uit DB te laden (verwacht tabel/view: buyback_answer_labels met kolommen: key, label) */
async function loadAnswerLabelsFromDB(): Promise<Record<string, string> | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from("buyback_answer_labels")
      .select("key, label");

    if (error) {
      // Stil terugvallen als tabel niet bestaat
      return null;
    }
    const map: Record<string, string> = {};
    for (const row of data || []) {
      if (row?.key && row?.label) map[row.key] = row.label;
    }
    return Object.keys(map).length ? map : null;
  } catch {
    return null;
  }
}

function mergeBrandingWithEnv(partial: Partial<BrandingCfg>): BrandingCfg {
  const brand_name =
    partial.brand_name || process.env.MAIL_BRAND_NAME || "Microforce Buyback";
  const brand_color = partial.brand_color || "#0ea5e9";
  const email_from = process.env.MAIL_FROM || ""; // verplicht via ENV
  const email_reply_to = process.env.MAIL_REPLY_TO || undefined;
  const email_disclaimer = (partial.email_disclaimer ?? undefined) || "";
  const logo_url = (partial.logo_url ?? undefined) || "";

  return {
    brand_name,
    brand_color,
    email_from,
    email_reply_to,
    email_disclaimer,
    logo_url,
  };
}

/** Genereer ALLE rijtjes voor de “Toestel-details” tabel (zonder <table> wrapper). */
function renderDetailsRows(input: Input, labels: Record<string, string>) {
  const rows: string[] = [];

  // Referentie
  rows.push(`
    <tr>
      <td style="padding:8px;border:1px solid #e5e7eb;background:#fafafa"><strong>Referentie</strong></td>
      <td style="padding:8px;border:1px solid #e5e7eb"><code>${input.order_code}</code></td>
    </tr>`);

  // Toestel
  const devLine = input.capacity_gb
    ? `${input.model ?? "—"} • ${input.capacity_gb} GB`
    : input.model ?? "—";
  rows.push(`
    <tr>
      <td style="padding:8px;border:1px solid #e5e7eb;background:#fafafa"><strong>Toestel</strong></td>
      <td style="padding:8px;border:1px solid #e5e7eb">${devLine}</td>
    </tr>`);

  // Berekende prijs
  const priceLine =
    typeof input.final_price_cents === "number"
      ? `${eur(input.final_price_cents)}${
          input.wants_voucher ? " (incl. voucherbonus)" : ""
        }`
      : "—";
  rows.push(`
    <tr>
      <td style="padding:8px;border:1px solid #e5e7eb;background:#fafafa"><strong>Berekende prijs</strong></td>
      <td style="padding:8px;border:1px solid #e5e7eb">${priceLine}</td>
    </tr>`);

  // Separator “Conditie en antwoorden” (kopje over 2 kolommen)
  const hasAnswers = !!(input.answers && Object.keys(input.answers).length);
  if (hasAnswers) {
    rows.push(`
      <tr>
        <td colspan="2" style="padding:10px;border:1px solid #e5e7eb;background:#f8fafc;font-weight:600">
          Conditie en antwoorden
        </td>
      </tr>`);
    // Antwoord-rijen
    for (const [k, v] of Object.entries(input.answers!)) {
      const label = labels[k] ?? FALLBACK_LABELS[k] ?? k;
      const hv = humanizeValue(k, String(v));
      rows.push(`
        <tr>
          <td style="padding:6px 8px;border:1px solid #e5e7eb;background:#fafafa">${label}</td>
          <td style="padding:6px 8px;border:1px solid #e5e7eb">${hv || "—"}</td>
        </tr>`);
    }
  }

  return rows.join("");
}

/** Normaliseer openingsuren-waarden en toon standaard 'Gesloten' */
function normalizeOpenHoursValue(v?: string | null) {
  const raw = (v ?? "").toString().trim();
  if (!raw) return "Gesloten";
  const low = raw.toLowerCase();
  if (
    ["-", "closed", "gesloten", "sluiten", "nvt", "n/a", "n.v.t."].includes(low)
  )
    return "Gesloten";
  return raw;
}

/** Converteer allerlei sleutelvarianten naar een canonieke Engelstalige dagnaam */
function canonicalDayKey(
  k: string
):
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday"
  | null {
  const s = k.toLowerCase().trim().replace(/\./g, "");
  const map: Record<
    string,
    "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday"
  > = {
    // Maandag
    monday: "monday",
    mon: "monday",
    ma: "monday",
    maan: "monday",
    maandag: "monday",
    // Dinsdag
    tuesday: "tuesday",
    tue: "tuesday",
    di: "tuesday",
    dins: "tuesday",
    dinsdag: "tuesday",
    // Woensdag
    wednesday: "wednesday",
    wed: "wednesday",
    wo: "wednesday",
    woens: "wednesday",
    woensdag: "wednesday",
    // Donderdag
    thursday: "thursday",
    thu: "thursday",
    do: "thursday",
    donder: "thursday",
    donderdag: "thursday",
    // Vrijdag
    friday: "friday",
    fri: "friday",
    vr: "friday",
    vrij: "friday",
    vrijdag: "friday",
    // Zaterdag
    saturday: "saturday",
    sat: "saturday",
    za: "saturday",
    zat: "saturday",
    zaterdag: "saturday",
    // Zondag
    sunday: "sunday",
    sun: "sunday",
    zo: "sunday",
    zon: "sunday",
    zondag: "sunday",
  };
  return map[s] ?? null;
}

/** Sorteer en toon openingsuren Ma → Zo met dagnaam voluit (NL) — ondersteunt NL/EN/afkortingen als keys */
function renderOpeningHours(hours: Record<string, string>) {
  const DAY_ORDER = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
  ] as const;
  const DAY_LABELS: Record<(typeof DAY_ORDER)[number], string> = {
    monday: "Maandag",
    tuesday: "Dinsdag",
    wednesday: "Woensdag",
    thursday: "Donderdag",
    friday: "Vrijdag",
    saturday: "Zaterdag",
    sunday: "Zondag",
  };

  // Normaliseer inkomende keys naar canonieke keys
  const normalized: Partial<Record<(typeof DAY_ORDER)[number], string>> = {};
  for (const [k, v] of Object.entries(hours || {})) {
    const canon = canonicalDayKey(k);
    if (!canon) continue;
    // Eerste niet-lege waarde wint
    if (!normalized[canon]) normalized[canon] = (v ?? "").toString();
  }

  const rows = DAY_ORDER.map((key) => {
    const val = normalizeOpenHoursValue(normalized[key] ?? "");
    return `
      <tr>
        <td style="padding:1px 8px 1px 0;color:#6b7280">${DAY_LABELS[key]}</td>
        <td style="padding:1px 0">${val}</td>
      </tr>`;
  }).join("");

  return `
    <div style="margin-top:6px">
      <strong>Openingsuren</strong>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:4px;border-collapse:collapse">
        ${rows}
      </table>
    </div>`;
}

// ---------- Main

export async function sendStatusMail(input: Input) {
  // Basic guards
  if (!input?.to) {
    console.warn("[MAIL][sendStatusMail] geen ontvanger; skipping", {
      order_code: input?.order_code,
    });
    return { skipped: true, reason: "missing-to" } as const;
  }
  if (!process.env.RESEND_API_KEY) throw new Error("RESEND_API_KEY ontbreekt in env");

  // Branding + labels ophalen
  const [dbBranding, dbLabels] = await Promise.all([
    loadBrandingFromDB(),
    loadAnswerLabelsFromDB(),
  ]);
  const cfg = mergeBrandingWithEnv(dbBranding);
  const LABELS = dbLabels || FALLBACK_LABELS;

  if (!cfg.email_from) {
    throw new Error("MAIL_FROM ontbreekt (in env)");
  }

  const resend = new Resend(process.env.RESEND_API_KEY);

  // Subject, header
  const name = customerFullName(input.first_name, input.last_name);
  const baseSubject = `[${cfg.brand_name}] Bevestiging buyback-aanvraag ${input.order_code}`;

  // Leveringsblok (met correcte openingsuren lay-out Ma → Zo, dagen voluit NL)
  const deliveryBlock =
    input.delivery_method === "dropoff"
      ? `
        <h3 style="margin:18px 0 6px;font-size:14px">Binnenbrengen in winkel</h3>
        <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
          <tr><td style="padding:2px 0"><strong>Winkel</strong></td><td style="padding:2px 0">: ${
            input.shop_location ?? "—"
          }</td></tr>
          ${
            input.shop_address1 || input.shop_zip || input.shop_city
              ? `<tr><td style="padding:2px 0"><strong>Adres</strong></td><td style="padding:2px 0">: ${[
                  input.shop_address1,
                  [input.shop_zip, input.shop_city].filter(Boolean).join(" "),
                ]
                  .filter(Boolean)
                  .join(", ")}</td></tr>`
              : ""
          }
        </table>
        ${input.opening_hours ? renderOpeningHours(input.opening_hours) : ""}
      `
      : input.delivery_method === "ship"
      ? `
        <h3 style="margin:18px 0 6px;font-size:14px">Verzenden per post</h3>
        <p style="margin:0">Je ontvangt (of ontving) de verzendinstructies via e-mail.</p>
        ${
          input.street ||
          input.house_number ||
          input.postal_code ||
          input.city ||
          input.country
            ? `<p style="margin:8px 0 0"><strong>Afzenderadres (voor het etiket):</strong><br/>
                ${[
                  [input.street, input.house_number].filter(Boolean).join(" "),
                  [input.postal_code, input.city].filter(Boolean).join(" "),
                  input.country,
                ]
                  .filter(Boolean)
                  .join("<br/>")}
               </p>`
            : ""
        }
      `
      : `
        <h3 style="margin:18px 0 6px;font-size:14px">Leveringskeuze</h3>
        <p style="margin:0">Nog niet gekozen of onbekend.</p>
      `;

  // Uitbetalingsblok (voucher-copy aangepast)
  const payoutBlock = input.wants_voucher
    ? `<p style="margin:0"><strong>Uitbetaling:</strong> Fantastisch dat je voor een voucher koos! Eénmaal jouw toestel is gecontroleerd en aanvaard, ontvang je een voucher code ter waarde van <strong>${eur(
        input.final_price_cents ?? 0
      )}</strong> waarmee je online of in één van onze winkels een aankoop kan doen.</p>`
    : `<p style="margin:0"><strong>Uitbetaling:</strong> overschrijving op IBAN ${
        input.iban ? `<code>${input.iban}</code>` : "—"
      }.</p>`;

  // Tekst fallback
  const textParts: string[] = [];
  textParts.push(`Beste ${name},`);
  textParts.push("");
  textParts.push(`Referentie: ${input.order_code}`);
  textParts.push(
    `Toestel: ${input.model ?? "—"}${
      input.capacity_gb ? ` • ${input.capacity_gb} GB` : ""
    }`
  );
  const priceLineText =
    typeof input.final_price_cents === "number"
      ? `${eur(input.final_price_cents)}${
          input.wants_voucher ? " (incl. voucherbonus)" : ""
        }`
      : "—";
  textParts.push(`Berekende prijs: ${priceLineText}`);
  textParts.push("");
  textParts.push("Conditie/antwoorden:");
  if (input.answers && Object.keys(input.answers).length) {
    for (const [k, v] of Object.entries(input.answers)) {
      const label = LABELS[k] ?? k;
      textParts.push(`- ${label}: ${humanizeValue(k, String(v))}`);
    }
  } else {
    textParts.push("- —");
  }
  textParts.push("");
  if (input.delivery_method === "dropoff") {
    textParts.push("Binnenbrengen in winkel:");
    textParts.push(`- Winkel: ${input.shop_location ?? "—"}`);
    const addr = [
      input.shop_address1,
      [input.shop_zip, input.shop_city].filter(Boolean).join(" "),
    ]
      .filter(Boolean)
      .join(", ");
    if (addr) textParts.push(`- Adres: ${addr}`);
  } else if (input.delivery_method === "ship") {
    textParts.push("Verzenden per post — instructies via e-mail.");
    const addr = [
      [input.street, input.house_number].filter(Boolean).join(" "),
      [input.postal_code, input.city].filter(Boolean).join(" "),
      input.country,
    ]
      .filter(Boolean)
      .join(", ");
    if (addr) textParts.push(`Afzenderadres: ${addr}`);
  }
  textParts.push("");
  if (input.wants_voucher) {
    textParts.push(
      `Uitbetaling: voucher t.w.v. ${eur(
        input.final_price_cents ?? 0
      )} (code volgt na controle).`
    );
  } else {
    textParts.push(
      `Uitbetaling: overschrijving${
        input.iban ? ` op IBAN ${input.iban}` : ""
      }.`
    );
  }
  textParts.push("");
  textParts.push(
    "Bij ontvangst van jouw toestel word je op de hoogte gesteld van het verdere verloop van jouw verkoop. Indien alles conform jouw opgave is, wordt jouw aanvraag en uitbetaling verwerkt binnen 1 tot 3werkdagen."
  );
  textParts.push("");
  textParts.push(`Met vriendelijke groeten,\n${cfg.brand_name}`);
  if (cfg.email_disclaimer) {
    textParts.push("");
    textParts.push(`--\n${cfg.email_disclaimer}`);
  }
  const text = textParts.join("\n");

  // Header: als er logo is, géén merknaam tonen eronder
  const header = cfg.logo_url
    ? `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px">
        <img src="${cfg.logo_url}" alt="${cfg.brand_name}" height="40" style="height:40px;width:auto;display:block" />
      </div>
    `
    : `<h2 style="margin:0 0 8px;font-size:18px;color:${cfg.brand_color}">${cfg.brand_name}</h2>`;

  // ÉÉN TABEL met alle toestelinfo (gelijke kolombreedte via <colgroup>)
  const detailsTable = `
    <table role="presentation" cellpadding="0" cellspacing="0"
           style="width:100%;border-collapse:collapse;margin:0 0 12px;border:1px solid #e5e7eb">
      <colgroup><col style="width:35%"><col style="width:65%"></colgroup>
      <tbody>
        ${renderDetailsRows(input, LABELS)}
      </tbody>
    </table>
  `;

  const nextStepsHtml = `
    <h3 style="margin:18px 0 6px;font-size:14px">Volgende stappen</h3>
    <p style="margin:0 0 12px">
      Bij ontvangst van jouw toestel word je op de hoogte gesteld van het verdere verloop van jouw verkoop.
      Indien alles conform jouw opgave is, wordt jouw aanvraag en uitbetaling verwerkt binnen 1 tot 3werkdagen.
    </p>
  `;

  // HTML fallback body
  const baseHtml = `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;line-height:1.55;color:#0f172a">
    ${header}

    <p style="margin:0 0 12px">Beste ${name},</p>
    <p style="margin:0 0 12px">Bedankt voor je buyback-aanvraag. We hebben je gegevens goed ontvangen.</p>

    ${detailsTable}

    ${deliveryBlock}

    <h3 style="margin:18px 0 6px;font-size:14px">Uitbetaling</h3>
    ${payoutBlock}

    ${nextStepsHtml}

    <p style="margin:12px 0 0;color:#475569">Vragen?Antwoord gerust op deze e-mail.</p>
    <p style="margin:4px 0 0;color:#475569">Met vriendelijke groeten,<br/>${cfg.brand_name}</p>

    <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0"/>
    ${
      cfg.email_disclaimer
        ? `<p style="margin:0;color:#64748b;font-size:12px;white-space:pre-wrap">${escapeHtml(
            cfg.email_disclaimer
          )}</p>`
        : `<p style="margin:0;color:#64748b;font-size:12px">Dit is een automatische bevestigingsmail. Gelieve je referentie <strong>${input.order_code}</strong> te vermelden bij contact.</p>`
    }
  </div>
  `;

  // 🔹 Taal voor templates
  const languageRaw = input.language || (input as any).locale || "nl";
  const language = typeof languageRaw === "string" ? languageRaw : "nl";

  // 🔹 Variabelen voor template-rendering
  const templateVars: Record<string, string> = {
    first_name: input.first_name ?? "",
    last_name: input.last_name ?? "",
    full_name: name,
    order_code: input.order_code,
    brand_name: cfg.brand_name,
    header,
    details_table: detailsTable,
    delivery_block: deliveryBlock,
    payout_block: payoutBlock,
    next_steps: nextStepsHtml,
    disclaimer_html: cfg.email_disclaimer
      ? escapeHtml(cfg.email_disclaimer)
      : `Dit is een automatische bevestigingsmail. Gelieve je referentie <strong>${input.order_code}</strong> te vermelden bij contact.`,
  };

  // 🔹 Probeer DB-template 'status_initial' (per taal)
  const rendered = await renderEmailTemplate("status_initial", language, templateVars);

  const finalSubject = rendered?.subject || baseSubject;
  const finalHtml = rendered?.html || baseHtml;

  // Logging + verzenden
  console.info("[MAIL][sendStatusMail] env check", {
    hasKey: !!process.env.RESEND_API_KEY,
    from: cfg.email_from,
    replyTo: cfg.email_reply_to || null,
    node: process?.versions?.node || "n/a",
  });

  console.info("[MAIL][sendStatusMail] send start", {
    to: input.to,
    from: cfg.email_from,
    order_code: input.order_code,
  });

  let res: any;
  try {
    res = await resend.emails.send({
      from: cfg.email_from,
      to: input.to!,
      replyTo: cfg.email_reply_to || undefined,
      subject: finalSubject,
      html: finalHtml,
      text,
    });

    console.info("[MAIL][sendStatusMail] raw response:", res);

    if (res?.error) {
      console.error("[MAIL][sendStatusMail] send error:", res.error);
      throw new Error(res.error?.message || "Resend send failed");
    }

    console.info("[MAIL][sendStatusMail] send ok:", {
      id: (res as any)?.id,
      to: input.to,
    });
    return res;
  } catch (err: any) {
    console.error("[MAIL][sendStatusMail] exception:", err);
    throw err;
  }
}

// Kleine helper om disclaimer veilig weer te geven
function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
