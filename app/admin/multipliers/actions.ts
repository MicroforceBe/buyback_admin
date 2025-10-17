'use server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// Schema: multiplier-regel
const MultRow = z.object({
  model: z.string().min(1),
  question_key: z.enum(['functional', 'screen', 'housing', 'battery', 'eu', 'icloud']),
  option_key: z.string().min(1),
  label: z.string().optional().nullable(),
  tip: z.string().optional().nullable(),
  multiplier_value: z.number(), // bv 0.85, 1, 1.1
  priority: z.number().int().optional(),
  active: z.boolean().optional()
});

// Upsert (unique: model,question_key,option_key)
export async function upsertMultiplier(input: z.input<typeof MultRow>) {
  const row = MultRow.parse(input);
  if (row.active === undefined) row.active = true;
  if (row.priority === undefined) row.priority = 100;

  const { error } = await supabaseAdmin
    .from('buyback_multipliers_norm')
    .upsert([row], { onConflict: 'model,question_key,option_key' });

  if (error) throw new Error(error.message);
  return { ok: true };
}

// Delete
export async function deleteMultiplier(key: {
  model: string;
  question_key: string;
  option_key: string;
}) {
  const { error } = await supabaseAdmin
    .from('buyback_multipliers_norm')
    .delete()
    .match(key);

  if (error) throw new Error(error.message);
  return { ok: true };
}
