'use server';
import { requireAccess } from '@/lib/security/access';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { receptionBatteryLabelIssue } from '@/lib/receptionBattery';
import { renderProductLabel } from '@/lib/productLabel';
import { getRefurbLabelSource } from '../erp/labels/refurbSource';

export async function prepareReceptionLabel(itemId: string): Promise<{ok:true;html:string}|{ok:false;message:string}> {
  await requireAccess('refurb','read',false);
  const source=await getRefurbLabelSource(itemId);
  if(source.error)return {ok:false,message:source.error};
  const {data:article,error}=await supabaseAdmin.from('erp_articles').select('sku,title,vat_margin').eq('sku',source.sku).maybeSingle();
  if(error || !article)return {ok:false,message:'Geen ERP-artikel gevonden voor de opgeslagen SKU. Controleer de SKU in de receptie.'};
  const batteryIssue = receptionBatteryLabelIssue(source.battery, article.title, source.description);
  if (batteryIssue) return {ok:false,message:batteryIssue};
  try{
    return {ok:true,html:renderProductLabel({sku:article.sku,title:article.title,serial:source.imei,battery:source.battery,omitEmptyBattery:true,vatMargin:article.vat_margin})};
  }catch(error){
    return {ok:false,message:error instanceof Error?error.message:'Het productlabel kon niet worden opgebouwd.'};
  }
}

