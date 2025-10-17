'use server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// Schema-validatie (active is optioneel; default zetten we na parse)
const CatalogRow = z.object({
  brand: z.string().min(1),
  model: z.string().min(1),
  variant: z.string().nullable().optional(),
  capacity_gb: z.number().int().positive(),
  base_price_cents: z.number().int().min(0),
  active: z.boolean().optional()
});

export async function upsertCatalogRow(input: z.input<typeof CatalogRow>) {
  const row = CatalogRow.parse(input);
  // Defaults/normalisatie
  if (row.active === undefined) row.active = true;
  if (row.variant === undefined) row.variant = null;

  const { error } = await supabaseAdmin
    .from('buyback_catalog')
    .upsert([row], { onConflict: 'brand,model,variant,capacity_gb' });

  if (error) throw new Error(error.message);
  return { ok: true };
}

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
