'use server';
import { requireAccess } from '@/lib/security/access';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supplierRmaStages, rmaMoney, rmaDate } from '@/lib/supplierRma';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
const uuid = (raw: unknown) => { const value = String(raw ?? ''); if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw Error('RMA_INPUT'); return value; };
const short = (form: FormData, key: string, max = 250) => { const value = String(form.get(key) ?? '').trim(); if (value.length > max) throw Error('RMA_INPUT'); return value; };
function version(form: FormData) { const value = Number(form.get('version')); if (!Number.isSafeInteger(value) || value < 1) throw Error('RMA_INPUT'); return value; }
function errorCode(error: unknown) { const message = error instanceof Error ? error.message : ''; if (message.includes('RMA_CONFLICT')) return 'conflict'; if (message.includes('RMA_COMPENSATION_REQUIRED')) return 'compensation'; if (message.includes('RMA_REFUNDED')) return 'refunded'; if (message.includes('RMA_PRICE_MISSING')) return 'price_missing'; if (message.includes('RMA_NO_NEW_ITEMS')) return 'no_new_items'; if (message.includes('RMA_ALREADY_LINKED') || message.includes('supplier_rma_one_active_case')) return 'already_linked'; if (message.includes('RMA_SUPPLIER_MISMATCH')) return 'supplier'; if (message.includes('RMA_CASE_CLOSED')) return 'closed'; return 'invalid'; }
async function mutate(command: string, data: Record<string, unknown>, actor: string) {
  const { data: result, error } = await supabaseAdmin.rpc('manage_supplier_rma', { p_command: command, p_data: data, p_actor: actor });
  if (error) throw Error(error.message);
  return uuid(result);
}
export async function createSupplierRma(form: FormData) {
  const user = await requireAccess('refurb', 'write', true);
  let caseId: string;
  try {
    const ids = [...new Set(form.getAll('item_ids').map(uuid))];
    if (!ids.length || ids.length > 200) throw Error('RMA_INPUT');
    const { data: item, error: itemError } = await supabaseAdmin.from('refurb_reception_items').select('reception_id').eq('id', ids[0]).single();
    if (itemError || !item) throw Error('RMA_INPUT');
    const { data: reception, error } = await supabaseAdmin.from('refurb_receptions').select('supplier_id,supplier').eq('id', item.reception_id).single();
    if (error || !reception) throw Error('RMA_INPUT');
    caseId = await mutate('create', { supplier_id: reception.supplier_id, supplier_name: reception.supplier, item_ids: ids }, user.email);
  } catch (error) { redirect('/admin/refurb/rma?msg=' + errorCode(error)); }
  revalidatePath('/admin/refurb/rma');
  redirect('/admin/refurb/rma/' + caseId);
}
export async function updateSupplierRmaCase(form: FormData) {
  const user = await requireAccess('refurb', 'write', true);
  let id: string;
  try {
    id = uuid(form.get('case_id'));
    const stage = short(form, 'stage');
    if (!Object.prototype.hasOwnProperty.call(supplierRmaStages, stage)) throw Error('RMA_INPUT');
    const sent_on = rmaDate(form.get('sent_on')), received_on = rmaDate(form.get('received_on'));
    if (sent_on && received_on && sent_on > received_on) throw Error('RMA_INPUT');
    await mutate('update_case', { case_id: id, version: version(form), stage, supplier_reference: short(form, 'supplier_reference'), supplier_credit_note: short(form, 'supplier_credit_note'), tracking_reference: short(form, 'tracking_reference'), sent_on, received_on, followup_on: rmaDate(form.get('followup_on')), notes: short(form, 'notes', 10000) }, user.email);
  } catch (error) { redirect('/admin/refurb/rma?msg=' + errorCode(error)); }
  revalidatePath('/admin/refurb/rma'); revalidatePath('/admin/refurb/rma/' + id);
  redirect('/admin/refurb/rma/' + id + '?saved=1');
}
export async function updateSupplierRmaItem(form: FormData) {
  const user = await requireAccess('refurb', 'write', true);
  let id: string;
  try {
    id = uuid(form.get('case_id'));
    await mutate('update_item', { case_id: id, item_id: uuid(form.get('item_id')), version: version(form), expected_cents: rmaMoney(form.get('expected'), true), received_cents: rmaMoney(form.get('received')), notes: short(form, 'notes', 5000) }, user.email);
  } catch (error) { redirect('/admin/refurb/rma?msg=' + errorCode(error)); }
  revalidatePath('/admin/refurb/rma'); revalidatePath('/admin/refurb/rma/' + id);
  redirect('/admin/refurb/rma/' + id + '?saved=1');
}
export async function addSupplierRmaItems(form: FormData) {
  const user = await requireAccess('refurb', 'write', true);
  let id: string;
  try {
    id = uuid(form.get('case_id'));
    const ids = [...new Set(form.getAll('item_ids').map(uuid))];
    if (!ids.length || ids.length > 200) throw Error('RMA_INPUT');
    await mutate('add_items', { case_id: id, version: version(form), item_ids: ids }, user.email);
  } catch (error) { redirect('/admin/refurb/rma?msg=' + errorCode(error)); }
  revalidatePath('/admin/refurb/rma'); revalidatePath('/admin/refurb/rma/' + id);
  redirect('/admin/refurb/rma/' + id + '?saved=1');
}

export async function createReceptionSupplierRma(form: FormData) {
  const user = await requireAccess('refurb', 'write', true);
  let id: string;
  try {
    const receptionId = uuid(form.get('reception_id'));
    const { data, error } = await supabaseAdmin.rpc('prepare_reception_supplier_rma', { p_reception_id: receptionId, p_item_ids: null, p_use_purchase_price: form.get('use_purchase_price')==='1', p_actor: user.email });
    if (error) throw Error(error.message);
    id = uuid(data);
  } catch (error) { redirect('/admin/refurb/rma?msg=' + errorCode(error)); }
  revalidatePath('/admin/refurb'); revalidatePath('/admin/refurb/rma');
  redirect('/admin/refurb/rma/' + id);
}

export async function registerLateReceptionRma(form: FormData) {
  const user = await requireAccess('refurb', 'write', true);
  let id: string;
  try {
    const receptionId = uuid(form.get('reception_id'));
    const ids = [...new Set(form.getAll('item_ids').map(uuid))];
    if (!ids.length || ids.length > 200) throw Error('RMA_INPUT');
    const { data, error } = await supabaseAdmin.rpc('prepare_reception_supplier_rma', { p_reception_id: receptionId, p_item_ids: ids, p_use_purchase_price: form.get('use_purchase_price')==='1', p_actor: user.email });
    if (error) throw Error(error.message);
    id = uuid(data);
  } catch (error) { redirect('/admin/refurb/rma?msg=' + errorCode(error)); }
  revalidatePath('/admin/refurb'); revalidatePath('/admin/refurb/rma');
  redirect('/admin/refurb/rma/' + id);
}
