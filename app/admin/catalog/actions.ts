"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin as supabaseAdminExport } from "@/lib/supabaseAdmin";

function sb() {
  const anySb: any = supabaseAdminExport as any;
  return typeof anySb === "function" ? anySb() : anySb;
}

const BUCKET = "buyback-models";

/* ===== CATEGORIES ===== */
export async function listCategories() {
  const s = sb();
  const { data, error } = await s
    .from("buyback_categories")
    .select("id, name, sort_order")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function createCategory(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  if (!name) throw new Error("Naam is verplicht");
  const s = sb();

  const { data: maxSort } = await s
    .from("buyback_categories")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextSort = (maxSort?.sort_order ?? 0) + 10;

  const { error } = await s
    .from("buyback_categories")
    .insert({ name, sort_order: nextSort });

  if (error) throw new Error(error.message);
  revalidatePath("/admin/catalog");
}

/* ===== MODELLEN (lijst voor 1 categorie) ===== */
export async function listModelsByCategory(categoryId: string) {
  const s = sb();

  const { data: models, error } = await s
    .from("buyback_models")
    .select("id, category_id, brand, model, image_url")
    .eq("category_id", categoryId)
    .order("brand", { ascending: true })
    .order("model", { ascending: true });

  if (error) throw new Error(error.message);

  const ids = (models || []).map((m) => m.id);
  let capacities: any[] = [];
  if (ids.length) {
    const { data: caps, error: capErr } = await s
      .from("buyback_capacities")
      .select("id, model_id, variant, capacity_gb, price_cents, active")
      .in("model_id", ids)
      .order("variant", { ascending: true })
      .order("capacity_gb", { ascending: true });
    if (capErr) throw new Error(capErr.message);
    capacities = caps || [];
  }

  const byModel: Record<string, any[]> = {};
  for (const c of capacities) {
    (byModel[c.model_id] ||= []).push(c);
  }

  return (models || []).map((m) => ({
    ...m,
    capacities: byModel[m.id] || [],
  }));
}

/* ===== MODEL MUTATIES ===== */
export async function addModel(categoryId: string) {
  const s = sb();
  const { data, error } = await s
    .from("buyback_models")
    .insert({
      category_id: categoryId,
      brand: "",
      model: "Nieuw model",
      image_url: null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  revalidatePath("/admin/catalog");
  return data?.id as string;
}

export async function updateModelField(
  modelId: string,
  field: "brand" | "model" | "image_url",
  value: string | null
) {
  const s = sb();
  const patch: any = {};
  patch[field] = (value ?? "").toString().trim() || null;
  const { error } = await s.from("buyback_models").update(patch).eq("id", modelId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/catalog");
}

export async function deleteModel(modelId: string) {
  const s = sb();
  // verwijder eerst capacities (indien geen cascade)
  await s.from("buyback_capacities").delete().eq("model_id", modelId);
  const { error } = await s.from("buyback_models").delete().eq("id", modelId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/catalog");
}

/* ===== CAPACITY / VARIANT MUTATIES ===== */
export async function addVariant(modelId: string) {
  const s = sb();
  const { error } = await s.from("buyback_capacities").insert({
    model_id: modelId,
    variant: "",
    capacity_gb: 64,
    price_cents: 0,
    active: true,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/catalog");
}

export async function updateCapacityField(
  capacityId: string,
  field: "variant" | "capacity_gb" | "price_cents",
  value: string | number
) {
  const s = sb();
  const patch: any = {};
  if (field === "capacity_gb" || field === "price_cents") {
    const num = Number(value);
    if (!Number.isFinite(num)) throw new Error("Ongeldige numerieke waarde");
    patch[field] = num;
  } else {
    patch[field] = String(value ?? "").trim();
  }
  const { error } = await s.from("buyback_capacities").update(patch).eq("id", capacityId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/catalog");
}

export async function toggleCapacityActive(capacityId: string, next: boolean) {
  const s = sb();
  const { error } = await s
    .from("buyback_capacities")
    .update({ active: !!next })
    .eq("id", capacityId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/catalog");
}

export async function deleteCapacity(capacityId: string) {
  const s = sb();
  const { error } = await s.from("buyback_capacities").delete().eq("id", capacityId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/catalog");
}

/* ====== IMAGE UPLOAD ====== */
function sanitizeName(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Server Action voor uploaden van 1 model-afbeelding.
 * Verwacht in FormData:
 *  - "model_id": string
 *  - "file": File (image/*)
 */
export async function uploadModelImage(formData: FormData) {
  const s = sb();

  const modelId = String(formData.get("model_id") || "").trim();
  const file = formData.get("file") as File | null;

  if (!modelId) throw new Error("model_id ontbreekt");
  if (!file || typeof (file as any).arrayBuffer !== "function")
    throw new Error("Geen bestand ontvangen");

  // basic content-type check
  const type = (file as any).type || "application/octet-stream";
  if (!/^image\//i.test(type)) throw new Error("Alleen Afbeeldingen toegestaan");

  const fileNameRaw = (file as any).name || "upload";
  const safeName = sanitizeName(fileNameRaw) || "image";
  const path = `models/${modelId}/${Date.now()}-${safeName}`;

  // upload
  const arrayBuf = await file.arrayBuffer();
  const { error: upErr } = await s.storage
    .from(BUCKET)
    .upload(path, arrayBuf, {
      contentType: type,
      upsert: false,
      cacheControl: "3600",
    });
  if (upErr) throw new Error(upErr.message);

  // public URL ophalen
  const { data: pub } = s.storage.from(BUCKET).getPublicUrl(path);
  const publicUrl = pub?.publicUrl;

  // schrijf naar model
  const { error: updErr } = await s
    .from("buyback_models")
    .update({ image_url: publicUrl })
    .eq("id", modelId);

  if (updErr) throw new Error(updErr.message);

  revalidatePath("/admin/catalog");
  return { image_url: publicUrl };
}

/**
 * Verwijdert alleen de referentie op het model (laat file staan),
 * handig als je wil “resetten”. Volledige file delete kan ook,
 * maar dat vergt het exacte storage-pad bewaren. Simpel houden hier.
 */
export async function clearModelImage(modelId: string) {
  const s = sb();
  const { error } = await s
    .from("buyback_models")
    .update({ image_url: null })
    .eq("id", modelId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/catalog");
}
