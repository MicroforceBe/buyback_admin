'use server';
import { requireAccess } from '@/lib/security/access';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supplierRmaStages, rmaMoney, rmaDate } from '@/lib/supplierRma';
import {supplierDecisions,custodyStates,repairStates} from '@/lib/supplierRmaResolution';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
const uuid = (raw: unknown) => { const value = String(raw ?? ''); if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw Error('RMA_INPUT'); return value; };
const short = (form: FormData, key: string, max = 250) => { const value = String(form.get(key) ?? '').trim(); if (value.length > max) throw Error('RMA_INPUT'); return value; };
function version(form: FormData) { const value = Number(form.get('version')); if (!Number.isSafeInteger(value) || value < 1) throw Error('RMA_INPUT'); return value; }
function errorCode(error: unknown) { const message = error instanceof Error ? error.message : ''; const resolutionCodes:Record<string,string>={RMA_USE_RECEPTION:'use_reception',RMA_FIX_STATUS_MISSING:'fix_status',RMA_REASON_REQUIRED:'reason_required',RMA_DECISION_INVALID:'decision_invalid',RMA_DECISION_REQUIRED:'decision_required',RMA_RECEIPT_EXCEEDS_AWARD:'receipt_award',RMA_CLAIM_LOCKED:'claim_locked',RMA_CUSTODY_INVALID:'custody',RMA_RETURN_REQUIRED:'return_required',RMA_SENT_DATE_REQUIRED:'sent_date',RMA_REPAIR_ACTIVE:'repair_active',RMA_REPAIR_TRANSITION:'repair_transition',RMA_REPAIR_FINALIZED:'repair_finalized',RMA_REJECTION_REQUIRED:'rejection_required',RMA_REPAIR_NOTES_REQUIRED:'repair_notes',RMA_QUALITY_REQUIRED:'quality_required',RMA_WRITEOFF_CONFIRMATION:'writeoff'};const resolution=Object.keys(resolutionCodes).find(code=>message.includes(code));if(resolution)return resolutionCodes[resolution]; if (message.includes('RMA_NOT_REGISTERED')) return 'not_registered'; if (message.includes('RMA_RECEPTION_MISMATCH')) return 'reception'; if (message.includes('RMA_FINAL_FIELDS_REQUIRED')) return 'final_fields'; if (message.includes('RMA_FINALIZED')) return 'finalized'; if (message.includes('RMA_EXPECTATION_MISSING')) return 'expectation_missing'; if (message.includes('RMA_CONFLICT')) return 'conflict'; if (message.includes('RMA_COMPENSATION_REQUIRED')) return 'compensation'; if (message.includes('RMA_REFUNDED')) return 'refunded'; if (message.includes('RMA_PRICE_MISSING')) return 'price_missing'; if (message.includes('RMA_NO_NEW_ITEMS')) return 'no_new_items'; if (message.includes('RMA_ALREADY_LINKED') || message.includes('supplier_rma_one_active_case')) return 'already_linked'; if (message.includes('RMA_SUPPLIER_MISMATCH')) return 'supplier'; if (message.includes('RMA_CASE_CLOSED')) return 'closed'; return 'invalid'; }
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
    if (stage==='handled' || !Object.prototype.hasOwnProperty.call(supplierRmaStages, stage)) throw Error('RMA_INPUT');
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
    const ids=[...new Set(form.getAll('item_ids').map(uuid))];
    if(!ids.length||ids.length>200)throw Error('RMA_INPUT');
    const target=short(form,'target_case')||'new';
    const { data, error } = await supabaseAdmin.rpc('assign_reception_supplier_rma', { p_reception_id: receptionId, p_item_ids: ids, p_target_case_id: target==='new'?null:uuid(target), p_register_late:false, p_use_purchase_price:form.get('use_purchase_price')==='1',p_actor:user.email });
    if (error) throw Error(error.message);
    id = uuid(data);
  } catch (error) { redirect('/admin/refurb/rma?msg=' + errorCode(error)); }
  revalidatePath('/admin/refurb','layout'); revalidatePath('/admin/refurb/rma');
  redirect('/admin/refurb/rma/' + id);
}

export async function registerLateReceptionRma(form: FormData) {
  const user = await requireAccess('refurb', 'write', true);
  let id: string;
  try {
    const receptionId = uuid(form.get('reception_id'));
    const ids = [...new Set(form.getAll('item_ids').map(uuid))];
    if (!ids.length || ids.length > 200) throw Error('RMA_INPUT');
    const target=short(form,'target_case')||'new';
    const { data, error } = await supabaseAdmin.rpc('assign_reception_supplier_rma', { p_reception_id:receptionId,p_item_ids:ids,p_target_case_id:target==='new'?null:uuid(target),p_register_late:true,p_use_purchase_price:form.get('use_purchase_price')==='1',p_actor:user.email });
    if (error) throw Error(error.message);
    id = uuid(data);
  } catch (error) { redirect('/admin/refurb/rma?msg=' + errorCode(error)); }
  revalidatePath('/admin/refurb','layout'); revalidatePath('/admin/refurb/rma');
  redirect('/admin/refurb/rma/' + id);
}

export async function copySupplierRmaExpected(form: FormData) {
  const user = await requireAccess('refurb', 'write', true);
  let id: string;
  try {
    id=uuid(form.get('case_id'));
    const all=form.get('all')==='1';
    const {data,error}=await supabaseAdmin.rpc('settle_supplier_rma', {p_command:all?'copy_all':'copy_item',p_data:{case_id:id,version:version(form),...(all?{}:{item_id:uuid(form.get('item_id'))})},p_actor:user.email});
    if(error)throw Error(error.message);
    uuid(data);
  } catch(error) {redirect('/admin/refurb/rma?msg='+errorCode(error));}
  revalidatePath('/admin/refurb/rma');revalidatePath('/admin/refurb/rma/'+id);
  redirect('/admin/refurb/rma/'+id+'?saved=1');
}
export async function finalizeSupplierRma(form: FormData) {
  const user = await requireAccess('refurb', 'write', true);
  let id: string;
  try {
    id=uuid(form.get('case_id'));
    if(form.get('confirm_final')!=='1')throw Error('RMA_INPUT');
    const {data,error}=await supabaseAdmin.rpc('settle_supplier_rma', {p_command:'finalize',p_data:{case_id:id,version:version(form),confirmed:true,confirm_writeoff:form.get('confirm_writeoff')==='1'},p_actor:user.email});
    if(error)throw Error(error.message);
    uuid(data);
  } catch(error) {redirect('/admin/refurb/rma?msg='+errorCode(error));}
  revalidatePath('/admin/refurb/rma');revalidatePath('/admin/refurb/rma/'+id);
  redirect('/admin/refurb/rma/'+id+'?saved=1');
}

function resolutionError(error:unknown){return errorCode(error);}
async function resolveItem(form:FormData,command:'decision'|'custody'|'repair',actor:string){
 let id:string|undefined;
 try{
  id=uuid(form.get('case_id'));const item_id=uuid(form.get('item_id'));
  const payload:Record<string,unknown>={case_id:id,item_id};
  if(command==='decision'){
   const decision=short(form,'decision');if(!Object.prototype.hasOwnProperty.call(supplierDecisions,decision))throw Error('RMA_DECISION_INVALID');
   Object.assign(payload,{version:version(form),decision,reason:short(form,'reason',5000),approved_cents:decision==='partial'?rmaMoney(form.get('approved')):null});
  }else{
   const followup_version=Number(form.get('followup_version'));if(!Number.isSafeInteger(followup_version)||followup_version<0)throw Error('RMA_INPUT');
   payload.followup_version=followup_version;
   if(command==='custody'){
    const custody=short(form,'custody');if(!Object.prototype.hasOwnProperty.call(custodyStates,custody))throw Error('RMA_CUSTODY_INVALID');
    Object.assign(payload,{custody,outbound_on:rmaDate(form.get('outbound_on')),returned_on:rmaDate(form.get('returned_on')),return_reference:short(form,'return_reference')});
   }else{
    const repair_state=short(form,'repair_state');if(!Object.prototype.hasOwnProperty.call(repairStates,repair_state))throw Error('RMA_REPAIR_TRANSITION');
    Object.assign(payload,{repair_state,repair_notes:short(form,'repair_notes',10000),repair_parts:short(form,'repair_parts',2000),repair_assignee:short(form,'repair_assignee'),quality_confirmed:form.get('quality_confirmed')==='1'});
   }
  }
  const {data,error}=await supabaseAdmin.rpc('resolve_supplier_rma',{p_command:command,p_data:payload,p_actor:actor});if(error)throw Error(error.message);uuid(data);
 }catch(error){redirect((id?'/admin/refurb/rma/'+id:'/admin/refurb/rma')+'?msg='+resolutionError(error));}
 revalidatePath('/admin/refurb','layout');revalidatePath('/admin/refurb/rma');revalidatePath('/admin/refurb/rma/'+id);revalidatePath('/admin/refurb/analytics');
 redirect('/admin/refurb/rma/'+id+'?saved=1');
}
export async function updateSupplierRmaDecision(form:FormData){
 const user = await requireAccess('refurb','write',true);
 return resolveItem(form,'decision',user.email);
}
export async function updateSupplierRmaCustody(form:FormData){
 const user = await requireAccess('refurb','write',true);
 return resolveItem(form,'custody',user.email);
}
export async function updateSupplierRmaRepair(form:FormData){
 const user = await requireAccess('refurb','write',true);
 return resolveItem(form,'repair',user.email);
}

