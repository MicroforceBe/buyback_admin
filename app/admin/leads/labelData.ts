import 'server-only';
import { requireAccess } from '@/lib/security/access';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { leadLabelLocalIssues,leadPartsWarning,type LeadLabelFields } from '@/lib/leadLabelValidation';
export async function getLeadLabelReadiness(leads:LeadLabelFields[]){
 await requireAccess('leads','read',false);
 const codes=[...new Set(leads.flatMap(lead=>[lead.sku??'',...(lead.used_parts_skus??[])]).map(code=>code.trim()).filter(code=>code&&code!=='-'))];
 const articles=new Map<string,{sku:string;missing_from_erp:boolean;vat_margin:boolean;refurbished_product:boolean}>();let failed=false;
 for(let offset=0;offset<codes.length;offset+=200){
  try { const {data,error}=await supabaseAdmin.from('erp_articles').select('sku,missing_from_erp,vat_margin,refurbished_product').in('sku',codes.slice(offset,offset+200));
  if(error){failed=true;break;}for(const article of data??[])articles.set(article.sku,article); } catch { failed=true;break; }
 }
 const knownParts=new Set([...articles.values()].filter(article=>article.missing_from_erp===false).map(article=>article.sku));
 return Object.fromEntries(leads.map(lead=>{
  const issues=leadLabelLocalIssues(lead),article=articles.get(lead.sku?.trim()??'');
  if(failed)issues.push('De ERP-controle is tijdelijk niet beschikbaar.');
  else if(lead.sku?.trim()&&(!article||article.missing_from_erp!==false||article.vat_margin!==true||article.refurbished_product!==true))issues.push('De toestel-SKU moet exact bestaan als actief refurbished margeartikel in ERP.');
  return [lead.id,{canPrint:issues.length===0,issues,partsWarning:leadPartsWarning(lead.used_parts_skus,knownParts,failed)}];
 }));
}
