import { NextResponse } from 'next/server';
import { runErpSync } from '@/lib/erpSync';
import { bearerMatches } from '@/lib/security/secrets';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
// Vercel Cron uses GET and supplies CRON_SECRET as the bearer token.
export async function GET(request: Request) {
  if (!bearerMatches(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    return NextResponse.json(await runErpSync());
  } catch {
    console.error('[ERP AUTO SYNC] failed');
    return NextResponse.json({ success: false, error: 'Sync mislukt' }, { status: 500 });
  }
}
