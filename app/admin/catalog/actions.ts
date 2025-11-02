// app/admin/catalog/actions.ts
"use server";

import { supabaseAdmin as supabaseAdminExport } from "@/lib/supabaseAdmin";

// In sommige projecten exporteert lib/supabaseAdmin een kant-en-klare client,
// in andere een factory-functie. Deze helper vangt beide gevallen af.
function sbClient() {
  const anySb: any = supabaseAdminExport as any;
  return typeof anySb === "function" ? anySb() : anySb;
}

/** Huidige kolommen van buyback_catalog (op basis van jouw introspectie) */
export type CatalogRow = {
  id: number; // bigint
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
  created_at: string; // timestamptz
  updated_at: string; // timestamptz
};

/** 1) Alle categorie-namen (distinct) */
export async function getCategories(): Promise<string[]> {
  const sb = sbClient();
  // We halen alles op en distillen categorieën (werkt op elk plan zonder RPC)
  const { data, error } = await sb
    .from("buyback_catalog")
    .select("category")
    .order("category", { ascending: true });

  if (error) throw new Error(error.message);

  const cats = Array.from(
    new Set(((data || []) as { category: string | null }[])
      .map((r) => r.category)
      .filter(Boolean))
  ) as string[];

  return cats;
}

/** 2) Rijen opvragen, optioneel gefilterd op categorie */
export async function getCatalogRows(category?: string | null): Promise<CatalogRow[]> {
  const sb = sbClient();
  let q = sb.from("buyback_catalog").select("*").order("brand", { ascending: true }).order("model", { ascending: true }).order("capacity_gb", { ascending: true });

  if (category && category !== "__ALL__") {
    q = q.eq("category", category);
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data || []) as CatalogRow[];
}

/** 3) Eén veld opslaan (inline edit) */
export async function saveCatalogRowField(
  rowId: number,
  key: string,
  value: unknown
): Promise<void> {
  const sb = sbClient();

  // Veiligstellen van toegestane kolommen
  const allowed: (keyof CatalogRow)[] = [
    "brand",
    "category",
    "model",
    "submodel",
    "variant",
    "year",
    "capacity_gb",
    "connectivity",
    "cpu",
    "ram_gb",
    "ssd_gb",
    "base_price_cents",
    "image_url",
    "active",
  ];

  if (!allowed.includes(key as keyof CatalogRow)) {
    throw new Error(`Kolom '${key}' kan niet gewijzigd worden.`);
  }

  const patch: Record<string, unknown> = { [key]: value, updated_at: new Date().toISOString() };

  const { error } = await sb
    .from("buyback_catalog")
    .update(patch)
    .eq("id", rowId);

  if (error) throw new Error(error.message);
}

/** 4) Afbeelding uploaden + image_url zetten */
const BUCKET = "buyback-catalog"; // <-- PAS AAN NAAR JOUW BUCKETNAAM (public read)

export async function uploadCatalogRowImage(
  rowId: number,
  file: File
): Promise<string> {
  const sb = sbClient();

  // Bestandsnaam: bbcat/{id}/{timestamp}-{slug}
  const ts = Date.now();
  const safeName = (file.name || "image").replace(/[^\w.\-]+/g, "_");
  const path = `bbcat/${rowId}/${ts}-${safeName}`;

  // Upload naar Supabase Storage
  const { data: up, error: upErr } = await sb.storage
    .from(BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      upsert: true,
      contentType: file.type || "application/octet-stream",
    });

  if (upErr) throw new Error(upErr.message);

  // Publieke URL ophalen
  const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(up.path);
  const publicUrl = pub?.publicUrl;
  if (!publicUrl) throw new Error("Kon public URL niet bepalen na upload.");

  // Wegschrijven in tabel
  await saveCatalogRowField(rowId, "image_url", publicUrl);

  return publicUrl;
}

/** 5) Rij verwijderen */
export async function deleteCatalogRow(rowId: number): Promise<void> {
  const sb = sbClient();
  const { error } = await sb.from("buyback_catalog").delete().eq("id", rowId);
  if (error) throw new Error(error.message);
}

/** 6) Rij aanmaken (minimaal brand, model, capacity_gb, base_price_cents) */
export async function createCatalogRow(init: {
  brand: string;
  category: string | null;
  model: string;
  variant: string | null;
  capacity_gb: number;
  base_price_cents: number;
  active?: boolean;
  image_url?: string | null;
  submodel?: string | null;
  year?: number | null;
  connectivity?: string | null;
  cpu?: string | null;
  ram_gb?: number | null;
  ssd_gb?: number | null;
}): Promise<CatalogRow> {
  const sb = sbClient();

  const toInsert = {
    brand: init.brand,
    category: init.category,
    model: init.model,
    submodel: init.submodel ?? null,
    variant: init.variant ?? null,
    year: init.year ?? null,
    capacity_gb: init.capacity_gb,
    connectivity: init.connectivity ?? null,
    cpu: init.cpu ?? null,
    ram_gb: init.ram_gb ?? null,
    ssd_gb: init.ssd_gb ?? null,
    base_price_cents: init.base_price_cents,
    image_url: init.image_url ?? null,
    active: init.active ?? true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await sb
    .from("buyback_catalog")
    .insert(toInsert)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as CatalogRow;
}
