'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * Toegestane statussen (nieuw workflow):
 * - new                       = Nieuw
 * - received_store            = Ontvangen in winkel
 * - label_created             = Verzendlabel aangemaakt
 * - shipment_received         = Zending ontvangen
 * - check_passed              = Controle succesvol
 * - check_failed              = Controle gefaald
 * - done                      = Afgewerkt
 */
const ALLOWED_STATUSES = [
  'new',
  'received_store',
  'label_created',
  'shipment_received',
  'check_passed',
  'check_failed',
  'done',
] as const;

/** Kleine helper: “12,34” of “12.34” → cents (1234) */
function eurToCents(input: string | null | undefined): number | undefined {
  if (input == null) return undefined;
  const txt = String(input).trim().replace(',', '.');
  if (txt === '') return undefined;
  const n = Number(txt);
  if (Number.isNaN(n)) throw new Error('Ongeldig bedrag');
  return Math.round(n * 100);
}

/** Notitie opslaan (losstaand, nog steeds handig naast inline edits) */
export async function saveNoteAction(formData: FormData) {
  const id = String(formData.get('id') || '');
  const admin_note = String(formData.get('admin_note') ?? '');

  if (!id) throw new Error('id ontbreekt');

  const { error } = await supabaseAdmin
    .from('buyback_leads')
    .update({ admin_note, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw new Error(error.message);
  revalidatePath('/admin/leads');
}

/** Alleen status wijzigen (nog gebruikt door sommige knoppen) */
export async function updateStatusAction(formData: FormData) {
  const id = String(formData.get('id') || '');
  const status = String(formData.get('status') || '');

  if (!id) throw new Error('id ontbreekt');
  if (!ALLOWED_STATUSES.includes(status as any)) {
    throw new Error('Ongeldige status');
  }

  const { error } = await supabaseAdmin
    .from('buyback_leads')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw new Error(error.message);
  revalidatePath('/admin/leads');
}

/**
 * Inline update vanuit de tabel:
 * - prijs in EUR (veldnaam: final_price_eur) → final_price_cents
 * - status (optioneel)
 * Je mag één of beide tegelijk meesturen.
 */
export async function updateLeadInlineAction(formData: FormData) {
  const id = String(formData.get('id') || '');
  const statusRaw = formData.get('status');
  const priceRaw = formData.get('final_price_eur');

  if (!id) throw new Error('id ontbreekt');

  const patch: Record<string, any> = { updated_at: new Date().toISOString() };

  if (statusRaw != null && statusRaw !== '') {
    const status = String(statusRaw);
    if (!ALLOWED_STATUSES.includes(status as any)) {
      throw new Error('Ongeldige status');
    }
    patch.status = status;
  }

  if (priceRaw != null) {
    const cents = eurToCents(String(priceRaw));
    if (cents !== undefined) patch.final_price_cents = cents;
    // Als iemand leeg laat, updaten we prijs niet (geen reset naar null hier)
  }

  if (Object.keys(patch).length <= 1) {
    // alleen updated_at zou overschieten → niets te doen
    revalidatePath('/admin/leads');
    return;
  }

  const { error } = await supabaseAdmin
    .from('buyback_leads')
    .update(patch)
    .eq('id', id);

  if (error) throw new Error(error.message);
  revalidatePath('/admin/leads');
}

/** Lead verwijderen (simple, zonder confirm in RSC) */
export async function deleteLeadAction(formData: FormData) {
  const id = String(formData.get('id') || '');
  if (!id) throw new Error('id ontbreekt');

  const { error } = await supabaseAdmin
    .from('buyback_leads')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);
  revalidatePath('/admin/leads');
}
