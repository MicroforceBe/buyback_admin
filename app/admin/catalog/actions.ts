'use server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// Schema-validatie
const CatalogRow = z.object({
  brand: z.string().min(1),
  model: z.string().min(1),
  variant: z.string().nullable().optional(),
  capacity_gb: z.number().int().positive(),
  base_price_cents: z.number().int().min(0),
  active: z.boolean().optional().default(true)
});

// upsert
export async function upsertCatalogRow(input: z.infer<typeof CatalogRow>) {
  const row = CatalogRow.parse(input);
  const { error } = await supabaseAdmin
    .from('buyback_catalog')
    .upsert([row], { onConflict: 'brand,model,variant,capacity_gb' });
  if (error) throw new Error(error.message);
  return { ok: true };
}

// delete
export async function deleteCatalogRow(key: {
  brand: string;
  model: string;
  variant?: string | null;
  capacity_gb: number;
}) {
  const { error } = await supabaseAdmin
    .from('buyback_catalog')
    .delete()
    .match({
      brand: key.brand,
      model: key.model,
      variant: key.variant ?? null,
      capacity_gb: key.capacity_gb
    });
  if (error) throw new Error(error.message);
  return { ok: true };
}
