'use server';
import { requireAccess } from '@/lib/security/access';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { leadLabelLocalIssues } from '@/lib/leadLabelValidation';
import { renderProductLabel } from '@/lib/productLabel';
export async function prepareLeadLabel(id:string):Promise<{ok:true;html:string}|{ok:false;message:string}>{
 await requireAccess('leads','read',false);
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))return {ok:false,message:'Ongeldige lead.'};
 const {data:lead,error}=await supabaseAdmin.from('buyback_leads').select('id,sku,imei_sn,battery_percentage,status').eq('id',id).maybeSingle();
 if(error||!lead)return {ok:false,message:'De opgeslagen toestelgegevens konden niet worden geladen.'};
 const issues=leadLabelLocalIssues(lead);if(issues.length)return {ok:false,message:issues.join(' ')};
 const {data:article,error:lookupError}=await supabaseAdmin.from('erp_articles').select('sku,title,vat_margin').eq('sku',lead.sku.trim()).eq('missing_from_erp',false).eq('vat_margin',true).eq('refurbished_product',true).maybeSingle();
 if(lookupError||!article)return {ok:false,message:'Geen geldige ERP-SKU van een refurbished margeartikel gevonden. Sla een bestaande artikelcode op.'};
 try{return {ok:true,html:renderProductLabel({sku:article.sku,title:article.title,serial:lead.imei_sn,battery:String(lead.battery_percentage),vatMargin:article.vat_margin})};}
 catch(error){return {ok:false,message:error instanceof Error?error.message:'Het label kon niet worden opgebouwd.'};}
}
