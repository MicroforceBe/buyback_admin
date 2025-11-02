"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin as supabaseAdminExport } from "@/lib/supabaseAdmin";
import { randomUUID } from "crypto";

// In sommige projecten exporteert lib/supabaseAdmin een klaar client object,
// in andere een factory-functie. Deze helper vangt beide af.
function sb() {
  const anySb: any = supabaseAdminExport as any;
  return typeof anySb === "function" ? anySb() : anySb;
}

// ====== Types die rechtstreeks matchen met je buyback_catalog ======
export type CatalogRow = {
  id: number;
  brand: string;
  category: string | null;
  model: string;
  submodel: string | null;
  variant: string | null;
  year: number | null;
  capacity_gb: number;
  connectivity: string | null;
  cpu: string | null;
  ram_gb: number | null;
  ssd_gb: number | null;
  base_price_cents: number;
  image_url: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

const TABLE = "buyback_catalog";
const BUCKET_NAME = "buyback-catalog"; // <— maak deze bucket in Supabase Storage indien nog niet bestaat

function ensureNumber(n: any, def = 0) {
  const x = Number(n);
  return Number.isFinite(x) ? x : def;
}
function nowIso() {
  return new Date().toISOString();
}

export async function listCategories() {
  // Typing toevoegen zodat r niet 'any' is
  const { data, error } = await sb()
    .from(TABLE)
    .select("category")
    .order("category", { ascending: true }) as unknown as {
      data: { category: string | null }[] | null;
      error: { message: string } | null;
    };

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as { category: string | null }[];
  const cats = Array.from(
    new Set(rows.map((r) => r.category).filter(Boolean))
  ) as string[];

  return cats;
}

export async function listModelsByCategory(category: string | null) {
  const q = sb()
    .from(TABLE)
    .select("*")
    .order("brand", { ascending: true })
    .order("model", { ascending: true })
    .order("capacity_gb", { ascending: true });

  if (category && category !== "__ALL__") q.eq("category", category);

  const { data, error } = await q.returns<CatalogRow[]>();
  if (error) throw new Error(error.message);
  return data || [];
}

export async function toggleActive(id: number, next: boolean) {
  const { error } = await sb()
    .from(TABLE)
    .update({ active: !!next, updated_at: nowIso() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/catalog");
}

export async function updatePriceCents(id: number, priceCents: number) {
  const val = Math.max(0, Math.round(ensureNumber(priceCents)));
  const { error } = await sb()
    .from(TABLE)
    .update({ base_price_cents: val, updated_at: nowIso() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/catalog");
}

export async function deleteRow(id: number) {
  const { error } = await sb().from(TABLE).delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/catalog");
}

export async function createRow(payload: Partial<CatalogRow>) {
  // minimale vereisten
  if (!payload.brand || !payload.model || typeof payload.capacity_gb !== "number") {
    throw new Error("brand, model en capacity_gb zijn verplicht.");
    }

  const row = {
    brand: String(payload.brand).trim(),
    category: payload.category ?? null,
    model: String(payload.model).trim(),
    submodel: payload.submodel ?? null,
    variant: payload.variant ?? null,
    year: payload.year ?? null,
    capacity_gb: ensureNumber(payload.capacity_gb),
    connectivity: payload.connectivity ?? null,
    cpu: payload.cpu ?? null,
    ram_gb: payload.ram_gb ?? null,
    ssd_gb: payload.ssd_gb ?? null,
    base_price_cents: Math.max(0, ensureNumber(payload.base_price_cents, 0)),
    image_url: payload.image_url ?? null,
    active: payload.active ?? true,
    created_at: nowIso(),
    updated_at: nowIso(),
  };

  const { error } = await sb().from(TABLE).insert(row);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/catalog");
}

// ====== Image upload (één foto voor heel het model) ======
// We updaten image_url voor ALLE rijen met (brand, model).
export async function uploadModelImageAction(
  brand: string,
  model: string,
  file: File
) {
  if (!file || !file.size) throw new Error("Geen bestand ontvangen.");
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const safeBrand = brand.trim().replace(/[^\w\-]+/g, "_");
  const safeModel = model.trim().replace(/[^\w\-]+/g, "_");
  const key = `${safeBrand}/${safeModel}/${randomUUID()}.${ext}`;

  const supa = sb();
  // @ts-ignore – supabase-js storage API is beschikbaar op de admin client
  const { error: upErr } = await supa.storage
    .from(BUCKET_NAME)
    .upload(key, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || "image/jpeg",
    });

  if (upErr) throw new Error(upErr.message);

  // @ts-ignore
  const { data: pub } = supa.storage.from(BUCKET_NAME).getPublicUrl(key);
  const publicUrl = pub?.publicUrl || null;

  const { error: updErr } = await supa
    .from(TABLE)
    .update({ image_url: publicUrl, updated_at: nowIso() })
    .eq("brand", brand)
    .eq("model", model);

  if (updErr) throw new Error(updErr.message);
  revalidatePath("/admin/catalog");
  return { url: publicUrl };
}

export async function setModelActiveForAll(brand: string, model: string, next: boolean) {
  const { error } = await sb()
    .from(TABLE)
    .update({ active: !!next, updated_at: nowIso() })
    .eq("brand", brand)
    .eq("model", model);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/catalog");
}
