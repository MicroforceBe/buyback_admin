"use server";

import { redirect } from "next/navigation";
import { supabaseAdmin as supabaseAdminExport } from "@/lib/supabaseAdmin";
import { sendStatusUpdateMail } from "@/lib/email/sendStatusUpdateMail";
import type { BuybackStatus } from "@/lib/email/templates";
import { getCurrentAdminUser } from "@/lib/getCurrentAdminUser";
import { hasPermission } from "@/lib/adminPermissions";

// In sommige projecten exporteert lib/supabaseAdmin een KLAAR client object,
// in andere een factory-functie. Deze helper vangt beide af.
function sbClient() {
  const anySb: any = supabaseAdminExport as any;
  return typeof anySb === "function" ? anySb() : anySb;
}

// ==== STATUS-TYPES ====

// BuybackStatus bevat de “normale” statussen (new, received_store, …)
// Voor de admin hebben we daarbovenop ook "cancelled".
type Status = BuybackStatus | "cancelled";

const ALLOWED_STATUSES: Status[] = [
  "new",
  "received_store",
  "label_created",
  "shipment_received",
  "check_passed",
  "check_failed",
  "done",
  "cancelled",
] as const;

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
  const ascii = raw
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
  const map: Record<string, string> = {
    be: "BE",
    belgium: "BE",
    belgie: "BE",
    "belgië": "BE",
    belgique: "BE",
    nl: "NL",
    nederland: "NL",
    netherlands: "NL",
    fr: "FR",
    france: "FR",
    frankrijk: "FR",
    de: "DE",
    germany: "DE",
    duitsland: "DE",
    deutschland: "DE",
    lu: "LU",
    luxembourg: "LU",
    luxemburg: "LU",
    gb: "GB",
    uk: "GB",
    "united kingdom": "GB",
    "verenigd koninkrijk": "GB",
  };
  return map[raw] || map[ascii] || (raw.length === 2 ? raw.toUpperCase() : null);
}

/** Utility: trim -> undefined bij lege string */
function clean(s: unknown): string | undefined {
  const v = (s ?? "").toString().trim();
  return v ? v : undefined;
}

/** Default ship_with configuratie: bpost @home (bpost:athome-bpack24hpro) */
const DEFAULT_SHIP_WITH = {
  type: "shipping_option_code",
  properties: {
    shipping_option_code: "bpost:athome-bpack24hpro",
  },
} as const;

/**
 * Haal ship_with-object op uit env en normaliseer naar:
 *
 * {
 *   type: "shipping_option_code",
 *   properties: { shipping_option_code: "..." }
 * }
 *
 * Ondersteunt twee env-vormen:
 * 1) { "shipping_option_code": "..." }
 * 2) { "type": "shipping_option_code", "properties": { "shipping_option_code": "..." } }
 *
 * Indien niet gezet of ongeldig: fallback naar DEFAULT_SHIP_WITH (bpost @home).
 */
function getShipWithObject(): any {
  const raw = process.env.SENDCLOUD_RETURN_SHIP_WITH_JSON;
  if (!raw) {
    console.warn(
      "[SENDCLOUD][V3 SHIPMENTS] SENDCLOUD_RETURN_SHIP_WITH_JSON not set; using default bpost:athome-bpack24hpro"
    );
    return DEFAULT_SHIP_WITH;
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      console.error(
        "[SENDCLOUD][V3 SHIPMENTS] SENDCLOUD_RETURN_SHIP_WITH_JSON is not an object; using default bpost:athome-bpack24hpro"
      );
      return DEFAULT_SHIP_WITH;
    }

    const anyParsed: any = parsed;

    // Vorm 2: type + properties.shipping_option_code
    if (anyParsed.properties?.shipping_option_code) {
      return {
        type: anyParsed.type || "shipping_option_code",
        properties: {
          shipping_option_code: anyParsed.properties.shipping_option_code,
        },
      };
    }

    // Vorm 1: top-level shipping_option_code
    if (anyParsed.shipping_option_code) {
      return {
        type: anyParsed.type || "shipping_option_code",
        properties: {
          shipping_option_code: anyParsed.shipping_option_code,
        },
      };
    }

    console.error(
      "[SENDCLOUD][V3 SHIPMENTS] ship_with JSON has no shipping_option_code; using default bpost:athome-bpack24hpro"
    );
    return DEFAULT_SHIP_WITH;
  } catch (e: any) {
    console.error(
      "[SENDCLOUD][V3 SHIPMENTS] invalid JSON in SENDCLOUD_RETURN_SHIP_WITH_JSON:",
      e?.message || e,
      " -> using default bpost:athome-bpack24hpro"
    );
    return DEFAULT_SHIP_WITH;
  }
}

/** Haal jullie (ontvanger) adres uit env; vereist voor labels */
function getMerchantToAddress() {
  const to = {
    name:
      clean(process.env.SENDCLOUD_TO_NAME) ||
      clean(process.env.MAIL_BRAND_NAME) ||
      "Microforce Buyback",
    company_name:
      clean(process.env.SENDCLOUD_TO_COMPANY) ||
      clean(process.env.MAIL_BRAND_NAME) ||
      "Microforce Buyback",
    email: clean(process.env.SENDCLOUD_TO_EMAIL),
    telephone: clean(process.env.SENDCLOUD_TO_PHONE),
    address: clean(process.env.SENDCLOUD_TO_ADDRESS), // verplicht
    house_number: clean(process.env.SENDCLOUD_TO_HOUSE_NUMBER), // optioneel
    postal_code: clean(process.env.SENDCLOUD_TO_POSTAL_CODE), // verplicht
    city: clean(process.env.SENDCLOUD_TO_CITY), // verplicht
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
 * Maakt via Sendcloud Shipments API v3 een zending + label aan voor deze lead.
 * Shipment (klant -> jullie) met correcte FROM/TO.
 *
 * Endpoint:
 *   POST https://panel.sendcloud.sc/api/v3/shipments/announce
 *
 * Auth:
 *   Basic auth met SENDCLOUD_PUBLIC_KEY:SENDCLOUD_SECRET_KEY
 */
async function createSendcloudLabel(after: any): Promise<CreateLabelResult> {
  try {
    if (!process.env.SENDCLOUD_PUBLIC_KEY || !process.env.SENDCLOUD_SECRET_KEY) {
      console.warn("[SENDCLOUD] ontbrekende API keys; skip label creation");
      return {};
    }

    // ship_with configuratie (v3 verplicht) – bevat shipping_option_code
    const shipWith = getShipWithObject();
    if (!shipWith) {
      console.warn(
        "[SENDCLOUD][V3 SHIPMENTS] no ship_with object; skipping label creation"
      );
      return {};
    }

    // Landcode klant (FROM) normaliseren
    const countryIso = normalizeCountryIso2(after.country) || "BE";

    // FROM (klant) – waarden cleanen
    const from_name =
      clean([after.first_name, after.last_name].filter(Boolean).join(" ")) ||
      clean(after.email) ||
      "Klant";
    const from_company_name = from_name; // fallback zodat nooit null
    const from_address_line_1 = clean(
      [after.street, after.house_number].filter(Boolean).join(" ")
    );
    const from_postal_code = clean(after.postal_code);
    const from_city = clean(after.city);
    const from_country_code = countryIso?.toUpperCase();
    const from_email = clean(after.email);
    const from_phone_number = clean(after.phone);

    // TO (jullie) adres uit env
    const { to, missing } = getMerchantToAddress();
    if (missing.length) {
      console.error(
        "[SENDCLOUD][V3 SHIPMENTS] ontbrekende TO omgevingvariabelen:",
        missing.join(", ")
      );
      return {};
    }

    const to_address_line_1 = [to.address, to.house_number].filter(Boolean).join(" ");

    // Preflight validatie: FROM & TO moeten verplichte velden hebben
    const fromMissing: string[] = [];
    if (!from_address_line_1) fromMissing.push("from_address.address_line_1");
    if (!from_city) fromMissing.push("from_address.city");
    if (!from_postal_code) fromMissing.push("from_address.postal_code");
    if (!from_country_code) fromMissing.push("from_address.country_code");

    const toMissing: string[] = [];
    if (!to_address_line_1) toMissing.push("to_address.address_line_1");
    if (!to.city) toMissing.push("to_address.city");
    if (!to.postal_code) toMissing.push("to_address.postal_code");
    if (!to.country) toMissing.push("to_address.country_code");

    const externalRef: string =
      (after as any).order_code ||
      String((after as any).orderId || (after as any).id || "");

    console.info("[SENDCLOUD][V3 SHIPMENTS] create shipment start", {
      order_number: externalRef,
      to: to.company_name || to.name,
      country: from_country_code,
      hasKeys:
        !!process.env.SENDCLOUD_PUBLIC_KEY && !!process.env.SENDCLOUD_SECRET_KEY,
      from_missing: fromMissing,
      to_missing: toMissing,
    });

    if (fromMissing.length || toMissing.length) {
      console.error("[SENDCLOUD][V3 SHIPMENTS] ontbrekende adresvelden:", {
        fromMissing,
        toMissing,
      });
      return {};
    }

    // Gewicht op parcel-niveau (verplicht voor shipment)
    const weight = {
      value: 0.5, // 0.5 kg is ruim voldoende voor 1 toestel
      unit: "kg",
    };

    // Shipments v3 verwacht parcels[] met gewicht, en from/to op shipment-niveau
    const payload: any = {
      from_address: {
        name: from_name,
        company_name: from_company_name,
        email: from_email,
        phone_number: from_phone_number,
        address_line_1: from_address_line_1,
        postal_code: from_postal_code,
        city: from_city,
        country_code: from_country_code,
      },

      to_address: {
        name: to.name,
        company_name: to.company_name,
        email: to.email,
        phone_number: to.telephone,
        address_line_1: to_address_line_1,
        postal_code: to.postal_code,
        city: to.city,
        country_code: to.country,
      },

      ship_with: shipWith, // bevat type + properties.shipping_option_code

      parcels: [
        {
          weight,
          // eventueel later: dimensions, insurance, etc.
        },
      ],

      // Belangrijk voor ordernummer + label
      order_number: externalRef,
      external_reference: externalRef,
      reference: externalRef,
      external_order_id: externalRef,
      label_notes: externalRef ? `Buyback ${externalRef}` : "BUYBACK",
    };

    const resp = await fetch(
      "https://panel.sendcloud.sc/api/v3/shipments/announce",
      {
        method: "POST",
        headers: {
          Authorization: scAuthHeader(), // Basic pub:sec
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      }
    );

    // Altijd raw response loggen om structuur te zien
    const rawText = await resp.text().catch(() => "");
    console.info("[SENDCLOUD][V3 SHIPMENTS] raw response", {
      status: resp.status,
      ok: resp.ok,
      bodySnippet: rawText.slice(0, 1000),
    });

    if (!resp.ok) {
      console.error(
        "[SENDCLOUD][V3 SHIPMENTS] create shipment failed",
        resp.status,
        rawText
      );
      return {};
    }

    let data: any = {};
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch (e: any) {
      console.error(
        "[SENDCLOUD][V3 SHIPMENTS] response is not valid JSON:",
        e?.message || e
      );
      return {};
    }

    // Sommige endpoints wrappen onder { data: { ... } }
    const d: any = (data as any)?.data ?? data;

    // === Tracking & label uit de shipments v3-response halen ===
    const firstParcel: any =
      d?.parcels?.[0] ??
      d?.parcel ??
      d?.shipment?.parcels?.[0] ??
      d?.shipments?.[0]?.parcels?.[0] ??
      null;

    const trackingNumber: string | null =
      d?.tracking_number ??
      d?.parcel?.tracking_number ??
      firstParcel?.tracking_number ??
      null;

    // Probeer eerst een tracking_url uit de API te halen
    const trackingUrlFromApi: unknown =
      d?.tracking_url ??
      d?.parcel?.tracking_url ??
      firstParcel?.tracking_url ??
      null;

    const trackingUrl: string | null =
      typeof trackingUrlFromApi === "string" ? trackingUrlFromApi : null;

    const docsArray: any[] =
      d?.documents ??
      d?.parcel?.documents ??
      (firstParcel?.documents as any[]) ??
      [];

    let labelPdfUrl: string | null = null;
    let parcelIdForLabel: string | null = null;

    if (Array.isArray(docsArray)) {
      const labelDoc = docsArray.find(
        (doc) => doc && doc.type === "label" && typeof doc.link === "string"
      );
      if (labelDoc) {
        // bv. "/api/v3/parcels/574848212/documents/label" of met host
        const link = String(labelDoc.link);

        // Parcel ID uit de link halen
        const m = link.match(/parcels\/(\d+)\/documents\/label/);
        if (m) {
          parcelIdForLabel = m[1]; // "574848212"
        }

        // desnoods nog bewaren, maar we gaan 'm niet rechtstreeks gebruiken
        labelPdfUrl = link;
      }
    }

    console.info("[SENDCLOUD][V3 SHIPMENTS] parsed result", {
      trackingNumber,
      hasLabelPdf: !!parcelIdForLabel || !!labelPdfUrl,
    });

    return {
      tracking_code: trackingNumber,
      tracking_url: trackingUrl,
      // We slaan voortaan de parcel_id op in label_pdf_url (beter: losse kolom, maar zo hoeft de DB niet meteen aangepast)
      label_pdf_url: parcelIdForLabel ?? labelPdfUrl,
    };
  } catch (e: any) {
    console.error("[SENDCLOUD][V3 SHIPMENTS] exception", e?.message || e);
    return {};
  }
}

/**
 * Eén action die ALLES kan updaten.
 * Velden (optioneel): id (required), status, final_price_eur, sku, imei_sn,
 * customer_number, iban, first_name, last_name, street, house_number,
 * postal_code, city, country, phone, wants_voucher, cancel_reason
 */
export async function updateLeadInlineAction(formData: FormData) {
  // permissies: enkel users met leads:write mogen wijzigen
  const adminUser = await getCurrentAdminUser();
  if (!hasPermission(adminUser, "leads", "write")) {
    redirect(`/admin/leads?msg=${encodeURIComponent("forbidden:no_permission")}`);
  }

  const id = String(formData.get("id") || "").trim();
  if (!id) redirect(`/admin/leads?msg=${encodeURIComponent("missing_id")}`);

  // 1) Verzamel gewenste wijzigingen uit het formulier
  const desired: Record<string, any> = {};

  // status
  const statusRaw = String(formData.get("status") ?? "").trim();
  if (statusRaw) {
    if (!isAllowedStatus(statusRaw)) {
      redirect(
        `/admin/leads?msg=${encodeURIComponent(`invalid_status:${statusRaw}`)}`
      );
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
      redirect(
        `/admin/leads?msg=${encodeURIComponent(`invalid_price:${priceRaw}`)}`
      );
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
    "cancel_reason", // ⬅️ nieuw veld voor annulatie-redenen
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
    redirect(
      `/admin/leads?msg=${encodeURIComponent(
        `select_error:${selErr.message}`
      )}`
    );
  }
  if (!before) {
    redirect(`/admin/leads?msg=${encodeURIComponent("not_found")}`);
  }

  // ❗ Eens een lead geannuleerd is, mag hij niet meer gewijzigd worden
  if ((before as any).status === "cancelled") {
    redirect(
      `/admin/leads?msg=${encodeURIComponent(
        "status_cancelled_no_changes"
      )}`
    );
  }

  // 3) Beperk patch tot bestaande kolommen
  const patch: Record<string, any> = {};
  const ignoredEarly: string[] = [];
  for (const [k, v] of Object.entries(desired)) {
    if (Object.prototype.hasOwnProperty.call(before, k)) {
      patch[k] = v;
    } else if (typeof v !== "undefined") {
      ignoredEarly.push(k);
    }
  }

  // 4) Gating eindstatus (controle-succes / -failed / done)
  const ending = new Set<Status>(["check_passed", "check_failed", "done"]);
  if (patch.status && ending.has(patch.status)) {
    const need = (key: "customer_number" | "sku" | "imei_sn") =>
      Object.prototype.hasOwnProperty.call(before, key)
        ? (patch[key] ?? (before as any)[key] ?? "").toString().trim()
        : "";
    if (!need("customer_number") || !need("sku") || !need("imei_sn")) {
      redirect(
        `/admin/leads?msg=${encodeURIComponent(
          "status_requires_customer_sku_imei"
        )}`
      );
    }
  }

  // 4.b Automatisch 'ship' zetten als label wordt aangemaakt
  const endingStatus: Status = "label_created";
  if (patch.status === endingStatus) {
    const currentMethod = (before as any).delivery_method as string | null;
    if (Object.prototype.hasOwnProperty.call(before, "delivery_method")) {
      if (currentMethod !== "ship") {
        patch.delivery_method = "ship";
        console.info("[LEADS] delivery_method auto->ship (label_created)");
      }
    }
  }

  // 4.c Als we naar "cancelled" gaan, moet er een cancel_reason zijn
  if (patch.status === "cancelled") {
    const reason =
      (patch.cancel_reason ??
        (before as any).cancel_reason ??
        "")?.toString().trim();

    if (!reason) {
      redirect(
        `/admin/leads?msg=${encodeURIComponent(
          "cancel_reason_required"
        )}`
      );
    }

    patch.cancel_reason = reason;
  }

  if (Object.keys(patch).length === 0) {
    const note = ignoredEarly.length
      ? ` (ignored:${ignoredEarly.join(",")})`
      : "";
    redirect(
      `/admin/leads?msg=${encodeURIComponent("nothing_to_update" + note)}`
    );
  }

  // 5) Update uitvoeren (ruim returning pakket)
  const returningCols = [
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
    "created_at",
    "updated_at",
    // trackingvelden
    "tracking_code",
    "tracking_url",
    "label_pdf_url",
    "questions_answers_html",
    // reden annulatie
    "cancel_reason",
  ].join(", ");

  const { data: after, error: updErr } = await sb
    .from("buyback_leads")
    .update(patch)
    .eq("id", id)
    .select(returningCols)
    .single();

  if (updErr) {
    redirect(
      `/admin/leads?msg=${encodeURIComponent(
        `update_error:${updErr.message}`
      )}`
    );
  }

  // 6) Status change → Sendcloud + mail (fire-and-forget)
  const prevStatus = (before as any)?.status as Status | undefined;
  const newStatus = ((patch.status as Status | undefined) ??
    (after as any)?.status) as Status | undefined;

  const NOTIFY_STATUSES: Status[] = [
    "received_store",
    "label_created",
    "shipment_received",
    "check_passed",
    "check_failed",
    "done",
    // géén "cancelled" hier: annulatie hoeft geen statusmail
  ];

  const statusChanged =
    newStatus && newStatus !== prevStatus && NOTIFY_STATUSES.includes(newStatus);

  if (statusChanged && after?.email) {
    (async () => {
      try {
        // 6.a Bij 'label_created' → maak verzendlabel + tracking via Sendcloud
        let tracking_code: string | null | undefined =
          (after as any).tracking_code ?? null;
        let tracking_url: string | null | undefined =
          (after as any).tracking_url ?? null;
        let label_pdf_url: string | null | undefined =
          (after as any).label_pdf_url ?? null;

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
              console.error(
                "[LEADS][SENDCLOUD] tracking upsert failed:",
                trackErr.message
              );
            } else {
              console.info("[LEADS][SENDCLOUD] tracking stored OK");
            }
          } else {
            console.warn(
              "[LEADS][SENDCLOUD] label not created (no tracking/label returned)"
            );
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

          // context / templatekeuze
          status: newStatus!, // template beslist tekst
          language: "nl",

          // toestel & prijs
          model: (after as any).model,
          capacity_gb: (after as any).capacity_gb,
          variant: (after as any).variant ?? null,
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

          // vragen + antwoorden (HTML uit lead)
          questions_answers_html:
            (after as any).questions_answers_html ?? null,

          // tracking/label
          tracking_code: tracking_code ?? undefined,
          tracking_url: tracking_url ?? undefined,
          label_pdf_url: label_pdf_url ?? undefined,
        });
      } catch (e: any) {
        console.error(
          "[LEADS][MAIL] sendStatusMail failed:",
          e?.message || e
        );
      }
    })();
  }

  // 7) Diagnose/feedback in de msg: welke keys hebben we geprobeerd te zetten?
  const setKeys = Object.keys(patch).sort();
  const ignoredFinal = Object.keys(desired).filter(
    (k) => !setKeys.includes(k)
  );
  const tagIgnored = ignoredFinal.length
    ? ` • ignored:${ignoredFinal.join(",")}`
    : "";
  const msg =
    `updated:${after?.status ?? "-"}•€${(
      (after?.final_price_cents ?? 0) / 100
    ).toFixed(2)}` +
    (setKeys.length ? ` • set:${setKeys.join(",")}` : "") +
    tagIgnored;

  redirect(`/admin/leads?msg=${encodeURIComponent(msg)}`);
}

export async function deleteLeadAction(formData: FormData) {
  // permissies: enkel users met leads:write mogen verwijderen
  const adminUser = await getCurrentAdminUser();
  if (!hasPermission(adminUser, "leads", "write")) {
    redirect(`/admin/leads?msg=${encodeURIComponent("forbidden:no_permission")}`);
  }

  const id = String(formData.get("id") || "").trim();
  if (!id)
    redirect(`/admin/leads?msg=${encodeURIComponent("missing_id")}`);
  const sb = sbClient();
  const { error } = await sb.from("buyback_leads").delete().eq("id", id);
  if (error)
    redirect(
      `/admin/leads?msg=${encodeURIComponent(
        `delete_error:${error.message}`
      )}`
    );
  redirect(`/admin/leads?msg=${encodeURIComponent("deleted")}`);
}

