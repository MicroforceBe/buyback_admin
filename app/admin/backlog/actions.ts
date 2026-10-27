'use server';
import {requireAccess} from '@/lib/security/access';
import {supabaseAdmin} from '@/lib/supabaseAdmin';
import {backlogInput} from '@/lib/developmentBacklog';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';

export async function createBacklogItem(form:FormData){
 const user=await requireAccess('settings','write',true);
 let message='created';
 try{
  const input=backlogInput(form);
  const {error}=await supabaseAdmin.from('buyback_development_backlog').insert({...input,created_by:user.email,updated_by:user.email});
  if(error)message='failed';
 }catch{message='invalid';}
 revalidatePath('/admin/backlog');redirect('/admin/backlog?message='+message);
}
export async function saveBacklogItem(form:FormData){
 const user=await requireAccess('settings','write',true);
 let message='saved';
 try{
  const id=String(form.get('id')||''),version=Number(form.get('version'));
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)||!Number.isSafeInteger(version)||version<1)throw Error('BACKLOG_INPUT');
  const input=backlogInput(form);
  const {data,error}=await supabaseAdmin.from('buyback_development_backlog').update({...input,version:version+1,updated_by:user.email,updated_at:new Date().toISOString()}).eq('id',id).eq('version',version).select('id').maybeSingle();
  if(error)message='failed';else if(!data)message='conflict';
 }catch{message='invalid';}
 revalidatePath('/admin/backlog');redirect('/admin/backlog?message='+message);
}
