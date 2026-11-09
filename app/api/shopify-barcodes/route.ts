import { NextResponse } from 'next/server';
import { runModelBarcodes } from '@/lib/shopify/modelBarcodesRun';
import { bearerMatches } from '@/lib/security/secrets';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
// Vercel Cron (hourly, between the Shopify sync runs) uses GET with CRON_SECRET as the bearer token.
export async function GET(request: Request) {
  if (!bearerMatches(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const result = await runModelBarcodes();
    return NextResponse.json(result.status === 'done'
      ? { status: 'done', dryRun: result.dryRun, candidates: result.candidates, filled: result.filled, fixed: result.fixed, cleared: result.cleared, failed: result.failed.length, remaining: result.remaining }
      : { status: result.status, reason: result.reason });
  } catch {
    console.error('[SHOPIFY BARCODES] failed');
    return NextResponse.json({ status: 'failed' }, { status: 500 });
  }
}
