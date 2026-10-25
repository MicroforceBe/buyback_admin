'use server';
import { requireAccess } from '@/lib/security/access';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { parseRmaDays } from '@/lib/receptionTerms';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
function id(raw:unknown){const value=String(raw??'');if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))throw Error('INVALID');return value;}
export async function updateReceptionMetadata(form:FormData){
  await requireAccess('refurb','write',false);
  let receptionId='';let result='saved';
  try {
    receptionId=id(form.get('reception_id'));
    const invoice=String(form.get('internal_invoice_nr')??'').trim();
    const stamp=String(form.get('updated_at')??'');
    if(invoice.length>250||!stamp||Number.isNaN(Date.parse(stamp)))throw Error('INVALID');
    const patch:{internal_invoice_nr:string|null;updated_at:string;rma_expiry_days?:number}={internal_invoice_nr:invoice||null,updated_at:new Date().toISOString()};
    if(form.has('rma_expiry_days'))patch.rma_expiry_days=parseRmaDays(form.get('rma_expiry_days'));
    const{data,error}=await supabaseAdmin.from('refurb_receptions').update(patch).eq('id',receptionId).eq('updated_at',stamp).select('id');
    if(error)throw Error('INVALID');if(!data?.length)result='conflict';
  }catch{result='invalid';}
  revalidatePath('/admin/refurb','layout');
  const list=form.get('list')==='1'||!receptionId;
  redirect((list?'/admin/refurb':'/admin/refurb/'+receptionId)+'?meta='+result+(list&&form.get('show_completed')==='1'?'&show_completed=1':''));
}
export async function updateSupplierRmaDays(form:FormData){
  await requireAccess('refurb','write',true);
  let result='saved';
  try{
    const supplierId=id(form.get('supplier_id'));const days=parseRmaDays(form.get('rma_expiry_days'));const original=parseRmaDays(form.get('original_days'));
    const{data,error}=await supabaseAdmin.from('refurb_suppliers').update({rma_expiry_days:days,updated_at:new Date().toISOString()}).eq('id',supplierId).eq('rma_expiry_days',original).select('id');
    if(error)throw Error('INVALID');if(!data?.length)result='conflict';
  }catch{result='invalid';}
  revalidatePath('/admin/refurb','layout');redirect('/admin/refurb/suppliers?meta='+result);
}
