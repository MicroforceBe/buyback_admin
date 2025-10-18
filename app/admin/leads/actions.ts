'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function updateStatusAction(formData: FormData) {
  const id = String(formData.get('id') || '');
  const status = String(formData.get('status') || '');
  if (!id || !['new','in_progress','done'].includes(status)) {
    throw new Error('Ongeldige invoer');
  }
  const { error } = await supabaseAdmin
    .from('buyback_leads')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/admin/leads');
}

export async function saveNoteAction(formData: FormData) {
  const id = String(formData.get('id') || '');
  const admin_note = String(formData.get('admin_note') || '');
  if (!id) throw new Error('Ongeldige invoer');
  const { error } = await supabaseAdmin
    .from('buyback_leads')
    .update({ admin_note, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/admin/leads');
}

export async function deleteLeadAction(formData: FormData) {
  const id = String(formData.get('id') || '');
  if (!id) throw new Error('Ongeldige invoer');
  const { error } = await supabaseAdmin
    .from('buyback_leads')
    .delete()
    .eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/admin/leads');
}

/** Inline update: status + final_price_cents in één keer */
export async function updateLeadInlineAction(formData: FormData) {
  const id = String(formData.get('id') || '');
  const status = String(formData.get('status') || '');
  const price  = String(formData.get('final_price_eur') || '').replace(',', '.').trim();

  if (!id) throw new Error('id ontbreekt');
  if (status && !['new','in_progress','done'].includes(status)) {
    throw new Error('Ongeldige status');
  }

  // final_price_cents uit EUR naar cents
  let final_price_cents: number | undefined = undefined;
  if (price !== '') {
    const p = Number(price);
    if (Number.isNaN(p)) throw new Error('Ongeldig bedrag');
    final_price_cents = Math.round(p * 100);
  }

  const patch: any = { updated_at: new Date().toISOString() };
  if (status) patch.status = status;
  if (final_price_cents !== undefined) patch.final_price_cents = final_price_cents;

  const { error } = await supabaseAdmin
    .from('buyback_leads')
    .update(patch)
    .eq('id', id);

  if (error) throw new Error(error.message);
  revalidatePath('/admin/leads');
}
