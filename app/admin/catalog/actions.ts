'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin as supabaseAdminExport } from '@/lib/supabaseAdmin';

function sb() {
  const anySb: any = supabaseAdminExport as any;
  return typeof anySb === 'function' ? anySb() : anySb;
}

export type CatalogRow = {
  id: number;
  brand: string;
  category: string | null;
  model: string;
  variant: string | null;
  capacity_gb: number;
  base_price_cents: number;
  image_url: string | null;
  active: boolean;
  created_at?: string;
  updated_at?: string;
};

const BRAND_BY_CATEGORY: Record<string, string> = {
  iPad: 'Apple',
  iPhone: 'Apple',
  Samsung: 'Samsung',
};

/** Haal alle verschillende categorie-labels op (afgeleid uit buyback_catalog). */
export async function getCategories(): Promise<string[]> {
  const { data, error } = await sb()
    .from('buyback_catalog')
    .select('category')
    .order('category', { ascending: true });

  if (error) throw new Error(error.message);
  const cats = Array.from(new Set((data || []).map((r: any) => r.category).filter(Boolean))) as string[];
  return cats;
}

/** Rijen ophalen. Als opts.category is gezet, server-side filteren. */
export async function getCatalogRows(
  opts?: { category?: string | null; q?: string | null }
): Promise<CatalogRow[]> {
  const s = sb().from('buyback_catalog').select(
    'id,brand,category,model,variant,capacity_gb,base_price_cents,image_url,active,created_at,updated_at'
  ).order('brand', { ascending: true }).order('model', { ascending: true }).order('capacity_gb', { ascending: true });

  if (opts?.category && opts.category !== '__ALL__') {
    s.eq('category', opts.category);
  }
  const { data, error } = await s;
  if (error) throw new Error(error.message);

  let rows = (data || []) as CatalogRow[];

  // optionele free-text filter op server-resultaat
  const q = (opts?.q || '').trim().toLowerCase();
  if (q) {
    rows = rows.filter((r) =>
      [r.brand, r.category || '', r.model, r.variant || ''].some((v) =>
        String(v).toLowerCase().includes(q)
      )
    );
  }

  return rows;
}

/** Eén veld opslaan (inline edit). */
export async function saveCatalogRowField(id: number, field: keyof CatalogRow, value: any) {
  const allowed: (keyof CatalogRow)[] = [
    'brand', 'category', 'model', 'variant', 'capacity_gb', 'base_price_cents', 'image_url', 'active'
  ];
  if (!allowed.includes(field)) throw new Error(`Veld '${String(field)}' is niet bewerkbaar.`);

  const patch: any = { [field]: value, updated_at: new Date().toISOString() };
  const { error } = await sb().from('buyback_catalog').update(patch).eq('id', id);
  if (error) throw new Error(error.message);

  revalidatePath('/admin/catalog');
  return { ok: true };
}

/** Nieuwe rij aanmaken. Brand wordt automatisch ingevuld op basis van category-tab. */
export async function createCatalogRow(base: Partial<CatalogRow>) {
  const category = (base.category ?? null) as string | null;
  let brand = (base.brand || '').trim();

  if (!brand && category && BRAND_BY_CATEGORY[category]) {
    brand = BRAND_BY_CATEGORY[category];
  }
  if (!brand) {
    throw new Error("Veld 'brand' is verplicht.");
  }

  const row: Omit<CatalogRow, 'id'> = {
    brand,
    category: category ?? null,
    model: (base.model || 'Nieuw model').trim() || 'Nieuw model',
    variant: (base.variant || null) as string | null,
    capacity_gb: Number.isFinite(base.capacity_gb) ? Number(base.capacity_gb) : 64,
    base_price_cents: Number.isFinite(base.base_price_cents) ? Number(base.base_price_cents) : 10000,
    image_url: (base.image_url || null) as string | null,
    active: typeof base.active === 'boolean' ? base.active : true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await sb()
    .from('buyback_catalog')
    .insert(row)
    .select('id')
    .single();

  if (error) throw new Error(error.message);

  revalidatePath('/admin/catalog');
  return { ok: true, id: data?.id as number };
}

/** Rij verwijderen. */
export async function deleteCatalogRow(id: number) {
  const { error } = await sb().from('buyback_catalog').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/admin/catalog');
  return { ok: true };
}

/**
 * Afbeelding uploaden via Supabase Storage (bucket: buyback-catalog),
 * daarna image_url in de rij bijwerken.
 */
export async function uploadCatalogRowImage(formData: FormData): Promise<string | null> {
  const file = formData.get('file') as File | null;
  const idStr = formData.get('id') as string | null;
  if (!file || !idStr) throw new Error('Ontbrekende file of id');

  const id = Number(idStr);
  if (!Number.isFinite(id)) throw new Error('Ongeldige id');

  const fileExt = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const objectPath = `models/${id}/${Date.now()}.${fileExt}`;

  // 1) upload
  const sbc = sb();
  const { error: upErr } = await (sbc.storage as any)
    .from('buyback-catalog')
    .upload(objectPath, file, {
      cacheControl: '3600',
      upsert: true,
    });
  if (upErr) throw new Error(upErr.message);

  // 2) publiek URL (of signed URL)
  const { data: pub } = (sbc.storage as any).from('buyback-catalog').getPublicUrl(objectPath);
  const publicUrl: string | null = pub?.publicUrl || null;

  // 3) updaten in DB
  if (publicUrl) {
    const { error: upDbErr } = await sbc
      .from('buyback_catalog')
      .update({ image_url: publicUrl, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (upDbErr) throw new Error(upDbErr.message);
  }

  revalidatePath('/admin/catalog');
  return publicUrl;
}
