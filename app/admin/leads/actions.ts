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
 * Inline update voor status en/of prijs (EUR → cents)
 * Verwacht form fields:
 *  - id (uuid)
 *  - status (optioneel)
 *  - final_price_eur (optioneel, bv "123.45")
 */
export async function updateLeadInlineAction(formData: FormData) {
  const id = String(formData.get("id") || "").trim();
  const statusRaw = String(formData.get("status") || "").trim();
  const priceRaw = String(formData.get("final_price_eur") || "").replace(",", ".").trim();

  if (!id) {
    redirect(`/admin/leads?msg=${encodeURIComponent("missing_id")}`);
  }

  const patch: Record<string, any> = {};

  // status valideren
  if (statusRaw) {
    if (!isAllowedStatus(statusRaw)) {
      redirect(
        `/admin/leads?msg=${encodeURIComponent(
          `invalid_status:${statusRaw}`
        )}`
      );
    }
    patch.status = statusRaw;
  }

  // prijs -> cents
  if (priceRaw) {
    const eur = Number(priceRaw);
    if (Number.isFinite(eur) && eur >= 0) {
      patch.final_price_cents = Math.round(eur * 100);
    } else {
      redirect(
        `/admin/leads?msg=${encodeURIComponent(
          `invalid_price:${priceRaw}`
        )}`
      );
    }
  }

  if (Object.keys(patch).length === 0) {
    redirect(`/admin/leads?msg=${encodeURIComponent("nothing_to_update")}`);
  }

  const sb = sbClient();

  // (optioneel) check bestaande rij (handig voor foutmeldingen/consistentie)
  const { data: before, error: selErr } = await sb
    .from("buyback_leads")
    .select("id, status, final_price_cents, order_code")
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

  // Updaten
  const { data: after, error: updErr } = await sb
    .from("buyback_leads")
    .update(patch)
    .eq("id", id)
    .select("id, status, final_price_cents, updated_at")
    .single();

  if (updErr) {
    // Meest voorkomende: CHECK constraint op status
    redirect(
      `/admin/leads?msg=${encodeURIComponent(
        `update_error:${updErr.message}`
      )}`
    );
  }

  const msg =
    `updated: ${after?.status ?? "-"} • €${((after?.final_price_cents ?? 0) / 100).toFixed(2)}`;
  redirect(`/admin/leads?msg=${encodeURIComponent(msg)}`);
}

/**
 * Lead verwijderen
 * Form field: id
 */
export async function deleteLeadAction(formData: FormData) {
  const id = String(formData.get("id") || "").trim();
  if (!id) {
    redirect(`/admin/leads?msg=${encodeURIComponent("missing_id")}`);
  }

  const sb = sbClient();
  const { error } = await sb.from("buyback_leads").delete().eq("id", id);

  if (error) {
    redirect(
      `/admin/leads?msg=${encodeURIComponent(
        `delete_error:${error.message}`
      )}`
    );
  }
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

export async function updateLeadInlineActionJson(formData: FormData): Promise<LeadRowInline> {
  const id = String(formData.get("id") || "").trim();

  // Mogelijke velden die we inline willen updaten
  const patch: Record<string, any> = {
    first_name: (formData.get("first_name") as string) ?? undefined,
    last_name: (formData.get("last_name") as string) ?? undefined,
    email: (formData.get("email") as string) ?? undefined,
    phone: (formData.get("phone") as string) ?? undefined,
    customer_number: (formData.get("customer_number") as string) ?? undefined,
    sku: (formData.get("sku") as string) ?? undefined,
    imei_sn: (formData.get("imei_sn") as string) ?? undefined,
  };

  // Prijs (EUR naar cents) — optioneel veld
  const priceRaw = String(formData.get("final_price_eur") || "").replace(",", ".").trim();
  if (priceRaw) {
    const eur = Number(priceRaw);
    if (!Number.isFinite(eur) || eur < 0) {
      throw new Error(`invalid_price:${priceRaw}`);
    }
    patch.final_price_cents = Math.round(eur * 100);
  }

  // Status (optioneel)
  const statusRaw = String(formData.get("status") || "").trim();
  if (statusRaw) {
    if (!isAllowedStatus(statusRaw)) {
      throw new Error(`invalid_status:${statusRaw}`);
    }
    patch.status = statusRaw;
  }

  if (!id) throw new Error("missing_id");

  // Lege strings → null opslaan (mooier in DB)
  for (const k of Object.keys(patch)) {
    if (patch[k] === "") patch[k] = null;
    if (patch[k] === undefined) delete patch[k];
  }
  if (Object.keys(patch).length === 0) throw new Error("nothing_to_update");

  const sb = sbClient();

  // We hebben huidige waarden nodig voor gating (SKU/IMEI/SN)
  const { data: before, error: selErr } = await sb
    .from("buyback_leads")
    .select("id, sku, imei_sn")
    .eq("id", id)
    .maybeSingle();
  if (selErr) throw new Error(`select_error:${selErr.message}`);
  if (!before) throw new Error("not_found");

  // Gating: voor eind-statussen moet sku én imei_sn aanwezig zijn
  // (pas evt. aan naar jouw flow)
  // Gating: voor eind-statussen moet customer_number + sku + imei_sn aanwezig zijn
  const gatedStatuses = new Set(['check_passed', 'check_failed', 'done']);
  if (patch.status && gatedStatuses.has(patch.status)) {
    const customerOk = (patch.customer_number ?? before.customer_number)?.trim();
    const skuOk = (patch.sku ?? before.sku)?.trim();
    const imeiOk = (patch.imei_sn ?? before.imei_sn)?.trim();
    if (!customerOk || !skuOk || !imeiOk) {
      throw new Error('status_requires_customer_sku_imei');
    }
  }

  // IMEI normalisatie + check (optioneel)
  if (patch.imei_sn) {
    const v = String(patch.imei_sn).replace(/\s+/g, "");
    const isIMEI = /^\d{15}$/.test(v);
    const isSN = /^[A-Za-z0-9\-_.]{4,}$/.test(v);
    if (!isIMEI && !isSN) {
      throw new Error("invalid_imei_sn");
    }
    patch.imei_sn = v;
  }

  const { data: after, error: updErr } = await sb
    .from("buyback_leads")
    .update(patch)
    .eq("id", id)
    .select(
      "first_name,last_name,email,phone,customer_number,sku,imei_sn,final_price_cents,status"
    )
    .single();

  if (updErr) throw new Error(`update_error:${updErr.message}`);

  return after as LeadRowInline;
}
