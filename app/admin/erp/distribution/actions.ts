'use server';
import {requireAccess} from '@/lib/security/access';
import {supabaseAdmin} from '@/lib/supabaseAdmin';
import {parseDistributionRules,distributionLocations} from '@/lib/erpDistribution';
import {revalidatePath} from 'next/cache';
const id=(v:unknown)=>{const s=String(v??'');if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s))throw Error('Controleer de selectie.');return s;};
const version=(form:FormData)=>{const n=Number(form.get('version'));if(!Number.isSafeInteger(n)||n<1)throw Error('Vernieuw de pagina.');return n;};
function message(e:unknown){const text=e instanceof Error?e.message:'';if(text.includes('DIST_STOCK'))return 'Voorraad of open planning is gewijzigd. Vernieuw en controleer de beschikbare aantallen.';if(text.includes('DIST_CONFLICT'))return 'Intussen gewijzigd. Vernieuw de pagina en probeer opnieuw.';if(text.includes('DIST_REPLAY'))return 'Deze aanvraag is al verwerkt met een andere inhoud. Controleer de verzendlijsten.';return 'Niet opgeslagen. Controleer de selectie en probeer opnieuw.';}
export async function createDistributionList(form:FormData){
 const user = await requireAccess('erp','write',false);
 let attempted=false;
 try{
  const source=String(form.get('source')),destination=String(form.get('destination')),notes=String(form.get('notes')??'').trim(),raw=String(form.get('lines')??'');
  if(!Object.hasOwn(distributionLocations,source)||!Object.hasOwn(distributionLocations,destination)||source===destination||notes.length>2000||raw.length>60000)throw Error('INPUT');
  const lines=JSON.parse(raw);if(!Array.isArray(lines)||!lines.length||lines.length>500)throw Error('INPUT');
  const clean=lines.map((row:{article_id:unknown;quantity:unknown})=>{const quantity=Number(row.quantity);if(!Number.isSafeInteger(quantity)||quantity<1||quantity>10000)throw Error('INPUT');return {article_id:id(row.article_id),quantity};});
  if(new Set(clean.map(row=>row.article_id)).size!==clean.length)throw Error('INPUT');
  attempted=true;
  const {data,error}=await supabaseAdmin.rpc('erp_distribution_command',{p_command:'create',p_data:{request_id:id(form.get('request_id')),source,destination,notes,lines:clean},p_actor:user.email});if(error)throw Error(error.message);
  try{revalidatePath('/admin/erp/distribution','layout');}catch{}return {ok:true,id:id(data)};
 }catch(e){const uncertain=attempted&&!(e instanceof Error&&e.message.includes('DIST_'));return {ok:false,error:uncertain?'Geen zekere opslagbevestiging. Controleer eerst de open verzendlijsten.':message(e),uncertain};}
}
export async function saveDistributionRules(form:FormData){
 const user = await requireAccess('erp','write',true);
 try{const raw=String(form.get('rules')??'');if(raw.length>60000)throw Error('INPUT');const rules=parseDistributionRules(JSON.parse(raw)),v=version(form);
  const {error}=await supabaseAdmin.rpc('erp_distribution_command',{p_command:'rules',p_data:{rules,version:v},p_actor:user.email});if(error)throw Error(error.message);
  revalidatePath('/admin/erp/distribution','layout');return {ok:true,version:v+1};
 }catch(e){return {ok:false,error:message(e)};}
}
export async function archiveDistributionList(form:FormData){
 const user = await requireAccess('erp','write',false);
 try{if(form.get('confirm')!=='1')throw Error('INPUT');const listId=id(form.get('id'));
  const {error}=await supabaseAdmin.rpc('erp_distribution_command',{p_command:'archive',p_data:{id:listId,version:version(form)},p_actor:user.email});if(error)throw Error(error.message);
  revalidatePath('/admin/erp/distribution','layout');return {ok:true};
 }catch(e){return {ok:false,error:message(e)};}
}
