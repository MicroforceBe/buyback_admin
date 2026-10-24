import { apiAccess } from '@/lib/security/access';
import { validLabelLink } from '@/lib/security/labelLinks';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const privateHeaders = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow' };
function failure(message: string, status: number) {
  return new NextResponse(message, { status, headers: privateHeaders });
}
export async function GET(req: NextRequest) {
  const params = new URL(req.url).searchParams;
  const parcelId = params.get('parcel_id') || '';
  const hasLink = params.has('signature') || params.has('expires');
  if (hasLink) {
    if (!validLabelLink(parcelId, params.get('expires'), params.get('signature'))) {
      return failure('Deze labellink is ongeldig of verlopen. Vraag een nieuwe link aan.', 403);
    }
  } else {
    const denied = await apiAccess(req, 'leads', 'read', false);
    if (denied) {
      for (const [key, value] of Object.entries(privateHeaders)) denied.headers.set(key, value);
      return denied;
    }
  }
  if (!/^[1-9][0-9]{0,19}$/.test(parcelId)) return failure('Ongeldig labelnummer.', 400);
  const pub = process.env.SENDCLOUD_PUBLIC_KEY;
  const sec = process.env.SENDCLOUD_SECRET_KEY;
  if (!pub || !sec) return failure('Labeldienst tijdelijk niet beschikbaar.', 503);
  try {
    const response = await fetch('https://panel.sendcloud.sc/api/v3/parcels/' + parcelId + '/documents/label', {
      method: 'GET', headers: { Authorization: 'Basic ' + Buffer.from(pub + ':' + sec).toString('base64'), Accept: 'application/pdf' },
      cache: 'no-store', redirect: 'error',
    });
    if (!response.ok || !response.headers.get('content-type')?.toLowerCase().startsWith('application/pdf')) {
      return failure('Het label kon niet worden opgehaald.', 502);
    }
    return new NextResponse(await response.arrayBuffer(), {
      status: 200,
      headers: { ...privateHeaders, 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="label.pdf"' },
    });
  } catch {
    return failure('Het label kon niet worden opgehaald.', 502);
  }
}

