"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@supabase/supabase-js";

// ── Supabase Admin client ──────────────────────────────────────────────────────
function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase admin env ontbreekt: NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL of SUPABASE_SERVICE_ROLE_KEY."
    );
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

function parsePriceToCents(input: string | null | undefined): number | null {
  if (input == null) return null;          // geen veld aanwezig -> geen wijziging
  const raw = String(input);
  const trimmed = raw.trim();
  if (trimmed === "") return null;         // lege string -> overslaan (géén fout)
  const normalized = trimmed.replace(/\s+/g, "").replace(",", ".");
  const num = Number(normalized);
  if (!isFinite(num) || num < 0) return null; // ongeldig -> overslaan
  const cents = Math.round(num * 100);
  return Number.isFinite(cents) ? cents : null;
}

function isUUID(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

// ── Actions ───────────────────────────────────────────────────────────────────
export async function updateLeadInlineAction(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!isUUID(id)) return { ok: false, error: "Ongeldig ID" };

  // Velden kunnen ontbreken of leeg zijn — dan slaan we over i.p.v. fouten te gooien
  const statusRaw = formData.get("status");
  const priceRaw = formData.get("final_price_eur");

  const patch: Record<string, any> = {};
  let touched = false;

  // Status
  if (statusRaw !== null) {
    const s = String(statusRaw).trim();
    if (s !== "") {
      if (!ALLOWED_STATUSES.includes(s as any)) {
        return { ok: false, error: `Ongeldige status: ${s}` };
      }
      patch.status = s;
      touched = true;
    }
  }

  // Prijs
  const cents = parsePriceToCents(priceRaw as any);
  if (cents !== null) {
    patch.final_price_cents = cents;
    touched = true;
  }

  if (!touched) {
    // Niets te wijzigen — niet als fout behandelen
    return { ok: true, message: "Geen wijzigingen" };
  }

  patch.updated_at = new Date().toISOString();

  try {
    const sb = supabaseAdmin();
    // return=representation + .select() forceert dat we de gewijzigde rij terugkrijgen
    const { data, error } = await sb
      .from("buyback_leads")
      .update(patch)
      .eq("id", id)
      .select("id,status,final_price_cents,updated_at")
      .single();

    if (error) {
      return { ok: false, error: error.message };
    }

    // Zorg dat SSR/ISR caches verversen
    revalidatePath("/admin/leads");
    return { ok: true, data };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

export async function deleteLeadAction(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!isUUID(id)) return { ok: false, error: "Ongeldig ID" };

  try {
    const sb = supabaseAdmin();
    const { error } = await sb.from("buyback_leads").delete().eq("id", id);
    if (error) return { ok: false, error: error.message };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }

  revalidatePath("/admin/leads");
  return { ok: true };
}
