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

/**
 * Maakt via Sendcloud een zending + label aan voor deze lead.
 * Verwacht dat 'after' alle nodige adresvelden bevat.
 * Faalt nooit hard: geeft { ...undefined } terug bij problemen en logt de fout.
 */
async function createSendcloudLabel(after: any): Promise<CreateLabelResult> {
  try {
    if (!process.env.SENDCLOUD_PUBLIC_KEY || !process.env.SENDCLOUD_SECRET_KEY) {
      console.warn("[SENDCLOUD] ontbrekende API keys; skip label creation");
      return {};
    }

    // Basis zending opbouw — pas aan indien je specifieke carrier/method wilt forceren
    // Zie Sendcloud API v2: POST /api/v2/parcels
    const payload: any = {
      parcel: {
        name: [after.first_name, after.last_name].filter(Boolean).join(" ") || "Klant",
        company_name: null,
        email: after.email || undefined,
        telephone: after.phone || undefined,
        address: [after.street, after.house_number].filter(Boolean).join(" "),
        house_number: after.house_number || undefined, // sommige carriers verwachten dit apart
        city: after.city,
        postal_code: after.postal_code,
        country: after.country || "BE",
        // gewicht verplicht bij sommige carriers — stel veilig minimum in gram
        weight: 250,
        order_number: after.order_code || after.id,
        // Optioneel: servicepoint id, carrier, etc.
      }
    };

    const resp = await fetch("https://panel.sendcloud.sc/api/v2/parcels", {
      method: "POST",
      headers: {
        "Authorization": scAuthHeader(),
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(payload),
      // node fetch in Next server actions is ok
    });

    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      console.error("[SENDCLOUD] create parcel failed", resp.status, txt);
      return {};
    }

    const data = await resp.json().catch(() => ({} as any));
    const parcel = (data && (data.parcel || data.data?.parcel)) || data;

    // Probeer robuust velden eruit te halen
    const trackingNumber: string | null =
      parcel?.tracking_number || parcel?.tracking_number_public || parcel?.tracking_number_scs || null;

    // Standaard tracking-URL bij Sendcloud
    const trackingUrl: string | null = parcel?.tracking_url || (trackingNumber
      ? `https://tracking.sendcloud.com/tracking/${encodeURIComponent(trackingNumber)}`
      : null);

    // Label link: Sendcloud retourneert verschillende varianten; kies PDF
    const labelPdf: string | null =
      parcel?.label?.normal_printer_pdf ||
      parcel?.label?.label_printer_pdf ||
      parcel?.label?.pdf ||
      parcel?.label_normal_printer ||
      parcel?.label_printer ||
      null;

    return {
      tracking_code: trackingNumber || null,
      tracking_url: trackingUrl || null,
      label_pdf_url: labelPdf || null,
    };
  } catch (e: any) {
    console.error("[SENDCLOUD] exception", e?.message || e);
    return {};
  }
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

  // wants_voucher (boolean in DB) — alleen meenemen als het veld in het formulier zat
  // Tip in de UI: gebruik een hidden default <input type="hidden" name="wants_voucher" value="0" />
  // plus checkbox met value="1", zodat de key altijd gepost wordt.
  const rawWantsVoucher = formData.get("wants_voucher");
  if (rawWantsVoucher !== null) {
    desired.wants_voucher = toBoolOrNull(rawWantsVoucher);
  }

  // overige inline velden die we willen ondersteunen (allemaal TEXT in DB)
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
      // lege string => null opslaan (netter en duidelijk in DB)
      desired[k] = trimmed === "" ? null : trimmed;
    }
  }

  const sb = sbClient();

  // 2) Haal bestaande rij op met ALLE kolommen, zodat we weten welke keys bestaan
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

  // 3) Beperk patch tot kolommen die écht bestaan in de tabel
  const patch: Record<string, any> = {};
  const ignored: string[] = [];
  for (const [k, v] of Object.entries(desired)) {
    if (Object.prototype.hasOwnProperty.call(before, k)) {
      patch[k] = v;
    } else if (typeof v !== "undefined") {
      ignored.push(k);
    }
  }

  // 4) Optionele gating: eindstatus vereist klantnummer + sku + imei (alleen als kolommen bestaan)
  const ending = new Set<Status>(["check_passed", "check_failed", "done"]);
  if (patch.status && ending.has(patch.status)) {
    const need = (key: "customer_number" | "sku" | "imei_sn") =>
      Object.prototype.hasOwnProperty.call(before, key)
        ? (patch[key] ?? (before as any)[key] ??"").toString().trim()
        : ""; // kolom bestaat niet → behandel als ontbrekend
    if (!need("customer_number") || !need("sku") || !need("imei_sn")) {
      redirect(`/admin/leads?msg=${encodeURIComponent("status_requires_customer_sku_imei")}`);
    }
  }

  if (Object.keys(patch).length === 0) {
    const note = ignored.length ? ` (ignored:${ignored.join(",")})` : "";
    redirect(`/admin/leads?msg=${encodeURIComponent("nothing_to_update" + note)}`);
  }

  // 5) Update uitvoeren
  // Uitgebreider returning-pakket zodat we meteen alle mail- en label-data hebben
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

  // 6) Status change → extra logica + status update e-mail (fire-and-forget)
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
        // 6.a Bij 'label_created' → maak verzendlabel + tracking via Sendcloud (alleen bij verzending)
        let tracking_code: string | null | undefined = (after as any).tracking_code ?? null;
        let tracking_url: string | null | undefined = (after as any).tracking_url ?? null;
        let label_pdf_url: string | null | undefined = (after as any).label_pdf_url ?? null;

        if (newStatus === "label_created" && (after as any).delivery_method === "ship") {
          const made = await createSendcloudLabel(after);
          // alleen als Sendcloud iets effectief opleverde, schrijven we terug
          if (made.tracking_code || made.tracking_url || made.label_pdf_url) {
            tracking_code = made.tracking_code ?? tracking_code ?? null;
            tracking_url = made.tracking_url ?? tracking_url ?? null;
            label_pdf_url = made.label_pdf_url ?? label_pdf_url ?? null;

            const { error: trackErr } = await sb
              .from("buyback_leads")
              .update({
                tracking_code,
                tracking_url,
                label_pdf_url,
              })
              .eq("id", id);
            if (trackErr) {
              console.error("[LEADS][SENDCLOUD] tracking upsert failed:", trackErr.message);
            }
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
          status: newStatus, // <-- laat de mailtemplate kiezen op basis van status
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
