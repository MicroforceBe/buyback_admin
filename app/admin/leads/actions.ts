'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const ALLOWED_STATUSES = [
  'new',
  'received_store',
  'label_created',
  'shipment_received',
  'check_passed',
  'check_failed',
  'done',
] as const;

// Helper om euro → centen veilig te converteren
function eurToCents(input: string | null | undefined): number | undefined {
  if (input == null) return undefined;
  const txt = String(input).trim().replace(',', '.');
  if (txt === '') return undefined;
  const n = Number(txt);
  if (Number.isNaN(n)) throw new Error('Ongeldig bedrag');
  return Math.round(n * 100);
}

// ✅ Inline update van status en prijs in de tabel
export async function updateLeadInlineAction(formData: FormData) {
  const id = String(formData.get('id') || '');
  const statusRaw = formData.get('status');
  const priceRaw = formData.get('final_price_eur');

  if (!id) throw new Error('id ontbreekt');

  const patch: Record<string, any> = { updated_at: new Date().toISOString() };

  // Status updaten (indien meegegeven)
  if (statusRaw != null && String(statusRaw).trim() !== '') {
    const status = String(statusRaw);
    if (!ALLOWED_STATUSES.includes(status as any)) {
      throw new Error(`Ongeldige status: ${status}`);
    }
    patch.status = status;
  }

  // Prijs updaten (indien meegegeven)
  if (priceRaw != null) {
    const cents = eurToCents(String(priceRaw));
    if (cents !== undefined) patch.final_price_cents = cents;
  }

  // Niets te wijzigen → gewoon herladen
  if (Object.keys(patch).length <= 1) {
    revalidatePath('/admin/leads');
    return;
  }

  try {
    const { error } = await supabaseAdmin
      .from('buyback_leads')
      .update(patch)
      .eq('id', id);

    if (error) {
      throw new Error(`Update mislukt: ${error.message}`);
    }
  } catch (e: any) {
    throw new Error(`Inline update failed (id=${id}): ${e?.message || e}`);
  }

  revalidatePath('/admin/leads');
}

// ✅ Verwijderen van een lead
export async function deleteLeadAction(formData: FormData) {
  const id = String(formData.get('id') || '');
  if (!id) throw new Error('id ontbreekt');

  try {
    const { error } = await supabaseAdmin
      .from('buyback_leads')
      .delete()
      .eq('id', id);

    if (error) throw new Error(`Verwijderen mislukt: ${error.message}`);
  } catch (e: any) {
    throw new Error(`Delete failed (id=${id}): ${e?.message || e}`);
  }

  revalidatePath('/admin/leads');
}
