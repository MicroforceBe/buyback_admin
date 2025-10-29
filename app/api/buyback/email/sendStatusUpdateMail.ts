// app/api/buyback/email/sendStatusUpdateMail.ts
import { Resend } from "resend";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Input is bewust compatibel met de velden die we in actions doorgeven
export type Input = {
  to: string | null;
  first_name?: string | null;
  last_name?: string | null;

  order_code: string;

  // context
  model?: string | null;
  capacity_gb?: number | null;
  final_price_cents?: number | null;

  delivery_method?: "ship" | "dropoff" | null;

  // shop
  shop_location?: string | null;
  shop_address1?: string | null;
  shop_zip?: string | null;
  shop_city?: string | null;
  opening_hours?: Record<string, string> | null;
};

// ===== Helpers (zelfde stijl als confirm-mail) =====

function eur(cents?: number | null) {
  const v = typeof cents === "number" ? cents : 0;
  return (v / 100).toLocaleString("nl-BE", { style: "currency", currency: "EUR" });
}

function customerFullName(first?: string | null, last?: string | null) {
  const s = [first, last].filter(Boolean).join(" ").trim();
  return s || "klant";
}

type BrandingCfg = {
  brand_name: string;
  brand_color: string;
  email_from: string;
  email_reply_to?: string | null;
  email_disclaimer?: string | null;
  logo_url?: string | null;
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
  const brand_name = partial.brand_name || process.env.MAIL_BRAND_NAME || "Microforce Buyback";
  const brand_color = partial.brand_color || "#0ea5e9";
  const email_from = process.env.MAIL_FROM || "";
  const email_reply_to = process.env.MAIL_REPLY_TO || undefined;
  const email_disclaimer = (partial.email_disclaimer ?? undefined) || "";
  const logo_url = (partial.logo_url ?? undefined) || "";

  return { brand_name, brand_color, email_from, email_reply_to, email_disclaimer, logo_url };
}

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/** Canonicaliseer keys & toon Ma→Zo met dag voluit (NL) */
function normalizeOpenHoursValue(v?: string | null) {
  const raw = (v ?? "").toString().trim();
  if (!raw) return "Gesloten";
  const low = raw.toLowerCase();
  if (["-", "closed", "gesloten", "sluiten", "nvt", "n/a", "n.v.t."].includes(low)) return "Gesloten";
  return raw;
}
function canonicalDayKey(k: string): "monday"|"tuesday"|"wednesday"|"thursday"|"friday"|"saturday"|"sunday"|null {
  const s = k.toLowerCase().trim().replace(/\./g, "");
  const map: Record<string, "monday"|"tuesday"|"wednesday"|"thursday"|"friday"|"saturday"|"sunday"> = {
    monday: "monday", mon: "monday", ma: "monday", maan: "monday", maandag: "monday",
    tuesday: "tuesday", tue: "tuesday", di: "tuesday", dins: "tuesday", dinsdag: "tuesday",
    wednesday: "wednesday", wed: "wednesday", wo: "wednesday", woens: "wednesday", woensdag: "wednesday",
    thursday: "thursday", thu: "thursday", do: "thursday", donder: "thursday", donderdag: "thursday",
    friday: "friday", fri: "friday", vr: "friday", vrij: "friday", vrijdag: "friday",
    saturday: "saturday", sat: "saturday", za: "saturday", zat: "saturday", zaterdag: "saturday",
    sunday: "sunday", sun: "sunday", zo: "sunday", zon: "sunday", zondag: "sunday",
  };
  return map[s] ?? null;
}
function renderOpeningHours(hours: Record<string, string>) {
  const DAY_ORDER = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"] as const;
  const DAY_LABELS: Record<(typeof DAY_ORDER)[number], string> = {
    monday: "Maandag", tuesday: "Dinsdag", wednesday: "Woensdag", thursday: "Donderdag",
    friday: "Vrijdag", saturday: "Zaterdag", sunday: "Zondag",
  };
  const normalized: Partial<Record<(typeof DAY_ORDER)[number], string>> = {};
  for (const [k, v] of Object.entries(hours || {})) {
    const canon = canonicalDayKey(k);
    if (!canon) continue;
    if (!normalized[canon]) normalized[canon] = (v ?? "").toString();
  }
  const rows = DAY_ORDER.map(key => {
    const val = normalizeOpenHoursValue(normalized[key] ?? "");
    return `<tr><td style="padding:1px 8px 1px 0;color:#6b7280">${DAY_LABELS[key]}</td><td style="padding:1px 0">${val}</td></tr>`;
  }).join("");
  return `
    <div style="margin-top:6px">
      <strong>Openingsuren</strong>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:4px;border-collapse:collapse">
        ${rows}
      </table>
    </div>`;
}

// ===== Main =====

export async function sendStatusUpdateMail(input: Input) {
  if (!input?.to) {
    console.warn("[MAIL][statusUpdate] missing recipient; skip", { order_code: input?.order_code });
    return { skipped: true, reason: "missing-to" } as const;
  }
  if (!process.env.RESEND_API_KEY) throw new Error("RESEND_API_KEY ontbreekt in env");

  const [dbBranding] = await Promise.all([loadBrandingFromDB()]);
  const cfg = mergeBrandingWithEnv(dbBranding);
  if (!cfg.email_from) throw new Error("MAIL_FROM ontbreekt (in env)");

  const resend = new Resend(process.env.RESEND_API_KEY);

  const name = customerFullName(input.first_name, input.last_name);
  const subject = `[${cfg.brand_name}] Statusupdate: toestel ontvangen in de winkel (${input.order_code})`;

  const devLine = input.capacity_gb
    ? `${input.model ?? "—"} • ${input.capacity_gb} GB`
    : (input.model ?? "—");

  // Header: met logo indien aanwezig (zonder merknaam onder logo)
  const header = cfg.logo_url
    ? `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px">
        <img src="${cfg.logo_url}" alt="${cfg.brand_name}" height="40" style="height:40px;width:auto;display:block" />
      </div>
    `
    : `<h2 style="margin:0 0 8px;font-size:18px;color:${cfg.brand_color}">${cfg.brand_name}</h2>`;

  // Details-tabel (zelfde stijl als bevestiging)
  const detailsTable = `
    <table role="presentation" cellpadding="0" cellspacing="0"
           style="width:100%;border-collapse:collapse;margin:0 0 12px;border:1px solid #e5e7eb">
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
        ${
          typeof input.final_price_cents === "number"
            ? `<tr>
                <td style="padding:8px;border:1px solid #e5e7eb;background:#fafafa"><strong>Berekende prijs</strong></td>
                <td style="padding:8px;border:1px solid #e5e7eb">${eur(input.final_price_cents)}</td>
               </tr>`
            : ""
        }
      </tbody>
    </table>
  `;

  // Dropoff-block met winkel + openingsuren (volgorde Ma→Zo)
  const dropoffBlock = `
    <h3 style="margin:18px 0 6px;font-size:14px">Ontvangst bevestigd</h3>
    <p style="margin:0 0 12px">We hebben je toestel in de winkel ontvangen. Onze technieker start zo meteen met de controle.</p>
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
    ${input.opening_hours ? renderOpeningHours(input.opening_hours) : ""}
  `;

  // HTML
  const html = `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;line-height:1.55;color:#0f172a">
    ${header}

    <p style="margin:0 0 12px">Beste ${name},</p>
    <p style="margin:0 0 12px">Goed nieuws! Je toestel werd <strong>ontvangen in de winkel</strong>.</p>

    ${detailsTable}

    ${dropoffBlock}

    <h3 style="margin:18px 0 6px;font-size:14px">Volgende stappen</h3>
    <p style="margin:0 0 12px">
      We controleren je toestel zo snel mogelijk. Indien alles conform je opgave is, verwerken we je aanvraag en uitbetaling binnen <strong>1 tot 3 werkdagen</strong>.
      Merk je later toch nog een afwijking in onze beoordeling, dan contacteren we je met een voorstel.
    </p>

    <p style="margin:12px 0 0;color:#475569">Vragen? Antwoord gerust op deze e-mail.</p>
    <p style="margin:4px 0 0;color:#475569">Met vriendelijke groeten,<br/>${cfg.brand_name}</p>

    <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0"/>
    ${
      cfg.email_disclaimer
        ? `<p style="margin:0;color:#64748b;font-size:12px;white-space:pre-wrap">${escapeHtml(cfg.email_disclaimer)}</p>`
        : `<p style="margin:0;color:#64748b;font-size:12px">Vermeld je referentie <strong>${input.order_code}</strong> bij contact.</p>`
    }
  </div>
  `;

  // TEXT fallback
  const text = [
    `Beste ${name},`,
    ``,
    `Je toestel is ontvangen in de winkel.`,
    ``,
    `Referentie: ${input.order_code}`,
    `Toestel: ${devLine}`,
    typeof input.final_price_cents === "number" ? `Berekende prijs: ${eur(input.final_price_cents)}` : ``,
    ``,
    `We starten de controle. Indien alles conform is, volgt verwerking binnen 1–3 werkdagen.`,
    ``,
    `Met vriendelijke groeten,`,
    `${cfg.brand_name}`,
  ].filter(Boolean).join("\n");

  // Verzenden
  console.info("[MAIL][statusUpdate] send start", { to: input.to, order_code: input.order_code });
  const res = await resend.emails.send({
    from: cfg.email_from,
    to: input.to!,
    replyTo: cfg.email_reply_to || undefined,
    subject,
    html,
    text,
  });

  if ((res as any)?.error) {
    console.error("[MAIL][statusUpdate] send error:", (res as any).error);
    throw new Error((res as any).error?.message || "Resend send failed");
  }

  console.info("[MAIL][statusUpdate] send ok:", { id: (res as any)?.id, to: input.to });
  return res;
}
