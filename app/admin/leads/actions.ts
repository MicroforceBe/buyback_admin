"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const ALLOWED_STATUSES = [
  "new",
  "received_store",
  "label_created",
  "shipment_received",
  "check_passed",
  "check_failed",
  "done",
] as const;

type StatusCode = (typeof ALLOWED_STATUSES)[number];

function assertStatus(s: string): s is StatusCode {
  return (ALLOWED_STATUSES as readonly string[]).includes(s);
}

/** Helper: Slack melding (optioneel) */
async function postSlack(text: string) {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch {
    // stil falen; geen crash bij Slack issues
  }
}

/** Inline update: status &/of price */
export async function updateLeadInlineAction(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!id) redirect(`/admin/leads?msg=missing_id`);

  const statusRaw = String(formData.get("status") ?? "").trim();
  const priceRaw = String(formData.get("final_price_eur") ?? "").trim().replace(",", ".");

  const patch: Record<string, any> = {};

  if (statusRaw) {
    if (!assertStatus(statusRaw)) redirect(`/admin/leads?msg=invalid_status`);
    patch.status = statusRaw;
  }

  if (priceRaw) {
    const eur = Number(priceRaw);
    if (!Number.isFinite(eur) || eur < 0) redirect(`/admin/leads?msg=invalid_price`);
    patch.final_price_cents = Math.round(eur * 100);
  }

  if (Object.keys(patch).length === 0) redirect(`/admin/leads?msg=nothing_to_update`);

  const sb = supabaseAdmin();
  const { data: before, error: selErr } = await sb.from("buyback_leads")
    .select("id, status, final_price_cents, order_code")
    .eq("id", id)
    .single();
  if (selErr || !before) redirect(`/admin/leads?msg=not_found`);

  const { data: after, error: updErr } = await sb
    .from("buyback_leads")
    .update(patch)
    .eq("id", id)
    .select("id, status, final_price_cents, order_code")
    .single();

  if (updErr) redirect(`/admin/leads?msg=update_error_${encodeURIComponent(updErr.message)}`);

  // Slack bij belangrijke statuswijzigingen
  if (patch.status && before.status !== patch.status) {
    await postSlack(`🔔 Lead ${after?.order_code ?? id} status: ${before.status} → ${patch.status}`);
  }

  revalidatePath("/admin/leads");
  redirect(`/admin/leads?msg=updated`);
}

/** Bulk status update (meerdere leads in één keer) */
export async function bulkUpdateStatusAction(formData: FormData) {
  const idsStr = String(formData.get("ids") || ""); // CSV van UUIDs
  const status = String(formData.get("status") || "").trim();

  if (!idsStr) redirect(`/admin/leads?msg=missing_ids`);
  if (!assertStatus(status)) redirect(`/admin/leads?msg=invalid_status`);

  const ids = idsStr.split(",").map(s => s.trim()).filter(Boolean);
  if (ids.length === 0) redirect(`/admin/leads?msg=no_ids`);

  const sb = supabaseAdmin();

  // haal bestaande op voor slack logging
  const { data: befores } = await sb.from("buyback_leads").select("id, order_code, status").in("id", ids);
  const { error: updErr } = await sb.from("buyback_leads").update({ status }).in("id", ids);
  if (updErr) redirect(`/admin/leads?msg=bulk_update_error_${encodeURIComponent(updErr.message)}`);

  // Slack melding
  try {
    const changed = (befores ?? []).filter(x => x.status !== status);
    if (changed.length > 0) {
      await postSlack(`🔁 Bulk status update (${changed.length}): ${changed.map(x => x.order_code ?? x.id).join(", ")} → ${status}`);
    }
  } catch {}

  revalidatePath("/admin/leads");
  redirect(`/admin/leads?msg=bulk_updated`);
}

/** Alleen admin_note bijwerken (optioneel) */
export async function upsertAdminNoteAction(formData: FormData) {
  const id = String(formData.get("id") || "");
  const note = String(formData.get("admin_note") || "");

  if (!id) redirect(`/admin/leads?msg=missing_id`);

  const sb = supabaseAdmin();
  const { error: updErr } = await sb.from("buyback_leads").update({ admin_note: note }).eq("id", id);

  if (updErr) redirect(`/admin/leads?msg=note_error_${encodeURIComponent(updErr.message)}`);

  revalidatePath("/admin/leads");
  redirect(`/admin/leads?msg=note_updated`);
}
