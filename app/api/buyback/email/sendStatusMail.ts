import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";

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
const FROM = process.env.MAIL_FROM!;         // bv. "Microforce Buyback <klantenservice@microforce.be>"
const REPLY_TO = process.env.MAIL_REPLY_TO || undefined;

// Supabase admin client (server-side)
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// ===== Settings cache (5 min) =====
type Settings = {
  brand_name: string | null;
  brand_color: string | null;
  logo_url: string | null;
  email_disclaimer: string | null;
};
let _cache: { at: number; data: Settings | null } = { at: 0, data: null };

async function getSettings(): Promise<Settings> {
  const now = Date.now();
  if (_cache.data && now - _cache.at < 5 * 60 * 1000) return _cache.data;

  const { data, error } = await supabase
    .from("buyback_settings")
    .select("brand_name, brand_color, logo_url, email_disclaimer")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    console.warn("[MAIL][settings] fetch failed; using env fallbacks:", error.message);
  }

  const fallbacks: Settings = {
    brand_name: process.env.MAIL_BRAND_NAME || "Microforce Buyback",
    brand_color: process.env.MAIL_BRAND_COLOR || "#0ea5e9",
    logo_url: process.env.MAIL_BRAND_LOGO || null,
    email_disclaimer: process.env.MAIL_FOOTER_ADDRESS || null,
  };

  const merged: Settings = {
    brand_name: data?.brand_name ?? fallbacks.brand_name,
    brand_color: data?.brand_color ?? fallbacks.brand_color,
    logo_url: data?.logo_url ?? fallbacks.logo_url,
    email_disclaimer: data?.email_disclaimer ?? fallbacks.email_disclaimer,
  };

  _cache = { at: now, data: merged };
  return merged;
}

function eur(cents?: number | null) {
  const v = typeof cents === "number" ? cents : 0;
  return (v / 100).toLocaleString("nl-BE", { style: "currency", currency: "EUR" });
}

/** ====== Antwoord-normalisatie ====== */
const ORDERED_KEYS = ["functional", "icloud", "eu", "eu_model", "battery", "screen", "housing", "status"] as const;

const LABELS: Record<string, string> = {
  functional: "Werkt het toestel?",
  icloud: "iCloud/Google-vergrendeling",
  eu: "EU-model",
  eu_model: "EU-model",
  battery: "Batterijconditie",
  screen: "Scherm",
  housing: "Behuizing",
  status: "Algemene staat",
};

const YESNO: Record<string, string> = {
  yes: "Ja",
  true: "Ja",
  ja: "Ja",
  no: "Nee",
  false: "Nee",
  nee: "Nee",
};

function humanizeValue(key: string, value: string) {
  const raw = (value ?? "").toString().trim();
  const lower = raw.toLowerCase();

  if (lower in YESNO) return YESNO[lower];

  if (key === "battery") {
    const le = lower.match(/^l?e?(\d{2,3})$/);
    if (le) return `≤ ${le[1]}%`;
    const le2 = lower.match(/^≤\s*(\d{2,3})%?$/);
    if (le2) return `≤ ${le2[1]}%`;
    const n = Number(raw.replace("%", ""));
    if (!Number.isNaN(n) && n >= 0 && n <= 100) return `${n}%`;
  }

  const mapLook = (s: string) =>
    s
      .replace(/_/g, " ")
      .replace(/\bgeen\b/gi, "Geen schade")
      .replace(/\bklein\b/gi, "Kleine schade")
      .replace(/\bgroot\b/gi, "Grote schade")
      .replace(/\bminimaal\b/gi, "Zo goed als nieuw")
      .replace(/\bsporen\b/gi, "Normale gebruikssporen")
      .replace(/\bzwaar\b/gi, "Zware gebruikssporen");

  if (key === "screen" || key === "housing" || key === "status") {
    return mapLook(raw);
  }

  return raw.replace(/_/g, " ").replace(/\bja\b/gi, "Ja").replace(/\bnee\b/gi, "Nee");
}

function normalizeAnswers(answers?: Record<string, string> | null) {
  if (!answers || typeof answers !== "object") return [] as { label: string; value: string }[];

  const norm: Record<string, string> = { ...answers };
  if (norm.eu === undefined && norm.eu_model !== undefined) norm.eu = norm.eu_model;

  const ordered: { label: string; value: string }[] = [];
  for (const k of ORDERED_KEYS) {
    const val = norm[k as string];
    if (val === undefined) continue;
    const label = LABELS[k as string] ?? k;
    ordered.push({ label, value: humanizeValue(k as string, String(val)) });
  }

  for (const [k, v] of Object.entries(norm)) {
    if (!ORDERED_KEYS.includes(k as any)) {
      ordered.push({ label: LABELS[k] ?? k, value: humanizeValue(k, String(v)) });
    }
  }

  return ordered;
}

function renderAnswersTable(answers?: Record<string, string> | null) {
  const rows = normalizeAnswers(answers);
  if (!rows.length) return "";

  const tr = rows
    .map(
      (r) => `
      <tr>
        <td style="padding:8px;border:1px solid #e5e7eb;background:#f8fafc">${r.label}</td>
        <td style="padding:8px;border:1px solid #e5e7eb">${r.value || "—"}</td>
      </tr>`
    )
    .join("");

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin-top:6px;border:1px solid #e5e7eb">
      <tbody>${tr}</tbody>
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

  const settings = await getSettings();
  const BRAND = settings.brand_name || "Microforce Buyback";
  const BRAND_COLOR = settings.brand_color || "#0ea5e9";
  const BRAND_LOGO = settings.logo_url || null;
  const FOOTER_DISCLAIMER = settings.email_disclaimer || null;

  console.info("[MAIL][sendStatusMail] env check", {
    hasKey: Boolean(process.env.RESEND_API_KEY),
    from: FROM,
    replyTo: REPLY_TO || null,
    node: process.version,
  });

  const name = customerFullName(input.first_name, input.last_name);
  const subject = `Bevestiging buyback-aanvraag ${input.order_code}`;

  const devLine = input.capacity_gb
    ? `${input.model ?? "—"} • ${input.capacity_gb} GB`
    : (input.model ?? "—");

  const priceLine = typeof input.final_price_cents === "number"
    ? `${eur(input.final_price_cents)}${input.wants_voucher ? " (incl. voucherbonus)" : ""}`
    : "—";

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

  const answersRows = normalizeAnswers(input.answers);
  const answersTable = answersRows.length
    ? `
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin-top:6px;border:1px solid #e5e7eb">
        <tbody>
          ${answersRows.map(r => `
            <tr>
              <td style="padding:8px;border:1px solid #e5e7eb;background:#f8fafc">${r.label}</td>
              <td style="padding:8px;border:1px solid #e5e7eb">${r.value || "—"}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `
    : `<p style="margin:0">—</p>`;

  // TEXT fallback
  const textParts: string[] = [];
  textParts.push(`Beste ${name},`);
  textParts.push("");
  textParts.push(`Bedankt voor je buyback-aanvraag. Je referentie: ${input.order_code}.`);
  textParts.push(`Toestel: ${input.model ?? "—"}${input.capacity_gb ? ` • ${input.capacity_gb} GB` : ""}`);
  textParts.push(`Indicatieve prijs: ${priceLine}`);
  textParts.push("");
  textParts.push("Conditie/antwoorden:");
  if (answersRows.length) {
    for (const r of answersRows) textParts.push(`- ${r.label}: ${r.value || "—"}`);
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
  if (FOOTER_DISCLAIMER) {
    textParts.push("");
    textParts.push(FOOTER_DISCLAIMER);
  }
  const text = textParts.join("\n");

  // HTML
  const headerLogo = BRAND_LOGO
    ? `<img src="${BRAND_LOGO}" alt="${BRAND}" style="height:36px;display:block" />`
    : `<div style="font-weight:700;color:#0f172a;font-size:18px">${BRAND}</div>`;

  const html = `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;line-height:1.6;color:#0f172a">
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin-bottom:12px">
      <tr>
        <td style="padding:16px 0;border-bottom:3px solid ${BRAND_COLOR}">
          <div style="display:flex;align-items:center;gap:12px">${headerLogo}
            <span style="font-size:14px;color:#475569">${BRAND}</span>
          </div>
        </td>
      </tr>
    </table>

    <p style="margin:0 0 12px">Beste ${name},</p>
    <p style="margin:0 0 12px">Bedankt voor je buyback-aanvraag. We hebben je gegevens goed ontvangen.</p>

    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb">
      <tbody>
        <tr>
          <td style="padding:8px;border:1px solid #e5e7eb;background:#f8fafc"><strong>Referentie</strong></td>
          <td style="padding:8px;border:1px solid #e5e7eb"><code>${input.order_code}</code></td>
        </tr>
        <tr>
          <td style="padding:8px;border:1px solid #e5e7eb;background:#f8fafc"><strong>Toestel</strong></td>
          <td style="padding:8px;border:1px solid #e5e7eb">${devLine}</td>
        </tr>
        <tr>
          <td style="padding:8px;border:1px solid #e5e7eb;background:#f8fafc"><strong>Indicatieve prijs</strong></td>
          <td style="padding:8px;border:1px solid #e5e7eb">${priceLine}</td>
        </tr>
      </tbody>
    </table>

    <h3 style="margin:18px 0 6px;font-size:14px">Conditie & antwoorden</h3>
    ${answersTable}

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
    ${
      FOOTER_DISCLAIMER
        ? `<p style="margin:0;color:#64748b;font-size:12px">${FOOTER_DISCLAIMER}</p>`
        : `<p style="margin:0;color:#94a3b8;font-size:12px">Dit is een automatische bevestigingsmail. Vermeld je referentie <strong>${input.order_code}</strong> bij contact.</p>`
    }
  </div>
  `;

  console.info("[MAIL][sendStatusMail] send start", { to: input.to, from: FROM, order_code: input.order_code });

  let res: any;
  try {
    res = await resend.emails.send({
      from: FROM,
      to: input.to!,
      replyTo: REPLY_TO,
      subject,
      html,
      text,
    });

    if (res?.error) {
      console.error("[MAIL][sendStatusMail] send error:", res.error);
      throw new Error(res.error?.message || "Resend send failed");
    }

    console.info("[MAIL][sendStatusMail] send ok:", { id: res.id, to: input.to });
    return res;
  } catch (err) {
    console.error("[MAIL][sendStatusMail] exception:", err);
    throw err;
  }
}
