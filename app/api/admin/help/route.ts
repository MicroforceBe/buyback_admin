import { NextResponse } from 'next/server';
import { getCurrentAdminUser } from '@/lib/getCurrentAdminUser';
import { sameOrigin } from '@/lib/security/policy';
import { helpAnswer, isHelpModule } from '@/lib/helpManual';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
// Read-only: session validation plus an in-memory manual search. No data/provider tools.
export async function POST(request:Request) {
  if (!sameOrigin(request)) return reply({error:'Ongeldige herkomst.'},403);
  let user;
  try { user=await getCurrentAdminUser(); } catch { return reply({error:'Aanmelding tijdelijk niet beschikbaar.'},503); }
  if (!user) return reply({error:'Je sessie is verlopen. Meld opnieuw aan.'},401);
  if (!request.headers.get('content-type')?.includes('application/json')) return reply({error:'Ongeldige aanvraag.'},415);
  // Bound the stream itself, not just Content-Length (which a caller can omit).
  const reader=request.body?.getReader();
  if (!reader) return reply({error:'Vul een vraag in.'},400);
  let raw='',size=0; const decoder=new TextDecoder();
  try {
    while(true) { const chunk=await reader.read(); if(chunk.done)break; size+=chunk.value.byteLength; if(size>4096){await reader.cancel();return reply({error:'De vraag is te lang.'},413);} raw+=decoder.decode(chunk.value,{stream:true}); }
    raw+=decoder.decode();
  } catch {return reply({error:'De aanvraag kon niet worden gelezen.'},400);}
  let input;
  try { input=JSON.parse(raw); } catch { return reply({error:'Ongeldige aanvraag.'},400); }
  if (!input||!isHelpModule(input.module)||typeof input.question!=='string'||input.question.trim().length<3||input.question.length>800) return reply({error:'Kies een module en stel een vraag van 3 tot 800 tekens.'},400);
  const answer=helpAnswer(user,input.module,input.question.trim());
  if (!answer) return reply({error:'Je hebt geen toegang tot deze module.'},403);
  return reply(answer);
}
