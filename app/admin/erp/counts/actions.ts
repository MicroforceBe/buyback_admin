'use server';
import {requireAccess} from '@/lib/security/access';
import {supabaseAdmin} from '@/lib/supabaseAdmin';
import {revalidatePath} from 'next/cache';
import {countInput,countError,adminCountCommands,type CountResult} from '@/lib/stockCounts';
import {uuidPattern} from '@/lib/erpArticleProfile';
export async function countCommand(command:string,form:FormData):Promise<CountResult>{
 const user = await requireAccess('erp','write',adminCountCommands.has(command));
 const input=countInput(command,form);if('error' in input)return {ok:false,definitive:true,error:input.error};
 try{
  const {data,error}=await supabaseAdmin.rpc('stock_count_command',{p_actor:user.email,p_admin:user.role==='admin',p_command:command,p_payload:input.payload});
  if(error)return {ok:false,definitive:/stock_/.test(error.message)||error.code==='23505',error:countError(error.message,error.code)};
  if(!data||typeof data.ok!=='boolean')return {ok:false,error:'Opslag kon niet worden bevestigd. Probeer opnieuw.'};
  revalidatePath('/admin/erp/counts');revalidatePath('/admin/erp/counts/'+input.payload.session_id);
  return data as CountResult;
 }catch{return {ok:false,error:'Opslag kon niet worden bevestigd. Je invoer blijft staan; probeer opnieuw.'};}
}
export async function lookupCount(sessionId:string,code:string):Promise<CountResult>{
 await requireAccess('erp','write',false);
 if(!uuidPattern.test(sessionId)||!code.trim()||code.length>128||/[\x00-\x1f\x7f]/.test(code))return {ok:false,error:'Scan een geldige EAN of SKU.'};
 try{
  const {data:session,error:sessionError}=await supabaseAdmin.from('stock_count_sessions').select('status').eq('id',sessionId).maybeSingle();
  if(sessionError||!session||session.status!=='active')return {ok:false,error:'De telling is niet meer actief. Vernieuw de pagina.'};
  const results=await Promise.all(['sku','ean'].map(field=>supabaseAdmin.from('stock_count_lines').select('article_id,sku,title').eq('session_id',sessionId).eq(field,code.trim()).limit(21)));
  if(results.some(r=>r.error))return {ok:false,error:'Artikelcontrole is tijdelijk niet beschikbaar.'};
  const candidates=[...new Map(results.flatMap(r=>r.data??[]).map(r=>[r.article_id,r])).values()];
  return {ok:true,candidates};
 }catch{return {ok:false,error:'Artikelcontrole is tijdelijk niet beschikbaar.'};}
}
