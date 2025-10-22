"use server";

import { redirect } from "next/navigation";
import { supabaseAdmin as supabaseAdminExport } from "@/lib/supabaseAdmin";

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
        ? (patch[key] ?? (before as any)[key] ?? "").toString().trim()
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
  const returningCols =
    "id, status, final_price_cents, wants_voucher, customer_number, sku, imei_sn, iban, " +
    "first_name, last_name, street, house_number, postal_code, city, country, phone, updated_at";

  const { data: after, error: updErr } = await sb
    .from("buyback_leads")
    .update(patch)
    .eq("id", id)
    .select(returningCols)
    .single();

  if (updErr) {
    redirect(`/admin/leads?msg=${encodeURIComponent(`update_error:${updErr.message}`)}`);
  }

  // 6) Diagnose/feedback in de msg: welke keys hebben we geprobeerd te zetten?
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
