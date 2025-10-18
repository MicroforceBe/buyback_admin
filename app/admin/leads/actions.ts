"use server";

import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

// ── Supabase Admin client (service role) ───────────────────────────────────────
function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase admin env ontbreekt: NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL of SUPABASE_SERVICE_ROLE_KEY.");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const ALLOWED_STATUSES = [
  "new",
  "received_store",
  "label_created",
  "shipment_received",
  "check_passed",
  "check_failed",
  "done",
] as const;

function parsePriceToCents(input: FormDataEntryValue | null): number | null {
  if (input == null) return null;
  const s = String(input).trim();
  if (!s) return null;
  const normalized = s.replace(/\s+/g, "").replace(",", ".");
  const num = Number(normalized);
  if (!isFinite(num) || num < 0) return null;
  return Math.round(num * 100);
}

function isUUID(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

// ── Actions ───────────────────────────────────────────────────────────────────
export async function updateLeadInlineAction(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!isUUID(id)) {
    // harde redirect met query hint zodat je in de UI kunt zien wat er misliep
    redirect("/admin/leads?msg=invalid_id");
  }

  const statusRaw = formData.get("status");
  const priceRaw  = formData.get("final_price_eur");

  const patch: Record<string, any> = {};
  let touched = false;

  // Status verwerken (optioneel)
  if (statusRaw !== null) {
    const s = String(statusRaw).trim();
    if (s) {
      if (!ALLOWED_STATUSES.includes(s as any)) {
        redirect(`/admin/leads?msg=invalid_status_${encodeURIComponent(s)}`);
      }
      patch.status = s;
      touched = true;
    }
  }

  // Prijs verwerken (optioneel)
  const cents = parsePriceToCents(priceRaw);
  if (cents !== null) {
    patch.final_price_cents = cents;
    touched = true;
  }

  if (!touched) {
    // Niets gewijzigd → terug naar overzicht
    redirect("/admin/leads?msg=no_changes");
  }

  const sb = supabaseAdmin();

  // 1) Haal vorige waarden (ter verificatie & debug)
  const { data: before, error: selErr } = await sb
    .from("buyback_leads")
    .select("id,status,final_price_cents")
    .eq("id", id)
    .single();

  if (selErr) {
    redirect(`/admin/leads?msg=select_before_error_${encodeURIComponent(selErr.message)}`);
  }

  // 2) Update met return=representation
  patch.updated_at = new Date().toISOString();
  const { data: after, error: updErr } = await sb
    .from("buyback_leads")
    .update(patch, { returning: "representation" })
    .eq("id", id)
    .select("id,status,final_price_cents,updated_at")
    .single();

  if (updErr) {
    redirect(`/admin/leads?msg=update_error_${encodeURIComponent(updErr.message)}`);
  }

  // 3) Verifieer zichtbare wijziging (vooral status)
  if (patch.status && after?.status !== patch.status) {
    // Kolom mismatch of policy → helpende hint
    redirect(`/admin/leads?msg=status_not_changed_check_column_or_rls`);
  }

  // 4) Harde reload (navigatie) zodat UI altijd bijgewerkt is
  redirect("/admin/leads?msg=updated");
}

export async function deleteLeadAction(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!isUUID(id)) {
    redirect("/admin/leads?msg=invalid_id");
  }

  const sb = supabaseAdmin();
  const { error } = await sb.from("buyback_leads").delete().eq("id", id);
  if (error) {
    redirect(`/admin/leads?msg=delete_error_${encodeURIComponent(error.message)}`);
  }

  redirect("/admin/leads?msg=deleted");
}
