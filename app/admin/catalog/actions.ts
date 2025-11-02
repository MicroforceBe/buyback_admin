// app/admin/catalog/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin as supabaseAdminExport } from "@/lib/supabaseAdmin";

function sb() {
  const anySb: any = supabaseAdminExport as any;
  return typeof anySb === "function" ? anySb() : anySb;
}

/** ===== Types ===== */
export type Category = {
  id: string;
  name: string;
  created_at?: string | null;
};

export type ModelRow = {
  id: string;
  category_id: string;
  brand: string | null;
  model: string;
  base_price_cents: number | null;
  active: boolean | null;
  image_url: string | null;
  image_path: string | null; // opslagpad in bucket (voor delete/replace)
  updated_at?: string | null;
};

/** ===== Loads ===== */
export async function loadCategories(): Promise<Category[]> {
  const { data, error } = await sb()
    .from("buyback_categories")
    .select("id,name,created_at")
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function loadModelsByCategory(categoryId: string): Promise<ModelRow[]> {
  if (!categoryId) return [];
  const { data, error } = await sb()
    .from("buyback_models")
    .select("id,category_id,brand,model,base_price_cents,active,image_url,image_path,updated_at")
    .eq("category_id", categoryId)
    .order("brand", { ascending: true })
    .order("model", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** ===== Category CRUD ===== */
export async function createCategoryAction(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  if (!name) throw new Error("Naam is verplicht");
  const { error } = await sb().from("buyback_categories").insert({ name });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/catalog");
}

/** ===== Model CRUD/updates ===== */
export async function createModelAction(formData: FormData) {
  const category_id = String(formData.get("category_id") || "").trim();
  const brand = String(formData.get("brand") || "").trim() || null;
  const model = String(formData.get("model") || "").trim();
  const base_price_eur = String(formData.get("base_price_eur") || "").trim();

  if (!category_id || !model) throw new Error("Categorie en model zijn verplicht");

  let base_price_cents: number | null = null;
  if (base_price_eur) {
    const eur = Number(base_price_eur.replace(",", "."));
    if (!Number.isFinite(eur) || eur < 0) throw new Error("Ongeldige prijs");
    base_price_cents = Math.round(eur * 100);
  }

  const { error } = await sb().from("buyback_models").insert({
    category_id,
    brand,
    model,
    base_price_cents,
    active: true,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/catalog");
}

export async function updateModelFieldAction(formData: FormData) {
  const id = String(formData.get("id") || "");
  const field = String(formData.get("field") || "");
  let value: any = formData.get("value");

  if (!id || !field) throw new Error("Missing id/field");

  // Veldspecifieke casting
  if (field === "base_price_cents") {
    const eur = Number(String(value || "").replace(",", "."));
    if (!Number.isFinite(eur) || eur < 0) throw new Error("Ongeldige prijs");
    value = Math.round(eur * 100);
  } else if (field === "active") {
    value = String(value) === "true";
  } else if (typeof value === "string") {
    value = value.trim();
  }

  const patch: Record<string, any> = {};
  patch[field] = value;

  const { error } = await sb().from("buyback_models").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/catalog");
}

export async function toggleModelActiveAction(formData: FormData) {
  const id = String(formData.get("id") || "");
  const next = String(formData.get("next") || "") === "true";
  if (!id) throw new Error("Missing id");
  const { error } = await sb().from("buyback_models").update({ active: next }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/catalog");
}

export async function deleteModelAction(formData: FormData) {
  const id = String(formData.get("id") || "");
  const image_path = String(formData.get("image_path") || "");
  if (!id) throw new Error("Missing id");

  // verwijder eerst image uit storage (indien aanwezig)
  if (image_path) {
    await sb().storage.from("buyback-model-images").remove([image_path]).catch(() => {});
  }

  const { error } = await sb().from("buyback_models").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/catalog");
}

/** ===== Upload/update image ===== */
export async function uploadModelImageAction(formData: FormData) {
  const id = String(formData.get("id") || "");
  const file = formData.get("file") as File | null;
  if (!id || !file) throw new Error("Missing id/file");

  const bucket = "buyback-model-images";
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${id}/${Date.now()}.${ext}`;

  // Upload
  const { error: upErr } = await sb().storage.from(bucket).upload(path, file, {
    upsert: true,
    cacheControl: "3600",
    contentType: file.type || "image/jpeg",
  });
  if (upErr) throw new Error(upErr.message);

  // Publieke URL
  const { data: pub } = sb().storage.from(bucket).getPublicUrl(path);
  const image_url = pub?.publicUrl || null;

  // Oude image_path eventueel opruimen
  const { data: row } = await sb()
    .from("buyback_models")
    .select("image_path")
    .eq("id", id)
    .single()
    .catch(() => ({ data: null as any }));

  const old = row?.image_path as string | null;
  if (old && old !== path) {
    await sb().storage.from(bucket).remove([old]).catch(() => {});
  }

  // Opslaan in DB
  const { error: updErr } = await sb()
    .from("buyback_models")
    .update({ image_url, image_path: path })
    .eq("id", id);
  if (updErr) throw new Error(updErr.message);

  revalidatePath("/admin/catalog");
}
