"use server";
import {requireAccess} from '@/lib/security/access';
import {revalidatePath} from 'next/cache';
import {redirect} from 'next/navigation';
import {prisma} from '@/lib/prisma';
import {diagnosticReport} from '@/lib/diagnostics';

const MANUAL_KEYS=new Set(['face_id','touchscreen','front_camera','rear_camera','speaker','microphone','buttons','charging_port','wifi','bluetooth','cosmetic_screen','cosmetic_frame','cosmetic_back']);
function message(sessionId:string,text:string):never{
 redirect('/admin/diagnostics/'+encodeURIComponent(sessionId)+'?diagnostic_error='+encodeURIComponent(text));
}
export async function saveDiagnosticTestAction(formData:FormData){
 await requireAccess('refurb','write',false);
 const sessionId=String(formData.get('sessionId')||'');
 const testKey=String(formData.get('testKey')||'');
 const status=String(formData.get('status')||'');
 const notes=String(formData.get('notes')||'').trim();
 if(!sessionId||sessionId.length>100||!MANUAL_KEYS.has(testKey)||!['pass','warning','fail'].includes(status)||notes.length>2000)throw new Error('Ongeldige testgegevens.');
 try{
  await prisma.$transaction(async tx=>{
   await tx.diagnosticTestResult.create({data:{sessionId,testKey,status,notes:notes||null}});
   await tx.diagnosticSession.update({where:{id:sessionId},data:{status:'in_progress',finalGrade:null,finalScore:null}});
  },{isolationLevel:'Serializable'});
 }catch{message(sessionId,'Opslaan is niet gelukt. Probeer opnieuw.');}
 revalidatePath('/admin/diagnostics/'+sessionId);
 revalidatePath('/admin/diagnostics/'+sessionId+'/certificate');
}
export async function finalizeDiagnosticSessionAction(formData:FormData){
 await requireAccess('refurb','write',false);
 const sessionId=String(formData.get('sessionId')||'');
 if(!sessionId||sessionId.length>100)throw new Error('Ongeldige sessie.');
 let error='';
 try{
  error=await prisma.$transaction(async tx=>{
   const session=await tx.diagnosticSession.findUnique({where:{id:sessionId},include:{deviceUnit:true,tests:{orderBy:[{createdAt:'desc'},{id:'desc'}]},appTests:{orderBy:[{createdAt:'desc'},{id:'desc'}]}}});
   if(!session)return 'Sessie niet gevonden.';
   const report=diagnosticReport(session.tests,session.deviceUnit.batteryHealth,session.appTests);
   if(!report.complete)return 'Nog niet alle controles zijn beoordeeld: '+report.incomplete.map(t=>t.label).join(', ')+'. Niet ondersteund telt niet als geslaagd.';
   if(!report.batteryKnown)return 'Vul eerst een geldige, gecontroleerde batterijconditie in (0–100%). Onbekend wordt niet als 100% beschouwd.';
   if(session.deviceUnit.securityGrade==='FAIL')return 'Er staat een onopgeloste beveiligingsblokkade op dit toestel. Los deze eerst op.';
   await tx.diagnosticSession.update({where:{id:sessionId},data:{status:'completed',finalScore:report.score,finalGrade:report.grade}});
   return '';
  },{isolationLevel:'Serializable'});
 }catch{error='Afronden is niet gelukt of de resultaten zijn ondertussen gewijzigd. Herlaad de sessie en probeer opnieuw.';}
 if(error)message(sessionId,error);
 revalidatePath('/admin/diagnostics/'+sessionId);
 revalidatePath('/admin/diagnostics/'+sessionId+'/certificate');
 revalidatePath('/admin/diagnostics');
 redirect('/admin/diagnostics/'+encodeURIComponent(sessionId)+'?diagnostic_saved=1');
}
