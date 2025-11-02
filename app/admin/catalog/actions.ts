// app/admin/catalog/actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin as supabaseAdminExport } from '@/lib/supabaseAdmin';

function sb() {
  const anySb: any = supabaseAdminExport as any;
  return typeof anySb === 'function' ? anySb() : anySb;
}

/* ====== Types ====== */
export type Category = {
  id: string;
  name: string;
};

export type ModelRow = {
  id: string;
  category_id: string;
  model: string;
  brand: string | null;
  variant: string | null;
  capacity_gb: number | null;
  price_cents: number | null;
  active: boolean;
  image_url: string | null;
};

/* ====== Loaders ====== */
export async function loadCategories(): Promise<Category[]> {
  const s = sb();
  const { data, error } = await s.from('buyback_categories').select('id, name').order('name', { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []) as Category[];
}

export async function loadModelsByCategory(categoryId: string): Promise<ModelRow[]> {
  const s = sb();
  const { data, error } = await s
    .from('buyback_models')
    .select('id, category_id, model, brand, variant, capacity_gb, price_cents, active, image_url')
    .eq('category_id', categoryId)
    .order('model', { ascending: true })
    .order('variant', { ascending: true })
    .order('capacity_gb', { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []) as ModelRow[];
}

/* ====== Mutaties ====== */

// Categorie toevoegen
export async function createCategoryAction(formData: FormData) {
  const name = String(formData.get('name') || '').trim();
  if (!name) throw new Error('Naam is verplicht');
  const s = sb();
  const { error } = await s.from('buyback_categories').insert({ name });
  if (error) throw new Error(error.message);
  revalidatePath('/admin/catalog');
}

// Rij bewaren (model/variant/capacity/price/active)
export async function updateModelRowAction(formData: FormData) {
  const id = String(formData.get('id') || '').trim();
  if (!id) throw new Error('missing id');

  // optionele velden
  const model = (formData.get('model') ?? '').toString().trim() || null;
  const brand = (formData.get('brand') ?? '').toString().trim() || null;
  const variant = (formData.get('variant') ?? '').toString().trim() || null;

  const capRaw = (formData.get('capacity_gb') ?? '').toString().trim();
  const capacity_gb = capRaw === '' ? null : Number(capRaw);

  const priceRaw = (formData.get('price_eur') ?? '').toString().replace(',', '.').trim();
  const price_cents = priceRaw === '' ? null : Math.round(Number(priceRaw) * 100);

  const active = (formData.get('active') ?? 'false').toString() === 'true';

  const patch: Record<string, any> = {
    model,
    brand,
    variant,
    capacity_gb,
    price_cents,
    active
  };

  const s = sb();
  const { error } = await s.from('buyback_models').update(patch).eq('id', id);
  if (error) throw new Error(error.message);

  revalidatePath('/admin/catalog');
}

// Image upload op *modelniveau*: update alle rijen met zelfde category_id + model
export async function uploadModelImageAction(formData: FormData) {
  const rowId = String(formData.get('row_id') || '').trim();
  const file = formData.get('file') as File | null;
  if (!rowId) throw new Error('missing row_id');
  if (!file || file.size === 0) throw new Error('Ontbrekend bestand');

  const s = sb();

  // 1) Haal de rij op om category_id + model te kennen
  const { data: row, error: rowErr } = await s
    .from('buyback_models')
    .select('id, category_id, model')
    .eq('id', rowId)
    .maybeSingle();

  if (rowErr) throw new Error(rowErr.message);
  if (!row) throw new Error('Model-rij niet gevonden');

  // 2) Upload naar storage
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const objectKey = `models/${row.category_id}/${encodeURIComponent(row.model)}-${Date.now()}.${ext}`;

  const { error: upErr } = await s.storage.from('buyback-models').upload(objectKey, file, {
    cacheControl: '3600',
    upsert: true,
    contentType: file.type || 'image/*',
  });
  if (upErr) throw new Error(upErr.message);

  const { data: publicUrlRes } = s.storage.from('buyback-models').getPublicUrl(objectKey);
  const publicUrl = publicUrlRes?.publicUrl || null;
  if (!publicUrl) throw new Error('Kon public URL niet bepalen');

  // 3) Update ALLE rijen met dezelfde category + model
  const { error: updErr } = await s
    .from('buyback_models')
    .update({ image_url: publicUrl })
    .eq('category_id', row.category_id)
    .eq('model', row.model);

  if (updErr) throw new Error(updErr.message);

  revalidatePath('/admin/catalog');
}
