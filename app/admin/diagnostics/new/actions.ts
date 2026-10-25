'use server';
import { requireAccess } from '@/lib/security/access';
import { prisma } from '@/lib/prisma';
import { parseSessionInput } from '@/lib/diagnosticsUsb';

export async function createDiagnosticSession(formData: FormData): Promise<{error?:string;sessionId?:string}> {
  await requireAccess('refurb', 'write', false);
  let input: ReturnType<typeof parseSessionInput>;
  try { input=parseSessionInput(Object.fromEntries(formData.entries())); }
  catch(e) { return {error:e instanceof Error ? e.message : 'Controleer de toestelgegevens.'}; }
  try {
    const session=await prisma.$transaction(async tx=>{
      const matches=await tx.deviceUnit.findMany({where:{OR:[
        ...(input.imei?[{imei:input.imei}]:[]),
        ...(input.serialNumber?[{serialNumber:input.serialNumber}]:[]),
        ...(input.udid?[{udid:input.udid}]:[]),
      ]},take:2});
      if (matches.length>1) throw new Error('IDENTITY_CONFLICT');
      const existing=matches[0];
      if (existing && ((existing.imei && input.imei && existing.imei!==input.imei) || (existing.serialNumber && input.serialNumber && existing.serialNumber!==input.serialNumber) || (existing.udid && input.udid && existing.udid!==input.udid))) throw new Error('IDENTITY_CONFLICT');
      // Empty USB fields must not erase existing device information.
      const data={
        brand:input.brand || existing?.brand || 'Apple',
        ...(input.imei?{imei:input.imei}:{}),...(input.serialNumber?{serialNumber:input.serialNumber}:{}),
        model:input.model,...(input.storage?{storage:input.storage}:{}),...(input.color?{color:input.color}:{}),
        ...(input.udid?{udid:input.udid}:{}),...(input.productType?{productType:input.productType}:{}),
        ...(input.iosVersion?{iosVersion:input.iosVersion}:{}),
        ...(input.modelNumber?{modelNumber:input.modelNumber}:{}),
        ...(input.batteryCycles!==''?{batteryCycles:Number(input.batteryCycles)}:{}),
        ...(input.batteryHealth!==''?{batteryHealth:Number(input.batteryHealth)}:{}),
      };
      const unit=existing?await tx.deviceUnit.update({where:{id:existing.id},data}):await tx.deviceUnit.create({data});
      const session=await tx.diagnosticSession.create({data:{deviceUnitId:unit.id,status:'draft'}});
      // Preserve provenance per session, including after another session updates the shared device.
      await tx.diagnosticTestResult.create({data:{sessionId:session.id,testKey:'usb:intake',status:'info',value:{
        protocol:1,
        battery:{health:input.batteryHealth===''?null:Number(input.batteryHealth),source:input.batteryHealth===''?'unknown':input.batterySource||'manual',
          ...(input.batterySource==='calculated'?{designCapacity:Number(input.batteryDesignCapacity),nominalChargeCapacity:Number(input.batteryNominalChargeCapacity)}:{}),
          cycles:input.batteryCycles===''?null:Number(input.batteryCycles)},
        color:{name:input.color||null,source:input.color?input.colorSource||'manual':'unknown',modelNumber:input.modelNumber||null},
      }}});
      return session;
    },{isolationLevel:'Serializable'});
    return {sessionId:session.id};
  } catch(e) {
    return {error:e instanceof Error && e.message==='IDENTITY_CONFLICT'?'Deze toestelgegevens komen overeen met verschillende bestaande toestellen. Controleer IMEI en serienummer.':'Opslaan lukt niet. Controleer de gegevens en probeer opnieuw. Er is geen gedeeltelijke sessie bewaard.'};
  }
}

