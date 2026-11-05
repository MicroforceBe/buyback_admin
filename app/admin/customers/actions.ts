'use server';
import { requireAccess } from '@/lib/security/access';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { customerInput, CustomerInputError, isUuid, type CustomerInput } from '@/lib/customers';
import { revalidatePath } from 'next/cache';

export type DuplicateCandidate = { id: string; customer_number: string; name: string; email: string | null; phone: string | null };
export type CustomerSaveResult =
  | { ok: true; id: string }
  | { ok: false; error: string; field?: string; duplicates?: DuplicateCandidate[] };

const SAVE_FAILED = 'Opslaan is niet gelukt. Probeer opnieuw; er is niets gewijzigd.';

function invalid(error: unknown): CustomerSaveResult {
  if (error instanceof CustomerInputError) return { ok: false, error: error.message, field: error.field };
  return { ok: false, error: 'Controleer de ingevulde gegevens.' };
}

/** Active customers with the same e-mail address or phone number, so staff can avoid duplicates. */
async function findDuplicates(input: CustomerInput, excludeId?: string): Promise<DuplicateCandidate[]> {
  const filters: string[] = [];
  if (input.email) filters.push(`email.eq.${input.email}`);
  if (input.phone) filters.push(`phone.eq.${input.phone}`);
  if (input.vat_number) filters.push(`vat_number.eq.${input.vat_number}`);
  if (!filters.length) return [];
  let query = supabaseAdmin
    .from('shop_customers')
    .select('id,customer_number,customer_type,first_name,last_name,company_name,email,phone')
    .is('archived_at', null)
    .or(filters.join(','))
    .limit(5);
  if (excludeId) query = query.neq('id', excludeId);
  const { data, error } = await query;
  if (error) throw new Error('DUPLICATE_CHECK_FAILED');
  return (data ?? []).map(row => ({
    id: row.id,
    customer_number: row.customer_number,
    name: row.customer_type === 'business' ? row.company_name : [row.first_name, row.last_name].filter(Boolean).join(' '),
    email: row.email,
    phone: row.phone,
  }));
}

export async function createCustomer(form: FormData): Promise<CustomerSaveResult> {
  const user = await requireAccess('customers', 'write');
  let input: CustomerInput;
  try { input = customerInput(form); } catch (error) { return invalid(error); }
  try {
    if (form.get('confirm_duplicate') !== '1') {
      const duplicates = await findDuplicates(input);
      if (duplicates.length) return { ok: false, error: 'Er bestaat al een klant met dit e-mailadres, telefoonnummer of btw-nummer.', duplicates };
    }
    const now = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from('shop_customers')
      .insert({ ...input, marketing_opt_in_at: input.marketing_opt_in ? now : null, created_by: user.email, updated_by: user.email })
      .select('id')
      .single();
    if (error || !data) return { ok: false, error: SAVE_FAILED };
    revalidatePath('/admin/customers');
    return { ok: true, id: data.id };
  } catch {
    return { ok: false, error: SAVE_FAILED };
  }
}

export async function updateCustomer(form: FormData): Promise<CustomerSaveResult> {
  const user = await requireAccess('customers', 'write');
  const id = String(form.get('id') ?? '');
  const version = Number(form.get('version'));
  if (!isUuid(id) || !Number.isSafeInteger(version) || version < 1) return { ok: false, error: 'Ongeldige klant of versie. Vernieuw de pagina.' };
  let input: CustomerInput;
  try { input = customerInput(form); } catch (error) { return invalid(error); }
  try {
    const { data: current, error: readError } = await supabaseAdmin
      .from('shop_customers')
      .select('id,version,archived_at,marketing_opt_in,marketing_opt_in_at')
      .eq('id', id)
      .maybeSingle();
    if (readError) return { ok: false, error: SAVE_FAILED };
    if (!current) return { ok: false, error: 'Deze klant bestaat niet meer.' };
    if (current.archived_at) return { ok: false, error: 'Een gearchiveerde klant kan niet worden gewijzigd. Zet de klant eerst terug.' };
    if (form.get('confirm_duplicate') !== '1') {
      const duplicates = await findDuplicates(input, id);
      if (duplicates.length) return { ok: false, error: 'Een andere klant heeft hetzelfde e-mailadres, telefoonnummer of btw-nummer.', duplicates };
    }
    const now = new Date().toISOString();
    const marketing_opt_in_at = !input.marketing_opt_in ? null : current.marketing_opt_in ? current.marketing_opt_in_at : now;
    const { data, error } = await supabaseAdmin
      .from('shop_customers')
      .update({ ...input, marketing_opt_in_at, version: version + 1, updated_by: user.email, updated_at: now })
      .eq('id', id)
      .eq('version', version)
      .is('archived_at', null)
      .select('id')
      .maybeSingle();
    if (error) return { ok: false, error: SAVE_FAILED };
    if (!data) return { ok: false, error: 'Deze klant is intussen door iemand anders gewijzigd. Vernieuw de pagina en probeer opnieuw.' };
    revalidatePath('/admin/customers');
    revalidatePath('/admin/customers/' + id);
    return { ok: true, id };
  } catch {
    return { ok: false, error: SAVE_FAILED };
  }
}

export async function setCustomerArchived(input: { id: string; version: number; archived: boolean }): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireAccess('customers', 'write');
  if (!input || !isUuid(input.id) || !Number.isSafeInteger(input.version) || input.version < 1 || typeof input.archived !== 'boolean') {
    return { ok: false, error: 'Ongeldige klant of versie. Vernieuw de pagina.' };
  }
  try {
    const now = new Date().toISOString();
    // Only archive an active customer and only restore an archived one, so a repeated or stale
    // click never changes the archive date or writes a misleading history event.
    let query = supabaseAdmin
      .from('shop_customers')
      .update({ archived_at: input.archived ? now : null, version: input.version + 1, updated_by: user.email, updated_at: now })
      .eq('id', input.id)
      .eq('version', input.version);
    query = input.archived ? query.is('archived_at', null) : query.not('archived_at', 'is', null);
    const { data, error } = await query.select('id').maybeSingle();
    if (error) return { ok: false, error: SAVE_FAILED };
    if (!data) return { ok: false, error: 'Deze klant is intussen gewijzigd. Vernieuw de pagina en probeer opnieuw.' };
    revalidatePath('/admin/customers');
    revalidatePath('/admin/customers/' + input.id);
    return { ok: true };
  } catch {
    return { ok: false, error: SAVE_FAILED };
  }
}

/** Links an unlinked buyback lead to an active customer. Changes a lead, so it also needs lead write rights. */
export async function linkLeadToCustomer(input: { customerId: string; leadId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireAccess('customers', 'write');
  await requireAccess('leads', 'write');
  if (!input || !isUuid(input.customerId) || !isUuid(input.leadId)) return { ok: false, error: 'Ongeldige klant of lead.' };
  try {
    const { error } = await supabaseAdmin.rpc('shop_customer_link_lead', { p_customer: input.customerId, p_lead: input.leadId, p_actor: user.email });
    if (error) {
      if (error.message?.includes('SHOP_CUSTOMER_NOT_AVAILABLE')) return { ok: false, error: 'Deze klant is gearchiveerd of bestaat niet meer.' };
      if (error.message?.includes('SHOP_CUSTOMER_LEAD_NOT_LINKABLE')) return { ok: false, error: 'Deze lead is al aan een klant gekoppeld.' };
      return { ok: false, error: 'Koppelen is niet gelukt. Probeer opnieuw.' };
    }
    revalidatePath('/admin/customers/' + input.customerId);
    return { ok: true };
  } catch {
    return { ok: false, error: 'Koppelen is niet gelukt. Probeer opnieuw.' };
  }
}
