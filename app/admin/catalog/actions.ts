'use server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin as supabaseAdminExport } from '@/lib/supabaseAdmin';

// Sommige projecten exporteren een client, andere een factory.
function sbClient() {
  const anySb: any = supabaseAdminExport as any;
  return typeof anySb === 'function' ? anySb() : anySb;
}

/* ==== Types die we in de UI nodig hebben ==== */
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

/* =========================================================
 *  CATEGORIES + ROWS
 * =======================================================*/

export async function getCategories(): Promise<string[]> {
  const sb = sbClient();
  // DISTINCT categorieën (nulls wegfilteren)
  const { data, error } = await sb
    .from('buyback_catalog')
    .select('category')
    .not('category', 'is', null)
    .order('category', { ascending: true });

  if (error) throw new Error(error.message);
  const cats = Array.from(new Set((data || []).map((r: any) => r.category).filter(Boolean)));
  return cats as string[];
}

export async function getCatalogRows(opts?: { category?: string | null; q?: string | null }): Promise<CatalogRow[]> {
  const sb = sbClient();
  const { category, q } = opts || {};
  let query = sb.from('buyback_catalog').select(
    `
      id, brand, category, model, submodel, variant,
      year, capacity_gb, connectivity, cpu, ram_gb, ssd_gb,
      base_price_cents, image_url, active, created_at, updated_at
    `
  );

  if (category && category !== '__ALL__') {
    query = query.eq('category', category);
  }

  if (q && q.trim()) {
    // tekstfilter op model + brand
    const like = `%${q.trim()}%`;
    query = query.or(`model.ilike.${like},brand.ilike.${like}`);
  }

  const { data, error } = await query.order('brand', { ascending: true }).order('model', { ascending: true }).order('capacity_gb', { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []) as CatalogRow[];
}

/* =========================================================
 *  CRUD ACTIES
 * =======================================================*/

const ALLOWED_UPDATE_FIELDS = new Set([
  'brand',
  'category',
  'model',
  'submodel',
  'variant',
  'year',
  'capacity_gb',
  'base_price_cents',
  'image_url',
  'active',
]);

export async function saveCatalogRowField(id: number, key: string, value: unknown) {
  if (!ALLOWED_UPDATE_FIELDS.has(key)) {
    throw new Error(`Veld '${key}' mag niet geüpdatet worden.`);
  }
  const sb = sbClient();

  // Normalisaties
  const patch: Record<string, any> = {};
  if (key === 'year' || key === 'capacity_gb' || key === 'base_price_cents') {
    const n = value === null || value === '' ? null : Number(value);
    if (key !== 'base_price_cents' && n === null) {
      patch[key] = null;
    } else {
      if (Number.isNaN(n)) throw new Error(`Ongeldige numerieke waarde voor '${key}'.`);
      patch[key] = n;
    }
  } else if (key === 'active') {
    patch[key] = Boolean(value);
  } else if (key === 'image_url') {
    patch[key] = (value ?? null) as string | null;
  } else {
    patch[key] = (value ?? null) as any;
  }

  const { error } = await sb.from('buyback_catalog').update(patch).eq('id', id);
  if (error) throw new Error(error.message);

  revalidatePath('/admin/catalog');
  return { ok: true };
}

export async function createCatalogRow(payload: Partial<CatalogRow>) {
  const required = ['brand', 'model', 'capacity_gb', 'base_price_cents'] as const;
  for (const k of required) {
    if (payload[k] === undefined || payload[k] === null || payload[k] === '') {
      throw new Error(`Veld '${k}' is verplicht.`);
    }
  }

  const row: Partial<CatalogRow> = {
    brand: String(payload.brand),
    model: String(payload.model),
    capacity_gb: Number(payload.capacity_gb),
    base_price_cents: Number(payload.base_price_cents),
    category: payload.category ?? null,
    submodel: payload.submodel ?? null,
    variant: payload.variant ?? null,
    year: payload.year ?? null,
    image_url: payload.image_url ?? null,
    active: payload.active ?? true,
  };

  const sb = sbClient();
  const { data, error } = await sb.from('buyback_catalog').insert(row).select('id').single();
  if (error) throw new Error(error.message);

  revalidatePath('/admin/catalog');
  return { ok: true, id: data?.id as number };
}

export async function deleteCatalogRow(id: number) {
  const sb = sbClient();
  const { error } = await sb.from('buyback_catalog').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/admin/catalog');
  return { ok: true };
}

/* =========================================================
 *  IMAGE UPLOAD (naar Supabase Storage)
 *  Verwacht een FormData met:
 *   - 'file' (File)
 *   - 'rowId' (string/number)  => om pad netjes te maken
 * =======================================================*/

export async function uploadCatalogRowImage(form: FormData) {
  const file = form.get('file') as File | null;
  const rowIdRaw = form.get('rowId');

  if (!file) throw new Error('Geen bestand ontvangen.');
  if (!rowIdRaw) throw new Error('rowId ontbreekt.');

  const rowId = Number(rowIdRaw);
  if (!Number.isFinite(rowId)) throw new Error('Ongeldige rowId.');

  const bucket = process.env.NEXT_PUBLIC_SUPABASE_CATALOG_BUCKET || 'buyback-catalog';
  const sb = sbClient();

  // Lees bestand in Node buffer (=> runtime nodejs bovenaan is cruciaal)
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Bepaal extensie op basis van mimetype (simpel)
  const mime = file.type || 'application/octet-stream';
  const ext = mime.split('/')[1] || 'bin';

  // Netjes pad: per row een vaste bestandsnaam
  const path = `models/${rowId}/main.${ext}`;

  // Upload (upsert=true zodat vervangen ook kan)
  const { error: upErr } = await sb.storage
    .from(bucket)
    .upload(path, buffer, {
      contentType: mime,
      upsert: true,
    });

  if (upErr) {
    // Stuur maximale context terug naar de UI zodat je het ziet in de toast
    const anyErr = upErr as any;
    throw new Error(
      `Upload mislukt: ${anyErr?.message || 'unknown'} (bucket=${bucket}, path=${path})`
    );
  }

  // Publieke URL ophalen
  const { data: pub } = sb.storage.from(bucket).getPublicUrl(path);
  const publicUrl = pub?.publicUrl || null;

  // URL ook in de DB zetten
  const { error: updErr } = await sb
    .from('buyback_catalog')
    .update({ image_url: publicUrl })
    .eq('id', rowId);

  if (updErr) {
    throw new Error(`Upload OK, maar DB-update faalde: ${updErr.message}`);
  }

  revalidatePath('/admin/catalog');
  return { ok: true, url: publicUrl, path };
}
