'use server';
import {requireAccess} from '@/lib/security/access';
import {supabaseAdmin} from '@/lib/supabaseAdmin';
import {revalidatePath} from 'next/cache';
import {profileInput,uuidPattern} from '@/lib/erpArticleProfile';
export type SaveResult={ok:boolean;error?:string;version?:number};
export async function saveArticleProfile(form:FormData):Promise<SaveResult>{
 const user = await requireAccess('erp', 'write', false);
 const id=String(form.get('article_id')??''),version=Number(form.get('version'));
 if(!uuidPattern.test(id)||!form.has('version')||!Number.isSafeInteger(version)||version<0)return {ok:false,error:'Ongeldige artikelversie. Vernieuw de pagina.'};
 const input=profileInput(form);if('error' in input)return {ok:false,error:input.error};
 try{
  const {data,error}=await supabaseAdmin.rpc('save_erp_article_profile',{p_article_id:id,p_version:version,p_data:input.data,p_actor:user.email});
  if(error)return {ok:false,error:error.message?.includes('profile_conflict')?'Een collega heeft deze fiche intussen gewijzigd. Vernieuw de pagina voordat je opnieuw opslaat.':'De artikelfiche kon niet worden opgeslagen. Probeer opnieuw.'};
  if(!Number.isInteger(data)||data!==version+1)return {ok:false,error:'Opslag kon niet worden bevestigd. Vernieuw de pagina.'};
  revalidatePath('/admin/erp/articles');revalidatePath(`/admin/erp/articles/${id}`);
  return {ok:true,version:data};
 }catch{return {ok:false,error:'Opslaan is tijdelijk niet beschikbaar. Je invoer blijft staan.'};}
}
export async function setArticleCore(id:string,expected:boolean|null):Promise<SaveResult>{
 await requireAccess('erp', 'write', false);
 if(!uuidPattern.test(id)||!(expected===null||typeof expected==='boolean'))return {ok:false,error:'Ongeldig artikel.'};
 try{
  let q=supabaseAdmin.from('erp_articles').update({core_assortment:!expected}).eq('id',id).or('refurbished_product.eq.false,refurbished_product.is.null');
  q=expected===null?q.is('core_assortment',null):q.eq('core_assortment',expected);
  const {data,error}=await q.select('id').maybeSingle();
  if(error||!data)return {ok:false,error:'De selectie is intussen gewijzigd of kon niet worden opgeslagen. Vernieuw de pagina.'};
  revalidatePath('/admin/erp/articles');revalidatePath(`/admin/erp/articles/${id}`);return {ok:true};
 }catch{return {ok:false,error:'Core-assortiment kon niet worden opgeslagen.'};}
}

