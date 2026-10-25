import { diagnosticAccess } from '@/lib/security/access';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { WEB_TESTS, WEB_PREFIX, validateWebResult, webResults } from '@/lib/diagnostics';

export const dynamic = 'force-dynamic';
const noStore = {'Cache-Control':'no-store'};
export async function GET(request: Request) {
  const denied = await diagnosticAccess(request, 'read');
  if (denied) return denied;
  const sessionId = new URL(request.url).searchParams.get('sessionId') || '';
  if (!sessionId || sessionId.length>100) return NextResponse.json({error:'Ongeldige sessie.'},{status:400});
  try {
    const session = await prisma.diagnosticSession.findUnique({where:{id:sessionId},include:{deviceUnit:true,tests:{where:{testKey:{startsWith:WEB_PREFIX}},orderBy:[{createdAt:'desc'},{id:'desc'}]}}});
    if (!session) return NextResponse.json({error:'Sessie niet gevonden.'},{status:404});
    return NextResponse.json({ok:true,model:session.deviceUnit.model,results:webResults(session.tests)}, {headers:noStore});
  } catch {
    return NextResponse.json({error:'Resultaten konden niet worden geladen. Probeer opnieuw.'},{status:503,headers:noStore});
  }
}
export async function POST(request: Request) {
  const denied = await diagnosticAccess(request, 'write');
  if (denied) return denied;
  let body;
  try {
    const raw = await request.text();
    if (raw.length>12000) return NextResponse.json({error:'Beoordeling is te groot.'},{status:413});
    body = JSON.parse(raw);
  } catch { return NextResponse.json({error:'Ongeldige beoordeling.'},{status:400}); }
  const spec = WEB_TESTS.find(t=>t.key===body?.testKey);
  if (!spec || typeof body.sessionId!=='string' || !body.sessionId || body.sessionId.length>100 || !(body.expectedId===null || typeof body.expectedId==='string')) return NextResponse.json({error:'Ongeldige test of sessie.'},{status:400});
  let value;
  try { value = validateWebResult(spec,body.result); }
  catch (error) { return NextResponse.json({error:error instanceof Error?error.message:'Ongeldige beoordeling.'},{status:400}); }
  try {
    const outcome = await prisma.$transaction(async tx=>{
      const session = await tx.diagnosticSession.findUnique({where:{id:body.sessionId}});
      if (!session) return {code:404,error:'Sessie niet gevonden.'};
      const latest = await tx.diagnosticTestResult.findFirst({where:{sessionId:body.sessionId,testKey:WEB_PREFIX+spec.key},orderBy:[{createdAt:'desc'},{id:'desc'}]});
      if ((latest?.id ?? null)!==body.expectedId) return {code:409,error:'Deze test is ondertussen gewijzigd. Herlaad de resultaten voordat je opnieuw bewaart.'};
      const result = await tx.diagnosticTestResult.create({data:{sessionId:body.sessionId,testKey:WEB_PREFIX+spec.key,status:value.status,notes:value.notes || null,value:value as unknown as Prisma.InputJsonValue}});
      // Any revised test invalidates the previously calculated certificate in the same transaction.
      await tx.diagnosticSession.update({where:{id:body.sessionId},data:{status:'in_progress',finalScore:null,finalGrade:null}});
      return {code:200,result:{...value,id:result.id,createdAt:result.createdAt.toISOString()}};
    },{isolationLevel:'Serializable'});
    return NextResponse.json(outcome.code===200?{ok:true,result:outcome.result}:{error:outcome.error},{status:outcome.code,headers:noStore});
  } catch (error) {
    const conflict = typeof error==='object' && error!==null && 'code' in error && error.code==='P2034';
    return NextResponse.json({error:conflict?'Een andere bewerking was eerder klaar. Herlaad de resultaten.':'Opslaan is niet gelukt. Je invoer blijft staan; probeer opnieuw.'},{status:conflict?409:503,headers:noStore});
  }
}
