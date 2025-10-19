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
function isAllowedStatus(v: string): v is (typeof ALLOWED_STATUSES)[number] {
  return ALLOWED_STATUSES.includes(v as any);
}

/**
 * Eén action die ALLES kan updaten.
 * Velden (optioneel): id (required), status, final_price_eur, sku, imei_sn,
 * customer_number, iban, first_name, last_name, street, house_number,
 * postal_code, city, country, phone
 */
export async function updateLeadInlineAction(formData: FormData) {
  const id = String(formData.get("id") || "").trim();
  if (!id) redirect(`/admin/leads?msg=${encodeURIComponent("missing_id")}`);

  const statusRaw = String(formData.get("status") ?? "").trim();
  const priceRaw = String(formData.get("final_price_eur") ?? "").replace(",", ".").trim();

  const patch: Record<string, any> = {};

  // status
  if (statusRaw) {
    if (!isAllowedStatus(statusRaw)) {
      redirect(`/admin/leads?msg=${encodeURIComponent(`invalid_status:${statusRaw}`)}`);
    }
    patch.status = statusRaw;
  }

  // prijs -> cents
  if (priceRaw) {
    const eur = Number(priceRaw);
    if (!Number.isFinite(eur) || eur < 0) {
      redirect(`/admin/leads?msg=${encodeURIComponent(`invalid_price:${priceRaw}`)}`);
    }
    patch.final_price_cents = Math.round(eur * 100);
  }

  // overige bewerkbare velden
  const f = (k: string) => {
    const v = formData.get(k);
    return typeof v === "string" ? v.trim() : null;
  };

  const KEYS = [
    "sku","imei_sn",
    "customer_number","iban",
    "first_name","last_name",
    "street","house_number","postal_code","city","country",
    "phone",
  ] as const;

  KEYS.forEach((k) => {
    const v = f(k);
    if (v !== null) patch[k] = v;
  });

  const sb = sbClient();

  // haal bestaande rij op voor gating
  const { data: before, error: selErr } = await sb
    .from("buyback_leads")
    .select("id, status, final_price_cents, customer_number, sku, imei_sn")
    .eq("id", id)
    .maybeSingle();

  if (selErr) {
    redirect(`/admin/leads?msg=${encodeURIComponent(`select_error:${selErr.message}`)}`);
  }
  if (!before) {
    redirect(`/admin/leads?msg=${encodeURIComponent("not_found")}`);
  }

  // Gating: voor eind-statussen moet customer_number + sku + imei_sn aanwezig zijn
  const ending = new Set(["check_passed","check_failed","done"]);
  if (patch.status && ending.has(patch.status)) {
    const customerOk = (patch.customer_number ?? before.customer_number ?? "").trim();
    const skuOk      = (patch.sku ?? before.sku ?? "").trim();
    const imeiOk     = (patch.imei_sn ?? before.imei_sn ?? "").trim();
    if (!customerOk || !skuOk || !imeiOk) {
      redirect(`/admin/leads?msg=${encodeURIComponent("status_requires_customer_sku_imei")}`);
    }
  }

  if (Object.keys(patch).length === 0) {
    redirect(`/admin/leads?msg=${encodeURIComponent("nothing_to_update")}`);
  }

  const { data: after, error: updErr } = await sb
    .from("buyback_leads")
    .update(patch)
    .eq("id", id)
    .select("id, status, final_price_cents, updated_at")
    .single();

  if (updErr) {
    redirect(`/admin/leads?msg=${encodeURIComponent(`update_error:${updErr.message}`)}`);
  }

  const msg = `updated:${after?.status ?? "-"}•€${((after?.final_price_cents ?? 0)/100).toFixed(2)}`;
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

// ---- NIEUW: JSON-return variant voor inline editing (géén redirect) ----
export type LeadRowInline = {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  customer_number: string | null;
  sku: string | null;
  imei_sn: string | null;
  final_price_cents: number | null;
  status: (typeof ALLOWED_STATUSES)[number];
};
