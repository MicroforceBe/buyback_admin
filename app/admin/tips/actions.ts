'use server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const TipRow = z.object({
  model: z.string().min(1),
  tip_key: z.enum([
    'ship_opzenden',
    'ship_binnenbrengen',
    'store_gentbrugge',
    'store_antwerpen',
    'store_oudenaarde',
    'pay_bank',
    'pay_voucher'
  ]),
  tip: z.string().min(1)
});

// Upsert (unique: model, tip_key)
export async function upsertTip(input: z.input<typeof TipRow>) {
  const row = TipRow.parse(input);
  const { error } = await supabaseAdmin
    .from('buyback_ui_tips')
    .upsert([row], { onConflict: 'model,tip_key' });
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function deleteTip(key: { model: string; tip_key: string }) {
  const { error } = await supabaseAdmin
    .from('buyback_ui_tips')
    .delete()
    .match(key);
  if (error) throw new Error(error.message);
  return { ok: true };
}
