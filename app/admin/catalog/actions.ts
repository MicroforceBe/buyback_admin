//app/admin/catalog/actions.ts
'use server';

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

/* === Mapping om automatisch het merk te bepalen uit de category-tab === */
const BRAND_BY_CATEGORY: Record<string, string> = {
  iPad: 'Apple',
  iPhone: 'Apple',
  Samsung: 'Samsung',
};

/* =========================================================
 *  CATEGORIES + ROWS
 * =======================================================*/

export async function getCategories(): Promise<string[]> {
  const sb = sbClient();
  const { data, error } = await sb
    .from('buyback_catalog')
    .select('category')
    .not('category', 'is', null)
    .order('category', { ascending: true });

  if (error) throw new Error(error.message);
  const cats = Array.from(
    new Set((data || []).map((r: any) => r.category).filter(Boolean)),
  );
  return cats as string[];
}

export async function getCatalogRows(opts?: {
  category?: string | null;
  q?: string | null;
}): Promise<CatalogRow[]> {
  const sb = sbClient();
  const { category, q } = opts || {};
  let query = sb.from('buyback_catalog').select(
    `
      id, brand, category, model, submodel, variant,
      year, capacity_gb, connectivity, cpu, ram_gb, ssd_gb,
      base_price_cents, image_url, active, created_at, updated_at
    `,
  );

  if (category && category !== '__ALL__') {
    query = query.eq('category', category);
  }

  if (q && q.trim()) {
    // Meerdere woorden => AND-match op model
    const terms = q
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    if (terms.length === 1) {
      const like = `%${terms[0]}%`;
      query = query.or(`model.ilike.${like},brand.ilike.${like}`);
    } else {
      for (const term of terms) {
        const like = `%${term}%`;
        query = query.ilike('model', like);
      }
    }
  }

  // 🔽 Sortering:
  // - in een specifieke categorie: eerst variant, dan capaciteit
  // - in "Alle": oude sortering op brand, model, capaciteit
  if (category && category !== '__ALL__') {
    query = query
      .order('variant', { ascending: true, nullsFirst: true })
      .order('capacity_gb', { ascending: true });
  } else {
    query = query
      .order('brand', { ascending: true })
      .order('model', { ascending: true })
      .order('capacity_gb', { ascending: true });
  }

  const { data, error } = await query;

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

export async function saveCatalogRowField(
  id: number,
  key: string,
  value: unknown,
) {
  'use server';
  if (!ALLOWED_UPDATE_FIELDS.has(key)) {
    throw new Error(`Veld '${key}' mag niet geüpdatet worden.`);
  }
  const sb = sbClient();

  const patch: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };
  if (key === 'year' || key === 'capacity_gb' || key === 'base_price_cents') {
    const n = value === null || value === '' ? null : Number(value);
    if (key !== 'base_price_cents' && n === null) {
      patch[key] = null;
    } else {
      if (Number.isNaN(n))
        throw new Error(`Ongeldige numerieke waarde voor '${key}'.`);
      patch[key] = n;
    }
  } else if (key === 'active') {
    patch[key] = Boolean(value);
  } else if (key === 'image_url') {
    patch[key] = (value ?? null) as string | null;
  } else {
    patch[key] = value ?? null;
  }

  const { error } = await sb.from('buyback_catalog').update(patch).eq('id', id);
  if (error) throw new Error(error.message);

  revalidatePath('/admin/catalog');
  return { ok: true };
}

export async function createCatalogRow(payload: Partial<CatalogRow>) {
  'use server';

  // brand is NIET meer verplicht; we leiden het af uit category indien leeg.
  const required = ['model', 'capacity_gb', 'base_price_cents'] as const;
  for (const k of required) {
    if (
      payload[k] === undefined ||
      payload[k] === null ||
      payload[k] === ''
    ) {
      throw new Error(`Veld '${k}' is verplicht.`);
    }
  }

  // Merk afleiden uit category als niet gezet
  let brand = (payload.brand ?? '').toString().trim();
  const category = (payload.category ?? null) as string | null;
  if (!brand && category && BRAND_BY_CATEGORY[category]) {
    brand = BRAND_BY_CATEGORY[category];
  }
  if (!brand) {
    // laatste fallback (kan je aanpassen naar bv. 'Onbekend')
    brand = 'Apple';
  }

  const now = new Date().toISOString();

  const row: Partial<CatalogRow> = {
    brand,
    model: String(payload.model),
    capacity_gb: Number(payload.capacity_gb),
    base_price_cents: Number(payload.base_price_cents),
    category,
    submodel: payload.submodel ?? null,
    variant: payload.variant ?? null,
    year: payload.year ?? null,
    connectivity: payload.connectivity ?? null,
    cpu: payload.cpu ?? null,
    ram_gb: payload.ram_gb ?? null,
    ssd_gb: payload.ssd_gb ?? null,
    image_url: payload.image_url ?? null,
    active: payload.active ?? true,
    created_at: now,
    updated_at: now,
  };

  const sb = sbClient();
  const { data, error } = await sb
    .from('buyback_catalog')
    .insert(row)
    .select('id')
    .single();
  if (error) throw new Error(error.message);

  revalidatePath('/admin/catalog');
  return { ok: true, id: data?.id as number };
}

export async function deleteCatalogRow(id: number) {
  'use server';
  const sb = sbClient();
  const { error } = await sb.from('buyback_catalog').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/admin/catalog');
  return { ok: true };
}

/* =========================================================
 *  IMAGE UPLOAD (Supabase Storage)
 * =======================================================*/

export async function uploadCatalogRowImage(form: FormData) {
  'use server';

  const file = form.get('file') as File | null;
  const rowIdRaw = form.get('rowId');

  if (!file) throw new Error('Geen bestand ontvangen.');
  if (!rowIdRaw) throw new Error('rowId ontbreekt.');

  const rowId = Number(rowIdRaw);
  if (!Number.isFinite(rowId)) throw new Error('Ongeldige rowId.');

  const bucket =
    process.env.NEXT_PUBLIC_SUPABASE_CATALOG_BUCKET || 'buyback-catalog';
  const sb = sbClient();

  const mime = file.type || 'application/octet-stream';
  const ext = (mime.split('/')[1] || 'bin').toLowerCase();
  const path = `models/${rowId}/main.${ext}`;

  const { error: upErr } = await sb.storage.from(bucket).upload(path, file, {
    contentType: mime,
    upsert: true,
  });

  if (upErr) {
    const anyErr = upErr as any;
    throw new Error(
      `Upload mislukt: ${
        anyErr?.message || 'unknown'
      } (bucket=${bucket}, path=${path})`,
    );
  }

  const { data: pub } = sb.storage.from(bucket).getPublicUrl(path);
  const publicUrl = pub?.publicUrl || null;

  const { error: updErr } = await sb
    .from('buyback_catalog')
    .update({ image_url: publicUrl, updated_at: new Date().toISOString() })
    .eq('id', rowId);

  if (updErr) {
    throw new Error(`Upload OK, maar DB-update faalde: ${updErr.message}`);
  }

  revalidatePath('/admin/catalog');
  return { ok: true, url: publicUrl, path };
}
