'use server';
import {requireAccess} from '@/lib/security/access';
import {supabaseAdmin} from '@/lib/supabaseAdmin';
import {revalidatePath} from 'next/cache';
import {taxonomyInput,taxonomyTables,changedTaxonomyError} from '@/lib/erpArticleTaxonomy';
export type TaxonomyResult={ok:boolean;error?:string};
export async function saveTaxonomy(form:FormData):Promise<TaxonomyResult>{
 const user = await requireAccess('erp', 'write', false);
 const input=taxonomyInput(form);if('error' in input)return {ok:false,error:input.error};
 try{
  if(input.data.group_id&&(input.kind==='assignment'||input.data.active===true)){
   const {data:g,error}=await supabaseAdmin.from('erp_article_groups').select('id,active,parent_id').eq('id',input.data.group_id).maybeSingle();
   if(error||!g?.active)return {ok:false,error:'Kies een actieve groep of subgroep.'};
   if(g.parent_id){const {data:p,error:pe}=await supabaseAdmin.from('erp_article_groups').select('active').eq('id',g.parent_id).maybeSingle();if(pe||!p?.active)return {ok:false,error:'De bovenliggende artikelgroep is niet actief.'};}
  }
  const table=taxonomyTables[input.kind],payload={...input.data,version:input.version+1,updated_by:user.email};
  const q=input.id?supabaseAdmin.from(table).update(payload).eq('id',input.id).eq('version',input.version):supabaseAdmin.from(table).insert(payload);
  const {data,error}=await q.select('id').maybeSingle();
  if(error)return {ok:false,error:changedTaxonomyError(error.code,error.message)};
  if(!data)return {ok:false,error:'Dit onderdeel is intussen gewijzigd. Vernieuw de pagina voordat je opnieuw opslaat.'};
  revalidatePath('/admin/erp/article-settings');revalidatePath('/admin/erp/articles','layout');return {ok:true};
 }catch{return {ok:false,error:'Opslaan is tijdelijk niet beschikbaar. Je invoer blijft staan.'};}
}
export async function previewSkuPrefix(prefix:string):Promise<{ok:boolean;error?:string;count?:number;articles?:Array<{id:string;sku:string;title:string;article_group_name:string|null;article_subgroup_name:string|null;recognized_model:string|null;group_origin:string}>}>{
 await requireAccess('erp', 'read', false);
 if(!/^\d{3}$/.test(prefix))return {ok:false,error:'Vul exact drie cijfers in.'};
 try{const {data,error,count}=await supabaseAdmin.from('erp_article_classified').select('id,sku,title,article_group_name,article_subgroup_name,recognized_model,group_origin',{count:'exact'}).like('sku',prefix+'%').order('sku').limit(20);if(error)return {ok:false,error:'Voorbeelden konden niet worden geladen.'};return {ok:true,count:count??0,articles:data??[]};}catch{return {ok:false,error:'Voorbeelden zijn tijdelijk niet beschikbaar.'};}
}
