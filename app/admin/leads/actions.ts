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
