"use server";

import { redirect } from "next/navigation";
import { supabaseAdmin as supabaseAdminExport } from "@/lib/supabaseAdmin";
import { sendStatusUpdateMail } from "@/app/api/buyback/email/sendStatusUpdateMail";

// In sommige projecten exporteert lib/supabaseAdmin een KLAAR client object,
// in andere een factory-functie. Deze helper vangt beide af.
function sbClient() {
  const anySb: any = supabaseAdminExport as any;
  return typeof anySb === "function" ? anySb() : anySb;
}

const ALLOWED_STATUSES = [
  "new",
  "received_store",
  "label_created",
  "shipment_received",
  "check_passed",
  "check_failed",
  "done",
] as const;

type Status = (typeof ALLOWED_STATUSES)[number];

function isAllowedStatus(v: string): v is Status {
  return ALLOWED_STATUSES.includes(v as any);
}

// === Helper: converteer form-waarden naar boolean/null (voorkomt "Boolean('false')" valkuil) ===
function toBoolOrNull(v: unknown): boolean | null {
  if (v === true || v === "true" || v === "1" || v === 1 || v === "on") return true;
  if (v === false || v === "false" || v === "0" || v === 0 || v === "") return false;
  return null;
}

/** Kleine helpers voor Sendcloud */
function scAuthHeader() {
  const pub = process.env.SENDCLOUD_PUBLIC_KEY || "";
  const sec = process.env.SENDCLOUD_SECRET_KEY || "";
  const token = Buffer.from(`${pub}:${sec}`).toString("base64");
  return `Basic ${token}`;
}

type CreateLabelResult = {
  tracking_code?: string | null;
  tracking_url?: string | null;
  label_pdf_url?: string | null;
};

/** Normaliseer land naar ISO-2 (BE/NL/…) en verwijder diacritics */
function normalizeCountryIso2(input?: string | null): string | null {
  if (!input) return null;
  const raw = input.trim().toLowerCase();
  const ascii = raw.normalize("NFD").replace(/\p{Diacritic}/gu, "");
  const map: Record<string, string> = {
    be: "BE", belgium: "BE", belgie: "BE", "belgië": "BE", belgique: "BE",
    nl: "NL", nederland: "NL", netherlands: "NL",
    fr: "FR", france: "FR", frankrijk: "FR",
    de: "DE", germany: "DE", duitsland: "DE", deutschland: "DE",
    lu: "LU", luxembourg: "LU", luxemburg: "LU",
    gb: "GB", uk: "GB", "united kingdom": "GB", "verenigd koninkrijk": "GB",
  };
  return map[raw] || map[ascii] || (raw.length === 2 ? raw.toUpperCase() : null);
}

/** Kies shipment of shipping_method voor BE (bpost) o.b.v. env */
function resolveSendcloudService(countryIso: string): {
  shipment?: { id: number };
  shipping_method?: number;
  info: string;
} {
  if (countryIso === "BE") {
    const shipmentIdRaw = process.env.SENDCLOUD_SHIPMENT_ID_BE;
    const methodIdRaw = process.env.SENDCLOUD_METHOD_BE_BPOST;

    const shipmentId = shipmentIdRaw ? parseInt(String(shipmentIdRaw), 10) : NaN;
    const methodId = methodIdRaw ? parseInt(String(methodIdRaw), 10) : NaN;

    if (Number.isFinite(shipmentId) && shipmentId > 0) {
      return { shipment: { id: shipmentId }, info: `Using shipment ${shipmentId} (BE preset)` };
    }
    if (Number.isFinite(methodId) && methodId > 0) {
      return { shipping_method: methodId, info: `Using method ${methodId} (BE bpost)` };
    }
    return { info: "No BE shipment/method env set" };
  }
  return { info: `No resolver for country ${countryIso}` };
}

/** Utility: trim -> undefined bij lege string */
function clean(s: unknown): string | undefined {
  const v = (s ?? "").toString().trim();
  return v ? v : undefined;
}

/** Haal jullie (ontvanger) adres uit env; vereist voor retourlabels */
function getMerchantToAddress() {
  const to = {
    name: clean(process.env.SENDCLOUD_TO_NAME) || clean(process.env.MAIL_BRAND_NAME) || "Microforce Buyback",
    company_name: clean(process.env.SENDCLOUD_TO_COMPANY) || clean(process.env.MAIL_BRAND_NAME) || "Microforce Buyback",
    email: clean(process.env.SENDCLOUD_TO_EMAIL),
    telephone: clean(process.env.SENDCLOUD_TO_PHONE),
    address: clean(process.env.SENDCLOUD_TO_ADDRESS),          // verplicht
    house_number: clean(process.env.SENDCLOUD_TO_HOUSE_NUMBER),// optioneel
    postal_code: clean(process.env.SENDCLOUD_TO_POSTAL_CODE),  // verplicht
    city: clean(process.env.SENDCLOUD_TO_CITY),                // verplicht
    country: (clean(process.env.SENDCLOUD_TO_COUNTRY) || "BE")?.toUpperCase(),
  };
  const missing: string[] = [];
  if (!to.address) missing.push("SENDCLOUD_TO_ADDRESS");
  if (!to.postal_code) missing.push("SENDCLOUD_TO_POSTAL_CODE");
  if (!to.city) missing.push("SENDCLOUD_TO_CITY");
  if (!to.country) missing.push("SENDCLOUD_TO_COUNTRY");
  return { to, missing };
}

/**
 * Maakt via Sendcloud een zending + label aan voor deze lead.
 * Retourlabel (klant -> jullie) met correcte FROM/TO.
 */
async function createSendcloudLabel(after: any): Promise<CreateLabelResult> {
  try {
    if (!process.env.SENDCLOUD_PUBLIC_KEY || !process.env.SENDCLOUD_SECRET_KEY) {
      console.warn("[SENDCLOUD] ontbrekende API keys; skip label creation");
      return {};
    }

    // Normaliseer landcode klant (afzender bij retour)
    const countryIso = (normalizeCountryIso2(after.country) || "BE").toUpperCase();

    // Kies methode/preset (nu enkel BE bpost)
    const resolver = resolveSendcloudService(countryIso);

    // Retourlabels vereisen expliciet from_* (KLANT) en to_* (JULLIE) velden
    const from_name =
      [after.first_name, after.last_name].filter(Boolean).join(" ").trim()
      || after.email
      || "Klant";

    // ---- JULLIE (ontvanger) uit env (moet ingevuld zijn) ----
    const TO_COMPANY  = process.env.RET_TO_COMPANY  || process.env.MAIL_BRAND_NAME || "Microforce";
    const TO_ADDRESS1 = process.env.RET_TO_ADDRESS1 || "";
    const TO_HOUSENO  = process.env.RET_TO_HOUSENUMBER || "";
    const TO_POSTAL   = process.env.RET_TO_POSTAL   || "";
    const TO_CITY     = process.env.RET_TO_CITY     || "";
    const TO_COUNTRY  = (process.env.RET_TO_COUNTRY || "BE").toUpperCase();
    const TO_EMAIL    = process.env.RET_TO_EMAIL    || undefined;
    const TO_PHONE    = process.env.RET_TO_PHONE    || undefined;

    // ---- Validatie minimale velden (klant + jullie) ----
    const missing: string[] = [];
    if (!after.street)         missing.push("from_address_1(street)");
    if (!after.house_number)   missing.push("from_house_number");
    if (!after.postal_code)    missing.push("from_postal_code");
    if (!after.city)           missing.push("from_city");
    if (!countryIso)           missing.push("from_country");

    if (!TO_COMPANY)           missing.push("to_company_name");
    if (!TO_ADDRESS1)          missing.push("to_address_1");
    if (!TO_HOUSENO)           missing.push("to_house_number");
    if (!TO_POSTAL)            missing.push("to_postal_code");
    if (!TO_CITY)              missing.push("to_city");
    if (!TO_COUNTRY)           missing.push("to_country");

    if (missing.length) {
      console.error("[SENDCLOUD][return] ontbrekende adressen:", missing.join(", "));
      return {};
    }


/**
* Eén action die ALLES kan updaten.
* Velden (optioneel): id (required), status, final_price_eur, sku, imei_sn,
* customer_number, iban, first_name, last_name, street, house_number,
* postal_code, city, country, phone, wants_voucher
*/
export async function updateLeadInlineAction(formData: FormData) {
  const id = String(formData.get("id") || "").trim();
  if (!id) redirect(`/admin/leads?msg=${encodeURIComponent("missing_id")}`);

  // 1) Verzamel gewenste wijzigingen uit het formulier
  const desired: Record<string, any> = {};

  // status
  const statusRaw = String(formData.get("status") ?? "").trim();
  if (statusRaw) {
    if (!isAllowedStatus(statusRaw)) {
      redirect(`/admin/leads?msg=${encodeURIComponent(`invalid_status:${statusRaw}`)}`);
    }
    desired.status = statusRaw;
  }

  // prijs (EUR → cents)
  const priceRaw = String(formData.get("final_price_eur") ?? "")
    .replace(",", ".")
    .trim();
  if (priceRaw) {
    const eur = Number(priceRaw);
    if (!Number.isFinite(eur) || eur < 0) {
      redirect(`/admin/leads?msg=${encodeURIComponent(`invalid_price:${priceRaw}`)}`);
    }
    desired.final_price_cents = Math.round(eur * 100);
  }

  // wants_voucher (boolean in DB)
  const rawWantsVoucher = formData.get("wants_voucher");
  if (rawWantsVoucher !== null) {
    desired.wants_voucher = toBoolOrNull(rawWantsVoucher);
  }

  // overige inline velden (TEXT)
  const FIELDS = [
    "customer_number",
    "iban",
    "first_name",
    "last_name",
    "street",
    "house_number",
    "postal_code",
    "city",
    "country",
    "phone",
    "sku",
    "imei_sn",
  ] as const;

  for (const k of FIELDS) {
    const v = formData.get(k as string);
    if (typeof v === "string") {
      const trimmed = v.trim();
      desired[k] = trimmed === "" ? null : trimmed;
    }
  }

  const sb = sbClient();

  // 2) Haal bestaande rij op
  const { data: before, error: selErr } = await sb
    .from("buyback_leads")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (selErr) {
    redirect(`/admin/leads?msg=${encodeURIComponent(`select_error:${selErr.message}`)}`);
  }
  if (!before) {
    redirect(`/admin/leads?msg=${encodeURIComponent("not_found")}`);
  }

  // 3) Beperk patch tot bestaande kolommen
  const patch: Record<string, any> = {};
  const ignored: string[] = [];
  for (const [k, v] of Object.entries(desired)) {
    if (Object.prototype.hasOwnProperty.call(before, k)) {
      patch[k] = v;
    } else if (typeof v !== "undefined") {
      ignored.push(k);
    }
  }

  // 4) Gating eindstatus
  const ending = new Set<Status>(["check_passed", "check_failed", "done"]);
  if (patch.status && ending.has(patch.status)) {
    const need = (key: "customer_number" | "sku" | "imei_sn") =>
      Object.prototype.hasOwnProperty.call(before, key)
        ? (patch[key] ?? (before as any)[key] ?? "").toString().trim()
        : "";
    if (!need("customer_number") || !need("sku") || !need("imei_sn")) {
      redirect(`/admin/leads?msg=${encodeURIComponent("status_requires_customer_sku_imei")}`);
    }
  }

  // 4.b Automatisch 'ship' zetten als label wordt aangemaakt
  if (patch.status === "label_created") {
    const currentMethod = (before as any).delivery_method as string | null;
    if (Object.prototype.hasOwnProperty.call(before, "delivery_method")) {
      if (currentMethod !== "ship") {
        patch.delivery_method = "ship";
        console.info("[LEADS] delivery_method auto->ship (label_created)");
      }
    }
  }

  if (Object.keys(patch).length === 0) {
    const note = ignored.length ? ` (ignored:${ignored.join(",")})` : "";
    redirect(`/admin/leads?msg=${encodeURIComponent("nothing_to_update" + note)}`);
  }

  // 5) Update uitvoeren (ruim returning pakket)
  const returningCols =
    [
      "id",
      "status",
      "final_price_cents",
      "wants_voucher",
      "customer_number",
      "sku",
      "imei_sn",
      "iban",
      "first_name",
      "last_name",
      "street",
      "house_number",
      "postal_code",
      "city",
      "country",
      "phone",
      "email",
      "order_code",
      "model",
      "capacity_gb",
      "delivery_method",
      "shop_id",
      "shop_location",
      "updated_at",
      // trackingvelden
      "tracking_code",
      "tracking_url",
      "label_pdf_url",
    ].join(", ");

  const { data: after, error: updErr } = await sb
    .from("buyback_leads")
    .update(patch)
    .eq("id", id)
    .select(returningCols)
    .single();

  if (updErr) {
    redirect(`/admin/leads?msg=${encodeURIComponent(`update_error:${updErr.message}`)}`);
  }

  // 6) Status change → Sendcloud + mail (fire-and-forget)
  const prevStatus = (before as any)?.status as Status | undefined;
  const newStatus = ((patch.status as Status | undefined) ?? (after as any)?.status) as Status | undefined;

  const NOTIFY_STATUSES: Status[] = [
    "received_store",
    "label_created",
    "shipment_received",
    "check_passed",
    "check_failed",
    "done",
  ];

  const statusChanged = newStatus && newStatus !== prevStatus && NOTIFY_STATUSES.includes(newStatus);

  if (statusChanged && after?.email) {
    (async () => {
      try {
        // 6.a Bij 'label_created' → maak verzendlabel + tracking via Sendcloud
        let tracking_code: string | null | undefined = (after as any).tracking_code ?? null;
        let tracking_url: string | null | undefined = (after as any).tracking_url ?? null;
        let label_pdf_url: string | null | undefined = (after as any).label_pdf_url ?? null;

        if (newStatus === "label_created") {
          console.info("[LEADS] attempting Sendcloud label (label_created)");
          const made = await createSendcloudLabel(after);
          if (made.tracking_code || made.tracking_url || made.label_pdf_url) {
            tracking_code = made.tracking_code ?? tracking_code ?? null;
            tracking_url = made.tracking_url ?? tracking_url ?? null;
            label_pdf_url = made.label_pdf_url ?? label_pdf_url ?? null;

            const { error: trackErr } = await sb
              .from("buyback_leads")
              .update({ tracking_code, tracking_url, label_pdf_url })
              .eq("id", id);
            if (trackErr) {
              console.error("[LEADS][SENDCLOUD] tracking upsert failed:", trackErr.message);
            } else {
              console.info("[LEADS][SENDCLOUD] tracking stored OK");
            }
          } else {
            console.warn("[LEADS][SENDCLOUD] label not created (no tracking/label returned)");
          }
        }

        // 6.b Shopdetails ophalen indien beschikbaar
        let shop_address1: string | null = null;
        let shop_zip: string | null = null;
        let shop_city: string | null = null;
        let opening_hours: Record<string, string> | null = null;

        if ((after as any).shop_id) {
          const { data: shop, error: shopErr } = await sb
            .from("buyback_shops")
            .select("name, address1, zip, city, opening_hours")
            .eq("id", (after as any).shop_id)
            .single();

          if (!shopErr && shop) {
            shop_address1 = shop.address1 ?? null;
            shop_zip = shop.zip ?? null;
            shop_city = shop.city ?? null;
            opening_hours = (shop.opening_hours as any) ?? null;
          }
        }

        // 6.c E-mail versturen met context (incl. tracking/label indien aanwezig)
        await sendStatusUpdateMail({
          // ontvanger + basis
          to: (after as any).email,
          first_name: (after as any).first_name,
          last_name: (after as any).last_name,
          order_code: (after as any).order_code,

          // context
          status: newStatus!, // template beslist tekst
          model: (after as any).model,
          capacity_gb: (after as any).capacity_gb,
          final_price_cents: (after as any).final_price_cents,
          wants_voucher: (after as any).wants_voucher ?? null,
          iban: (after as any).iban ?? null,

          // levering + shop
          delivery_method: (after as any).delivery_method,
          shop_location: (after as any).shop_location,
          shop_address1,
          shop_zip,
          shop_city,
          opening_hours,

          // tracking/label
          tracking_code: tracking_code ?? undefined,
          tracking_url: tracking_url ?? undefined,
          label_pdf_url: label_pdf_url ?? undefined,
        } as any);
      } catch (e: any) {
        console.error("[LEADS][MAIL] sendStatusUpdateMail failed:", e?.message || e);
      }
    })();
  }

  // 7) Diagnose/feedback in de msg: welke keys hebben we geprobeerd te zetten?
  const setKeys = Object.keys(patch).sort();
  const tagIgnored = ignored.length ? ` • ignored:${ignored.join(",")}` : "";
  const msg =
    `updated:${after?.status ?? "-"}•€${((after?.final_price_cents ?? 0) / 100).toFixed(2)}` +
    (setKeys.length ? ` • set:${setKeys.join(",")}` : "") +
    tagIgnored;

  redirect(`/admin/leads?msg=${encodeURIComponent(msg)}`);
}

export async function deleteLeadAction(formData: FormData) {
  const id = String(formData.get("id") || "").trim();
  if (!id) redirect(`/admin/leads?msg=${encodeURIComponent("missing_id")}`);
  const sb = sbClient();
  const { error } = await sb.from("buyback_leads").delete().eq("id", id);
  if (error) redirect(`/admin/leads?msg=${encodeURIComponent(`delete_error:${error.message}`)}`);
  redirect(`/admin/leads?msg=${encodeURIComponent("deleted")}`);
}
