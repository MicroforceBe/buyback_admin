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
