"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@supabase/supabase-js";

// ── Supabase Admin client (service role) ───────────────────────────────────────
function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY; // service role (RLS bypass)
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

function parsePriceToCents(input: string | null | undefined): number | null {
  if (!input) return null;
  const normalized = String(input).replace(/\s+/g, "").replace(",", ".");
  if (!normalized) return null;
  const num = Number(normalized);
  if (!isFinite(num) || num < 0) return null;
  const cents = Math.round(num * 100);
  return Number.isFinite(cents) ? cents : null;
}

function isUUID(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

// ── Server Actions ─────────────────────────────────────────────────────────────
// Alleen async functions exporteren in een "use server" file!
export async function updateLeadInlineAction(formData: FormData) {
  // Haal velden op
  const id = String(formData.get("id") || "");
  const status = formData.get("status");
  const priceEur = formData.get("final_price_eur");

  // Validatie
  if (!isUUID(id)) {
    return { ok: false, error: "Ongeldig ID" };
  }

  const patch: Record<string, any> = { updated_at: new Date().toISOString() };

  if (status !== null) {
    const s = String(status);
    if (!ALLOWED_STATUSES.includes(s as any)) {
      return { ok: false, error: `Ongeldige status: ${s}` };
    }
    patch.status = s;
  }

  if (priceEur !== null) {
    const cents = parsePriceToCents(String(priceEur));
    if (cents === null) {
      return { ok: false, error: "Prijs is ongeldig (verwacht bv. 123.45)" };
    }
    patch.final_price_cents = cents;
  }

  if (Object.keys(patch).length === 1) {
    // enkel updated_at? niets te doen
    return { ok: true };
  }

  try {
    const sb = supabaseAdmin();
    const { error } = await sb
      .from("buyback_leads")
      .update(patch)
      .eq("id", id);

    if (error) {
      // Niet throwen → netjes teruggeven zodat UI niet crasht
      return { ok: false, error: error.message };
    }
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }

  // Pagina verversen zodat data zichtbaar updatet
  revalidatePath("/admin/leads");
  return { ok: true };
}

export async function deleteLeadAction(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!isUUID(id)) return { ok: false, error: "Ongeldig ID" };

  try {
    const sb = supabaseAdmin();
    const { error } = await sb.from("buyback_leads").delete().eq("id", id);
    if (error) {
      return { ok: false, error: error.message };
    }
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }

  revalidatePath("/admin/leads");
  return { ok: true };
}
