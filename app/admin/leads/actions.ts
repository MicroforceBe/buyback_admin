// app/admin/leads/actions.ts

"use server";

import { redirect } from "next/navigation";
import { supabaseAdmin as supabaseAdminExport } from "@/lib/supabaseAdmin";
import { sendStatusUpdateMail } from "@/lib/email/sendStatusUpdateMail";
import type { BuybackStatus } from "@/lib/email/templates";
import { getCurrentAdminUser } from "@/lib/getCurrentAdminUser";
import { hasPermission } from "@/lib/adminPermissions";
import { getNotificationSettings } from "@/lib/buybackSettings";
import { sendFinanceBorderelMail } from "@/lib/email/sendFinanceBorderel";


// In sommige projecten exporteert lib/supabaseAdmin een KLAAR client object,
// in andere een factory-functie. Deze helper vangt beide af.
function sbClient() {
  const anySb: any = supabaseAdminExport as any;
  return typeof anySb === "function" ? anySb() : anySb;
}

// Status in de leads: alle mailbare statussen + 'cancelled'
type Status = BuybackStatus | "cancelled";

// Toegestane statussen in de UI
const ALLOWED_STATUSES: Status[] = [
  "new",
  "received_store",
  "label_created",
  "shipment_received",
  "check_passed",
  "check_failed",
  "done",
  "cancelled",
];

function isAllowedStatus(v: string): v is Status {
  return ALLOWED_STATUSES.includes(v as Status);
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
*/
async function createSendcloudLabel(after: any): Promise<CreateLabelResult> {
  try {
    if (!process.env.SENDCLOUD_PUBLIC_KEY || !process.env.SENDCLOUD_SECRET_KEY) {
      console.warn("[SENDCLOUD] ontbrekende API keys; skip label creation");
      return {};
    }

    const shipWith = getShipWithObject();
    if (!shipWith) {
      console.warn(
        "[SENDCLOUD][V3 SHIPMENTS] no ship_with object; skipping label creation"
      );
      return {};
    }

    const countryIso = normalizeCountryIso2(after.country) || "BE";

    const from_name =
      clean([after.first_name, after.last_name].filter(Boolean).join(" ")) ||
      clean(after.email) ||
      "Klant";
    const from_company_name = from_name;
    const from_address_line_1 = clean(
      [after.street, after.house_number].filter(Boolean).join(" ")
    );
    const from_postal_code = clean(after.postal_code);
    const from_city = clean(after.city);
    const from_country_code = countryIso?.toUpperCase();
    const from_email = clean(after.email);
    const from_phone_number = clean(after.phone);

    const { to, missing } = getMerchantToAddress();
    if (missing.length) {
      console.error(
        "[SENDCLOUD][V3 SHIPMENTS] ontbrekende TO omgevingvariabelen:",
        missing.join(", ")
      );
      return {};
    }

    const to_address_line_1 = [to.address, to.house_number].filter(Boolean).join(" ");

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

    const weight = {
      value: 0.5,
      unit: "kg",
    };

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

      ship_with: shipWith,

      parcels: [
        {
          weight,
        },
      ],

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
          Authorization: scAuthHeader(),
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      }
    );

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

    const d: any = (data as any)?.data ?? data;

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
        const link = String(labelDoc.link);
        const m = link.match(/parcels\/(\d+)\/documents\/label/);
        if (m) {
          parcelIdForLabel = m[1];
        }
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
      label_pdf_url: parcelIdForLabel ?? labelPdfUrl,
    };
  } catch (e: any) {
    console.error("[SENDCLOUD][V3 SHIPMENTS] exception", e?.message || e);
    return {};
  }
}

/**
* Server action om opnieuw een label + tracking op te halen
* en opnieuw de statusmail voor 'label_created' te sturen.
*/
export async function resyncSendcloudLabelAction(formData: FormData) {
  const adminUser = await getCurrentAdminUser();
  if (!hasPermission(adminUser, "leads", "write")) {
    redirect(`/admin/leads?msg=${encodeURIComponent("forbidden:no_permission")}`);
  }

  const id = String(formData.get("id") || "").trim();
  if (!id) {
    redirect(`/admin/leads?msg=${encodeURIComponent("missing_id")}`);
  }

  const sb = sbClient();

  const { data: lead, error } = await sb
    .from("buyback_leads")
    .select(
      [
        "id",
        "status",
        "email",
        "first_name",
        "last_name",
        "order_code",
        "model",
        "capacity_gb",
        "variant",
        "final_price_cents",
        "wants_voucher",
        "iban",
        "delivery_method",
        "shop_location",
        "shop_id",
        "questions_answers_html",
        "tracking_code",
        "tracking_url",
        "label_pdf_url",
      ].join(",")
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !lead) {
    redirect(
      `/admin/leads?msg=${encodeURIComponent(
        `resync_not_found:${error?.message || "no_lead"}`
      )}`
    );
  }

  if ((lead as any).delivery_method !== "ship") {
    redirect(
      `/admin/leads?msg=${encodeURIComponent("resync_not_ship_lead")}`
    );
  }

  // opnieuw label + tracking proberen
  console.info("[LEADS][RESYNC] attempting Sendcloud label (manual resync)");
  const made = await createSendcloudLabel(lead);

  let tracking_code: string | null =
    made.tracking_code ?? (lead as any).tracking_code ?? null;
  let tracking_url: string | null =
    made.tracking_url ?? (lead as any).tracking_url ?? null;
  let label_pdf_url: string | null =
    made.label_pdf_url ?? (lead as any).label_pdf_url ?? null;

  if (tracking_code || tracking_url || label_pdf_url) {
    const { error: trackErr } = await sb
      .from("buyback_leads")
      .update({ tracking_code, tracking_url, label_pdf_url })
      .eq("id", id);

    if (trackErr) {
      console.error(
        "[LEADS][RESYNC] tracking upsert failed:",
        trackErr.message
      );
    } else {
      console.info("[LEADS][RESYNC] tracking stored OK");
    }
  } else {
    console.warn(
      "[LEADS][RESYNC] label not created (no tracking/label returned)"
    );
  }

  // indien er een e-mail is: opnieuw statusmail voor 'label_created'
  if (lead.email) {
    try {
      await sendStatusUpdateMail({
        to: (lead as any).email,
        first_name: (lead as any).first_name,
        last_name: (lead as any).last_name,
        order_code: (lead as any).order_code,
        status: "label_created",
        language: "nl",
        model: (lead as any).model,
        capacity_gb: (lead as any).capacity_gb,
        variant: (lead as any).variant ?? null,
        final_price_cents: (lead as any).final_price_cents,
        wants_voucher: (lead as any).wants_voucher ?? null,
        iban: (lead as any).iban ?? null,
        delivery_method: (lead as any).delivery_method,
        shop_location: (lead as any).shop_location,
        shop_address1: null,
        shop_zip: null,
        shop_city: null,
        opening_hours: null,
        questions_answers_html: (lead as any).questions_answers_html ?? null,
        tracking_code: tracking_code ?? undefined,
        tracking_url: tracking_url ?? undefined,
        label_pdf_url: label_pdf_url ?? undefined,
      });
      console.info("[LEADS][RESYNC] status mail (label_created) sent");
    } catch (e: any) {
      console.error(
        "[LEADS][RESYNC] sendStatusUpdateMail failed:",
        e?.message || e
      );
    }
  }

  redirect(`/admin/leads?msg=${encodeURIComponent("resynced_label")}`);
}

/**
* Eén action die ALLES kan updaten.
*/
export async function updateLeadInlineAction(formData: FormData) {
  // permissies: enkel users met leads:write mogen wijzigen
  const adminUser = await getCurrentAdminUser();
  if (!hasPermission(adminUser, "leads", "write")) {
    redirect(`/admin/leads?msg=${encodeURIComponent("forbidden:no_permission")}`);
  }

  const id = String(formData.get("id") || "").trim();
  if (!id) redirect(`/admin/leads?msg=${encodeURIComponent("missing_id")}`);

  // 1) status + cancel_reason uit het formulier halen
  const statusRaw = String(formData.get("status") ?? "").trim();

  const cancelReasonRaw = (formData.get("cancel_reason") as string | null) ?? "";
  const cancelReason = cancelReasonRaw.trim() || null;

  if (statusRaw) {
    if (!isAllowedStatus(statusRaw)) {
      redirect(
        `/admin/leads?msg=${encodeURIComponent(`invalid_status:${statusRaw}`)}`
      );
    }
    // Als status naar cancelled gaat, moet er een reden zijn
    if (statusRaw === "cancelled" && !cancelReason) {
      redirect(
        `/admin/leads?msg=${encodeURIComponent("cancel_reason_required")}`
      );
    }
  }

  // 2) Verzamel gewenste wijzigingen uit het formulier
  const desired: Record<string, any> = {};

  if (statusRaw) {
    desired.status = statusRaw as Status;
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

  // expliciet: cancel_reason (alleen zetten als er iets is)
  if (cancelReason !== null) {
    desired.cancel_reason = cancelReason;
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

  // 3) Haal bestaande rij op
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

  // Als de lead al geannuleerd is -> niets meer wijzigen
  if ((before as any).status === "cancelled") {
    redirect(`/admin/leads?msg=${encodeURIComponent("already_cancelled")}`);
  }

  // 4) Beperk patch tot bestaande kolommen
  const patch: Record<string, any> = {};
  const ignoredEarly: string[] = [];
  for (const [k, v] of Object.entries(desired)) {
    if (Object.prototype.hasOwnProperty.call(before, k)) {
      patch[k] = v;
    } else if (typeof v !== "undefined") {
      ignoredEarly.push(k);
    }
  }

  // 5) Gating eindstatus (check_passed/check_failed/done)
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

  // 5.b Automatisch 'ship' zetten als label wordt aangemaakt
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

  if (Object.keys(patch).length === 0) {
    const note = ignoredEarly.length
      ? ` (ignored:${ignoredEarly.join(",")})`
      : "";
    redirect(
      `/admin/leads?msg=${encodeURIComponent("nothing_to_update" + note)}`
    );
  }

  // 6) Update uitvoeren
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
    "variant",
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

  // 7) Status change → Sendcloud + mail (fire-and-forget)
  const prevStatus = (before as any)?.status as Status | undefined;
  const newStatus = ((patch.status as Status | undefined) ??
    (after as any)?.status) as Status | undefined;

  // Alleen deze statussen sturen mails (géén mail bij 'cancelled')
  const NOTIFY_STATUSES: BuybackStatus[] = [
    "received_store",
    "label_created",
    "shipment_received",
    "check_passed",
    "check_failed",
    "done",
  ];

  const statusChanged =
    newStatus &&
    newStatus !== prevStatus &&
    NOTIFY_STATUSES.includes(newStatus as BuybackStatus);

  if (statusChanged && after?.email) {
    (async () => {
      try {
        // Bij 'label_created' → maak verzendlabel + tracking via Sendcloud
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

        // Shopdetails ophalen indien beschikbaar
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

        await sendStatusUpdateMail({
          to: (after as any).email,
          first_name: (after as any).first_name,
          last_name: (after as any).last_name,
          order_code: (after as any).order_code,
          status: newStatus as BuybackStatus, // 'cancelled' komt hier nooit
          language: "nl",
          model: (after as any).model,
          capacity_gb: (after as any).capacity_gb,
          variant: (after as any).variant ?? null,
          final_price_cents: (after as any).final_price_cents,
          wants_voucher: (after as any).wants_voucher ?? null,
          iban: (after as any).iban ?? null,
          delivery_method: (after as any).delivery_method,
          shop_location: (after as any).shop_location,
          shop_address1,
          shop_zip,
          shop_city,
          opening_hours,
          questions_answers_html:
            (after as any).questions_answers_html ?? null,
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

      // Finance-mail met aankoopborderel (bij geslaagde controle)
      const FINANCE_TRIGGER_STATUSES: BuybackStatus[] = ["check_passed"];

      if (
        newStatus &&
        FINANCE_TRIGGER_STATUSES.includes(newStatus as BuybackStatus)
      ) {
        const { finance_email, brand_name } = await getNotificationSettings();
        if (finance_email) {
          try {
            await sendFinanceBorderelMail({
              to: finance_email,
              status: newStatus as BuybackStatus,
              // basis + identificatie
              first_name: (after as any).first_name,
              last_name: (after as any).last_name,
              order_code: (after as any).order_code,
              email: (after as any).email,
              // toestel
              model: (after as any).model,
              capacity_gb: (after as any).capacity_gb,
              variant: (after as any).variant ?? null,
              sku: (after as any).sku ?? null,
              imei_sn: (after as any).imei_sn ?? null,
              // prijs / uitbetaling
              final_price_cents: (after as any).final_price_cents,
              wants_voucher: (after as any).wants_voucher ?? null,
              iban: (after as any).iban ?? null,
              // klant & adres
              street: (after as any).street ?? null,
              house_number: (after as any).house_number ?? null,
              postal_code: (after as any).postal_code ?? null,
              city: (after as any).city ?? null,
              country: (after as any).country ?? null,
              phone: (after as any).phone ?? null,
              // levering / shop
              delivery_method: (after as any).delivery_method,
              shop_location: (after as any).shop_location,
              shop_address1: shop_address1,
              shop_zip,
              shop_city,
              opening_hours,
              // tracking
              tracking_code: tracking_code ?? undefined,
              tracking_url: tracking_url ?? undefined,
              label_pdf_url: label_pdf_url ?? undefined,
              // extra voor finance
              customer_number: (after as any).customer_number ?? null,
              brand_name_override: brand_name,
              // vragen/antwoorden (optioneel) in borderel
              questions_answers_html:
                (after as any).questions_answers_html ?? null,
            });
          } catch (e: any) {
            console.error(
              "[LEADS][FINANCE] borderel mail failed:",
              e?.message || e
            );
          }
        } else {
          console.warn(
            "[LEADS][FINANCE] finance_email not configured; skipping borderel"
          );
        }
      }
    })();
  }

  // 8) Diagnose/feedback
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
