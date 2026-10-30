'use server';
import {requireAccess} from '@/lib/security/access';
import {supabaseAdmin} from '@/lib/supabaseAdmin';
import {parseSupplierDeviceCsv} from '@/lib/supplierDeviceCsv';
import {revalidatePath} from 'next/cache';
export async function importSupplierDeviceCsv(form:FormData):Promise<{id?:string;error?:string;uncertain?:boolean}>{
 const user = await requireAccess('refurb','write',false);
 try{
  const text=form.get('csv');if(typeof text!=='string')return {error:'Kies eerst een CSV-bestand.'};
  const parsed=parseSupplierDeviceCsv(text);
  const request=String(form.get('request_id')||''),supplier=String(form.get('supplier_id')||''),nr=String(form.get('reception_number')||'').trim(),vat=String(form.get('vat_scheme')||'');
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if(!uuid.test(request)||!uuid.test(supplier)||!/^[A-Za-z0-9_-]{1,100}$/.test(nr)||!['margin','normal'].includes(vat))return {error:'Vul receptienummer, leverancier en btw-regeling in.'};
  const save=form.get('save_profile')==='1';if(save&&user.role!=='admin')return {error:'Alleen een admin kan een leveranciersformaat bewaren.'};
  const data={format:parsed.format,supplier_id:supplier,reception_number:nr,invoice:parsed.invoice,date:parsed.date,vat_scheme:vat,save_profile:save,items:parsed.items};
  const result=await supabaseAdmin.rpc('import_refurb_supplier_csv',{p_request:request,p_actor:user.email,p_data:data});
  if(result.error){const message=result.error.message;const messages:Record<string,string>={
   IMPORT_RECEPTION_EXISTS:'Dit receptienummer bestaat al. Open de bestaande receptie.',
   IMPORT_INVOICE_EXISTS:'Deze factuur bestaat al voor deze leverancier.',
   IMPORT_DEVICE_EXISTS:'Minstens één IMEI/SN staat al in een receptie. Er is niets geïmporteerd.',
   IMPORT_INITIAL_STATUS:'De beginstatus New is niet correct ingesteld. Er is niets geïmporteerd.',
   IMPORT_REPLAY_MISMATCH:'Deze aanvraag is gewijzigd. Vernieuw en controleer eerst de bestaande recepties.',
   IMPORT_PROFILE_ADMIN:'Alleen een admin kan een leveranciersformaat bewaren.'
  };const key=Object.keys(messages).find(k=>message.includes(k));if(key)return {error:messages[key]};
   return {error:'Geen importbevestiging ontvangen. Controleer eerst of de receptie bestaat voordat je opnieuw probeert.',uncertain:true};
  }
  if(typeof result.data!=='string'||!uuid.test(result.data))return {error:'Geen importbevestiging. Controleer de receptielijst.',uncertain:true};
  revalidatePath('/admin/refurb');revalidatePath('/admin/refurb/new/import');
  return {id:result.data};
 }catch(error){return {error:error instanceof Error&&/CSV|regel|bestand|factuur|datum|Aantal|EUR|prijs|IMEI|Omschrijving|toestel|aanhaling/i.test(error.message)?error.message:'Import kon niet gecontroleerd worden. Er is geen bevestiging; controleer eerst de receptielijst.',uncertain:true};}
}
