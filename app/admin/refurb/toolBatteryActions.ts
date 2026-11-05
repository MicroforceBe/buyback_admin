'use server';
import { requireAccess } from '@/lib/security/access';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { parseReceptionBattery } from '@/lib/receptionBattery';
import { canPrintRefurbLabel } from '@/lib/refurbLabel';
import { revalidatePath } from 'next/cache';

export async function fillMissingToolBattery(itemId:string,raw:string):Promise<{ok:true;battery:number}|{ok:false;message:string}> {
  await requireAccess('refurb','write',false);
  if(typeof itemId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(itemId))return {ok:false,message:'Ongeldig receptieartikel.'};
  let battery:number|null;
  try{battery=parseReceptionBattery(raw);}catch{return {ok:false,message:'Vul een geheel batterijpercentage van 0 tot 100 in.'};}
  if(battery===null)return {ok:false,message:'Vul het gemeten batterijpercentage in.'};
  const {data:item,error}=await supabaseAdmin.from('refurb_reception_items').select('id,reception_id,refurb_status,battery_percentage,updated_at').eq('id',itemId).maybeSingle();
  if(error||!item)return {ok:false,message:'Het artikel kon niet worden geladen. Vernieuw de pagina.'};
  if(item.battery_percentage!==null)return {ok:false,message:'Er is inmiddels al een batterijpercentage opgeslagen. Vernieuw de pagina.'};
  const {data:options,error:statusError}=await supabaseAdmin.from('refurb_status_options').select('value,label');
  if(statusError||!canPrintRefurbLabel(item.refurb_status,options||[]))return {ok:false,message:'Batterij aanvullen voor een label kan alleen bij Finished, Ready to book of Booked.'};
  // Only fill an absent measurement. A concurrent edit or status change must not be overwritten.
  const {data:saved,error:saveError}=await supabaseAdmin.from('refurb_reception_items')
    .update({battery_percentage:battery,updated_at:new Date().toISOString()})
    .eq('id',itemId).is('battery_percentage',null).eq('refurb_status',item.refurb_status).eq('updated_at',item.updated_at)
    .select('id').maybeSingle();
  if(saveError)return {ok:false,message:'Batterijpercentage niet opgeslagen. Probeer opnieuw of neem contact op met de beheerder.'};
  if(!saved)return {ok:false,message:'Dit artikel is intussen gewijzigd. Vernieuw de pagina en controleer het opgeslagen percentage.'};
  revalidatePath('/admin/refurb');
  revalidatePath('/admin/refurb/'+item.reception_id);
  return {ok:true,battery};
}
