"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin as supabaseAdminExport } from "@/lib/supabaseAdmin";

// helper: sommige projecten exporteren een client of factory
function sb() {
  const any = supabaseAdminExport as any;
  return typeof any === "function" ? any() : any;
}

/* ========== CATEGORIES ========== */

export async function createCategoryAction(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  if (!name) return { ok: false, error: "Naam is verplicht" };

  const s = sb();
  // kies volgende position
  const { data: maxPos } = await s
    .from("buyback_categories")
    .select("position")
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const position = (maxPos?.position ?? 0) + 10;

  const { error } = await s
    .from("buyback_categories")
    .insert({ name, position });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/catalog");
  return { ok: true };
}

/* ========== MODELLEN ========== */

export async function updateModelFieldAction(formData: FormData) {
  const id = String(formData.get("id") || "").trim();
  if (!id) return { ok: false, error: "id ontbreekt" };

  const patch: Record<string, any> = {};
  for (const k of ["brand", "model", "category_id"]) {
    if (formData.has(k)) {
      const v = String(formData.get(k) ?? "").trim();
      patch[k] = v === "" ? null : v;
    }
  }
  if (formData.has("active")) {
    const v = String(formData.get("active"));
    patch.active = v === "true" || v === "1" || v === "on";
  }

  if (Object.keys(patch).length === 0) return { ok: false, error: "Niets te wijzigen" };

  const s = sb();
  const { error } = await s.from("buyback_models").update(patch).eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/catalog");
  return { ok: true };
}

export async function uploadModelImageAction(formData: FormData) {
  const id = String(formData.get("id") || "").trim();
  const file = formData.get("file") as File | null;
  if (!id || !file) return { ok: false, error: "id of bestand ontbreekt" };

  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const key = `models/${id}.${ext}?v=${Date.now()}`; // cache-bust

  const s = sb();

  // upload naar storage bucket "catalog"
  const { error: upErr } = await s.storage.from("catalog").upload(key.split("?")[0], file, {
    upsert: true,
    contentType: file.type || "image/jpeg",
  });
  if (upErr) return { ok: false, error: upErr.message };

  // publieke URL ophalen
  const { data: pub } = s.storage.from("catalog").getPublicUrl(key.split("?")[0]);
  const publicUrl = pub?.publicUrl ? `${pub.publicUrl}?t=${Date.now()}` : null;

  if (!publicUrl) return { ok: false, error: "Kon public URL niet bepalen" };

  const { error: updErr } = await s
    .from("buyback_models")
    .update({ image_url: publicUrl })
    .eq("id", id);

  if (updErr) return { ok: false, error: updErr.message };

  revalidatePath("/admin/catalog");
  return { ok: true, image_url: publicUrl };
}

/* ========== CAPACITEIT/VARIANT ========== */

export async function toggleCapacityActiveAction(formData: FormData) {
  const id = String(formData.get("id") || "").trim();
  if (!id) return { ok: false, error: "capacity id ontbreekt" };

  const activeRaw = String(formData.get("active") || "");
  const active = activeRaw === "true" || activeRaw === "1" || activeRaw === "on";

  const s = sb();
  const { error } = await s.from("buyback_capacities").update({ active }).eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/catalog");
  return { ok: true };
}
