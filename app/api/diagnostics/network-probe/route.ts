import { diagnosticAccess } from '@/lib/security/access';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
const PROBE_BYTES = 131072;
export async function GET(request: Request) {
  const denied = await diagnosticAccess(request,'read');
  if (denied) return denied;
  // Fixed, bounded fixture; no customer data and no arbitrary URL/proxy.
  return new Response('x'.repeat(PROBE_BYTES), {headers:{'Content-Type':'application/octet-stream','Cache-Control':'no-store, no-transform','X-Diagnostic-Bytes':String(PROBE_BYTES)}});
}
export async function POST(request: Request) {
  const denied = await diagnosticAccess(request,'write');
  if (denied) return denied;
  if (!request.body) return NextResponse.json({error:'Geen testgegevens.'},{status:400});
  const reader = request.body.getReader();
  let bytes = 0;
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    bytes += chunk.value.byteLength;
    if (bytes>PROBE_BYTES) {await reader.cancel();return NextResponse.json({error:'Te veel testgegevens.'},{status:413});}
    if (chunk.value.some(x=>x!==120)) {await reader.cancel();return NextResponse.json({error:'Ongeldige testgegevens.'},{status:400});}
  }
  if (bytes!==PROBE_BYTES) return NextResponse.json({error:'Onvolledige overdracht.'},{status:400});
  return NextResponse.json({ok:true,bytes},{headers:{'Cache-Control':'no-store'}});
}
